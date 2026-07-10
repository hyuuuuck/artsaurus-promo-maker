import sharp from "sharp";
import { readImageUrlToBuffer } from "@/features/promo-maker/poster/storage";
import type { GeneratedImageResult } from "@/lib/image-generation/providers/googleAiStudioProvider";
import type { PerformerAssetGenerationOptions } from "@/features/promo-maker/poster/types";

type GenerateMockInput = {
  referenceImageUrl: string;
  options: PerformerAssetGenerationOptions;
};

export async function generateMockPerformerAsset(input: GenerateMockInput): Promise<GeneratedImageResult> {
  const referenceBody = await readImageUrlToBuffer(input.referenceImageUrl);
  const body = await sharp(referenceBody)
    .rotate()
    .resize({ width: 1024, height: 1280, fit: "cover", position: "attention" })
    .png()
    .toBuffer();

  return {
    body,
    contentType: "image/png",
    providerMetadata: {
      mode: "mock",
      style: input.options.style,
    },
  };
}
