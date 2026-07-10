import crypto, { randomUUID } from "node:crypto";
import sharp from "sharp";
import { buildPerformerAssetPrompt, hashPerformerAssetPrompt } from "@/lib/prompt/performerAssetPromptBuilder";
import { createPerformerCutout, getCurrentCutoutPipeline } from "@/lib/image-processing/cutout";
import {
  evaluateFaceIdentity,
  faceIdentitySelectionScore,
  getFaceIdentityConfig,
  FACE_IDENTITY_PIPELINE_VERSION,
  type FaceIdentityCheckResult,
} from "@/lib/image-generation/faceIdentity";
import { generatePerformerAssetWithGoogleAiStudio, type GeneratedImageResult } from "@/lib/image-generation/providers/googleAiStudioProvider";
import { generateMockPerformerAsset } from "@/lib/image-generation/providers/mockPerformerAssetProvider";
import type { PerformerAssetGenerationOptions } from "../poster/types";
import { performerAssetAllowedOperations, performerAssetDisallowedOperations, performerAssetSourceTypeFromMode } from "../poster/assetPolicy";
import { getProposalVariantPipelineStatus } from "../poster/proposalPerformerVariants";
import { storePosterObject } from "../poster/storage";
import { insertByNewest, mutateDb, readDb, standaloneUserId } from "./localStore";
import type { GeneratedPerformerAsset, ReferenceImage } from "./types";
import { StandaloneApiError } from "./http";

type GenerateInput = {
  referenceImageId: string;
  referenceImageIds?: {
    front?: string;
    left?: string;
    right?: string;
  };
  baselineAssetId?: string;
  options: PerformerAssetGenerationOptions;
  consentToPersonImageProcessing?: boolean;
  usageRightsConfirmed?: boolean;
  regenerate?: boolean;
};

type Candidate = GeneratedImageResult & {
  faceIdentity: FaceIdentityCheckResult;
  selectionScore: number;
  assetProvider: string;
  generationMode: string;
  pipelineMode: string;
};

const STORED_ASSET_MIN_WIDTH = 1200;
const STORED_ASSET_MIN_HEIGHT = 1500;
const STORED_ASSET_MAX_UPSCALE = 2;

export async function listPerformerAssets() {
  const db = await readDb();
  return db.performerAssets.filter((asset) => asset.userId === standaloneUserId()).slice(0, 24);
}

export async function getPerformerAssetPipelineStatus() {
  const faceIdentity = getFaceIdentityConfig();
  const cutout = getCurrentCutoutPipeline();
  const googleKeyPresent = hasGoogleKey();
  const imageProvider = selectedImageProvider();
  return {
    imageGeneration: {
      mode: imageProvider === "google-ai-studio" && googleKeyPresent ? "live" : "mock",
      provider: imageProvider === "google-ai-studio" && googleKeyPresent ? "google-ai-studio" : "mock",
      liveRequested: imageProvider === "google-ai-studio",
      apiKeyPresent: googleKeyPresent,
      model: process.env.GOOGLE_IMAGE_MODEL?.trim() || "gemini-3.1-flash-image",
      ready: imageProvider !== "google-ai-studio" || googleKeyPresent,
    },
    cutout: {
      provider: cutout.provider,
      model: cutout.model,
      pipelineVersion: cutout.version,
      ready: cutout.provider === "sharp" || Boolean(process.env.REMBG_ENDPOINT || process.env.CUTOUT_PROVIDER !== "rembg"),
    },
    faceIdentity: {
      enabled: faceIdentity.enabled,
      provider: faceIdentity.provider,
      model: faceIdentity.provider === "deepface" ? faceIdentity.deepFaceModel : faceIdentity.model,
      threshold: faceIdentity.threshold,
      localThreshold: faceIdentity.localThreshold,
      maxAttempts: faceIdentity.maxAttempts,
      pipelineVersion: FACE_IDENTITY_PIPELINE_VERSION,
      deepFaceApiUrlPresent: Boolean(faceIdentity.deepFaceApiUrl),
      ready: !faceIdentity.enabled || faceIdentity.provider !== "deepface" || Boolean(faceIdentity.deepFaceApiUrl),
    },
    proposalVariants: getProposalVariantPipelineStatus(),
  };
}

