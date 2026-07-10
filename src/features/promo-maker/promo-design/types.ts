export type PromoDocumentKind =
  | "poster"
  | "pamphlet-bifold"
  | "instagram-feed"
  | "instagram-story"
  | "linkedin-cover";

export type PromoCanvasSizingMode = "original" | "fit" | "fill";

export type PromoLayerType = "text" | "image" | "shape";

export type PromoTextAlign = "left" | "center" | "right" | "justify";

export type PromoImageRole = "primary" | "poster-cover" | "qr" | "barcode" | "decorative";

export type PromoShapeGroup = "basic" | "speech" | "arrow";

export type PromoShapeType =
  | "rectangle"
  | "ellipse"
  | "line"
  | "triangle"
  | "donut"
  | "speech-bubble"
  | "callout"
  | "arrow"
  | "double-arrow";

export type PromoPanelId = "frontCover" | "backCover" | "insideLeft" | "insideRight";

export type PromoLayerIdFactory = (prefix: string) => string;

export interface PromoCanvas {
  width: number;
  height: number;
  backgroundColor: string;
  overflow: "hidden" | "visible";
}

export interface PromoPanel {
  id: PromoPanelId;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PromoBaseLayer {
  id: string;
  type: PromoLayerType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  zIndex: number;
  isVisible: boolean;
  isLocked: boolean;
  flipX?: boolean;
  flipY?: boolean;
  shadowEnabled?: boolean;
  sourceLayerId?: string;
  clipToPanelId?: PromoPanelId;
}

export interface PromoTextLayer extends PromoBaseLayer {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  textAlign: PromoTextAlign;
  color: string;
  lineHeight: number;
  letterSpacing: number;
}

export interface PromoImageCrop {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface PromoImageLayer extends PromoBaseLayer {
  type: "image";
  src: string;
  imageRole?: PromoImageRole;
  naturalWidth?: number;
  naturalHeight?: number;
  objectFit: "contain" | "cover" | "none";
  crop: PromoImageCrop;
}

export interface PromoShapeLayer extends PromoBaseLayer {
  type: "shape";
  shapeType: PromoShapeType;
  group: PromoShapeGroup;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  innerRadiusRatio?: number;
  text?: Omit<PromoTextLayer, keyof PromoBaseLayer | "type">;
}

export type PromoLayer = PromoTextLayer | PromoImageLayer | PromoShapeLayer;

export interface PromoDocument {
  id: string;
  kind: PromoDocumentKind;
  title: string;
  canvas: PromoCanvas;
  layers: PromoLayer[];
  panels?: PromoPanel[];
  sizingMode?: PromoCanvasSizingMode;
  sourcePosterDocumentId?: string;
  sourcePosterLayerIds?: string[];
}
