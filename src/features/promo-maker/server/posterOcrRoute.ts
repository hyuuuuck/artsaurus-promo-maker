import { recognizePosterText } from "../poster/ocr";
import { errorResponse, ok, parseError, parseRecord, readJson } from "./http";

export async function POST(request: Request) {
  try {
    const payload = parseRecord(await readJson(request));
    const imageUrl = typeof payload.imageUrl === "string" ? payload.imageUrl : "";
    if (!imageUrl) return errorResponse("POSTER_IMAGE_REQUIRED", "OCR을 실행할 포스터 이미지가 필요합니다.", 400);
    const minConfidence = clampNumber(payload.minConfidence, 0, 100, 38);
    const result = await recognizePosterText({ imageUrl, minConfidence });
    if (!result.items.length) {
      return errorResponse("POSTER_OCR_EMPTY", "인식된 텍스트가 없습니다. 해상도가 높은 포스터로 다시 시도해 주세요.", 422);
    }
    return ok(result);
  } catch (error) {
    return parseError(error);
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}
