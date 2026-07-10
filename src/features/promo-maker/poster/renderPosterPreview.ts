import sharp, { type OverlayOptions } from "sharp";
import QRCode from "qrcode";
import { posterExportFontStack } from "./fonts";
import { POSTER_CANVAS, type PosterDesign, type PosterImageLayer, type PosterLayer, type PosterShapeLayer, type PosterTextLayer } from "./types";
import { readImageUrlToBuffer, storePosterObject } from "./storage";

type StoredPreviewInput = {
  userId: string;
  design: PosterDesign;
};

export async function renderPosterPng(design: PosterDesign) {
  const canvas = sharp({
    create: {
      width: design.canvas.width || POSTER_CANVAS.width,
      height: design.canvas.height || POSTER_CANVAS.height,
      channels: 4,
      background: design.canvas.backgroundColor || "#ffffff",
    },
  });

  const composites = await Promise.all(
    design.layers
      .filter((layer) => layer.visible !== false)
      .map(async (layer) => ({
        input: await renderLayer(layer),
        left: Math.round(layer.x),
        top: Math.round(layer.y),
      })),
  );

  return canvas.composite(composites).png().toBuffer();
}

export async function renderAndStorePosterPreview(input: StoredPreviewInput) {
  const preview = await renderPosterPng(input.design);
  const thumbnail = await sharp(preview)
    .resize({ width: 720, height: 900, fit: "cover" })
    .webp({ quality: 90, effort: 4 })
    .toBuffer();
  const [previewUrl, thumbnailUrl] = await Promise.all([
    storePosterObject({
      directory: "poster-previews",
      userId: input.userId,
      body: preview,
      contentType: "image/png",
      extension: "png",
    }),
    storePosterObject({
      directory: "poster-previews",
      userId: input.userId,
      body: thumbnail,
      contentType: "image/webp",
      extension: "webp",
    }),
  ]);

  return {
    previewUrl,
    thumbnailUrl,
  };
}

export async function renderAndStorePosterExport(input: StoredPreviewInput) {
  const body = await renderPosterPng(input.design);
  const exportUrl = await storePosterObject({
    directory: "poster-exports",
    userId: input.userId,
    body,
    contentType: "image/png",
    extension: "png",
  });
  return { exportUrl };
}

