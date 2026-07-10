import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readImageUrlToBuffer } from "@/features/promo-maker/poster/storage";
import type { GeneratedImageResult } from "@/lib/image-generation/providers/googleAiStudioProvider";

export type ComfyUiWorkflowKind = "background" | "pose";

type ComfyUiReference = {
  label: string;
  url: string;
  mimeType: string;
};

type GenerateWithComfyInput = {
  kind: ComfyUiWorkflowKind;
  prompt: string;
  negativePrompt?: string;
  referenceImages: ComfyUiReference[];
};

type ComfyUiStatus = {
  provider: "comfyui-faceid-controlnet";
  baseUrlPresent: boolean;
  backgroundWorkflowPresent: boolean;
  poseWorkflowPresent: boolean;
  backgroundReady: boolean;
  poseReady: boolean;
  ready: boolean;
  timeoutMs: number;
};

type UploadedComfyImage = {
  name: string;
  subfolder?: string;
  type?: string;
};

type ComfyHistoryImage = {
  filename: string;
  subfolder?: string;
  type?: string;
};

const DEFAULT_COMFY_TIMEOUT_MS = 180_000;
const DEFAULT_COMFY_POLL_MS = 1200;

export function getComfyUiPipelineStatus(): ComfyUiStatus {
  const baseUrlPresent = Boolean(readComfyBaseUrl());
  const backgroundWorkflowPresent = Boolean(readWorkflowPath("background"));
  const poseWorkflowPresent = Boolean(readWorkflowPath("pose"));
  return {
    provider: "comfyui-faceid-controlnet",
    baseUrlPresent,
    backgroundWorkflowPresent,
    poseWorkflowPresent,
    backgroundReady: baseUrlPresent && backgroundWorkflowPresent,
    poseReady: baseUrlPresent && poseWorkflowPresent,
    ready: baseUrlPresent && (backgroundWorkflowPresent || poseWorkflowPresent),
    timeoutMs: readTimeoutMs(),
  };
}

export async function generatePerformerAssetWithComfyUi(input: GenerateWithComfyInput): Promise<GeneratedImageResult> {
  const status = getComfyUiPipelineStatus();
  if (input.kind === "background" && !status.backgroundReady) {
    throw new Error("ComfyUI background replacement workflow is not configured.");
  }
  if (input.kind === "pose" && !status.poseReady) {
    throw new Error("ComfyUI pose synthesis workflow is not configured.");
  }

  const workflow = await readWorkflow(input.kind);
  const uploaded = await uploadReferences(input.referenceImages);
  const prompt = replaceWorkflowPlaceholders(workflow, {
    __ARTSAURUS_PROMPT__: input.prompt,
    __ARTSAURUS_NEGATIVE_PROMPT__: input.negativePrompt ?? defaultNegativePrompt(),
    __ARTSAURUS_REFERENCE_IMAGE__: comfyImageName(uploaded[0]),
    __ARTSAURUS_FACE_IMAGE__: comfyImageName(uploaded[1] ?? uploaded[0]),
    __ARTSAURUS_POSE_IMAGE__: comfyImageName(uploaded[2] ?? uploaded[0]),
    __ARTSAURUS_SEED__: Math.floor(Math.random() * 2_000_000_000),
  }) as Record<string, unknown>;
  const promptId = await queuePrompt(prompt);
  const output = await waitForOutput(promptId);
  const body = await fetchOutputImage(output);

  return {
    body,
    contentType: "image/png",
    providerMetadata: {
      provider: "comfyui-faceid-controlnet",
      workflowKind: input.kind,
      promptId,
      referenceCount: input.referenceImages.length,
      referenceLabels: input.referenceImages.map((reference) => reference.label),
      output,
    },
  };
}

function readComfyBaseUrl() {
  return (process.env.COMFYUI_BASE_URL?.trim() || process.env.COMFYUI_API_URL?.trim() || "").replace(/\/+$/, "");
}

function readWorkflowPath(kind: ComfyUiWorkflowKind) {
  const raw =
    kind === "background"
      ? process.env.COMFYUI_BACKGROUND_WORKFLOW_PATH?.trim()
      : process.env.COMFYUI_POSE_WORKFLOW_PATH?.trim();
  return raw ? path.resolve(raw) : "";
}

async function readWorkflow(kind: ComfyUiWorkflowKind) {
  const workflowPath = readWorkflowPath(kind);
  const workflow = JSON.parse(await readFile(workflowPath, "utf8")) as unknown;
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
    throw new Error(`ComfyUI ${kind} workflow must be a JSON object exported in API format.`);
  }
  return workflow as Record<string, unknown>;
}

async function uploadReferences(references: ComfyUiReference[]) {
  if (!references.length) throw new Error("ComfyUI generation needs at least one reference image.");
  return Promise.all(references.map(uploadReference));
}

