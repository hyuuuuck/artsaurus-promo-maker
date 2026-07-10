import type { GeneratedPerformerAsset } from "../server/types";

export type PerformerAssetSourceType = "generated_from_photo" | "directly_uploaded" | "manually_edited";
export type PerformerAssetBackgroundType = "transparent" | "plain" | "studio" | "complex" | "unknown";
export type PerformerAssetCropType = "headshot" | "bust" | "half_body" | "full_body" | "unclear";
export type PerformerAssetOrientation = "front" | "three_quarter_left" | "three_quarter_right" | "profile_left" | "profile_right" | "unclear";
export type AssetAnalysisWorkflowType = "source_photo" | "direct_asset";
export type AssetApprovalRecommendation = "approve" | "approve_with_preprocessing" | "ask_for_better_asset" | "manual_review" | "regenerate";

export type PerformerAsset = {
  id: string;
  sourceType: PerformerAssetSourceType;
  performerName?: string;
  instrumentOrRole?: string;
  fileUrl: string;
  thumbnailUrl: string;
  mimeType: string;
  width: number;
  height: number;
  backgroundType: PerformerAssetBackgroundType;
  cropType: PerformerAssetCropType;
  orientation: PerformerAssetOrientation;
  approvedForPosterUse: boolean;
  lockedIdentity: boolean;
  lockedFace: boolean;
  usageRightsConfirmedByUser: boolean;
  consentConfirmedByUser: boolean;
  allowedOperations: string[];
  disallowedOperations: string[];
  createdAt: string;
  updatedAt: string;
};

export type AssetAnalysis = {
  id: string;
  workflowType: AssetAnalysisWorkflowType;
  uploadId?: string;
  assetId?: string;
  usable: boolean;
  reasonIfUnusable?: string;
  personCount: number;
  faceVisible: boolean;
  faceClarityScore: number;
  resolutionScore: number;
  edgeQualityScore: number;
  backgroundType: PerformerAssetBackgroundType;
  recommendedPreprocessing: string[];
  approvalRecommendation: AssetApprovalRecommendation;
};

export type ApprovedPerformerAssetDescriptor = {
  asset_id: string;
  source_type: PerformerAssetSourceType;
  performer_name?: string;
  instrument_or_role?: string;
  file_url: string;
  thumbnail_url: string;
  mime_type: string;
  width: number;
  height: number;
  background_type: string;
  crop_type: string;
  orientation: string;
  approved_for_poster_use: boolean;
  locked_identity: boolean;
  locked_face: boolean;
  usage_rights_confirmed_by_user: boolean;
  consent_confirmed_by_user: boolean;
  allowed_operations: string[];
  disallowed_operations: string[];
  created_at: string;
  updated_at: string;
};

export const performerAssetAllowedOperations = [
  "x",
  "y",
  "scale",
  "crop",
  "position",
  "opacity",
  "shadow",
  "rimLight",
  "colorGrade",
  "edgeBlend",
  "zIndex",
  "subtle_color_grading",
  "edge_blending",
] as const;

export const performerAssetDisallowedOperations = [
  "change_face",
  "change_identity",
  "change_pose",
  "change_expression",
  "change_hairstyle",
  "change_clothing",
  "change_instrument",
  "assetId_replacement",
  "prompt_based_redraw",
  "regeneration",
  "replace_performer_image",
] as const;

export function performerAssetSourceTypeFromMode(mode: string): PerformerAssetSourceType {
  if (mode === "source-lock") return "directly_uploaded";
  return "generated_from_photo";
}

export function shouldBypassPerformerRegeneration(
  asset: Pick<PerformerAsset, "sourceType"> | { generationMode?: string | null; sourceType?: PerformerAssetSourceType | null },
) {
  const sourceType = asset.sourceType ?? performerAssetSourceTypeFromMode(asset.generationMode ?? "");
  return sourceType === "directly_uploaded";
}

export function buildApprovedPerformerAssetDescriptor(asset: GeneratedPerformerAsset): ApprovedPerformerAssetDescriptor {
  const normalized = buildPerformerAsset(asset);
  return {
    asset_id: normalized.id,
    source_type: normalized.sourceType,
    performer_name: normalized.performerName,
    instrument_or_role: normalized.instrumentOrRole,
    file_url: normalized.fileUrl,
    thumbnail_url: normalized.thumbnailUrl,
    mime_type: normalized.mimeType,
    width: normalized.width,
    height: normalized.height,
    background_type: normalized.backgroundType,
    crop_type: normalized.cropType,
    orientation: normalized.orientation,
    approved_for_poster_use: normalized.approvedForPosterUse,
    locked_identity: normalized.lockedIdentity,
    locked_face: normalized.lockedFace,
    usage_rights_confirmed_by_user: normalized.usageRightsConfirmedByUser,
    consent_confirmed_by_user: normalized.consentConfirmedByUser,
    allowed_operations: [...performerAssetAllowedOperations],
    disallowed_operations: [...performerAssetDisallowedOperations],
    created_at: normalized.createdAt,
    updated_at: normalized.updatedAt,
  };
}

