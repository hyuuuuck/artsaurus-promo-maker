import sharp from "sharp";
import { readImageUrlToBuffer, storePosterObject } from "@/features/promo-maker/poster/storage";

const DEFAULT_CUTOUT_PROVIDER = "sharp";
const DEFAULT_REMBG_ENDPOINT = "http://rembg:7000/api/remove";
const DEFAULT_REMBG_MODEL = "u2net_human_seg";
const DEFAULT_REMBG_TIMEOUT_MS = 90_000;
export const CUTOUT_PIPELINE_VERSION = "rembg-sidecar-v3";
const BACKGROUND_DISTANCE_THRESHOLD = 26;
const MIN_BACKGROUND_CONFIDENCE = 0.38;
const MIN_TRANSPARENT_RATIO = 0.12;
const MAX_TRANSPARENT_RATIO = 0.72;
const REMBG_MIN_OPAQUE_RATIO = 0.035;
const REMBG_MAX_OPAQUE_RATIO = 0.94;
const BOTTOM_CENTER_PROTECTION_START_RATIO = 0.22;
const BOTTOM_CENTER_PROTECTION_END_RATIO = 0.78;
const MAX_CORE_TRANSPARENT_RATIO = 0.08;

type CutoutInput = {
  userId: string;
  imageUrl: string;
};

export type CutoutResult = {
  cutoutPngUrl: string;
  maskUrl: string;
  width: number;
  height: number;
  status: "generated" | "fallback_source";
  pipelineVersion: string;
  requestedProvider: "rembg" | "sharp";
  provider: "rembg" | "sharp";
  model?: string;
};

export async function createPerformerCutout(input: CutoutInput): Promise<CutoutResult> {
  const source = await readImageUrlToBuffer(input.imageUrl);
  const pipeline = getCurrentCutoutPipeline();
  if (pipeline.provider === "rembg") {
    try {
      const rembgCutout = await createRembgCutout(input, source, pipeline);
      if (rembgCutout) return rembgCutout;
    } catch (error) {
      console.warn("rembg cutout failed; falling back to sharp cutout", error);
    }
  }

  return createSharpCutout(input, source, pipeline);
}

export function getCurrentCutoutPipeline() {
  const provider = selectedCutoutProvider();
  return {
    version: CUTOUT_PIPELINE_VERSION,
    provider,
    model: provider === "rembg" ? process.env.REMBG_MODEL?.trim() || DEFAULT_REMBG_MODEL : undefined,
  };
}

async function createRembgCutout(input: CutoutInput, source: Buffer, pipeline: ReturnType<typeof getCurrentCutoutPipeline>): Promise<CutoutResult | null> {
  const model = pipeline.model || DEFAULT_REMBG_MODEL;
  const normalizedSource = await sharp(source, { limitInputPixels: 32_000_000 })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(normalizedSource)], { type: "image/png" }), "input.png");
  form.set("model", model);
  form.set("ppm", "true");

  const response = await fetchWithTimeout(process.env.REMBG_ENDPOINT?.trim() || DEFAULT_REMBG_ENDPOINT, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    throw new Error(`rembg returned ${response.status}: ${await response.text()}`);
  }

  const cutoutPng = await sharp(Buffer.from(await response.arrayBuffer()), { limitInputPixels: 32_000_000 })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .png()
    .toBuffer();
  const image = sharp(cutoutPng, { limitInputPixels: 32_000_000 }).ensureAlpha();
  const metadata = await image.metadata();
  const width = metadata.width ?? 1024;
  const height = metadata.height ?? 1280;
  const raw = await image.raw().toBuffer();
  const mask = alphaMaskFromRaw(raw, width, height);

  if (isUnusableRembgCutout(mask, width, height)) {
    return null;
  }

  const maskPng = await sharp(mask, { raw: { width, height, channels: 1 } }).png().toBuffer();
  const [cutoutPngUrl, maskUrl] = await storeCutoutObjects(input.userId, cutoutPng, maskPng);

  return {
    cutoutPngUrl,
    maskUrl,
    width,
    height,
    status: "generated",
    pipelineVersion: pipeline.version,
    requestedProvider: pipeline.provider,
    provider: "rembg",
    model,
  };
}

