import type {
  PromoImageLayer,
  PromoLayerIdFactory,
  PromoShapeLayer,
  PromoShapeType,
  PromoTextAlign,
} from "./types";

export type PromoToolGroupId = "text" | "image" | "shape-basic" | "shape-speech" | "shape-arrow" | "code";
export type PromoCodeTool = "qr" | "barcode";

export const PROMO_TOOL_GROUPS: Array<{
  id: PromoToolGroupId;
  label: string;
  tools: string[];
}> = [
  { id: "text", label: "텍스트", tools: ["text"] },
  { id: "image", label: "사진", tools: ["image", "crop"] },
  { id: "shape-basic", label: "기본 도형", tools: ["rectangle", "ellipse", "triangle", "donut"] },
  { id: "shape-speech", label: "말풍선/설명", tools: ["speech-bubble", "callout"] },
  { id: "shape-arrow", label: "화살표", tools: ["arrow", "double-arrow"] },
  { id: "code", label: "QR/바코드", tools: ["qr", "barcode"] },
];

export function getCodeToolGroup() {
  return PROMO_TOOL_GROUPS.find((group) => group.id === "code")!;
}

export function createSpeechShapeLayer({
  idFactory,
  shapeType = "speech-bubble",
  text = "설명을 입력하세요",
  x = 120,
  y = 120,
}: {
  idFactory: PromoLayerIdFactory;
  shapeType?: Extract<PromoShapeType, "speech-bubble" | "callout">;
  text?: string;
  x?: number;
  y?: number;
}): PromoShapeLayer {
  return {
    id: idFactory("shape"),
    type: "shape",
    name: shapeType === "callout" ? "설명 도형" : "말풍선",
    shapeType,
    group: "speech",
    x,
    y,
    width: 360,
    height: 180,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    isVisible: true,
    isLocked: false,
    fill: "#ffffff",
    stroke: "#111111",
    strokeWidth: 2,
    text: {
      text,
      fontFamily: "Pretendard",
      fontSize: 28,
      fontWeight: 700,
      italic: false,
      underline: false,
      strikethrough: false,
      textAlign: "center" satisfies PromoTextAlign,
      color: "#111111",
      lineHeight: 1.2,
      letterSpacing: 0,
    },
  };
}

export function createDonutShapeLayer({
  idFactory,
  x = 120,
  y = 120,
  innerRadiusRatio = 0.55,
}: {
  idFactory: PromoLayerIdFactory;
  x?: number;
  y?: number;
  innerRadiusRatio?: number;
}): PromoShapeLayer {
  return {
    id: idFactory("shape"),
    type: "shape",
    name: "도넛",
    shapeType: "donut",
    group: "basic",
    x,
    y,
    width: 180,
    height: 180,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    isVisible: true,
    isLocked: false,
    fill: "#111111",
    stroke: "#111111",
    strokeWidth: 0,
    innerRadiusRatio: clampRatio(innerRadiusRatio),
  };
}

export function updateDonutInnerRadius(layer: PromoShapeLayer, innerRadiusRatio: number): PromoShapeLayer {
  if (layer.shapeType !== "donut") {
    return layer;
  }

  return {
    ...layer,
    innerRadiusRatio: clampRatio(innerRadiusRatio),
  };
}

export function applyDirectImageCrop(
  layer: PromoImageLayer,
  delta: { offsetX?: number; offsetY?: number; scaleDelta?: number },
): PromoImageLayer {
  const crop = layer.crop ?? { scale: 1, offsetX: 0, offsetY: 0 };
  return {
    ...layer,
    crop: {
      scale: Math.max(0.1, crop.scale + (delta.scaleDelta ?? 0)),
      offsetX: crop.offsetX + (delta.offsetX ?? 0),
      offsetY: crop.offsetY + (delta.offsetY ?? 0),
    },
  };
}

function clampRatio(value: number) {
  return Math.min(0.9, Math.max(0.1, value));
}
