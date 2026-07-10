import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const GENERATED_ROOT = path.join(process.cwd(), "public", "generated", "promo-maker");

type RouteContext = {
  params: Promise<{
    path?: string[];
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const params = await context.params;
  const filePath = resolveGeneratedFile(params.path ?? []);

  if (!filePath) {
    return new Response("Not found", { status: 404, headers: noStoreHeaders() });
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      return new Response("Not found", { status: 404, headers: noStoreHeaders() });
    }

    const body = await readFile(filePath);
    return new Response(new Uint8Array(body), {
      headers: {
        ...noStoreHeaders(),
        "Content-Type": contentTypeFor(filePath),
        "Content-Length": String(body.length),
      },
    });
  } catch {
    return new Response("Not found", { status: 404, headers: noStoreHeaders() });
  }
}

function resolveGeneratedFile(segments: string[]) {
  if (!segments.length || segments.some((segment) => segment === ".." || segment.includes("/") || segment.includes("\\"))) {
    return null;
  }

  const filePath = path.resolve(GENERATED_ROOT, ...segments.map(decodeURIComponent));
  const relative = path.relative(GENERATED_ROOT, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  return filePath;
}

function contentTypeFor(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function noStoreHeaders() {
  return {
    "Cache-Control": "no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  };
}