async function uploadReference(reference: ComfyUiReference): Promise<UploadedComfyImage> {
  const source = await readImageUrlToBuffer(reference.url);
  const form = new FormData();
  const filename = `${safeFilename(reference.label)}-${randomUUID()}.${extensionFromMime(reference.mimeType)}`;
  form.set("image", new Blob([new Uint8Array(source)], { type: reference.mimeType }), filename);
  form.set("overwrite", "true");
  form.set("type", "input");

  const response = await fetchComfy("/upload/image", {
    method: "POST",
    headers: comfyAuthHeaders(),
    body: form,
  });
  if (!response.ok) {
    throw new Error(`ComfyUI image upload failed with status ${response.status}: ${await response.text()}`);
  }
  const payload = (await response.json()) as Partial<UploadedComfyImage>;
  if (!payload.name) throw new Error("ComfyUI upload response did not include image name.");
  return {
    name: payload.name,
    subfolder: typeof payload.subfolder === "string" ? payload.subfolder : undefined,
    type: typeof payload.type === "string" ? payload.type : "input",
  };
}

async function queuePrompt(prompt: Record<string, unknown>) {
  const response = await fetchComfy("/prompt", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...comfyAuthHeaders(),
    },
    body: JSON.stringify({
      prompt,
      client_id: randomUUID(),
    }),
  });
  if (!response.ok) {
    throw new Error(`ComfyUI prompt queue failed with status ${response.status}: ${await response.text()}`);
  }
  const payload = (await response.json()) as { prompt_id?: unknown };
  if (typeof payload.prompt_id !== "string") throw new Error("ComfyUI did not return a prompt_id.");
  return payload.prompt_id;
}

async function waitForOutput(promptId: string): Promise<ComfyHistoryImage> {
  const deadline = Date.now() + readTimeoutMs();
  while (Date.now() < deadline) {
    const response = await fetchComfy(`/history/${encodeURIComponent(promptId)}`, {
      method: "GET",
      headers: comfyAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error(`ComfyUI history lookup failed with status ${response.status}: ${await response.text()}`);
    }
    const history = await response.json();
    const image = findOutputImage(history, promptId);
    if (image) return image;
    await sleep(readPollMs());
  }
  throw new Error("ComfyUI workflow timed out before returning an output image.");
}

async function fetchOutputImage(image: ComfyHistoryImage) {
  const params = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder ?? "",
    type: image.type ?? "output",
  });
  const response = await fetchComfy(`/view?${params.toString()}`, {
    method: "GET",
    headers: comfyAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(`ComfyUI output download failed with status ${response.status}: ${await response.text()}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function fetchComfy(route: string, init: RequestInit) {
  const baseUrl = readComfyBaseUrl();
  if (!baseUrl) throw new Error("COMFYUI_BASE_URL is not configured.");
  return fetch(`${baseUrl}${route}`, init);
}

function comfyAuthHeaders(): Record<string, string> {
  const apiKey = process.env.COMFYUI_API_KEY?.trim();
  return apiKey ? { "X-API-Key": apiKey } : {};
}

function replaceWorkflowPlaceholders(value: unknown, replacements: Record<string, string | number>): unknown {
  if (typeof value === "string") {
    if (Object.prototype.hasOwnProperty.call(replacements, value)) return replacements[value];
    return Object.entries(replacements).reduce((current, [key, replacement]) => current.replaceAll(key, String(replacement)), value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceWorkflowPlaceholders(item, replacements));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceWorkflowPlaceholders(item, replacements)]));
  }
  return value;
}

function findOutputImage(history: unknown, promptId: string): ComfyHistoryImage | null {
  const historyRecord = asRecord(history);
  const entry = asRecord(historyRecord?.[promptId]) ?? historyRecord;
  const outputs = asRecord(entry?.outputs);
  if (!outputs) return null;
  const candidates: ComfyHistoryImage[] = [];
  for (const output of Object.values(outputs)) {
    const images = asRecord(output)?.images;
    if (!Array.isArray(images)) continue;
    for (const image of images) {
      const record = asRecord(image);
      if (typeof record?.filename !== "string") continue;
      candidates.push({
        filename: record.filename,
        subfolder: typeof record.subfolder === "string" ? record.subfolder : "",
        type: typeof record.type === "string" ? record.type : "output",
      });
    }
  }
  return candidates.find((image) => image.type === "output") ?? candidates[0] ?? null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function comfyImageName(image?: UploadedComfyImage) {
  if (!image) return "";
  return image.subfolder ? `${image.subfolder}/${image.name}` : image.name;
}

function extensionFromMime(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function safeFilename(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "reference";
}

function readTimeoutMs() {
  const value = Number(process.env.COMFYUI_TIMEOUT_MS ?? DEFAULT_COMFY_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_COMFY_TIMEOUT_MS;
}

function readPollMs() {
  const value = Number(process.env.COMFYUI_POLL_MS ?? DEFAULT_COMFY_POLL_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_COMFY_POLL_MS;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultNegativePrompt() {
  return "different face, changed face angle, side profile, looking away, distorted face, face swap artifact, de-aged face, changed gender presentation, casual selfie, sticker-photo pose, finger heart, peace sign, unreadable hands, extra fingers";
}
