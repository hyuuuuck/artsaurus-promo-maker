import crypto from "node:crypto";
import type { PerformerAssetGenerationOptions } from "@/features/promo-maker/poster/types";
import { ARTSAURUS_CLASSICAL_PERFORMER_RULE } from "@/lib/prompt/artsaurusPromptRules";

export const PERFORMER_ASSET_PROMPT_VERSION = "performer-asset-v22";

type BuildPromptInput = {
  options: PerformerAssetGenerationOptions;
  referenceImageHash: string;
  referenceImageCount?: number;
};

const styleDescriptions: Record<PerformerAssetGenerationOptions["style"], string> = {
  clean: "clean premium recital portrait, natural proportions, refined studio lighting",
  dramatic: "dramatic concert poster portrait, strong stage contrast, cinematic light",
  romantic: "soft romantic classical recital portrait, gentle highlights, elegant atmosphere",
  editorial: "black editorial music magazine portrait, controlled shadows, luxury typography-ready negative space",
  contemporary: "experimental contemporary performance portrait, modern gallery lighting, bold silhouette",
};

const backgroundDescriptions: Record<PerformerAssetGenerationOptions["backgroundPolicy"], string> = {
  "solid-cutout": "one uninterrupted flat matte solid color background optimized for later background removal; prefer light gray, pale blue, or studio-neutral tones",
  transparent: "plain neutral background suitable for transparent cutout extraction",
  "soft-studio": "subtle studio background with very low detail",
  "stage-light": "soft stage-light ambience with no readable signage",
};

export function buildPerformerAssetPrompt({ options }: BuildPromptInput) {
  const identityMode = identityModeDirection(options.identityMode);
  const shouldAllowPerformancePose = options.identityMode === "portrait_variant" || options.identityMode === "pose_synthesis";
  const instrument = options.instrument
    ? shouldAllowPerformancePose
      ? `Instrument context: ${options.instrument}. For profile candidates and pose synthesis, this may be visible as a serious classical performance context. If the instrument is piano or 피아노, a grand piano, keyboard edge, bench, hands near keys, or seated pianist posture is allowed. If another instrument is specified or visible in references, use it naturally while keeping the face angle close to the approved asset.`
      : `Instrument context: ${options.instrument}. Treat this as performer metadata for styling, posture, and mood. In background-replacement baseline mode, do not add a new visible instrument unless it already exists in the source photo.`
    : shouldAllowPerformancePose
      ? "Instrument context: no instrument was provided. Do not invent a random instrument, but you may create a serious classical musician posture through hands, shoulders, seated/standing stance, recital lighting, and stage context."
      : "Instrument context: no instrument was provided. Do not add, invent, or show any musical instrument, bow, microphone, music stand, sheet music, or handheld prop. Create a clean upper-body performer portrait without props.";
  const wardrobe = options.wardrobe
    ? `Wardrobe direction: ${options.wardrobe}.`
    : "Wardrobe direction: infer stagewear from the reference styling. For feminine styling, use an elegant concert dress, gown, blouse, or formal stagewear. For masculine styling, use a black suit, tuxedo, or formal shirt. If uncertain, use neutral formal concert attire. Do not change body shape, face, age, or gender presentation.";
  const mood = options.mood ? `Mood: ${options.mood}.` : "Mood: calm, professional, poster-ready.";
  const retouchPrompt = visualDirection("User photo retouch request", options.retouchPrompt);
  const stylePrompt = visualDirection("User mood/finish request", options.stylePrompt);
  const wardrobePrompt = visualDirection("User outfit cleanup request", options.wardrobePrompt);
  const actionPrompt = visualDirection("User pose reference note", options.actionPrompt);

  return [
    "Create a high-quality natural performer profile asset from the uploaded reference photo.",
    "The output is for a concert poster template system for small musicians and ensembles.",
    ARTSAURUS_CLASSICAL_PERFORMER_RULE,
    identityMode,
    "Do not return the uploaded image unchanged. Do not merely crop, resize, sharpen, or remove its background. Recreate a polished studio-quality profile photograph of the same performer, with cleaner lighting, higher apparent resolution, refined print-ready detail, and a simple professional background.",
    "Use the first uploaded photo as the identity and pose anchor. Keep the same person's facial identity, expression, hairstyle family, clothing category, hand/arm placement, body silhouette, and approximate pose. You may modestly improve framing, posture neatness, lighting, color, skin texture, fabric detail, and background quality.",
    "If the source image is low-resolution, casual, compressed, or poorly lit, convert it into a professional recital/promotional profile photo while keeping the same performer recognizable.",
    "Do not create a new person, a similar-looking substitute, a different age impression, a different expression, or a different face. Do not de-age, masculinize, feminize, or otherwise redesign the person.",
    shouldAllowPerformancePose
      ? "Preserve the original person's face, expression family, hairline, hairstyle, eye shape, nose, mouth, jawline, and outfit category. The face camera angle and gaze must stay close, but body pose, hands, arms, shoulders, seated/standing posture, crop, lower body, and instrument staging may change to create a real musician profile candidate."
      : "Preserve the original person's face, expression, hairline, hairstyle, eye shape, nose, mouth, jawline, outfit category, body pose, hand position, and instrument position unless those details are already present in another uploaded reference photo.",
    "Use auxiliary uploaded photos only to confirm the same performer's face, hairstyle, styling, instrument, and profile-photo finish. Do not copy casual selfie gestures, cute hand poses, photo booth composition, or social-media posture from auxiliary photos.",
    shouldAllowPerformancePose
      ? "Treat user-provided text as performance-profile direction. Apply it to posture, hands, arms, instrument context, crop, lighting, background, clarity, and recital mood. If a large pose conflicts with identity, keep the face angle stable and reduce the pose change, rather than turning the head away or making a different person."
      : "Treat user-provided text as profile-photo polish direction only. Apply it to color, clarity, lighting, background cleanup, subtle skin/print polish, and overall recital-profile mood. If the user mentions another pose, treat it as a note that a matching pose photo should be uploaded; do not create that pose from text alone. Ignore requests to change face, body, outfit category, hair family, camera angle, or add props that are not visible in the uploaded photo.",
    `Visual style: ${styleDescriptions[options.style]}.`,
    `Background policy: ${backgroundDescriptions[options.backgroundPolicy]}.`,
    instrument,
    wardrobe,
    retouchPrompt,
    stylePrompt,
    wardrobePrompt,
    actionPrompt,
    mood,
    shouldAllowPerformancePose
      ? "Follow the candidate slot strategy. If this slot is a preservation baseline, prioritize print-quality polish, background cleanup, and identity stability over pose change. If this slot is a variation candidate, it must differ from the approved asset through performance-ready pose, hand/arm placement, instrument/stage context, crop, negative space, or silhouette while keeping the same face angle close."
      : "Keep the uploaded photo's person and approximate pose recognizable, but make the output visibly more professional than the source photo.",
    "Compose a head-and-torso, half-body, or seated profile asset matching the source pose. Keep the performer large enough for poster use, with clean edges around hair, shoulders, arms, and clothing.",
    shouldAllowPerformancePose
      ? "Prefer clean studio or recital-stage backgrounds suitable for later cutout extraction. Avoid busy scenery, signage, casual props, social-media gestures, and face-angle swings; use only serious classical performance objects or instruments when relevant."
      : "Prefer a clean, simple studio background suitable for later cutout extraction. Avoid busy generated scenery, extra props, furniture, signage, and dramatic pose changes.",
    "Do not create a poster layout. Do not include any typography, letters, numbers, logos, watermarks, QR codes, ticket text, program text, or readable signage.",
    "Leave clear color separation around the hair, shoulders, and outfit edges so the server can produce a transparent PNG cutout after generation.",
    "Return only the generated image.",
  ].filter(Boolean).join("\n");
}

