import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { errorResponse, ok, parseError, readFormData } from "./http";
import { writePublicObject } from "../poster/storage";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const formData = await readFormData(request);
    const file = formData.get("file");
    const purpose = String(formData.get("purpose") ?? "poster");
    if (!(file instanceof File)) return errorResponse("FILE_REQUIRED", "업로드할 이미지를 선택해 주세요.", 400);
    if (file.size <= 0) return errorResponse("EMPTY_FILE", "비어 있는 파일은 업로드할 수 없습니다.", 400);
    if (file.size > MAX_UPLOAD_BYTES) return errorResponse("FILE_TOO_LARGE", "이미지는 20MB 이하로 업로드해 주세요.", 413);

    const source = Buffer.from(await file.arrayBuffer());
    const normalized = await normalizeImage(source, purpose);
    const url = await writePublicObject({
      directory: `uploads/${purpose.replace(/[^a-z0-9-]/gi, "").toLowerCase() || "image"}`,
      body: normalized.body,
      extension: normalized.extension,
      fileName: `${randomUUID()}.${normalized.extension}`,
    });

    return ok({
      url,
      contentType: normalized.contentType,
      originalContentType: file.type,
      size: normalized.body.length,
      originalSize: file.size,
      purpose,
      maxBytes: MAX_UPLOAD_BYTES,
      width: normalized.width,
      height: normalized.height,
    });
  } catch (error) {
    return parseError(error);
  }
}

async function normalizeImage(body: Buffer, purpose: string) {
  const maxSide = purpose === "poster" ? 3000 : 2200;
  const png = await sharp(body, { limitInputPixels: 64_000_000 })
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 8, adaptiveFiltering: true })
    .toBuffer();
  const metadata = await sharp(png).metadata();
  return {
    body: png,
    contentType: "image/png",
    extension: "png",
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
  };
}
