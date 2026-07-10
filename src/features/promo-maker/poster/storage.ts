import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const PUBLIC_PREFIX = "/generated/promo-maker";
const PUBLIC_ROOT = path.join(process.cwd(), "public", "generated", "promo-maker");

export async function readImageUrlToBuffer(url: string) {
  if (url.startsWith("data:")) {
    const [, data = ""] = url.split(",", 2);
    return Buffer.from(data, url.includes(";base64,") ? "base64" : "utf8");
  }

  if (url.startsWith(PUBLIC_PREFIX)) {
    return readPublicFile(url.slice(PUBLIC_PREFIX.length));
  }

  if (url.startsWith("/uploads/")) {
    const filePath = path.resolve(process.cwd(), "public", decodeURIComponent(url.replace(/^\//, "")));
    assertInside(path.join(process.cwd(), "public"), filePath);
    return readFile(filePath);
  }

  if (url.startsWith("/")) {
    const filePath = path.resolve(process.cwd(), "public", decodeURIComponent(url.replace(/^\//, "")));
    assertInside(path.join(process.cwd(), "public"), filePath);
    return readFile(filePath);
  }

  if (/^https?:\/\//i.test(url)) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Image fetch failed with status ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }

  throw new Error("Unsupported image URL.");
}

export async function storePosterObject(input: {
  directory: "poster-assets" | "poster-cutouts" | "poster-masks" | "poster-previews" | "poster-exports";
  userId: string;
  body: Buffer;
  contentType: "image/png" | "image/webp";
  extension: "png" | "webp";
}) {
  return writePublicObject({
    directory: input.directory,
    body: input.body,
    extension: input.extension,
    fileName: `${input.userId}-${randomUUID()}.${input.extension}`,
  });
}

export async function writePublicObject(input: {
  directory: string;
  body: Buffer;
  extension: string;
  fileName?: string;
}) {
  const cleanDirectory = input.directory.replace(/^\/+|\/+$/g, "").replace(/\.\./g, "");
  const fileName = input.fileName ?? `${randomUUID()}.${input.extension.replace(/^\./, "")}`;
  const directoryPath = path.join(PUBLIC_ROOT, cleanDirectory);
  await mkdir(directoryPath, { recursive: true });
  const filePath = path.join(directoryPath, fileName);
  await writeFile(filePath, input.body);
  return `${PUBLIC_PREFIX}/${cleanDirectory}/${fileName}`;
}

async function readPublicFile(relativeUrl: string) {
  const decoded = decodeURIComponent(relativeUrl.replace(/^\/+/, ""));
  const filePath = path.resolve(PUBLIC_ROOT, decoded);
  assertInside(PUBLIC_ROOT, filePath);
  return readFile(filePath);
}

function assertInside(root: string, filePath: string) {
  const relative = path.relative(root, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Invalid local file URL.");
  }
}