export async function generatePerformerAsset(input: GenerateInput) {
  if (!input.consentToPersonImageProcessing) {
    throw new StandaloneApiError("PERSON_IMAGE_CONSENT_REQUIRED", "인물 사진 AI 편집 동의가 필요합니다.", 400);
  }
  if (!input.usageRightsConfirmed) {
    throw new StandaloneApiError("ASSET_USAGE_RIGHTS_REQUIRED", "업로드 이미지 사용 권한 확인이 필요합니다.", 400);
  }

  const db = await readDb();
  const references = resolveReferences(db.referenceImages, input.referenceImageId, input.referenceImageIds);
  const primaryReference = references[0];
  if (!primaryReference) throw new StandaloneApiError("REFERENCE_IMAGE_NOT_FOUND", "참고 사진을 찾을 수 없습니다.", 404);

  const baselineAsset = input.baselineAssetId ? db.performerAssets.find((asset) => asset.id === input.baselineAssetId) ?? null : null;
  const promptInput = {
    options: input.options,
    referenceImageHash: buildReferenceHash(references, baselineAsset),
    referenceImageCount: references.length,
  };
  const promptUsed = buildPerformerAssetPrompt(promptInput);
  const promptHash = hashPerformerAssetPrompt(promptInput);
  const identityMode = input.options.identityMode ?? "uploaded_photo";

  if (!input.regenerate) {
    const existing = db.performerAssets.find((asset) => asset.promptHash === promptHash && asset.userId === standaloneUserId());
    if (existing) return existing;
  }

  const candidate = await generateBestCandidate({
    promptUsed,
    identityMode,
    options: input.options,
    references,
    primaryReference,
    baselineAsset,
  });
  const storedGenerated = await normalizeStoredPerformerImage(candidate.body);
  const generatedImageUrl = await storePosterObject({
    directory: "poster-assets",
    userId: standaloneUserId(),
    body: storedGenerated,
    contentType: "image/png",
    extension: "png",
  });
  const cutout = await createPerformerCutout({
    userId: standaloneUserId(),
    imageUrl: generatedImageUrl,
  });
  const thumbnail = await sharp(storedGenerated, { limitInputPixels: 32_000_000 })
    .resize({ width: 720, height: 900, fit: "cover", position: "attention" })
    .webp({ quality: 90, effort: 4 })
    .toBuffer();
  const thumbnailUrl = await storePosterObject({
    directory: "poster-assets",
    userId: standaloneUserId(),
    body: thumbnail,
    contentType: "image/webp",
    extension: "webp",
  });

  const now = new Date();
  const asset: GeneratedPerformerAsset = {
    id: `asset_${randomUUID()}`,
    userId: standaloneUserId(),
    referenceImageId: primaryReference.id,
    generatedImageUrl,
    cutoutPngUrl: cutout.cutoutPngUrl,
    maskUrl: cutout.maskUrl,
    thumbnailUrl,
    promptUsed,
    promptHash,
    provider: candidate.assetProvider,
    generationMode: candidate.generationMode,
    optionsJson: JSON.stringify(input.options),
    providerMetadataJson: JSON.stringify({
      ...candidate.providerMetadata,
      assetPipelineMode: candidate.pipelineMode,
      identityMode,
      source_type: performerAssetSourceTypeFromMode(candidate.generationMode),
      approved_for_poster_use: true,
      locked_identity: true,
      locked_face: true,
      consent_confirmed_by_user: true,
      usage_rights_confirmed_by_user: true,
      allowed_operations: [...performerAssetAllowedOperations],
      disallowed_operations: [...performerAssetDisallowedOperations],
      baselineAssetId: baselineAsset?.id,
      referenceImageIds: {
        front: input.referenceImageIds?.front || input.referenceImageId,
        left: input.referenceImageIds?.left,
        right: input.referenceImageIds?.right,
      },
      cutoutStatus: cutout.status,
      cutoutProvider: cutout.provider,
      cutoutModel: cutout.model,
      cutoutPipelineVersion: cutout.pipelineVersion,
      faceIdentityStatus: candidate.faceIdentity.status,
      faceIdentityProvider: candidate.faceIdentity.provider,
      faceIdentityScore: candidate.faceIdentity.score,
      faceIdentityLocalScore: candidate.faceIdentity.localScore,
      faceIdentityDistance: candidate.faceIdentity.distance,
      faceIdentityDistanceThreshold: candidate.faceIdentity.distanceThreshold,
      faceIdentityThreshold: candidate.faceIdentity.threshold,
      faceIdentityLocalThreshold: candidate.faceIdentity.localThreshold,
      faceIdentityAttempt: candidate.faceIdentity.attempt,
      faceIdentityMaxAttempts: candidate.faceIdentity.maxAttempts,
      faceIdentityReason: candidate.faceIdentity.reason,
    }),
    width: cutout.width,
    height: cutout.height,
    createdAt: now,
    updatedAt: now,
  };

  await mutateDb((mutable) => {
    insertByNewest(mutable.performerAssets, asset, 80);
  });

  return asset;
}

