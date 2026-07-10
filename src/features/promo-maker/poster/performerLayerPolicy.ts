import { DomainRuleError } from "@/lib/errors";
import {
  isPerformerAssetApprovedForPosterUse,
  performerAssetDisallowedOperations,
  type PerformerAsset,
} from "./assetPolicy";

export const performerLayerAllowedEditKeys = [
  "x",
  "y",
  "scale",
  "crop",
  "opacity",
  "shadow",
  "rimLight",
  "colorGrade",
  "edgeBlend",
  "zIndex",
] as const;

export type PerformerLayerAllowedEditKey = (typeof performerLayerAllowedEditKeys)[number];

export type PosterConceptStyleKey =
  | "classic_luxury_recital"
  | "modern_minimalist"
  | "dark_cinematic"
  | "soft_editorial"
  | "korean_arts_center"
  | "abstract_contemporary";

export type PerformerAssetPosterLayer = {
  id: string;
  type: "performer_asset";
  assetId: string;
  lockedIdentity: true;
  lockedFace: true;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  crop: PerformerAssetLayerCrop | null;
  zIndex: number;
  shadow?: PerformerAssetLayerShadow;
  rimLight?: PerformerAssetLayerRimLight;
  colorGrade?: PerformerAssetLayerColorGrade;
  edgeBlend?: PerformerAssetLayerEdgeBlend;
  allowedEdits: PerformerLayerAllowedEditKey[];
  disallowedEdits: string[];
};

export type PerformerAssetLayerCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PerformerAssetLayerShadow = {
  enabled: boolean;
  blur: number;
  opacity: number;
  x: number;
  y: number;
};

export type PerformerAssetLayerRimLight = {
  enabled: boolean;
  color: string;
  intensity: number;
};

export type PerformerAssetLayerColorGrade = {
  brightness: number;
  contrast: number;
  saturation: number;
  tint?: string;
};

export type PerformerAssetLayerEdgeBlend = {
  feather: number;
};

