import sharp from "sharp";
import type { ReferenceImage } from "@/features/promo-maker/server/types";
import { readImageUrlToBuffer } from "@/features/promo-maker/poster/storage";

export const FACE_IDENTITY_PIPELINE_VERSION = "face-identity-v3";
const DEFAULT_DEEPFACE_TIMEOUT_MS = 45_000;

type EvaluateFaceIdentityInput = {
  referenceImage: ReferenceImage;
  generatedImage: Buffer;
  generatedMimeType: "image/png" | "image/jpeg" | "image/webp";
  attempt: number;
};

export type FaceIdentityCheckResult = {
  pipelineVersion: string;
  status: "passed" | "failed" | "unchecked";
  provider: "deepface" | "google-ai-studio" | "local" | "source-lock" | "disabled";
  score?: number;
  localScore?: number;
  distance?: number;
  distanceThreshold?: number;
  threshold: number;
  localThreshold: number;
  attempt: number;
  maxAttempts: number;
  model?: string;
  reason?: string;
};

type GeminiIdentityResponse = {
  samePersonLikelihood?: unknown;
  decision?: unknown;
  reason?: unknown;
};

type DeepFaceIdentityResponse = {
  verified?: unknown;
  score?: unknown;
  distance?: unknown;
  threshold?: unknown;
  model?: unknown;
  detectorBackend?: unknown;
  distanceMetric?: unknown;
  reason?: unknown;
};

export async function evaluateFaceIdentity(input: EvaluateFaceIdentityInput): Promise<FaceIdentityCheckResult> {
  const config = getFaceIdentityConfig();
  const localScore = await compareLocalFaceCrops(input.referenceImage, input.generatedImage).catch(() => undefined);

  if (!config.enabled) {
    return {
      pipelineVersion: FACE_IDENTITY_PIPELINE_VERSION,
      status: "unchecked",
      provider: "disabled",
      threshold: config.threshold,
      localThreshold: config.localThreshold,
      attempt: input.attempt,
      maxAttempts: config.maxAttempts,
      localScore,
      reason: "Face identity check disabled.",
    };
  }

  if (shouldUseDeepFace(config)) {
    try {
      return await evaluateWithDeepFace({
        apiUrl: config.deepFaceApiUrl,
        model: config.deepFaceModel,
        detectorBackend: config.deepFaceDetectorBackend,
        distanceMetric: config.deepFaceDistanceMetric,
        timeoutMs: config.deepFaceTimeoutMs,
        referenceImage: input.referenceImage,
        generatedImage: input.generatedImage,
        localScore,
        attempt: input.attempt,
        config,
      });
    } catch (error) {
      if (config.provider === "deepface") {
        return {
          pipelineVersion: FACE_IDENTITY_PIPELINE_VERSION,
          status: "unchecked",
          provider: "deepface",
          threshold: config.threshold,
          localThreshold: config.localThreshold,
          attempt: input.attempt,
          maxAttempts: config.maxAttempts,
          model: config.deepFaceModel,
          localScore,
          reason: error instanceof Error ? error.message.slice(0, 240) : "DeepFace identity review failed.",
        };
      }
    }
  }

  if (config.provider === "deepface") {
    return {
      pipelineVersion: FACE_IDENTITY_PIPELINE_VERSION,
      status: "unchecked",
      provider: "deepface",
      threshold: config.threshold,
      localThreshold: config.localThreshold,
      attempt: input.attempt,
      maxAttempts: config.maxAttempts,
      model: config.deepFaceModel,
      localScore,
      reason: "DeepFace API URL is not configured.",
    };
  }

  if (config.provider === "local") {
    const passed = typeof localScore !== "number" || localScore >= config.localThreshold;
    return {
      pipelineVersion: FACE_IDENTITY_PIPELINE_VERSION,
      status: passed ? "passed" : "failed",
      provider: "local",
      score: localScore,
      localScore,
      threshold: config.threshold,
      localThreshold: config.localThreshold,
      attempt: input.attempt,
      maxAttempts: config.maxAttempts,
      reason: passed ? "Local face crop similarity passed." : "Local face crop similarity is below the identity safety threshold.",
    };
  }

  const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (!apiKey && typeof localScore === "number" && localScore < config.localThreshold) {
    return {
      pipelineVersion: FACE_IDENTITY_PIPELINE_VERSION,
      status: "failed",
      provider: "local",
      score: localScore,
      localScore,
      threshold: config.threshold,
      localThreshold: config.localThreshold,
      attempt: input.attempt,
      maxAttempts: config.maxAttempts,
      reason: "Local face crop similarity is below the identity safety threshold.",
    };
  }

  if (!apiKey) {
    return {
      pipelineVersion: FACE_IDENTITY_PIPELINE_VERSION,
      status: "unchecked",
      provider: "local",
      threshold: config.threshold,
      localThreshold: config.localThreshold,
      attempt: input.attempt,
      maxAttempts: config.maxAttempts,
      localScore,
      reason: "No Gemini API key available for face identity review.",
    };
  }

  try {
    const gemini = await evaluateWithGemini({
      apiKey,
      model: config.model,
      referenceImage: input.referenceImage,
      generatedImage: input.generatedImage,
      generatedMimeType: input.generatedMimeType,
    });
    const score = clampScore(gemini.samePersonLikelihood);
    const decision = typeof gemini.decision === "string" ? gemini.decision.toLowerCase() : "";
    const failed = decision === "fail" || score < config.threshold;

    return {
      pipelineVersion: FACE_IDENTITY_PIPELINE_VERSION,
      status: failed ? "failed" : "passed",
      provider: "google-ai-studio",
      score,
      localScore,
      threshold: config.threshold,
      localThreshold: config.localThreshold,
      attempt: input.attempt,
      maxAttempts: config.maxAttempts,
      model: config.model,
      reason: typeof gemini.reason === "string" ? gemini.reason.slice(0, 240) : undefined,
    };
  } catch (error) {
    return {
      pipelineVersion: FACE_IDENTITY_PIPELINE_VERSION,
      status: "unchecked",
      provider: "google-ai-studio",
      threshold: config.threshold,
      localThreshold: config.localThreshold,
      attempt: input.attempt,
      maxAttempts: config.maxAttempts,
      model: config.model,
      localScore,
      reason: error instanceof Error ? error.message.slice(0, 240) : "Face identity review failed.",
    };
  }
}