async function generateBestCandidate(input: {
  promptUsed: string;
  identityMode: string;
  options: PerformerAssetGenerationOptions;
  references: ReferenceImage[];
  primaryReference: ReferenceImage;
  baselineAsset: GeneratedPerformerAsset | null;
}): Promise<Candidate> {
  const useGoogle = selectedImageProvider() === "google-ai-studio" && hasGoogleKey();
  const attempts = input.identityMode === "portrait_variant" && useGoogle ? Math.max(1, Math.min(getFaceIdentityConfig().maxAttempts, 10)) : 1;
  const candidates: Candidate[] = [];
  let bestRejected: Candidate | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const generated = useGoogle
      ? await generatePerformerAssetWithGoogleAiStudio({
          prompt: `${input.promptUsed}\n\nCandidate attempt ${attempt}/${attempts}.`,
          referenceImages: buildGenerationReferences(input.references, input.baselineAsset),
        })
      : await generateMockPerformerAsset({
          referenceImageUrl: input.baselineAsset?.generatedImageUrl || input.primaryReference.originalUrl,
          options: input.options,
        });
    const normalized = await sharp(generated.body, { limitInputPixels: 32_000_000 }).rotate().png().toBuffer();
    const faceIdentity =
      input.identityMode === "uploaded_photo" || input.identityMode === "face_locked"
        ? sourceLockFaceIdentity(attempt)
        : await evaluateFaceIdentity({
            referenceImage: input.primaryReference,
            generatedImage: normalized,
            generatedMimeType: "image/png",
            attempt,
          });
    const candidate: Candidate = {
      ...generated,
      body: normalized,
      faceIdentity,
      selectionScore: faceIdentitySelectionScore(faceIdentity),
      assetProvider: useGoogle ? "google-ai-studio" : "mock",
      generationMode: generationModeForIdentity(input.identityMode, useGoogle),
      pipelineMode: useGoogle ? "gemini-candidates-face-filter" : "local-fallback",
    };

    if (faceIdentity.status === "failed") {
      if (!bestRejected || candidate.selectionScore > bestRejected.selectionScore) bestRejected = candidate;
      continue;
    }
    candidates.push(candidate);
  }

  if (candidates.length) {
    candidates.sort((left, right) => right.selectionScore - left.selectionScore);
    return candidates[0]!;
  }
  if (bestRejected && process.env.FACE_IDENTITY_STRICT !== "1") return bestRejected;
  throw new StandaloneApiError(
    "FACE_IDENTITY_FILTER_REJECTED",
    bestRejected?.faceIdentity.reason || "DeepFace/local 얼굴 검사를 통과한 후보가 없습니다.",
    422,
    bestRejected?.faceIdentity,
  );
}