export function buildPerformerAsset(asset: GeneratedPerformerAsset): PerformerAsset {
  const options = parseJson(asset.optionsJson);
  const metadata = parseJson(asset.providerMetadataJson);
  const backgroundType = normalizeBackgroundType(stringValue(metadata.backgroundType) || stringValue(options.backgroundPolicy));
  const cropType = normalizeCropType(stringValue(metadata.cropType));
  const orientation = normalizeOrientation(stringValue(metadata.orientation));
  const fileUrl = stringValue(asset.cutoutPngUrl) || stringValue(asset.generatedImageUrl) || "";
  const createdAt = dateValue(asset.createdAt);
  const updatedAt = dateValue((asset as GeneratedPerformerAsset & { updatedAt?: Date | string }).updatedAt ?? asset.createdAt);
  return {
    id: asset.id,
    sourceType: performerAssetSourceTypeFromMode(asset.generationMode),
    performerName: stringValue(options.performerName),
    instrumentOrRole: stringValue(options.instrument),
    fileUrl,
    thumbnailUrl: stringValue(asset.thumbnailUrl) || fileUrl,
    mimeType: inferMimeType(fileUrl),
    width: numberValue(asset.width),
    height: numberValue(asset.height),
    backgroundType,
    cropType,
    orientation,
    approvedForPosterUse: booleanValue(metadata.approved_for_poster_use, true),
    lockedIdentity: booleanValue(metadata.locked_identity, true),
    lockedFace: booleanValue(metadata.locked_face, true),
    usageRightsConfirmedByUser: booleanValue(metadata.usage_rights_confirmed_by_user, booleanValue(metadata.usageRightsConfirmedByUser, false)),
    consentConfirmedByUser: booleanValue(metadata.consent_confirmed_by_user, booleanValue(metadata.consentConfirmedByUser, false)),
    allowedOperations: [...performerAssetAllowedOperations],
    disallowedOperations: [...performerAssetDisallowedOperations],
    createdAt,
    updatedAt,
  };
}

export function isPerformerAssetApprovedForPosterUse(asset: PerformerAsset) {
  return asset.approvedForPosterUse && asset.lockedIdentity && asset.lockedFace;
}

export function analyzeSourcePhoto(input: {
  uploadId: string;
  width: number;
  height: number;
  backgroundType?: PerformerAssetBackgroundType;
}): AssetAnalysis {
  const resolutionScore = scoreResolution(input.width, input.height);
  return {
    id: `analysis-source-${input.uploadId}`,
    workflowType: "source_photo",
    uploadId: input.uploadId,
    usable: resolutionScore >= 0.45,
    reasonIfUnusable: resolutionScore < 0.45 ? "이미지 해상도가 낮아 프로필 에셋 생성 품질이 불안정할 수 있습니다." : undefined,
    personCount: 1,
    faceVisible: true,
    faceClarityScore: Math.max(0.45, resolutionScore),
    resolutionScore,
    edgeQualityScore: 0.5,
    backgroundType: input.backgroundType ?? "unknown",
    recommendedPreprocessing: ["profile_asset_generation"],
    approvalRecommendation: resolutionScore >= 0.7 ? "approve" : "approve_with_preprocessing",
  };
}

export function analyzeDirectAsset(input: {
  assetId: string;
  width: number;
  height: number;
  backgroundType?: PerformerAssetBackgroundType;
}): AssetAnalysis {
  const resolutionScore = scoreResolution(input.width, input.height);
  const backgroundType = input.backgroundType ?? "unknown";
  const usable = resolutionScore >= 0.4;
  return {
    id: `analysis-direct-${input.assetId}`,
    workflowType: "direct_asset",
    assetId: input.assetId,
    usable,
    reasonIfUnusable: usable ? undefined : "직접 포스터에 배치하기에는 이미지 해상도가 낮습니다.",
    personCount: 1,
    faceVisible: true,
    faceClarityScore: Math.max(0.45, resolutionScore),
    resolutionScore,
    edgeQualityScore: backgroundType === "transparent" ? 0.9 : 0.55,
    backgroundType,
    recommendedPreprocessing: backgroundType === "transparent" ? [] : ["edge_refinement"],
    approvalRecommendation: usable ? "approve" : "ask_for_better_asset",
  };
}

function parseJson(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function dateValue(value: Date | string | null | undefined) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value;
  return new Date(0).toISOString();
}

function inferMimeType(url: string) {
  if (/\.webp(?:$|\?)/i.test(url)) return "image/webp";
  if (/\.jpe?g(?:$|\?)/i.test(url)) return "image/jpeg";
  return "image/png";
}

function normalizeBackgroundType(value?: string): PerformerAssetBackgroundType {
  if (value === "transparent" || value === "plain" || value === "studio" || value === "complex") return value;
  if (value === "solid-cutout") return "transparent";
  if (value === "soft-studio" || value === "stage-light") return "studio";
  return "unknown";
}

function normalizeCropType(value?: string): PerformerAssetCropType {
  if (value === "headshot" || value === "bust" || value === "half_body" || value === "full_body") return value;
  return "unclear";
}

function normalizeOrientation(value?: string): PerformerAssetOrientation {
  if (value === "front" || value === "three_quarter_left" || value === "three_quarter_right" || value === "profile_left" || value === "profile_right") {
    return value;
  }
  return "unclear";
}

function scoreResolution(width: number, height: number) {
  const pixels = Math.max(0, width * height);
  return Math.max(0, Math.min(1, pixels / 1_200_000));
}
