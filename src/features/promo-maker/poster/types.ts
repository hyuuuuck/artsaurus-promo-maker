export const POSTER_CANVAS = {
  width: 1080,
  height: 1350,
} as const;

export const POSTER_PROPOSAL_COUNT_MIN = 1;
export const POSTER_PROPOSAL_COUNT_MAX = 8;
export const POSTER_PROPOSAL_COUNT_DEFAULT = 2;

export const posterTemplateIds = [
  "recital-photo-editorial",
  "minimal-recital",
  "black-editorial",
  "concert-hall-classic",
  "modern-typography",
  "soft-romantic",
  "experimental-contemporary",
  "premium-monochrome",
  "grid-portfolio",
] as const;

export type PosterTemplateId = (typeof posterTemplateIds)[number];

export type PerformerAssetStyle = "clean" | "dramatic" | "romantic" | "editorial" | "contemporary";
export type PerformerAssetBackgroundPolicy = "solid-cutout" | "transparent" | "soft-studio" | "stage-light";
export type PerformerAssetIdentityMode = "uploaded_photo" | "face_locked" | "background_replace" | "pose_synthesis" | "portrait_variant";

export type PerformerAssetGenerationOptions = {
  identityMode: PerformerAssetIdentityMode;
  style: PerformerAssetStyle;
  retouchPrompt?: string;
  stylePrompt?: string;
  instrument?: string;
  wardrobe?: string;
  wardrobePrompt?: string;
  actionPrompt?: string;
  mood?: string;
  backgroundPolicy: PerformerAssetBackgroundPolicy;
  useDefaultProfileFallback: boolean;
};

export type PosterQrTargetType =
  | "ticket_link"
  | "pamphlet_link"
  | "checkin_link"
  | "artist_profile_link"
  | "custom_url";

export type PosterConcertInfo = {
  title?: string;
  subtitle?: string;
  performerName?: string;
  program?: string;
  venueName?: string;
  dateText?: string;
  qrTargetType?: PosterQrTargetType;
  qrTargetUrl?: string;
};

export type PosterDesign = {
  version: 1;
  canvas: {
    width: number;
    height: number;
    backgroundColor: string;
  };
  templateId: PosterTemplateId;
  title: string;
  qrTargetType: PosterQrTargetType;
  qrTargetUrl: string;
  layers: PosterLayer[];
};

export type PosterLayerBase = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  visible?: boolean;
  locked?: boolean;
  lockedIdentity?: boolean;
  lockedFace?: boolean;
  allowedOperations?: string[];
  disallowedOperations?: string[];
};

export type PosterTextLayer = PosterLayerBase & {
  type: "text";
  text: string;
  ocrSourceLayerId?: string;
  ocrItemId?: string;
  ocrOriginalText?: string;
  ocrConfidence?: number;
  ocrCoverPatchId?: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle?: "normal" | "italic";
  underline?: boolean;
  color: string;
  align: "left" | "center" | "right";
  lineHeight: number;
  letterSpacing?: number;
};

export type PosterImageLayer = PosterLayerBase & {
  type: "image";
  src: string;
  objectFit: "contain" | "cover";
  objectPosition?: string;
  imageRole?: "reference" | "performer" | "texture" | "poster";
  protectedAreas?: Array<{
    id: string;
    name: string;
    shape?: "rect" | "ellipse" | "freeform";
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  coverPatches?: Array<{
    id: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fill: string;
    opacity?: number;
    text?: string;
    textColor?: string;
    fontSize?: number;
    fontWeight?: number;
  }>;
  adjustments?: {
    brightness?: number;
    contrast?: number;
    saturation?: number;
    hueRotate?: number;
    grayscale?: number;
    tintColor?: string;
    tintStrength?: number;
  };
  crop?: {
    scale: number;
    x: number;
    y: number;
  };
};

export type PosterShapeLayer = PosterLayerBase & {
  type: "shape";
  shape: "rect" | "circle" | "line" | "donut";
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  innerRadiusRatio?: number;
};

export type PosterQrLayer = PosterLayerBase & {
  type: "qr";
  targetType: PosterQrTargetType;
  targetUrl: string;
  foreground: string;
  background: string;
  caption?: string;
};

export type PosterLayer = PosterTextLayer | PosterImageLayer | PosterShapeLayer | PosterQrLayer;

export type PosterProposalDraft = {
  templateId: PosterTemplateId;
  title: string;
  design: PosterDesign;
};
