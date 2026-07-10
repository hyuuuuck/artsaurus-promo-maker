import sharp from "sharp";
import type { GeneratedPerformerAsset, ReferenceImage } from "../server/types";
import {
  compareFaceIdentityCandidates,
  evaluateFaceIdentity,
  faceIdentitySelectionScore,
  type FaceIdentityCheckResult,
} from "@/lib/image-generation/faceIdentity";
import { generatePerformerAssetWithComfyUi, getComfyUiPipelineStatus } from "@/lib/image-generation/providers/comfyUiProvider";
import { generatePerformerAssetWithGoogleAiStudio, type GeneratedImageResult } from "@/lib/image-generation/providers/googleAiStudioProvider";
import { createPerformerCutout } from "@/lib/image-processing/cutout";
import { ARTSAURUS_CLASSICAL_PERFORMER_RULE } from "@/lib/prompt/artsaurusPromptRules";
import { shouldBypassPerformerRegeneration } from "./assetPolicy";
import type { PosterConcertInfo, PosterTemplateId } from "./types";
import { readImageUrlToBuffer, storePosterObject } from "./storage";
import type { PerformerVisual, PosterTemplateMeta } from "./posterProposalTemplates";
import type { PosterGenerationPlan } from "./generationOrchestrator";
import { readDb } from "../server/localStore";

export const POSTER_PROPOSAL_VARIANT_PROMPT_VERSION = "poster-proposal-performer-v3";
const DUPLICATE_CUTOUT_IOU_THRESHOLD = 0.88;
const DEFAULT_VARIANT_CANDIDATE_POOL_SIZE = 10;

type GenerateProposalVariantsInput = {
  userId: string;
  performerAsset: GeneratedPerformerAsset;
  concertInfo: PosterConcertInfo;
  templates: PosterTemplateMeta[];
  orchestrationPlan?: PosterGenerationPlan;
};

type PerformerAssetOptions = {
  instrument?: string;
  actionPrompt?: string;
  wardrobe?: string;
  retouchPrompt?: string;
};

type ProposalVariantProvider = "off" | "google-ai-studio" | "comfyui-faceid-controlnet";

type EvaluatedVariantCandidate = {
  body: Buffer;
  faceIdentity: FaceIdentityCheckResult;
  selectionScore: number;
};

export type ProposalVariantPipelineStatus = {
  mode: string;
  provider: ProposalVariantProvider;
  ready: boolean;
  googleKeyPresent: boolean;
  comfyPoseReady: boolean;
  candidatePoolSize: number;
};