async function renderLayer(layer: PosterLayer) {
  if (layer.type === "image") {
    const image = await readImageUrlToBuffer(layer.src);
    const width = Math.max(1, Math.round(layer.width));
    const height = Math.max(1, Math.round(layer.height));
    const resized = await sharp(image)
      .rotate()
      .resize({
        width,
        height,
        fit: layer.objectFit === "cover" ? "cover" : "contain",
        position: "center",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    const adjusted = await applyImageAdjustments(resized, width, height, layer);
    return applyImageRegions(adjusted, resized, width, height, layer);
  }

  if (layer.type === "qr") {
    const qr = await QRCode.toBuffer(layer.targetUrl || "https://artsaurus.app", {
      type: "png",
      width: Math.max(64, Math.round(layer.width)),
      margin: 1,
      color: {
        dark: layer.foreground,
        light: layer.background,
      },
    });
    if (!layer.caption) return qr;
    const captionHeight = 28;
    const captionSvg = Buffer.from(`
      <svg width="${layer.width}" height="${captionHeight}" xmlns="http://www.w3.org/2000/svg">
        <text x="${layer.width / 2}" y="20" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="700" text-anchor="middle" fill="${escapeAttribute(
          layer.foreground,
        )}">${escapeText(layer.caption)}</text>
      </svg>
    `);
    return sharp({
      create: {
        width: Math.round(layer.width),
        height: Math.round(layer.height + captionHeight),
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        { input: qr, left: 0, top: 0 },
        { input: captionSvg, left: 0, top: Math.round(layer.height) },
      ])
      .png()
      .toBuffer();
  }

  if (layer.type === "shape") {
    return Buffer.from(shapeSvg(layer));
  }

  return Buffer.from(textSvg(layer));
}

async function applyImageAdjustments(body: Buffer, width: number, height: number, layer: PosterImageLayer) {
  const adjustments = {
    brightness: 1,
    contrast: 1,
    saturation: 1,
    hueRotate: 0,
    grayscale: 0,
    tintColor: "#111111",
    tintStrength: 0,
    ...layer.adjustments,
  };
  let image = sharp(body)
    .modulate({
      brightness: clamp(adjustments.brightness, 0.1, 3),
      saturation: clamp(adjustments.saturation, 0, 4) * (1 - clamp(adjustments.grayscale, 0, 1)),
      hue: clamp(adjustments.hueRotate, -360, 360),
    })
    .linear(clamp(adjustments.contrast, 0.1, 3), 128 * (1 - clamp(adjustments.contrast, 0.1, 3)));

  const tintStrength = clamp(adjustments.tintStrength, 0, 0.8);
  if (tintStrength > 0) {
    const tint = parseHexColor(adjustments.tintColor);
    image = image.composite([
      {
        input: {
          create: {
            width,
            height,
            channels: 4,
            background: { ...tint, alpha: tintStrength },
          },
        },
        blend: "overlay",
      },
    ]);
  }

  return image.png().toBuffer();
}

async function applyImageRegions(adjusted: Buffer, original: Buffer, width: number, height: number, layer: PosterImageLayer) {
  const composites: OverlayOptions[] = [];
  for (const area of layer.protectedAreas ?? []) {
    const box = normalizeRegion(area, width, height);
    if (!box) continue;
    const protectedRegion = await createProtectedRegion(original, box, area.shape);
    composites.push({
      input: protectedRegion,
      left: box.left,
      top: box.top,
    });
  }

  for (const patch of layer.coverPatches ?? []) {
    const box = normalizeRegion(patch, width, height);
    if (!box) continue;
    composites.push({
      input: Buffer.from(coverPatchSvg(patch, box.width, box.height)),
      left: box.left,
      top: box.top,
    });
  }

  if (!composites.length) return adjusted;
  return sharp(adjusted).composite(composites).png().toBuffer();
}

async function createProtectedRegion(
  original: Buffer,
  box: { left: number; top: number; width: number; height: number },
  shape: NonNullable<PosterImageLayer["protectedAreas"]>[number]["shape"],
) {
  const region = await sharp(original).extract(box).png().toBuffer();
  if (!shape || shape === "rect") return region;
  const mask = protectedAreaMaskSvg(shape, box.width, box.height);
  return sharp(region)
    .composite([
      {
        input: Buffer.from(mask),
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();
}

function protectedAreaMaskSvg(
  shape: NonNullable<PosterImageLayer["protectedAreas"]>[number]["shape"],
  width: number,
  height: number,
) {
  if (shape === "ellipse") {
    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="${width / 2}" cy="${height / 2}" rx="${
      width / 2
    }" ry="${height / 2}" fill="#fff"/></svg>`;
  }
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><polygon points="${width * 0.08},${height * 0.16} ${width * 0.72},${
    height * 0.04
  } ${width * 0.96},${height * 0.38} ${width * 0.86},${height * 0.86} ${width * 0.34},${height * 0.98} ${width * 0.04},${height * 0.66}" fill="#fff"/></svg>`;
}

function normalizeRegion(region: { x: number; y: number; width: number; height: number }, canvasWidth: number, canvasHeight: number) {
  const left = Math.round(Math.min(canvasWidth - 1, Math.max(0, region.x)));
  const top = Math.round(Math.min(canvasHeight - 1, Math.max(0, region.y)));
  const width = Math.round(Math.min(canvasWidth - left, Math.max(1, region.width)));
  const height = Math.round(Math.min(canvasHeight - top, Math.max(1, region.height)));
  if (width <= 0 || height <= 0) return null;
  return { left, top, width, height };
}

function coverPatchSvg(
  patch: NonNullable<PosterImageLayer["coverPatches"]>[number],
  width: number,
  height: number,
) {
  const opacity = clamp(patch.opacity ?? 1, 0, 1);
  const fontSize = patch.fontSize ?? 42;
  const text = patch.text?.trim();
  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="${escapeAttribute(patch.fill)}" fill-opacity="${opacity}" />
      ${
        text
          ? `<text x="12" y="${Math.min(height - 8, fontSize + 8)}" font-family="Inter, Arial, sans-serif" font-size="${fontSize}" font-weight="${
              patch.fontWeight ?? 800
            }" fill="${escapeAttribute(patch.textColor ?? "#111111")}">${escapeText(text)}</text>`
          : ""
      }
    </svg>
  `;
}

function clamp(value: number | undefined, min: number, max: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function parseHexColor(value?: string) {
  const normalized = /^#[0-9a-f]{6}$/i.test(value ?? "") ? value!.slice(1) : "111111";
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function shapeSvg(layer: PosterShapeLayer) {
  const width = Math.max(1, Math.round(layer.width));
  const height = Math.max(1, Math.round(layer.height));
  const stroke = layer.stroke ? `stroke="${escapeAttribute(layer.stroke)}" stroke-width="${layer.strokeWidth ?? 1}"` : "";
  const fill = `fill="${escapeAttribute(layer.fill)}"`;
  if (layer.shape === "circle") {
    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}" ${fill} ${stroke}/></svg>`;
  }
  if (layer.shape === "line") {
    return `<svg width="${width}" height="${height || 1}" xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="${height / 2}" x2="${width}" y2="${height / 2}" stroke="${escapeAttribute(
      layer.stroke || layer.fill || "#111111",
    )}" stroke-width="${layer.strokeWidth ?? Math.max(1, height)}"/></svg>`;
  }
  if (layer.shape === "donut") {
    const innerRatio = layer.innerRadiusRatio ?? 0.5;
    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><path d="${donutPath(
      width,
      height,
      innerRatio,
    )}" ${fill} fill-rule="evenodd" ${stroke}/></svg>`;
  }
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${width}" height="${height}" rx="${
    layer.radius ?? 0
  }" ${fill} ${stroke}/></svg>`;
}

function textSvg(layer: PosterTextLayer) {
  const lines = wrapText(layer.text, layer.fontSize, layer.width);
  const anchor = layer.align === "center" ? "middle" : layer.align === "right" ? "end" : "start";
  const x = layer.align === "center" ? layer.width / 2 : layer.align === "right" ? layer.width : 0;
  const lineHeight = layer.fontSize * layer.lineHeight;
  const tspans = lines
    .map((line, index) => {
      const dy = index === 0 ? layer.fontSize : lineHeight;
      return `<tspan x="${x}" dy="${dy}">${escapeText(line)}</tspan>`;
    })
    .join("");

  return `
    <svg width="${Math.max(1, Math.round(layer.width))}" height="${Math.max(1, Math.round(layer.height))}" xmlns="http://www.w3.org/2000/svg">
      <text x="${x}" y="0"
        font-family="${escapeAttribute(posterExportFontStack(layer.fontFamily))}"
        font-size="${layer.fontSize}"
        font-weight="${layer.fontWeight}"
        font-style="${layer.fontStyle ?? "normal"}"
        fill="${escapeAttribute(layer.color)}"
        text-anchor="${anchor}"
        letter-spacing="${layer.letterSpacing ?? 0}">${tspans}</text>
    </svg>
  `;
}

function wrapText(value: string, fontSize: number, width: number) {
  const hardLines = value.split("\n");
  const maxChars = Math.max(4, Math.floor(width / (fontSize * 0.58)));
  return hardLines.flatMap((line) => {
    const words = line.includes(" ") ? line.split(/\s+/) : line.split("");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const separator = line.includes(" ") && current ? " " : "";
      const next = `${current}${separator}${word}`;
      if (next.length > maxChars && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [""];
  });
}

function donutPath(width: number, height: number, innerRatio: number) {
  const cx = width / 2;
  const cy = height / 2;
  const outerR = Math.min(width, height) / 2;
  const innerR = outerR * innerRatio;
  return [
    `M ${cx} ${cy - outerR}`,
    `A ${outerR} ${outerR} 0 1 1 ${cx} ${cy + outerR}`,
    `A ${outerR} ${outerR} 0 1 1 ${cx} ${cy - outerR}`,
    "Z",
    `M ${cx} ${cy - innerR}`,
    `A ${innerR} ${innerR} 0 1 0 ${cx} ${cy + innerR}`,
    `A ${innerR} ${innerR} 0 1 0 ${cx} ${cy - innerR}`,
    "Z",
  ].join(" ");
}

function escapeText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value: string) {
  return escapeText(value).replace(/"/g, "&quot;");
}