function resolveReferences(
  references: ReferenceImage[],
  referenceImageId: string,
  referenceImageIds?: { front?: string; left?: string; right?: string },
) {
  const ids = [referenceImageIds?.front || referenceImageId, referenceImageIds?.left, referenceImageIds?.right].filter(Boolean);
  const byId = new Map(references.map((reference) => [reference.id, reference]));
  return ids.map((id) => byId.get(id!)).filter((item): item is ReferenceImage => Boolean(item));
}

function buildGenerationReferences(references: ReferenceImage[], baselineAsset: GeneratedPerformerAsset | null) {
  const base = references.map((reference, index) => ({
    label: index === 0 ? "primary identity and face direction reference" : `auxiliary identity reference ${index}`,
    url: reference.originalUrl,
    mimeType: reference.mimeType || "image/png",
  }));
  if (baselineAsset?.generatedImageUrl) {
    base.unshift({
      label: "approved performer asset baseline",
      url: baselineAsset.generatedImageUrl,
      mimeType: "image/png",
    });
  }
  return base;
}

function buildReferenceHash(references: ReferenceImage[], baselineAsset: GeneratedPerformerAsset | null) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ references: references.map((reference) => reference.hash), baselineAssetId: baselineAsset?.id }))
    .digest("hex");
}

function selectedImageProvider() {
  const provider = (process.env.IMAGE_GENERATION_PROVIDER || process.env.PERFORMER_ASSET_PROVIDER || "mock").trim().toLowerCase();
  return provider === "google-ai-studio" || provider === "google" || provider === "gemini" ? "google-ai-studio" : "mock";
}

function hasGoogleKey() {
  return Boolean(process.env.GOOGLE_AI_STUDIO_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim());
}

function generationModeForIdentity(identityMode: string, useGoogle: boolean) {
  if (identityMode === "background_replace") return "background-replace";
  if (identityMode === "pose_synthesis") return "pose-synthesis";
  if (identityMode === "portrait_variant") return "portrait-variant";
  if (identityMode === "face_locked" || identityMode === "uploaded_photo") return "source-lock";
  return useGoogle ? "live" : "mock";
}

function sourceLockFaceIdentity(attempt: number): FaceIdentityCheckResult {
  const config = getFaceIdentityConfig();
  return {
    pipelineVersion: FACE_IDENTITY_PIPELINE_VERSION,
    status: "passed",
    provider: "source-lock",
    score: 1,
    localScore: 1,
    threshold: config.threshold,
    localThreshold: config.localThreshold,
    attempt,
    maxAttempts: config.maxAttempts,
    reason: "Uploaded/source asset is locked and reused as the identity reference.",
  };
}

async function normalizeStoredPerformerImage(body: Buffer) {
  const metadata = await sharp(body, { limitInputPixels: 32_000_000 }).rotate().metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const widthScale = width > 0 ? STORED_ASSET_MIN_WIDTH / width : 1;
  const heightScale = height > 0 ? STORED_ASSET_MIN_HEIGHT / height : 1;
  const scale = Math.min(STORED_ASSET_MAX_UPSCALE, Math.max(1, widthScale, heightScale));

  let image = sharp(body, { limitInputPixels: 32_000_000 }).rotate();
  if (width > 0 && height > 0 && scale > 1.01) {
    image = image
      .resize({
        width: Math.round(width * scale),
        height: Math.round(height * scale),
        fit: "fill",
        kernel: sharp.kernel.lanczos3,
      })
      .sharpen({ sigma: 0.35, m1: 0.2, m2: 0.8 });
  }

  return image.png({ compressionLevel: 8, adaptiveFiltering: true }).toBuffer();
}