export type PosterDocument = {
  id: string;
  title: string;
  canvas: PosterDocumentCanvas;
  layers: PosterDocumentLayer[];
  linkedAssetIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type PosterDocumentCanvas = {
  width: number;
  height: number;
  orientation: "portrait" | "landscape" | "square";
  sizePreset: "instagram_portrait" | "instagram_square" | "a4_portrait" | "custom";
  dpi: number;
};

export type PosterDocumentLayer =
  | PosterBackgroundLayer
  | PerformerAssetPosterLayer
  | PosterDocumentTextLayer
  | PosterDocumentShapeLayer
  | PosterLightingOverlayLayer
  | PosterDecorativeLayer
  | PosterLogoPlaceholderLayer;

export type PosterBackgroundLayer = {
  id: string;
  type: "background";
  fill: string;
  zIndex: number;
};

export type PosterDocumentTextLayer = {
  id: string;
  type: "text";
  textRole: "concert_title" | "performer_name" | "instrument_or_role" | "date" | "venue" | "program" | "ticket" | "sponsor";
  text: string;
  editable: true;
  x: number;
  y: number;
  width: number;
  height: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  align: "left" | "center" | "right";
  zIndex: number;
};

export type PosterDocumentShapeLayer = {
  id: string;
  type: "shape";
  shape: "rect" | "circle" | "line" | "donut";
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke?: string;
  zIndex: number;
};

export type PosterLightingOverlayLayer = {
  id: string;
  type: "lighting_overlay";
  blendMode: "screen" | "soft-light" | "multiply";
  color: string;
  opacity: number;
  zIndex: number;
};

export type PosterDecorativeLayer = {
  id: string;
  type: "decorative";
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  zIndex: number;
};

export type PosterLogoPlaceholderLayer = {
  id: string;
  type: "logo_placeholder";
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
};

export type PosterConcept = {
  id: string;
  name: string;
  styleKey: PosterConceptStyleKey;
  description: string;
  posterDocument: PosterDocument;
};

export type PosterInfoForConcept = {
  title?: string;
  performerName?: string;
  instrumentOrRole?: string;
  dateText?: string;
  venueName?: string;
  program?: string;
  ticketText?: string;
  sponsors?: string;
};

const safeEditKeySet = new Set<string>(performerLayerAllowedEditKeys);
const unsafeInstructionKeyPattern = /assetid|source|face|identity|pose|expression|hair|hairstyle|clothing|outfit|wardrobe|instrument|prompt|redraw|regenerat|replace/i;
const unsafeInstructionTextPattern =
  /얼굴|정체성|다른 사람|자세|포즈|표정|웃|미소|머리|헤어|의상|옷|드레스|정장|악기|피아노|바이올린|첼로|face|identity|pose|expression|smile|hair|hairstyle|clothing|outfit|dress|suit|instrument|piano|violin|cello|redraw|regenerate|replace/i;

const conceptStyles: Record<PosterConceptStyleKey, { name: string; description: string; background: string; foreground: string; accent: string }> = {
  classic_luxury_recital: {
    name: "Classic Luxury Recital",
    description: "Formal recital poster with refined frame, balanced typography, and calm luxury.",
    background: "#f6efe2",
    foreground: "#17120e",
    accent: "#8f6a33",
  },
  modern_minimalist: {
    name: "Modern Minimalist",
    description: "Quiet contemporary poster with generous whitespace and strong editable text hierarchy.",
    background: "#f8f8f5",
    foreground: "#101010",
    accent: "#1f57d6",
  },
  dark_cinematic: {
    name: "Dark Cinematic",
    description: "Stage-light poster with deep contrast, shadow, and premium recital mood.",
    background: "#111111",
    foreground: "#ffffff",
    accent: "#d9b469",
  },
  soft_editorial: {
    name: "Soft Editorial",
    description: "Gentle editorial poster with soft color fields and performer-focused composition.",
    background: "#f4e5e4",
    foreground: "#2f2526",
    accent: "#9b5962",
  },
  korean_arts_center: {
    name: "Korean Arts Center",
    description: "Clean arts-center poster language with Korean typography and event information clarity.",
    background: "#f7f3ec",
    foreground: "#111111",
    accent: "#6b645d",
  },
  abstract_contemporary: {
    name: "Abstract Contemporary",
    description: "Contemporary concert visual system with abstract geometry around a locked performer asset.",
    background: "#e9edf6",
    foreground: "#111111",
    accent: "#f06d3f",
  },
};

export function isPerformerLayerLocked(layer: unknown) {
  if (!isRecord(layer)) return false;
  if (layer.type === "performer_asset") {
    return layer.lockedIdentity === true && layer.lockedFace === true;
  }
  return layer.type === "image" && layer.imageRole === "performer" && layer.lockedIdentity === true && layer.lockedFace === true;
}

export function assertSafePerformerLayerEdit(beforeLayer: unknown, afterLayer: unknown) {
  if (!isPerformerLayerLocked(beforeLayer)) return;
  if (!isRecord(beforeLayer) || !isRecord(afterLayer)) {
    throw unsafePerformerLayerEdit("잠긴 연주자 레이어는 객체 형태로만 수정할 수 있습니다.");
  }

  if (afterLayer.lockedIdentity !== true) {
    throw unsafePerformerLayerEdit("잠긴 연주자 레이어의 lockedIdentity를 해제할 수 없습니다.");
  }
  if (afterLayer.lockedFace !== true) {
    throw unsafePerformerLayerEdit("잠긴 연주자 레이어의 lockedFace를 해제할 수 없습니다.");
  }

  const beforeAssetId = stringValue(beforeLayer.assetId);
  const afterAssetId = stringValue(afterLayer.assetId);
  if (beforeAssetId && afterAssetId && beforeAssetId !== afterAssetId) {
    throw unsafePerformerLayerEdit("잠긴 연주자 레이어의 assetId를 교체할 수 없습니다.");
  }

  const keys = new Set([...Object.keys(beforeLayer), ...Object.keys(afterLayer)]);
  for (const key of keys) {
    if (safeEditKeySet.has(key)) continue;

    const beforeValue = beforeLayer[key];
    const afterValue = afterLayer[key];
    if (stableSerialize(beforeValue) === stableSerialize(afterValue)) continue;

    if (unsafeInstructionKeyPattern.test(key) || containsUnsafePerformerInstruction(afterValue)) {
      throw unsafePerformerLayerEdit(`잠긴 연주자 레이어에서 ${key} 변경은 허용되지 않습니다.`);
    }

    throw unsafePerformerLayerEdit(`잠긴 연주자 레이어에서는 ${key} 필드를 변경할 수 없습니다.`);
  }
}

export function assertSafePosterDocumentEdit(beforeDocument: unknown, afterDocument: unknown) {
  const beforeLayers = readDocumentLayers(beforeDocument);
  const afterLayers = readDocumentLayers(afterDocument);
  const afterLayersById = new Map(afterLayers.flatMap((layer) => (isRecord(layer) && typeof layer.id === "string" ? [[layer.id, layer]] : [])));

  for (const beforeLayer of beforeLayers) {
    if (!isPerformerLayerLocked(beforeLayer)) continue;
    const layerId = isRecord(beforeLayer) && typeof beforeLayer.id === "string" ? beforeLayer.id : "";
    const afterLayer = afterLayersById.get(layerId);
    if (!afterLayer) {
      throw unsafePerformerLayerEdit("잠긴 연주자 레이어는 삭제할 수 없습니다.");
    }
    assertSafePerformerLayerEdit(beforeLayer, afterLayer);
  }

  for (const afterLayer of afterLayers) {
    if (!isRecord(afterLayer)) continue;
    const isPerformerAssetLayer = afterLayer.type === "performer_asset" || (afterLayer.type === "image" && afterLayer.imageRole === "performer");
    if (isPerformerAssetLayer && !isPerformerLayerLocked(afterLayer)) {
      throw unsafePerformerLayerEdit("포스터의 연주자 레이어는 lockedIdentity와 lockedFace가 켜진 상태로만 저장할 수 있습니다.");
    }
  }
}

export function createDefaultPerformerAssetLayer(assetId: string): PerformerAssetPosterLayer {
  return {
    id: `performer-asset-${assetId}`,
    type: "performer_asset",
    assetId,
    lockedIdentity: true,
    lockedFace: true,
    x: 540,
    y: 650,
    scale: 1,
    opacity: 1,
    crop: null,
    zIndex: 20,
    shadow: {
      enabled: true,
      blur: 32,
      opacity: 0.22,
      x: 0,
      y: 18,
    },
    rimLight: {
      enabled: false,
      color: "#ffffff",
      intensity: 0,
    },
    colorGrade: {
      brightness: 1,
      contrast: 1,
      saturation: 1,
    },
    edgeBlend: {
      feather: 0,
    },
    allowedEdits: [...performerLayerAllowedEditKeys],
    disallowedEdits: [...performerAssetDisallowedOperations],
  };
}

export function createPosterDocumentFromConcept(
  asset: PerformerAsset,
  posterInfo: PosterInfoForConcept,
  stylePreset: PosterConceptStyleKey = "classic_luxury_recital",
): PosterDocument {
  if (!isPerformerAssetApprovedForPosterUse(asset)) {
    throw new DomainRuleError("PERFORMER_ASSET_NOT_APPROVED", "승인되지 않은 연주자 에셋으로는 포스터를 생성할 수 없습니다.", 422);
  }

  const style = conceptStyles[stylePreset];
  const now = new Date().toISOString();
  const title = posterInfo.title || "Untitled Concert";
  const performerName = posterInfo.performerName || asset.performerName || "Performer";
  const instrumentOrRole = posterInfo.instrumentOrRole || asset.instrumentOrRole || "Recital";

  return {
    id: `poster-document-${asset.id}-${stylePreset}`,
    title,
    canvas: {
      width: 1080,
      height: 1350,
      orientation: "portrait",
      sizePreset: "instagram_portrait",
      dpi: 144,
    },
    linkedAssetIds: [asset.id],
    createdAt: now,
    updatedAt: now,
    layers: [
      {
        id: "background",
        type: "background",
        fill: style.background,
        zIndex: 0,
      },
      {
        id: "accent-block",
        type: "decorative",
        label: "style accent",
        x: 84,
        y: 94,
        width: 16,
        height: 812,
        fill: style.accent,
        zIndex: 5,
      },
      createDefaultPerformerAssetLayer(asset.id),
      textLayer("title", "concert_title", title, 100, 920, 880, 132, 72, 800, style.foreground, "center", 40),
      textLayer("performer-name", "performer_name", performerName, 150, 1084, 780, 52, 34, 700, style.foreground, "center", 41),
      textLayer("instrument", "instrument_or_role", instrumentOrRole, 180, 1144, 720, 42, 25, 600, style.accent, "center", 42),
      textLayer("date", "date", posterInfo.dateText || "Date TBA", 180, 1204, 720, 42, 24, 600, style.foreground, "center", 43),
      textLayer("venue", "venue", posterInfo.venueName || "Venue TBA", 180, 1254, 720, 42, 24, 600, style.foreground, "center", 44),
      textLayer("program", "program", posterInfo.program || "", 118, 164, 844, 76, 24, 500, style.accent, "center", 45),
      textLayer("ticket", "ticket", posterInfo.ticketText || "", 112, 1288, 856, 36, 20, 500, style.foreground, "center", 46),
      textLayer("sponsor", "sponsor", posterInfo.sponsors || "", 112, 1322, 856, 24, 16, 500, style.foreground, "center", 47),
    ],
  };
}

export function createPosterConcept(
  asset: PerformerAsset,
  posterInfo: PosterInfoForConcept,
  stylePreset: PosterConceptStyleKey,
): PosterConcept {
  const style = conceptStyles[stylePreset];
  return {
    id: `poster-concept-${asset.id}-${stylePreset}`,
    name: style.name,
    styleKey: stylePreset,
    description: style.description,
    posterDocument: createPosterDocumentFromConcept(asset, posterInfo, stylePreset),
  };
}

function textLayer(
  id: string,
  textRole: PosterDocumentTextLayer["textRole"],
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  fontWeight: number,
  color: string,
  align: PosterDocumentTextLayer["align"],
  zIndex: number,
): PosterDocumentTextLayer {
  return {
    id,
    type: "text",
    textRole,
    text,
    editable: true,
    x,
    y,
    width,
    height,
    fontFamily: "poster-nanum-gothic",
    fontSize,
    fontWeight,
    color,
    align,
    zIndex,
  };
}

function unsafePerformerLayerEdit(message: string) {
  return new DomainRuleError("UNSAFE_PERFORMER_LAYER_EDIT", message, 400);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readDocumentLayers(value: unknown): unknown[] {
  if (!isRecord(value)) return [];
  return Array.isArray(value.layers) ? value.layers : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function containsUnsafePerformerInstruction(value: unknown): boolean {
  if (typeof value === "string") return unsafeInstructionTextPattern.test(value);
  if (Array.isArray(value)) return value.some(containsUnsafePerformerInstruction);
  if (!isRecord(value)) return false;

  return Object.entries(value).some(([key, nested]) => {
    if (unsafeInstructionKeyPattern.test(key)) return true;
    return containsUnsafePerformerInstruction(nested);
  });
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (!isRecord(value)) return JSON.stringify(value);
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
}
