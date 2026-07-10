import crypto, { randomUUID } from "node:crypto";
import sharp from "sharp";
import { readImageUrlToBuffer, writePublicObject } from "../poster/storage";
import { errorResponse, ok, parseError, readFormData } from "./http";
import { insertByNewest, mutateDb, standaloneUserId } from "./localStore";
import type { ReferenceImage } from "./types";

export const runtime = "nodejs";

const MAX_REFERENCE_BYTES = 12 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const formData = await readFormData(request);
    const file = formData.get("file");
    let rawBody: Buffer;
    let declaredContentType = "";

    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_REFERENCE_BYTES) {
        return errorResponse("FILE_TOO_LARGE", "참고 사진은 12MB 이하로 업로드해 주세요.", 413);
      }
      rawBody = Buffer.from(await file.arrayBuffer());
      declaredContentType = file.type;
    } else {
      rawBody = await readImageUrlToBuffer("/icon.png");
      declaredContentType = "image/png";
    }

    const normalized = await normalizeReferenceImage(rawBody, declaredContentType);
    const hash = crypto.createHash("sha256").update(normalized.body).digest("hex");
    const id = `ref_${randomUUID()}`;
    const baseName = `${standaloneUserId()}-${id}`;
    const [originalUrl, thumbnailUrl, faceCropUrl] = await Promise.all([
      writePublicObject({
        directory: "references",
        body: normalized.body,
        extension: "webp",
        fileName: `${baseName}.webp`,
      }),
      writePublicObject({
        directory: "references",
        body: await sharp(normalized.body).resize({ width: 560, height: 560, fit: "cover", position: "attention" }).webp({ quality: 88, effort: 4 }).toBuffer(),
        extension: "webp",
        fileName: `${baseName}-thumb.webp`,
      }),
      writePublicObject({
        directory: "references",
        body: await sharp(normalized.body).resize({ width: 1024, height: 1024, fit: "cover", position: "attention" }).webp({ quality: 92, effort: 4 }).toBuffer(),
        extension: "webp",
        fileName: `${baseName}-face.webp`,
      }),
    ]);

    const referenceImage: ReferenceImage = {
      id,
      userId: standaloneUserId(),
      originalUrl,
      thumbnailUrl,
      faceCropUrl,
      width: normalized.width,
      height: normalized.height,
      mimeType: normalized.contentType,
      hash,
      createdAt: new Date(),
    };

    await mutateDb((db) => {
      insertByNewest(db.referenceImages, referenceImage, 80);
    });

    return ok({ referenceImage });
  } catch (error) {
    return parseError(error);
  }
}

async function normalizeReferenceImage(body: Buffer, declaredContentType: string) {
  if (!declaredContentType.startsWith("image/") && declaredContentType !== "") {
    throw new Error("이미지 파일만 업로드할 수 있습니다.");
  }
  const normalized = await sharp(body, { limitInputPixels: 48_000_000 })
    .rotate()
    .resize({ width: 2200, height: 2200, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 94, effort: 4 })
    .toBuffer();
  const metadata = await sharp(normalized).metadata();
  return {
    body: normalized,
    contentType: "image/webp",
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
  };
}