async function createSharpCutout(input: CutoutInput, source: Buffer, pipeline: ReturnType<typeof getCurrentCutoutPipeline>): Promise<CutoutResult> {
  const image = sharp(source, { limitInputPixels: 32_000_000 })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .ensureAlpha();
  const metadata = await image.metadata();
  const width = metadata.width ?? 1024;
  const height = metadata.height ?? 1280;
  const raw = await image.raw().toBuffer();
  const background = sampleBackground(raw, width, height);
  const backgroundPixels = findConnectedBackground(raw, width, height, background);
  const mask = Buffer.alloc(width * height);
  const output = Buffer.from(raw);
  let status: CutoutResult["status"] = "generated";

  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    const sourceAlpha = output[offset + 3] ?? 255;
    const alpha = backgroundPixels[pixelIndex] ? 0 : sourceAlpha;
    output[offset + 3] = alpha;
    mask[pixelIndex] = alpha;
  }

  if (
    isLowConfidenceCutout(mask, width, height, background.confidence) ||
    hasUnsafeFaceCutout(mask, width, height) ||
    hasUnsafeCoreCutout(mask, width, height)
  ) {
    status = "fallback_source";
    for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
      const offset = pixelIndex * 4;
      const sourceAlpha = raw[offset + 3] ?? 255;
      output[offset + 3] = sourceAlpha;
      mask[pixelIndex] = sourceAlpha;
    }
  }

  const cutout = await sharp(output, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const maskPng = await sharp(mask, { raw: { width, height, channels: 1 } }).png().toBuffer();
  const [cutoutPngUrl, maskUrl] = await storeCutoutObjects(input.userId, cutout, maskPng);

  return {
    cutoutPngUrl,
    maskUrl,
    width,
    height,
    status,
    pipelineVersion: pipeline.version,
    requestedProvider: pipeline.provider,
    provider: "sharp",
    model: pipeline.model,
  };
}

function selectedCutoutProvider(): "rembg" | "sharp" {
  const provider = (process.env.CUTOUT_PROVIDER?.trim() || DEFAULT_CUTOUT_PROVIDER).toLowerCase();
  return provider === "rembg" ? "rembg" : "sharp";
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const timeoutMs = Number(process.env.REMBG_TIMEOUT_MS ?? DEFAULT_REMBG_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_REMBG_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function storeCutoutObjects(userId: string, cutoutPng: Buffer, maskPng: Buffer) {
  return Promise.all([
    storePosterObject({
      directory: "poster-cutouts",
      userId,
      body: cutoutPng,
      contentType: "image/png",
      extension: "png",
    }),
    storePosterObject({
      directory: "poster-masks",
      userId,
      body: maskPng,
      contentType: "image/png",
      extension: "png",
    }),
  ]);
}

function alphaMaskFromRaw(raw: Buffer, width: number, height: number) {
  const mask = Buffer.alloc(width * height);
  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    mask[pixelIndex] = raw[pixelIndex * 4 + 3] ?? 255;
  }
  return mask;
}

export function sampleBackground(raw: Buffer, width: number, height: number) {
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  const add = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    const r = raw[offset] ?? 255;
    const g = raw[offset + 1] ?? 255;
    const b = raw[offset + 2] ?? 255;
    const key = `${Math.round(r / 16)}:${Math.round(g / 16)}:${Math.round(b / 16)}`;
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  };

  const step = Math.max(1, Math.floor(Math.min(width, height) / 160));
  for (let x = 0; x < width; x += step) {
    add(x, 0);
    add(x, height - 1);
  }
  for (let y = 0; y < height; y += step) {
    add(0, y);
    add(width - 1, y);
  }

  const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0] ?? { count: 1, r: 255, g: 255, b: 255 };
  return {
    r: Math.round(dominant.r / dominant.count),
    g: Math.round(dominant.g / dominant.count),
    b: Math.round(dominant.b / dominant.count),
    confidence: dominant.count / Math.max(1, [...buckets.values()].reduce((sum, bucket) => sum + bucket.count, 0)),
  };
}