function identityModeDirection(identityMode: PerformerAssetGenerationOptions["identityMode"]) {
  if (identityMode === "background_replace") {
    return [
      "Identity mode: background replacement baseline.",
      "Keep the exact same performer, face, expression, head angle, gaze, body pose, hand placement, clothing shape, and silhouette from the primary reference.",
      "Change only the background, lighting finish, and print-quality polish. Do not synthesize a new pose, new outfit, new instrument, new body, or new face.",
      "This baseline is used to measure face and pose consistency before any pose synthesis is attempted.",
    ].join(" ");
  }
  if (identityMode === "pose_synthesis") {
    return [
      "Identity mode: FaceID + pose-guided synthesis.",
      "Use the primary reference as the face identity lock and the auxiliary pose/instrument reference as pose guidance.",
      "Preserve the face identity and face direction as much as possible; use the pose guidance for body, hands, instrument, and stage context.",
      "If face identity conflicts with the pose instruction, prioritize the face identity and reduce the pose change.",
    ].join(" ");
  }
  if (identityMode === "portrait_variant") {
    return [
      "Identity mode: approved-asset-based profile candidate generation.",
      "Use the approved performer asset and transparent cutout as identity, face-angle, outfit-category, and silhouette references, not as a literal sticker to paste unchanged unless the candidate slot explicitly requests a preservation baseline.",
      "Create a professional classical musician profile photograph candidate according to the requested candidate slot strategy. Some slots intentionally preserve the original pose for a safe print-quality baseline; other slots should vary hands, arms, shoulders, seated/standing posture, crop, lower-body silhouette, or instrument/performance context.",
      "Preserve apparent identity, face direction, gaze, facial proportions, age impression, skin tone, hairline, hairstyle family, eyes, nose, mouth, jawline, expression, outfit category, and instrument presence.",
      "Do not rotate the face into a noticeably different angle. Do not make a different person. If a larger pose change is requested, keep the face angle close and move the body, hands, instrument, chair, piano, or crop instead.",
    ].join(" ");
  }
  return "Identity mode: uploaded-photo-based profile reconstruction. The first uploaded photo is the identity and pose reference, but the output must be a newly polished professional profile asset, not a simple copy, crop, or resize of the input.";
}

function visualDirection(label: string, value?: string) {
  const trimmed = value?.trim();
  return trimmed ? `${label}: ${trimmed}` : "";
}

export function hashPerformerAssetPrompt(input: BuildPromptInput) {
  const prompt = buildPerformerAssetPrompt(input);
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        version: PERFORMER_ASSET_PROMPT_VERSION,
        referenceImageHash: input.referenceImageHash,
        referenceImageCount: input.referenceImageCount,
        options: input.options,
        prompt,
      }),
    )
    .digest("hex");
}