export async function generateProposalPerformerVariants(
  input: GenerateProposalVariantsInput,
): Promise<Partial<Record<PosterTemplateId, PerformerVisual>>> {
  if (shouldBypassPerformerRegeneration(input.performerAsset)) return {};

  const provider = selectedProposalVariantProvider();
  if (provider === "off") return {};
  if (provider === "google-ai-studio" && !hasGoogleImageGenerationKey()) return {};
  if (provider === "comfyui-faceid-controlnet" && !getComfyUiPipelineStatus().poseReady) return {};

  const referenceImages = await resolveAssetReferenceImages(input.performerAsset, input.userId);
  const primaryReference = referenceImages[0];
  if (!primaryReference) return {};

  const options = parseAssetOptions(input.performerAsset.optionsJson);
  const result: Partial<Record<PosterTemplateId, PerformerVisual>> = {};

  for (const template of input.templates) {
    try {
      const visual = await generateOneProposalVariant({
        userId: input.userId,
        performerAsset: input.performerAsset,
        referenceImages,
        primaryReference,
        concertInfo: input.concertInfo,
        template,
        options,
        provider,
        orchestrationPlan: input.orchestrationPlan,
      });
      if (visual) result[template.id] = visual;
    } catch (error) {
      console.warn("poster proposal performer variant generation failed", {
        templateId: template.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

async function generateOneProposalVariant(input: {
  userId: string;
  performerAsset: GeneratedPerformerAsset;
  referenceImages: ReferenceImage[];
  primaryReference: ReferenceImage;
  concertInfo: PosterConcertInfo;
  template: PosterTemplateMeta;
  options: PerformerAssetOptions;
  provider: ProposalVariantProvider;
  orchestrationPlan?: PosterGenerationPlan;
}): Promise<PerformerVisual | null> {
  const prompt = buildProposalVariantPrompt({
    concertInfo: input.concertInfo,
    template: input.template,
    options: input.options,
    orchestrationPlan: input.orchestrationPlan,
  });
  const referenceImages = buildVariantReferences(input.performerAsset, input.referenceImages);

  const candidates: EvaluatedVariantCandidate[] = [];
  let bestRejected: EvaluatedVariantCandidate | null = null;
  const candidatePoolSize = proposalVariantCandidatePoolSize(input.provider);

  for (let attempt = 1; attempt <= candidatePoolSize; attempt += 1) {
    let generated: GeneratedImageResult;
    try {
      generated =
        input.provider === "comfyui-faceid-controlnet"
          ? await generatePerformerAssetWithComfyUi({
              kind: "pose",
              prompt,
              referenceImages,
            })
          : await generatePerformerAssetWithGoogleAiStudio({
              prompt,
              referenceImages,
            });
    } catch (error) {
      if (!candidates.length) throw error;
      console.warn("poster proposal performer variant candidate generation stopped early", {
        templateId: input.template.id,
        attempt,
        acceptedCandidates: candidates.length,
        error: error instanceof Error ? error.message : String(error),
      });
      break;
    }
    const body = await sharp(generated.body, { limitInputPixels: 32_000_000 }).rotate().png().toBuffer();
    const faceIdentity = await evaluateFaceIdentity({
      referenceImage: input.primaryReference,
      generatedImage: body,
      generatedMimeType: "image/png",
      attempt,
    });
    const candidate = {
      body,
      faceIdentity,
      selectionScore: faceIdentitySelectionScore(faceIdentity),
    };

    if (faceIdentity.status === "failed") {
      if (compareFaceIdentityCandidates(faceIdentity, bestRejected?.faceIdentity) > 0) {
        bestRejected = candidate;
      }
      continue;
    }

    candidates.push(candidate);
  }

  if (!candidates.length) {
    console.warn("poster proposal performer variants rejected by identity check", {
      templateId: input.template.id,
      candidatePoolSize,
      bestRejectedScore: bestRejected?.selectionScore,
      score: bestRejected?.faceIdentity.score,
      localScore: bestRejected?.faceIdentity.localScore,
      reason: bestRejected?.faceIdentity.reason,
    });
    return null;
  }

  candidates.sort((left, right) => compareFaceIdentityCandidates(right.faceIdentity, left.faceIdentity));

  for (const candidate of candidates) {
    const generatedImageUrl = await storePosterObject({
      directory: "poster-assets",
      userId: input.userId,
      body: candidate.body,
      contentType: "image/png",
      extension: "png",
    });
    const cutout = await createPerformerCutout({
      userId: input.userId,
      imageUrl: generatedImageUrl,
    });
    const duplicateCutout = await hasNearDuplicateCutout(input.performerAsset.cutoutPngUrl, cutout.cutoutPngUrl);
    if (duplicateCutout) {
      console.warn("poster proposal performer variant rejected as copy-paste cutout", {
        templateId: input.template.id,
        selectedAttempt: candidate.faceIdentity.attempt,
        selectedScore: candidate.selectionScore,
      });
      continue;
    }

    return {
      generatedImageUrl,
      cutoutPngUrl: cutout.cutoutPngUrl,
    };
  }

  return null;
}

async function hasNearDuplicateCutout(sourceCutoutUrl: string, generatedCutoutUrl: string) {
  if (!sourceCutoutUrl || !generatedCutoutUrl) return false;
  const [source, generated] = await Promise.all([
    cutoutAlphaSignature(await readImageUrlToBuffer(sourceCutoutUrl)),
    cutoutAlphaSignature(await readImageUrlToBuffer(generatedCutoutUrl)),
  ]);
  if (source.length !== generated.length) return false;

  let intersection = 0;
  let union = 0;
  for (let index = 0; index < source.length; index += 1) {
    const a = (source[index] ?? 0) > 64;
    const b = (generated[index] ?? 0) > 64;
    if (a && b) intersection += 1;
    if (a || b) union += 1;
  }
  if (!union) return false;
  return intersection / union >= DUPLICATE_CUTOUT_IOU_THRESHOLD;
}

async function cutoutAlphaSignature(body: Buffer) {
  const { data } = await sharp(body, { limitInputPixels: 32_000_000 })
    .rotate()
    .resize({
      width: 96,
      height: 120,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const alpha = Buffer.alloc(96 * 120);
  for (let pixelIndex = 0; pixelIndex < alpha.length; pixelIndex += 1) {
    alpha[pixelIndex] = data[pixelIndex * 4 + 3] ?? 0;
  }
  return alpha;
}

export function buildProposalVariantPrompt(input: {
  concertInfo: PosterConcertInfo;
  template: PosterTemplateMeta;
  options: PerformerAssetOptions;
  orchestrationPlan?: PosterGenerationPlan;
}) {
  const instrument = inferInstrument(input.options, input.concertInfo);
  const instrumentDirection = instrument
    ? `Instrument/performance context: ${instrument}. If this is piano or pianist, use a grand piano, keyboard, bench, hands, or recital-stage context to imply performance, but keep the performer's face turned toward the camera at the same angle as the identity reference. If another instrument is specified or visible in references, use that instrument naturally while preserving the face angle.`
    : "Instrument/performance context: infer only from visible reference images. If no instrument is clearly visible or specified, create an elegant recital profile image without inventing a random instrument, and keep the face angle locked to the reference.";

  return [
    POSTER_PROPOSAL_VARIANT_PROMPT_VERSION,
    "Generate one new standalone performer image for a concert poster proposal.",
    ARTSAURUS_CLASSICAL_PERFORMER_RULE,
    "This is not a poster layout. Do not add text, letters, numbers, logos, QR codes, tickets, signage, frames, watermarks, or graphic design elements.",
    "Use the references to preserve the same person, face, hairstyle family, age impression, and overall performer identity.",
    "Face-angle lock is mandatory: preserve the primary reference face direction, camera yaw, pitch, roll, gaze direction, expression family, hairline, eye spacing, nose shape, mouth shape, jawline, and cheek structure.",
    "If the primary reference face is frontal, keep the generated face frontal or only a very slight three-quarter turn. Do not turn it into a side profile, looking-away portrait, over-the-shoulder pose, or a noticeably different head angle.",
    "If the primary reference face is already three-quarter, keep the same three-quarter direction and degree. Do not mirror it or rotate further unless the user uploaded a matching formal performance reference for that exact angle.",
    "Do not paste the provided transparent cutout or uploaded photo unchanged. Do not merely crop, resize, remove the background, or copy the same full-body pose. Create a new professional promotional image by varying background, lighting, outfit neatness, instrument context, arm/hand placement, and lower-body composition while keeping the face direction stable.",
    "The staging, lighting, clothing polish, background, and performance context may change meaningfully, but the face camera angle must stay close enough that the performer feels like the same person at a glance.",
    "Auxiliary reference photos may show intended instrument, posture, or styling. Use visible instruments and formal performance posture from auxiliary references as guidance, but ignore casual selfie angle, tilted head selfie composition, cute hand gestures, peace signs, finger hearts, sticker-photo poses, and social-media styling.",
    "If an auxiliary image contains both a classical instrument and a casual selfie pose, extract the instrument context only and create a serious concert/performance pose.",
    "When creating a performance pose, rotate or reposition the torso, hands, instrument, chair, piano, or background rather than rotating the face away from the reference angle.",
    "Keep the face clear, large enough, and recognizable. Avoid changing gender presentation, age, facial structure, expression family, face angle, or body proportions.",
    instrumentDirection,
    input.options.actionPrompt ? `User pose note: ${input.options.actionPrompt}` : "",
    input.orchestrationPlan?.naturalLanguagePrompt ? `User poster detail request: ${input.orchestrationPlan.naturalLanguagePrompt}` : "",
    input.orchestrationPlan ? `Orchestrator pose policy: ${input.orchestrationPlan.performerAssetJob.posePolicy}. ${input.orchestrationPlan.performerAssetJob.poseInstruction}` : "",
    input.orchestrationPlan ? `Orchestrator background direction: ${input.orchestrationPlan.backgroundJob.instruction}` : "",
    input.options.wardrobe ? `Wardrobe context: ${input.options.wardrobe}` : "",
    input.options.retouchPrompt ? `Photo polish note: ${input.options.retouchPrompt}` : "",
    `Poster template mood: ${templateMood(input.template.id)}.`,
    "Use a clean studio or recital-stage background with strong edge separation around hair, shoulders, hands, outfit, and instrument so a transparent PNG cutout can be extracted later.",
    "Return only the image.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildVariantReferences(performerAsset: GeneratedPerformerAsset, referenceImages: ReferenceImage[]) {
  const references = [
    {
      label:
        "current transparent performer cutout. Use as the main identity and face-angle lock reference, including face direction, gaze, expression, hairline, outfit, silhouette, and source continuity, but do not paste or reuse this exact full-body pose unchanged",
      url: performerAsset.cutoutPngUrl,
      mimeType: "image/png",
    },
    {
      label:
        "current generated performer asset. Use as identity, face camera angle, expression, and profile-quality reference, but create a new performance/profile variant without changing the face direction",
      url: performerAsset.generatedImageUrl,
      mimeType: "image/png",
    },
  ];

  for (const [index, reference] of referenceImages.entries()) {
    if (index === 0) {
      references.push({
        label: "primary uploaded performer photo. Strict identity and face-angle reference for face direction, expression, hair, and body type",
        url: reference.faceCropUrl || reference.originalUrl,
        mimeType: reference.faceCropUrl ? "image/webp" : reference.mimeType,
      });
    } else {
      references.push({
        label:
          "auxiliary uploaded performer photo. Use visible classical instrument, concert outfit, and formal performance context only. Do not override the primary face angle. Ignore casual selfie pose, cute hand gesture, finger heart, peace sign, sticker-photo composition, and social-media styling",
        url: reference.originalUrl,
        mimeType: reference.mimeType,
      });
    }
  }

  return references;
}

async function resolveAssetReferenceImages(performerAsset: GeneratedPerformerAsset, userId: string) {
  const metadata = parseMetadata(performerAsset.providerMetadataJson);
  const ids = [
    performerAsset.referenceImageId,
    ...Object.values(readReferenceImageIds(metadata)).filter((id): id is string => typeof id === "string" && Boolean(id)),
  ];
  const uniqueIds = [...new Set(ids)].filter((id): id is string => typeof id === "string" && Boolean(id));
  const db = await readDb();
  const images = db.referenceImages.filter((image) => image.userId === userId && uniqueIds.includes(image.id));
  const byId = new Map(images.map((image) => [image.id, image]));
  return uniqueIds.flatMap((id) => {
    const image = byId.get(id);
    return image ? [image] : [];
  });
}

function parseAssetOptions(value: string | null): PerformerAssetOptions {
  const parsed = parseMetadata(value);
  return {
    instrument: typeof parsed.instrument === "string" ? parsed.instrument : undefined,
    actionPrompt: typeof parsed.actionPrompt === "string" ? parsed.actionPrompt : undefined,
    wardrobe: typeof parsed.wardrobe === "string" ? parsed.wardrobe : undefined,
    retouchPrompt: typeof parsed.retouchPrompt === "string" ? parsed.retouchPrompt : undefined,
  };
}

function inferInstrument(options: PerformerAssetOptions, concertInfo: PosterConcertInfo) {
  const joined = [options.instrument, concertInfo.title, concertInfo.subtitle, concertInfo.program]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!joined) return "";
  if (/피아노|piano|pianist/.test(joined)) return "piano / pianist";
  if (/바이올린|violin|violinist/.test(joined)) return "violin";
  if (/첼로|cello|cellist/.test(joined)) return "cello";
  if (/비올라|viola/.test(joined)) return "viola";
  if (/플루트|flute|flutist/.test(joined)) return "flute";
  if (/성악|보컬|soprano|tenor|baritone|vocal|voice/.test(joined)) return "vocal recital";
  return options.instrument ?? "";
}

function templateMood(templateId: PosterTemplateId) {
  switch (templateId) {
    case "minimal-recital":
      return "minimal premium recital portrait, quiet confidence, refined studio lighting, face angle close to the identity reference";
    case "black-editorial":
      return "serious dramatic black editorial concert image, directional lighting, bold silhouette, face still toward camera, never a side-profile face, cute selfie, or sticker-photo pose";
    case "concert-hall-classic":
      return "formal concert hall promotional photo, elegant classical recital mood, same face direction as reference";
    case "modern-typography":
      return "modern confident promotional image, clean geometry, energetic body posture, face angle preserved";
    case "soft-romantic":
      return "soft romantic performer image, gentle highlights, graceful stage mood, no side-profile face unless the primary reference is side-profile";
    case "experimental-contemporary":
      return "contemporary performance context, modern gallery lighting, dynamic body composition with face angle locked";
    case "premium-monochrome":
      return "premium monochrome editorial portrait, high contrast, luxury recital look, same face direction as reference";
    case "grid-portfolio":
      return "portfolio-style alternate performer image, clean and versatile, face direction preserved";
  }
}

function hasGoogleImageGenerationKey() {
  return Boolean(process.env.GOOGLE_AI_STUDIO_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim());
}

export function selectedProposalVariantProvider(): ProposalVariantProvider {
  const value = (process.env.POSTER_PROPOSAL_VARIANT_PROVIDER?.trim() || "auto").toLowerCase();
  if (value === "google-ai-studio" || value === "google") return "google-ai-studio";
  if (value === "comfyui-faceid-controlnet" || value === "comfyui") return "comfyui-faceid-controlnet";
  if (value === "auto") {
    if (getComfyUiPipelineStatus().poseReady) return "comfyui-faceid-controlnet";
    if (hasGoogleImageGenerationKey()) return "google-ai-studio";
  }
  return "off";
}

function proposalVariantCandidatePoolSize(provider: ProposalVariantProvider) {
  if (provider === "off") return 0;
  const value = Number(process.env.POSTER_PROPOSAL_VARIANT_CANDIDATE_POOL_SIZE);
  if (!Number.isFinite(value)) return DEFAULT_VARIANT_CANDIDATE_POOL_SIZE;
  return Math.max(1, Math.min(12, Math.round(value)));
}

export function getProposalVariantPipelineStatus(): ProposalVariantPipelineStatus {
  const comfyStatus = getComfyUiPipelineStatus();
  const provider = selectedProposalVariantProvider();
  const googleKeyPresent = hasGoogleImageGenerationKey();
  const ready =
    provider === "google-ai-studio"
      ? googleKeyPresent
      : provider === "comfyui-faceid-controlnet"
        ? comfyStatus.poseReady
        : false;
  return {
    mode: (process.env.POSTER_PROPOSAL_VARIANT_PROVIDER?.trim() || "auto").toLowerCase(),
    provider,
    ready,
    googleKeyPresent,
    comfyPoseReady: comfyStatus.poseReady,
    candidatePoolSize: proposalVariantCandidatePoolSize(provider),
  };
}

function readReferenceImageIds(metadata: Record<string, unknown>) {
  const value = metadata.referenceImageIds;
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseMetadata(value: string | null) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
