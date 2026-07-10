import { readImageUrlToBuffer } from "@/features/promo-maker/poster/storage";

type GenerateInput = {
  prompt: string;
  referenceImages: Array<{
    label: string;
    url: string;
    mimeType: string;
  }>;
};

export type GeneratedImageResult = {
  body: Buffer;
  contentType: "image/png" | "image/jpeg" | "image/webp";
  providerMetadata: Record<string, unknown>;
};

type GoogleImageMimeType = GeneratedImageResult["contentType"];
type GoogleReferenceInputPart = { type: "text"; text: string } | { type: "image"; mime_type: string; data: string };

const GOOGLE_AI_STUDIO_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

export async function generatePerformerAssetWithGoogleAiStudio(input: GenerateInput): Promise<GeneratedImageResult> {
  const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing GOOGLE_AI_STUDIO_API_KEY or GEMINI_API_KEY.");
  }

  const model = process.env.GOOGLE_IMAGE_MODEL?.trim() || "gemini-3.1-flash-image";
  const referenceInputs: GoogleReferenceInputPart[][] = await Promise.all(
    input.referenceImages.map(async (reference, index) => {
      const referenceBody = await readImageUrlToBuffer(reference.url);
      return [
        {
          type: "text",
          text: `Reference ${index + 1}: ${reference.label}.`,
        },
        {
          type: "image",
          mime_type: reference.mimeType,
          data: referenceBody.toString("base64"),
        },
      ];
    }),
  );

  const requestedMimeType = selectedGoogleImageMimeType();
  let response = await requestGoogleImage({ apiKey, model, prompt: input.prompt, referenceInputs, mimeType: requestedMimeType });

  if (!response.ok) {
    const firstError = await response.text();
    if (requestedMimeType !== "image/jpeg") {
      response = await requestGoogleImage({ apiKey, model, prompt: input.prompt, referenceInputs, mimeType: "image/jpeg" });
    }
    if (!response.ok) {
      throw new Error(`Google AI Studio image generation failed with status ${response.status}: ${await response.text()}${firstError ? ` / first attempt: ${firstError.slice(0, 300)}` : ""}`);
    }
  }

  const payload = (await response.json()) as unknown;
  const output = findGeneratedImage(payload);
  if (!output) {
    throw new Error("Google AI Studio response did not contain an output image.");
  }

  return {
    body: Buffer.from(output.data, "base64"),
    contentType: output.contentType,
    providerMetadata: {
      model,
      referenceCount: input.referenceImages.length,
      referenceLabels: input.referenceImages.map((reference) => reference.label),
      requestedMimeType,
      responseId: readString(payload, ["id"]) ?? readString(payload, ["interaction", "id"]),
    },
  };
}

async function requestGoogleImage(input: {
  apiKey: string;
  model: string;
  prompt: string;
  referenceInputs: GoogleReferenceInputPart[][];
  mimeType: GoogleImageMimeType;
}) {
  return fetch(GOOGLE_AI_STUDIO_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": input.apiKey,
    },
    body: JSON.stringify({
      model: input.model,
      input: [
        {
          type: "text",
          text: `${input.prompt}\n\nOutput quality requirements: create a high-resolution, print-oriented image with clean skin texture, sharp eyes, natural hair detail, and no thumbnail/compressed look. Preserve the referenced performer's identity and avoid painterly blur.`,
        },
        ...input.referenceInputs.flat(),
      ],
      response_format: {
        type: "image",
        mime_type: input.mimeType,
        aspect_ratio: "4:5",
      },
    }),
  });
}

function selectedGoogleImageMimeType(): GoogleImageMimeType {
  const value = process.env.GOOGLE_IMAGE_RESPONSE_MIME_TYPE?.trim().toLowerCase();
  if (value === "image/jpeg" || value === "image/webp" || value === "image/png") return value;
  return "image/png";
}

function findGeneratedImage(payload: unknown): { data: string; contentType: "image/png" | "image/jpeg" | "image/webp" } | null {
  const outputImage = readObject(payload, ["output_image"]);
  const outputImageData = readString(outputImage, ["data"]);
  if (outputImageData) {
    const mimeType = readString(outputImage, ["mime_type"]) ?? readString(outputImage, ["mimeType"]) ?? "image/png";
    if (mimeType === "image/png" || mimeType === "image/jpeg" || mimeType === "image/webp") {
      return { data: outputImageData, contentType: mimeType };
    }
  }

  const candidates = walkObjects(payload);
  for (const candidate of candidates) {
    const data = readString(candidate, ["data"]);
    const mimeType = readString(candidate, ["mime_type"]) ?? readString(candidate, ["mimeType"]) ?? readString(candidate, ["contentType"]);
    if (!data || !mimeType || !mimeType.startsWith("image/")) continue;
    if (mimeType === "image/png" || mimeType === "image/jpeg" || mimeType === "image/webp") {
      return { data, contentType: mimeType };
    }
  }
  return null;
}

function walkObjects(value: unknown): unknown[] {
  if (!value || typeof value !== "object") return [];
  const values: unknown[] = [value];
  if (Array.isArray(value)) {
    for (const item of value) values.push(...walkObjects(item));
    return values;
  }
  for (const item of Object.values(value as Record<string, unknown>)) {
    values.push(...walkObjects(item));
  }
  return values;
}

function readObject(value: unknown, path: string[]) {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return current && typeof current === "object" ? current : null;
}

function readString(value: unknown, path: string[]) {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : null;
}