export function getFaceIdentityConfig() {
  const mode = (process.env.FACE_IDENTITY_CHECK?.trim() || "auto").toLowerCase();
  const enabled = mode !== "off" && mode !== "false" && mode !== "disabled";
  const provider = readProviderEnv();
  const threshold = readNumberEnv("FACE_IDENTITY_MIN_SCORE", 0.88, 0.45, 0.98);
  const localThreshold = readNumberEnv("FACE_IDENTITY_MIN_LOCAL_SCORE", 0.82, 0.45, 0.98);
  const maxAttempts = Math.round(readNumberEnv("FACE_IDENTITY_MAX_ATTEMPTS", 2, 1, 12));
  const model = process.env.FACE_IDENTITY_MODEL?.trim() || process.env.GOOGLE_TEXT_MODEL?.trim() || "gemini-2.5-flash";
  const deepFaceApiUrl = normalizeServiceUrl(process.env.DEEPFACE_API_URL);
  return {
    enabled,
    provider,
    threshold,
    localThreshold,
    maxAttempts,
    model,
    deepFaceApiUrl,
    deepFaceModel: process.env.DEEPFACE_MODEL?.trim() || "ArcFace",
    deepFaceDetectorBackend: process.env.DEEPFACE_DETECTOR_BACKEND?.trim() || "retinaface",
    deepFaceDistanceMetric: process.env.DEEPFACE_DISTANCE_METRIC?.trim() || "cosine",
    deepFaceTimeoutMs: Math.round(readNumberEnv("DEEPFACE_TIMEOUT_MS", DEFAULT_DEEPFACE_TIMEOUT_MS, 5_000, 180_000)),
  };
}

export function faceIdentitySelectionScore(faceIdentity: FaceIdentityCheckResult) {
  if (typeof faceIdentity.score === "number") return clampScore(faceIdentity.score);
  if (
    typeof faceIdentity.distance === "number" &&
    typeof faceIdentity.distanceThreshold === "number" &&
    faceIdentity.distanceThreshold > 0
  ) {
    return clampScore(1 - faceIdentity.distance / faceIdentity.distanceThreshold);
  }
  if (typeof faceIdentity.localScore === "number") return clampScore(faceIdentity.localScore);
  if (faceIdentity.status === "passed") return 0.5;
  if (faceIdentity.status === "unchecked") return 0.25;
  return 0;
}

