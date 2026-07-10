import sharp from "sharp";
import { readImageUrlToBuffer } from "@/features/promo-maker/poster/storage";
import type { GeneratedImageResult } from "@/lib/image-generation/providers/googleAiStudioProvider";
import type { PerformerAssetGenerationOptions } from "@/features/promo-maker/poster/types";

type GenerateFaceLockedInput = {
  referenceImageUrl: string;
  options: PerformerAssetGenerationOptions;
};

export async function generateFaceLockedPerformerAsset(input: GenerateFaceLockedInput): Promise<GeneratedImageResult> {
  const referenceBody = await readImageUrlToBuffer(input.referenceImageUrl);
  const retouch = localRetouchSettings(input.options.retouchPrompt);
  const body = await sharp(referenceBody, { limitInputPixels: 32_000_000 })
    .rotate()
    .resize({
      width: 1600,
      height: 2000,
      fit: "contain",
      background: { r: 244, g: 246, b: 248, alpha: 1 },
      withoutEnlargement: false,
    })
    .modulate({
      brightness: retouch.brightness,
      saturation: retouch.saturation,
    })
    .sharpen({ sigma: retouch.sharpenSigma, m1: 0.6, m2: 1.2 })
    .png()
    .toBuffer();

  return {
    body,
    contentType: "image/png",
    providerMetadata: {
      mode: "uploaded_photo_profile",
      style: input.options.style,
      identityMode: input.options.identityMode,
      retouchMode: "local-safe-profile-polish",
      retouchPromptApplied: Boolean(input.options.retouchPrompt?.trim()),
    },
  };
}

function localRetouchSettings(prompt?: string) {
  const value = prompt?.toLowerCase() ?? "";
  const wantsBright = /밝|화사|bright|clean|clear/.test(value);
  const wantsCalm = /차분|부드럽|soft|calm|natural/.test(value);
  const wantsSharp = /선명|sharp|또렷|clear|high quality|고화질/.test(value);
  const wantsBlackAndWhite = /흑백|black and white|monochrome/.test(value);

  return {
    brightness: wantsBright ? 1.06 : 1.03,
    saturation: wantsBlackAndWhite ? 0 : wantsCalm ? 0.96 : 1.02,
    sharpenSigma: wantsSharp ? 0.8 : 0.55,
  };
}
