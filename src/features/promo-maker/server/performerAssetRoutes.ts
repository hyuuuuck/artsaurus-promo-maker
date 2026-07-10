import { buildApprovedPerformerAssetDescriptor } from "../poster/assetPolicy";
import type { PerformerAssetGenerationOptions } from "../poster/types";
import { errorResponse, ok, parseError, parseRecord, readJson } from "./http";
import { generatePerformerAsset, getPerformerAssetPipelineStatus, listPerformerAssets } from "./performerAssetService";

export async function GET() {
  try {
    const performerAssets = await listPerformerAssets();
    return ok({
      pipeline: await getPerformerAssetPipelineStatus(),
      performerAssets,
      assetLibrary: performerAssets.map(buildApprovedPerformerAssetDescriptor),
    });
  } catch (error) {
    return parseError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = parseRecord(await readJson(request));
    const referenceImageId = readString(payload.referenceImageId);
    if (!referenceImageId) return errorResponse("REFERENCE_IMAGE_REQUIRED", "참고 사진을 먼저 준비해 주세요.", 400);

    const performerAsset = await generatePerformerAsset({
      referenceImageId,
      referenceImageIds: readReferenceImageIds(payload.referenceImageIds),
      baselineAssetId: readString(payload.baselineAssetId),
      options: readGenerationOptions(payload.options),
      consentToPersonImageProcessing: payload.consentToPersonImageProcessing === true,
      usageRightsConfirmed: payload.usageRightsConfirmed === true,
      regenerate: payload.regenerate === true,
    });

    return ok({ performerAsset });
  } catch (error) {
    return parseError(error);
  }
}

function readGenerationOptions(value: unknown): PerformerAssetGenerationOptions {
  const input = parseRecord(value);
  return {
    identityMode: readString(input.identityMode) === "portrait_variant" ? "portrait_variant" : readIdentityMode(input.identityMode),
    style: readStyle(input.style),
    retouchPrompt: readString(input.retouchPrompt),
    stylePrompt: readString(input.stylePrompt),
    instrument: readString(input.instrument),
    wardrobe: readString(input.wardrobe),
    wardrobePrompt: readString(input.wardrobePrompt),
    actionPrompt: readString(input.actionPrompt),
    mood: readString(input.mood),
    backgroundPolicy: readBackgroundPolicy(input.backgroundPolicy),
    useDefaultProfileFallback: input.useDefaultProfileFallback !== false,
  };
}

function readReferenceImageIds(value: unknown) {
  const input = parseRecord(value);
  return {
    front: readString(input.front),
    left: readString(input.left),
    right: readString(input.right),
  };
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readIdentityMode(value: unknown): PerformerAssetGenerationOptions["identityMode"] {
  const allowed = new Set(["uploaded_photo", "face_locked", "background_replace", "pose_synthesis", "portrait_variant"]);
  return typeof value === "string" && allowed.has(value) ? (value as PerformerAssetGenerationOptions["identityMode"]) : "background_replace";
}

function readStyle(value: unknown): PerformerAssetGenerationOptions["style"] {
  const allowed = new Set(["clean", "dramatic", "romantic", "editorial", "contemporary"]);
  return typeof value === "string" && allowed.has(value) ? (value as PerformerAssetGenerationOptions["style"]) : "clean";
}

function readBackgroundPolicy(value: unknown): PerformerAssetGenerationOptions["backgroundPolicy"] {
  const allowed = new Set(["solid-cutout", "transparent", "soft-studio", "stage-light"]);
  return typeof value === "string" && allowed.has(value) ? (value as PerformerAssetGenerationOptions["backgroundPolicy"]) : "solid-cutout";
}
