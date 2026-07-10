import { copyFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createWorker, OEM, PSM } from "tesseract.js";
import { readImageUrlToBuffer } from "./storage";

type TesseractBox = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

type TesseractLine = {
  text: string;
  confidence: number;
  bbox: TesseractBox;
};

export type PosterOcrItem = {
  id: string;
  text: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
  backgroundColor: string;
  textColor: string;
};

export type PosterOcrResult = {
  image: {
    width: number;
    height: number;
  };
  text: string;
  items: PosterOcrItem[];
  provider: "tesseract" | "google-ai-studio" | "hybrid";
};

const tessdataDirectory = path.join(os.tmpdir(), "artsaurus-tessdata");
const tesscacheDirectory = path.join(os.tmpdir(), "artsaurus-tess-cache");
let tessdataReady: Promise<string> | null = null;

export async function recognizePosterText(input: { imageUrl: string; minConfidence: number }): Promise<PosterOcrResult> {
  const source = await readImageUrlToBuffer(input.imageUrl);
  const normalized = await sharp(source, { limitInputPixels: 48_000_000 })
    .rotate()
    .resize({ width: 2200, height: 2200, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  const metadata = await sharp(normalized).metadata();
  const width = metadata.width ?? 1;
  const height = metadata.height ?? 1;
  const geminiItems = await recognizeWithGemini({
    normalized,
    width,
    height,
  }).catch((error) => {
    console.warn(error instanceof Error ? error.message : error);
    return [];
  });
  const tesseractItems =
    geminiItems.length >= 3
      ? []
      : await recognizeWithTesseract({
          normalized,
          width,
          height,
          minConfidence: input.minConfidence,
        });
  const candidates = geminiItems.length ? [...geminiItems, ...tesseractItems.filter((item) => item.confidence >= 62)] : tesseractItems;

  const items = await hydrateOcrItems({
    normalized,
    width,
    height,
    items: mergeOcrItems(candidates),
  });

  return {
    image: { width, height },
    text: items.map((item) => item.text).join("\n"),
    items,
    provider: geminiItems.length && tesseractItems.length ? "hybrid" : geminiItems.length ? "google-ai-studio" : "tesseract",
  };
}

async function recognizeWithTesseract(input: {
  normalized: Buffer;
  width: number;
  height: number;
  minConfidence: number;
}): Promise<RawOcrItem[]> {
  const worker = await createWorker("kor+eng", OEM.LSTM_ONLY, {
    logger: () => {},
    langPath: await prepareTessdata(),
    cachePath: tesscacheDirectory,
    cacheMethod: "write",
    gzip: true,
  });

  try {
    const variants = await buildTesseractVariants(input.normalized);
    const pageSegModes = [PSM.SPARSE_TEXT, PSM.AUTO, PSM.SINGLE_BLOCK];
    const items: RawOcrItem[] = [];
    const seen = new Set<string>();

    for (const variant of variants) {
      for (const pageSegMode of pageSegModes) {
        await worker.setParameters({
          tessedit_pageseg_mode: pageSegMode,
          preserve_interword_spaces: "1",
          user_defined_dpi: "300",
        });
        const result = await worker.recognize(variant, {}, { blocks: true, text: true });
        for (const line of extractLines(result.data.blocks)) {
          const text = normalizeOcrText(line.text);
          if (!isUsefulOcrText(text)) continue;
          if (!isUsefulTesseractText(text)) continue;
          if (line.confidence < input.minConfidence) continue;
          const box = normalizeBox(line.bbox, input.width, input.height);
          if (!box) continue;
          const key = `${text}:${Math.round(box.x * 100)}:${Math.round(box.y * 100)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          items.push({
            text,
            confidence: Math.round(line.confidence),
            ...box,
            source: "tesseract",
          });
        }
      }
    }

    return items;
  } finally {
    await worker.terminate();
  }
}

async function recognizeWithGemini(input: { normalized: Buffer; width: number; height: number }): Promise<RawOcrItem[]> {
  const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return [];

  const model = process.env.POSTER_OCR_MODEL?.trim() || process.env.GOOGLE_TEXT_MODEL?.trim() || "gemini-2.5-flash";
  const image = await sharp(input.normalized)
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: [
                "You are OCR for a Korean classical concert poster editor.",
                "Read all visible text in Korean, English, numbers, dates, prices, venues, names, composers, and phone numbers.",
                "Group text by visual line. Do not invent missing text. Do not include portraits, decorative marks, QR codes, or background texture.",
                "Return only JSON with this exact shape:",
                "{\"items\":[{\"text\":\"recognized line\",\"x\":0.0,\"y\":0.0,\"width\":0.0,\"height\":0.0,\"confidence\":0}]}",
                "Coordinates must be normalized numbers from 0 to 1 relative to the full image. Use tight boxes around each text line.",
                "If a line is partly obscured but legible, include the visible text with lower confidence.",
              ].join("\n"),
            },
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: image.toString("base64"),
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Google AI Studio OCR failed with status ${response.status}: ${await response.text()}`);
  }
  const payload = (await response.json()) as unknown;
  const parsed = parseGeminiOcrJson(payload);
  return parsed.items.flatMap((item, index) => {
    const text = normalizeOcrText(String(item.text ?? ""));
    if (!isUsefulOcrText(text)) return [];
    const box = normalizeRatioBox(item);
    if (!box) return [];
    return [
      {
        text,
        confidence: Math.round(clampNumber(item.confidence, 0, 100, 82)),
        ...box,
        source: "google-ai-studio" as const,
        sortIndex: index,
      },
    ];
  });
}

async function prepareTessdata() {
  if (!tessdataReady) {
    tessdataReady = (async () => {
      await mkdir(tessdataDirectory, { recursive: true });
      await mkdir(tesscacheDirectory, { recursive: true });
      await Promise.all([
        copyFile(resolveTessdataFile("kor"), path.join(tessdataDirectory, "kor.traineddata.gz")),
        copyFile(resolveTessdataFile("eng"), path.join(tessdataDirectory, "eng.traineddata.gz")),
      ]);
      return tessdataDirectory;
    })();
  }
  return tessdataReady;
}

function resolveTessdataFile(language: "kor" | "eng") {
  return path.join(process.cwd(), "node_modules", "@tesseract.js-data", language, "4.0.0_best_int", `${language}.traineddata.gz`);
}

type RawOcrItem = {
  text: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
  source: "tesseract" | "google-ai-studio";
  sortIndex?: number;
};

type GeminiOcrResponse = {
  items: Array<{
    text?: unknown;
    x?: unknown;
    y?: unknown;
    width?: unknown;
    height?: unknown;
    confidence?: unknown;
  }>;
};

async function buildTesseractVariants(source: Buffer) {
  const highContrast = await sharp(source)
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.2 })
    .linear(1.35, -18)
    .png()
    .toBuffer();
  const lightText = await sharp(source)
    .grayscale()
    .negate()
    .normalize()
    .sharpen({ sigma: 1.1 })
    .png()
    .toBuffer();
  const threshold = await sharp(source)
    .grayscale()
    .normalize()
    .threshold(168)
    .png()
    .toBuffer();
  return [source, highContrast, lightText, threshold];
}

async function hydrateOcrItems(input: {
  normalized: Buffer;
  width: number;
  height: number;
  items: RawOcrItem[];
}): Promise<PosterOcrItem[]> {
  const sorted = input.items
    .slice()
    .sort((left, right) => left.y - right.y || left.x - right.x || (left.sortIndex ?? 0) - (right.sortIndex ?? 0));
  const hydrated: PosterOcrItem[] = [];
  for (const item of sorted) {
    const pixelBox = ratioBoxToPixelBox(item, input.width, input.height);
    const backgroundColor = await estimateBackgroundColor(input.normalized, pixelBox, input.width, input.height);
    hydrated.push({
      id: `line-${hydrated.length + 1}`,
      text: item.text,
      confidence: Math.round(item.confidence),
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      backgroundColor,
      textColor: contrastTextColor(backgroundColor),
    });
  }
  return hydrated;
}

function mergeOcrItems(items: RawOcrItem[]) {
  const merged: RawOcrItem[] = [];
  for (const item of items.sort((left, right) => sourceRank(left.source) - sourceRank(right.source) || right.confidence - left.confidence)) {
    const duplicateIndex = merged.findIndex((existing) => isDuplicateOcrItem(existing, item));
    if (duplicateIndex < 0) {
      merged.push(item);
      continue;
    }
    const existing = merged[duplicateIndex];
    if (!existing || sourceRank(item.source) < sourceRank(existing.source) || item.confidence > existing.confidence + 16) {
      merged[duplicateIndex] = item;
    }
  }
  return merged;
}

function sourceRank(source: RawOcrItem["source"]) {
  return source === "google-ai-studio" ? 0 : 1;
}

function isDuplicateOcrItem(left: RawOcrItem, right: RawOcrItem) {
  if (boxIou(left, right) > 0.32) return true;
  const sameText = normalizeComparableText(left.text) === normalizeComparableText(right.text);
  if (!sameText) return false;
  return Math.abs(centerX(left) - centerX(right)) < 0.08 && Math.abs(centerY(left) - centerY(right)) < 0.04;
}

function boxIou(left: RawOcrItem, right: RawOcrItem) {
  const x1 = Math.max(left.x, right.x);
  const y1 = Math.max(left.y, right.y);
  const x2 = Math.min(left.x + left.width, right.x + right.width);
  const y2 = Math.min(left.y + left.height, right.y + right.height);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (!intersection) return 0;
  const union = left.width * left.height + right.width * right.height - intersection;
  return union > 0 ? intersection / union : 0;
}

function centerX(item: RawOcrItem) {
  return item.x + item.width / 2;
}

function centerY(item: RawOcrItem) {
  return item.y + item.height / 2;
}

function normalizeComparableText(value: string) {
  return value.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

function extractLines(blocks: unknown): TesseractLine[] {
  if (!Array.isArray(blocks)) return [];
  return blocks.flatMap((block) => {
    const paragraphs = typeof block === "object" && block && "paragraphs" in block ? block.paragraphs : [];
    if (!Array.isArray(paragraphs)) return [];
    return paragraphs.flatMap((paragraph) => {
      const lines = typeof paragraph === "object" && paragraph && "lines" in paragraph ? paragraph.lines : [];
      return Array.isArray(lines) ? (lines as TesseractLine[]) : [];
    });
  });
}

function normalizeOcrText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/[|]+/g, "I")
    .trim();
}

function isUsefulOcrText(value: string) {
  if (value.length < 2) return false;
  if (!/[\p{L}\p{N}]/u.test(value)) return false;
  if (isHexGlyphFallbackText(value)) return false;
  const symbolCount = Array.from(value).filter((char) => !/[\p{L}\p{N}\s.,:;()[\]\-+/&·]/u.test(char)).length;
  return symbolCount / Math.max(1, value.length) < 0.35;
}

function isHexGlyphFallbackText(value: string) {
  return /^(?:[0-9A-F]{2}\s*){3,}$/i.test(value.trim());
}

function isUsefulTesseractText(value: string) {
  const compact = value.replace(/\s+/g, "");
  if (compact.length < 3) return false;
  if (/^\d{1,2}$/.test(compact)) return false;
  if (/[가-힣]/.test(value)) {
    const hangulCount = countMatches(value, /[가-힣]/gu);
    const alphaNumericCount = countMatches(value, /[\p{L}\p{N}]/gu);
    if (hangulCount < 2) return false;
    if (hangulCount / Math.max(1, alphaNumericCount) < 0.45) return false;
  }
  const noisyAsciiCount = countMatches(value, /[I|[\]{}()\\/]/g);
  if (noisyAsciiCount >= 3 && noisyAsciiCount / Math.max(1, compact.length) > 0.18) return false;
  return true;
}

function countMatches(value: string, pattern: RegExp) {
  return Array.from(value.matchAll(pattern)).length;
}

function normalizeBox(box: TesseractBox, imageWidth: number, imageHeight: number) {
  const x0 = clamp(box.x0, 0, imageWidth - 1);
  const y0 = clamp(box.y0, 0, imageHeight - 1);
  const x1 = clamp(box.x1, x0 + 1, imageWidth);
  const y1 = clamp(box.y1, y0 + 1, imageHeight);
  const width = x1 - x0;
  const height = y1 - y0;
  if (width < imageWidth * 0.01 || height < imageHeight * 0.006) return null;
  return {
    x: x0 / imageWidth,
    y: y0 / imageHeight,
    width: width / imageWidth,
    height: height / imageHeight,
  };
}

function normalizeRatioBox(item: { x?: unknown; y?: unknown; width?: unknown; height?: unknown }) {
  const x = normalizeRatioNumber(item.x);
  const y = normalizeRatioNumber(item.y);
  const width = normalizeRatioNumber(item.width);
  const height = normalizeRatioNumber(item.height);
  if (x == null || y == null || width == null || height == null) return null;
  const left = clamp(x, 0, 0.995);
  const top = clamp(y, 0, 0.995);
  const right = clamp(left + width, left + 0.002, 1);
  const bottom = clamp(top + height, top + 0.002, 1);
  if (right - left < 0.004 || bottom - top < 0.004) return null;
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function normalizeRatioNumber(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(number)) return null;
  if (number > 100) return number / 1000;
  if (number > 1) return number / 100;
  return number;
}

function ratioBoxToPixelBox(box: { x: number; y: number; width: number; height: number }, imageWidth: number, imageHeight: number): TesseractBox {
  return {
    x0: Math.round(box.x * imageWidth),
    y0: Math.round(box.y * imageHeight),
    x1: Math.round((box.x + box.width) * imageWidth),
    y1: Math.round((box.y + box.height) * imageHeight),
  };
}

async function estimateBackgroundColor(source: Buffer, box: TesseractBox, imageWidth: number, imageHeight: number) {
  const pad = Math.max(8, Math.round(Math.max(box.x1 - box.x0, box.y1 - box.y0) * 0.28));
  const left = Math.floor(clamp(box.x0 - pad, 0, imageWidth - 1));
  const top = Math.floor(clamp(box.y0 - pad, 0, imageHeight - 1));
  const right = Math.ceil(clamp(box.x1 + pad, left + 1, imageWidth));
  const bottom = Math.ceil(clamp(box.y1 + pad, top + 1, imageHeight));
  const width = right - left;
  const height = bottom - top;
  const inner = {
    left: Math.max(0, Math.round(box.x0 - left)),
    top: Math.max(0, Math.round(box.y0 - top)),
    right: Math.min(width, Math.round(box.x1 - left)),
    bottom: Math.min(height, Math.round(box.y1 - top)),
  };
  const raw = await sharp(source).extract({ left, top, width, height }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const channels = raw.info.channels;
  const totals = { r: 0, g: 0, b: 0, count: 0 };

  for (let y = 0; y < raw.info.height; y += 1) {
    for (let x = 0; x < raw.info.width; x += 1) {
      const insideTextBox = x >= inner.left && x <= inner.right && y >= inner.top && y <= inner.bottom;
      if (insideTextBox) continue;
      const offset = (y * raw.info.width + x) * channels;
      totals.r += raw.data[offset] ?? 255;
      totals.g += raw.data[offset + 1] ?? 255;
      totals.b += raw.data[offset + 2] ?? 255;
      totals.count += 1;
    }
  }

  if (totals.count < 8) return "#ffffff";
  return rgbToHex(totals.r / totals.count, totals.g / totals.count, totals.b / totals.count);
}

function contrastTextColor(background: string) {
  const color = parseHexColor(background);
  const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  return luminance > 145 ? "#111111" : "#ffffff";
}

function parseHexColor(value: string) {
  const normalized = value.replace("#", "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : normalized;
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16) || 255,
    g: Number.parseInt(expanded.slice(2, 4), 16) || 255,
    b: Number.parseInt(expanded.slice(4, 6), 16) || 255,
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((value) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0"))
    .join("")}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(number)) return fallback;
  return clamp(number, min, max);
}

function parseGeminiOcrJson(payload: unknown): GeminiOcrResponse {
  const text = findGeminiText(payload);
  if (!text) throw new Error("Google AI Studio OCR did not return text.");
  try {
    return normalizeGeminiOcrResponse(JSON.parse(text));
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Google AI Studio OCR returned invalid JSON.");
    return normalizeGeminiOcrResponse(JSON.parse(match[0]));
  }
}

function normalizeGeminiOcrResponse(value: unknown): GeminiOcrResponse {
  if (!value || typeof value !== "object") return { items: [] };
  const items = "items" in value ? (value as { items: unknown }).items : [];
  return { items: Array.isArray(items) ? items : [] };
}

function findGeminiText(payload: unknown): string | null {
  const candidates = readArray(readObject(payload, ["candidates"]));
  for (const candidate of candidates) {
    const parts = readArray(readObject(candidate, ["content", "parts"]));
    for (const part of parts) {
      const text = readString(part, ["text"]);
      if (text) return text;
    }
  }
  return null;
}

function readObject(value: unknown, path: string[]) {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return current && typeof current === "object" ? current : null;
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown, path: string[]) {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : null;
}