export function compareFaceIdentityCandidates(left: FaceIdentityCheckResult, right: FaceIdentityCheckResult | null | undefined) {
  if (!right) return 1;
  const statusDelta = faceIdentityStatusRank(left.status) - faceIdentityStatusRank(right.status);
  if (statusDelta !== 0) return statusDelta;
  const scoreDelta = faceIdentitySelectionScore(left) - faceIdentitySelectionScore(right);
  if (Math.abs(scoreDelta) > 0.0001) return scoreDelta;
  return (right.attempt ?? 0) - (left.attempt ?? 0);
}

function faceIdentityStatusRank(status: FaceIdentityCheckResult["status"]) {
  if (status === "passed") return 3;
  if (status === "unchecked") return 2;
  return 1;
}

function shouldUseDeepFace(config: ReturnType<typeof getFaceIdentityConfig>) {
  return Boolean(config.deepFaceApiUrl) && (config.provider === "auto" || config.provider === "deepface");
}

async function evaluateWithDeepFace(input: {
  apiUrl: string;
  model: string;
  detectorBackend: string;
  distanceMetric: string;
  timeoutMs: number;
  referenceImage: ReferenceImage;
  generatedImage: Buffer;
  localScore?: number;
  attempt: number;
  config: ReturnType<typeof getFaceIdentityConfig>;
}): Promise<FaceIdentityCheckResult> {
  const referenceBuffer = await readImageUrlToBuffer(input.referenceImage.faceCropUrl || input.referenceImage.originalUrl);
  const referenceFace = await normalizeReviewImage(referenceBuffer);
  const generatedFace = await normalizeReviewImage(input.generatedImage);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await fetch(`${input.apiUrl}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        img1: toDataUrl(referenceFace.mimeType, referenceFace.body),
        img2: toDataUrl(generatedFace.mimeType, generatedFace.body),
        model_name: input.model,
        detector_backend: input.detectorBackend,
        distance_metric: input.distanceMetric,
        enforce_detection: false,
        align: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`DeepFace identity review failed with status ${response.status}: ${await response.text()}`);
    }

    const payload = (await response.json()) as DeepFaceIdentityResponse;
    const verified = payload.verified === true;
    const distance = readNumber(payload.distance);
    const distanceThreshold = readNumber(payload.threshold);
    const score =
      typeof payload.score === "number"
        ? clampScore(payload.score)
        : distanceToIdentityScore(distance, distanceThreshold, input.config.threshold, verified);
    const reason = typeof payload.reason === "string" ? payload.reason.slice(0, 240) : undefined;

    return {
      pipelineVersion: FACE_IDENTITY_PIPELINE_VERSION,
      status: verified ? "passed" : "failed",
      provider: "deepface",
      score,
      localScore: input.localScore,
      distance,
      distanceThreshold,
      threshold: input.config.threshold,
      localThreshold: input.config.localThreshold,
      attempt: input.attempt,
      maxAttempts: input.config.maxAttempts,
      model: [readStringValue(payload.model) || input.model, readStringValue(payload.detectorBackend) || input.detectorBackend]
        .filter(Boolean)
        .join("/"),
      reason: reason || (verified ? "DeepFace verification passed." : "DeepFace verification rejected the generated face."),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function evaluateWithGemini(input: {
  apiKey: string;
  model: string;
  referenceImage: ReferenceImage;
  generatedImage: Buffer;
  generatedMimeType: "image/png" | "image/jpeg" | "image/webp";
}) {
  const referenceBuffer = await readImageUrlToBuffer(input.referenceImage.faceCropUrl || input.referenceImage.originalUrl);
  const referenceFace = await normalizeReviewImage(referenceBuffer);
  const generatedFace = await normalizeReviewImage(input.generatedImage);
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent?key=${input.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: [
                "You are a strict identity consistency reviewer for a concert poster profile asset generator.",
                "Image 1 is the original reference face. Image 2 is the generated performer portrait.",
                "Decide whether image 2 still appears to be the same person as image 1.",
                "Focus on stable facial identity: eye spacing and shape, nose bridge and width, mouth shape, jawline, cheek structure, face proportions, and age impression.",
                "Ignore changes in clothing, lighting, background, makeup, minor hair styling, pose, and instrument.",
                "Fail if the generated person looks like a different person, a different age group, a different gender presentation, or if the face is not clear enough.",
                "Return only JSON with this shape: {\"samePersonLikelihood\":0.0,\"decision\":\"pass|fail|uncertain\",\"reason\":\"short reason\"}.",
              ].join("\n"),
            },
            {
              inline_data: {
                mime_type: referenceFace.mimeType,
                data: referenceFace.body.toString("base64"),
              },
            },
            {
              inline_data: {
                mime_type: generatedFace.mimeType,
                data: generatedFace.body.toString("base64"),
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
    throw new Error(`Gemini face identity review failed with status ${response.status}: ${await response.text()}`);
  }

  const payload = (await response.json()) as unknown;
  return parseGeminiJson(payload);
}

async function normalizeReviewImage(body: Buffer) {
  const normalized = await sharp(body, { limitInputPixels: 32_000_000 })
    .rotate()
    .resize({ width: 512, height: 512, fit: "cover", position: "attention" })
    .jpeg({ quality: 88 })
    .toBuffer();
  return {
    body: normalized,
    mimeType: "image/jpeg",
  };
}

function toDataUrl(mimeType: string, body: Buffer) {
  return `data:${mimeType};base64,${body.toString("base64")}`;
}

async function compareLocalFaceCrops(referenceImage: ReferenceImage, generatedImage: Buffer) {
  const reference = await readImageUrlToBuffer(referenceImage.faceCropUrl || referenceImage.originalUrl);
  const [referenceHash, generatedHash, referencePixels, generatedPixels] = await Promise.all([
    differenceHash(reference),
    differenceHash(generatedImage),
    normalizedGrayscale(reference),
    normalizedGrayscale(generatedImage),
  ]);
  const hashSimilarity = hammingSimilarity(referenceHash, generatedHash);
  const pixelSimilarity = cosineSimilarity(referencePixels, generatedPixels);
  return Number((hashSimilarity * 0.55 + pixelSimilarity * 0.45).toFixed(4));
}

async function differenceHash(body: Buffer) {
  const pixels = await sharp(body, { limitInputPixels: 32_000_000 })
    .rotate()
    .resize({ width: 9, height: 8, fit: "cover", position: "attention" })
    .grayscale()
    .raw()
    .toBuffer();
  const bits: number[] = [];
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const left = pixels[y * 9 + x] ?? 0;
      const right = pixels[y * 9 + x + 1] ?? 0;
      bits.push(left > right ? 1 : 0);
    }
  }
  return bits;
}

async function normalizedGrayscale(body: Buffer) {
  const pixels = await sharp(body, { limitInputPixels: 32_000_000 })
    .rotate()
    .resize({ width: 32, height: 32, fit: "cover", position: "attention" })
    .grayscale()
    .raw()
    .toBuffer();
  return [...pixels].map((value) => value / 255);
}

function hammingSimilarity(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  if (!length) return 0;
  let same = 0;
  for (let index = 0; index < length; index += 1) {
    if (left[index] === right[index]) same += 1;
  }
  return same / length;
}

function cosineSimilarity(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  if (!length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }
  if (!leftNorm || !rightNorm) return 0;
  return Math.max(0, Math.min(1, dot / Math.sqrt(leftNorm * rightNorm)));
}

function parseGeminiJson(payload: unknown): GeminiIdentityResponse {
  const text = findGeminiText(payload);
  if (!text) throw new Error("Gemini face identity review did not return text.");
  try {
    return JSON.parse(text) as GeminiIdentityResponse;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Gemini face identity review returned invalid JSON.");
    return JSON.parse(match[0]) as GeminiIdentityResponse;
  }
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

function clampScore(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function distanceToIdentityScore(distance: number | undefined, distanceThreshold: number | undefined, minScore: number, verified: boolean) {
  if (typeof distance !== "number" || typeof distanceThreshold !== "number" || distanceThreshold <= 0) {
    return verified ? minScore : Math.max(0, minScore - 0.2);
  }
  if (verified) {
    const margin = Math.max(0, distanceThreshold - distance) / distanceThreshold;
    return Number(Math.min(1, minScore + (1 - minScore) * margin).toFixed(4));
  }
  const overage = Math.max(0, distance - distanceThreshold) / distanceThreshold;
  return Number(Math.max(0, minScore * Math.max(0, 1 - overage)).toFixed(4));
}

function readProviderEnv(): "auto" | "deepface" | "google-ai-studio" | "local" {
  const provider = (process.env.FACE_IDENTITY_PROVIDER?.trim() || "auto").toLowerCase();
  if (provider === "deepface") return "deepface";
  if (provider === "google-ai-studio" || provider === "gemini") return "google-ai-studio";
  if (provider === "local") return "local";
  return "auto";
}

function normalizeServiceUrl(value?: string | null) {
  return (value ?? "").trim().replace(/\/+$/, "");
}

function readNumber(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : undefined;
}

function readStringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function readNumberEnv(key: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[key]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}