function colorDistance(r: number, g: number, b: number, background: { r: number; g: number; b: number }) {
  return Math.sqrt((r - background.r) ** 2 + (g - background.g) ** 2 + (b - background.b) ** 2);
}

export function findConnectedBackground(raw: Buffer, width: number, height: number, background: { r: number; g: number; b: number }) {
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;

  const enqueue = (index: number) => {
    if (visited[index] || !isBackgroundLike(raw, index, background)) return;
    visited[index] = 1;
    queue[tail] = index;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    if (isSafeBottomSeedColumn(x, width)) {
      enqueue((height - 1) * width + x);
    }
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head] ?? 0;
    head += 1;
    const x = index % width;
    const y = Math.floor(index / width);

    if (x > 0) enqueue(index - 1);
    if (x < width - 1) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y < height - 1) enqueue(index + width);
  }

  return visited;
}

function isSafeBottomSeedColumn(x: number, width: number) {
  const protectedStart = Math.floor(width * BOTTOM_CENTER_PROTECTION_START_RATIO);
  const protectedEnd = Math.ceil(width * BOTTOM_CENTER_PROTECTION_END_RATIO);
  return x < protectedStart || x >= protectedEnd;
}

function isBackgroundLike(raw: Buffer, pixelIndex: number, background: { r: number; g: number; b: number }) {
  const offset = pixelIndex * 4;
  const alpha = raw[offset + 3] ?? 255;
  if (alpha < 16) return true;
  const distance = colorDistance(raw[offset] ?? 0, raw[offset + 1] ?? 0, raw[offset + 2] ?? 0, background);
  return distance <= BACKGROUND_DISTANCE_THRESHOLD;
}

function isLowConfidenceCutout(mask: Buffer, width: number, height: number, backgroundConfidence: number) {
  if (backgroundConfidence < MIN_BACKGROUND_CONFIDENCE) return true;
  return isLowCoverageCutout(mask, width, height);
}

function isLowCoverageCutout(mask: Buffer, width: number, height: number) {
  let transparentPixels = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if ((mask[index] ?? 255) < 48) transparentPixels += 1;
  }

  const transparentRatio = transparentPixels / Math.max(1, width * height);
  return transparentRatio < MIN_TRANSPARENT_RATIO || transparentRatio > MAX_TRANSPARENT_RATIO;
}

export function isUnusableRembgCutout(mask: Buffer, width: number, height: number) {
  const pixelCount = Math.max(1, Math.min(mask.length, width * height));
  let opaquePixels = 0;

  for (let index = 0; index < pixelCount; index += 1) {
    if ((mask[index] ?? 0) >= 48) opaquePixels += 1;
  }

  const opaqueRatio = opaquePixels / pixelCount;
  return opaqueRatio < REMBG_MIN_OPAQUE_RATIO || opaqueRatio > REMBG_MAX_OPAQUE_RATIO;
}

function hasUnsafeFaceCutout(mask: Buffer, width: number, height: number) {
  const xStart = Math.floor(width * 0.36);
  const xEnd = Math.ceil(width * 0.64);
  const yStart = Math.floor(height * 0.2);
  const yEnd = Math.ceil(height * 0.58);
  let transparentPixels = 0;
  let totalPixels = 0;

  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      totalPixels += 1;
      if ((mask[y * width + x] ?? 255) < 48) {
        transparentPixels += 1;
      }
    }
  }

  return totalPixels > 0 && transparentPixels / totalPixels > 0.006;
}

function hasUnsafeCoreCutout(mask: Buffer, width: number, height: number) {
  const xStart = Math.floor(width * 0.3);
  const xEnd = Math.ceil(width * 0.7);
  const yStart = Math.floor(height * 0.48);
  const yEnd = Math.ceil(height * 0.9);
  let transparentPixels = 0;
  let totalPixels = 0;

  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      totalPixels += 1;
      if ((mask[y * width + x] ?? 255) < 48) {
        transparentPixels += 1;
      }
    }
  }

  return totalPixels > 0 && transparentPixels / totalPixels > MAX_CORE_TRANSPARENT_RATIO;
}
