import type { GeneratedPerformerAsset } from "../server/types";
import {
  POSTER_CANVAS,
  type PosterConcertInfo,
  type PosterDesign,
  type PosterImageLayer,
  type PosterLayer,
  type PosterProposalDraft,
  type PosterQrTargetType,
  type PosterShapeLayer,
  type PosterTextLayer,
  type PosterTemplateId,
} from "./types";
import { performerAssetAllowedOperations, performerAssetDisallowedOperations } from "./assetPolicy";
import type { PosterGenerationPlan } from "./generationOrchestrator";

type BuildProposalInput = {
  performerAsset: GeneratedPerformerAsset;
  performerVisuals?: Partial<Record<PosterTemplateId, PerformerVisual>>;
  concertInfo: PosterConcertInfo;
  qrTargetUrl: string;
  count?: 2 | 4 | 6 | 8;
  templates?: PosterTemplateMeta[];
  generationPlan?: PosterGenerationPlan;
};

export type PerformerVisual = Pick<GeneratedPerformerAsset, "generatedImageUrl" | "cutoutPngUrl">;

export type PosterTemplateMeta = {
  id: PosterTemplateId;
  title: string;
  background: string;
};

export const posterProposalTemplates: PosterTemplateMeta[] = [
  { id: "recital-photo-editorial", title: "Recital Photo Editorial", background: "#56584f" },
  { id: "minimal-recital", title: "Minimal Recital", background: "#f7f3ec" },
  { id: "black-editorial", title: "Black Editorial", background: "#0d0d0f" },
  { id: "concert-hall-classic", title: "Concert Hall Classic", background: "#efe2ca" },
  { id: "modern-typography", title: "Modern Typography", background: "#f8f8f5" },
  { id: "soft-romantic", title: "Soft Romantic", background: "#f4e5e4" },
  { id: "experimental-contemporary", title: "Experimental Contemporary", background: "#e9edf6" },
  { id: "premium-monochrome", title: "Premium Monochrome", background: "#111111" },
  { id: "grid-portfolio", title: "Grid Portfolio", background: "#faf8f3" },
];

export function selectPosterProposalTemplates(count?: 2 | 4 | 6 | 8, preferredTemplateIds: PosterTemplateId[] = []) {
  const ordered: PosterTemplateMeta[] = [];
  const addTemplate = (templateId: PosterTemplateId) => {
    const template = posterProposalTemplates.find((item) => item.id === templateId);
    if (template && !ordered.some((item) => item.id === template.id)) ordered.push(template);
  };
  for (const templateId of preferredTemplateIds) addTemplate(templateId);
  for (const template of posterProposalTemplates) addTemplate(template.id);
  return ordered.slice(0, count ?? 4);
}

export function buildPosterProposals(input: BuildProposalInput): PosterProposalDraft[] {
  const selectedTemplates = input.templates ?? selectPosterProposalTemplates(input.count, input.generationPlan?.layoutJob.templateIds);
  return selectedTemplates.map((template, index) => {
    const design = buildDesignForTemplate(template, index, input);
    return {
      templateId: template.id,
      title: template.title,
      design,
    };
  });
}

function buildDesignForTemplate(template: PosterTemplateMeta, index: number, input: BuildProposalInput): PosterDesign {
  const performerVisual = input.performerVisuals?.[template.id] ?? input.performerAsset;
  const title = input.concertInfo.title || "Untitled Concert";
  const performerName = input.concertInfo.performerName || "Performer";
  const subtitle = input.concertInfo.subtitle || input.concertInfo.program || "Recital";
  const programLine = formatProgramLine(input.concertInfo.program || "A. Scriabin        F. Chopin        F. Schubert");
  const recitalRole = resolveRecitalRole(input.concertInfo);
  const dateText = input.concertInfo.dateText || "Date TBA";
  const venueName = input.concertInfo.venueName || "Venue TBA";
  const qrTargetType = input.concertInfo.qrTargetType ?? "ticket_link";
  const qrTargetUrl = input.qrTargetUrl;
  const commonLayers: PosterLayer[] = [];

  if (template.id === "recital-photo-editorial") {
    const fullPhoto = image("performer", performerVisual.generatedImageUrl, 0, 0, 1080, 1350, "cover") as PosterImageLayer;
    fullPhoto.adjustments = {
      brightness: 0.96,
      contrast: 0.98,
      saturation: 0.82,
      tintColor: "#67685e",
      tintStrength: 0.18,
    };
    commonLayers.push(
      fullPhoto,
      shape("photo-tone", "rect", 0, 0, 1080, 1350, "rgba(47,48,43,0.24)"),
      shape("bottom-readable-veil", "rect", 0, 724, 1080, 626, "rgba(24,24,22,0.28)"),
      text("program", programLine, 44, 24, 992, 36, 21, 500, "#f2eee5", "center", "poster-myeongjo", { lineHeight: 1.05 }),
      text("recital-title", subtitle, 112, 78, 856, 54, 33, 500, "#f8f4eb", "center", "poster-myeongjo", { lineHeight: 1.05 }),
      text("performer-name", performerName, 70, 652, 940, 142, 92, 400, "#ffffff", "center", "poster-myeongjo", {
        fontStyle: "italic",
        lineHeight: 0.96,
      }),
      text("role", recitalRole, 300, 806, 480, 48, 29, 700, "#fffdf8", "center", "poster-myeongjo", { letterSpacing: 3 }),
      text("meta", `${dateText}   ${venueName}`, 112, 1186, 760, 42, 24, 700, "#ffffff", "center", "poster-nanum-gothic"),
      text("ticket", input.concertInfo.qrTargetUrl ? "예매 및 공연 정보는 QR을 확인해 주세요" : "공연 문의 및 예매 정보", 170, 1242, 640, 34, 17, 500, "#eee9df", "center", "poster-nanum-gothic"),
      qr("qr", qrTargetType, qrTargetUrl, 914, 1184, 96, "#111111", "#ffffff", "QR"),
    );
  }

  if (template.id === "minimal-recital") {
    commonLayers.push(
      shape("paper-rule", "line", 100, 104, 880, 1, "transparent", "#1d1d1d", 3),
      image("performer", performerVisual.cutoutPngUrl, 164, 246, 752, 706, "contain"),
      text("subtitle", subtitle, 100, 142, 880, 56, 28, 500, "#6b645d", "center", "poster-nanum-gothic"),
      text("title", title, 120, 950, 840, 164, 76, 800, "#111111", "center", "poster-nanum-gothic"),
      text("meta", `${dateText}\n${venueName}`, 266, 1142, 548, 78, 29, 700, "#1d1d1d", "center", "poster-nanum-gothic"),
      qr("qr", qrTargetType, qrTargetUrl, 888, 1164, 104, "#111111", "#ffffff", "예매"),
    );
  }

  if (template.id === "black-editorial") {
    commonLayers.push(
      shape("accent-block", "rect", 0, 0, 1080, 1350, "#0d0d0f"),
      image("performer", performerVisual.cutoutPngUrl, 594, 132, 388, 882, "contain"),
      shape("gold-rule", "rect", 82, 164, 10, 742, "#d9b469"),
      text("eyebrow", performerName, 112, 162, 398, 48, 28, 700, "#d9b469", "left", "poster-nanum-gothic"),
      text("title", title, 108, 238, 420, 286, 76, 900, "#ffffff", "left", "poster-nanum-gothic"),
      text("subtitle", subtitle, 112, 560, 392, 90, 29, 500, "#d7d7d7", "left", "poster-nanum-gothic"),
      text("meta", `${dateText}\n${venueName}`, 112, 1026, 430, 86, 30, 700, "#ffffff", "left", "poster-nanum-gothic"),
      qr("qr", qrTargetType, qrTargetUrl, 112, 1166, 106, "#0d0d0f", "#ffffff", "LINK"),
    );
  }

  if (template.id === "concert-hall-classic") {
    commonLayers.push(
      shape("outer-frame", "rect", 58, 58, 964, 1234, "transparent", "#5e4531", 3),
      shape("inner-frame", "rect", 96, 96, 888, 1158, "transparent", "#b1915e", 1),
      image("performer", performerVisual.generatedImageUrl, 170, 306, 740, 520, "cover"),
      text("eyebrow", "CONCERT RECITAL", 154, 174, 772, 44, 24, 700, "#72572e", "center", "poster-nanum-gothic"),
      text("title", title, 150, 866, 780, 152, 68, 800, "#17120e", "center", "Georgia"),
      text("performer", performerName, 204, 1042, 672, 58, 34, 700, "#17120e", "center", "poster-nanum-gothic"),
      text("meta", `${dateText} · ${venueName}`, 150, 1124, 780, 48, 25, 600, "#5e4531", "center", "poster-nanum-gothic"),
      qr("qr", qrTargetType, qrTargetUrl, 880, 1164, 90, "#17120e", "#efe2ca", "QR"),
    );
  }

  if (template.id === "modern-typography") {
    commonLayers.push(
      shape("blue-block", "rect", 0, 0, 382, 1350, "#202f5f"),
      shape("circle", "circle", 620, 98, 320, 320, "#e8d866"),
      image("performer", performerVisual.cutoutPngUrl, 554, 226, 426, 780, "contain"),
      text("series", "LIVE PERFORMANCE", 70, 118, 280, 60, 24, 800, "#ffffff", "left", "poster-nanum-gothic"),
      text("title", title, 68, 748, 430, 286, 78, 900, "#111111", "left", "poster-nanum-gothic"),
      text("subtitle", subtitle, 70, 1064, 430, 72, 30, 600, "#202f5f", "left", "poster-nanum-gothic"),
      text("meta", `${dateText}\n${venueName}`, 70, 1190, 460, 88, 26, 700, "#111111", "left", "poster-nanum-gothic"),
      qr("qr", qrTargetType, qrTargetUrl, 886, 1168, 102, "#111111", "#ffffff", "예매"),
    );
  }

  if (template.id === "soft-romantic") {
    commonLayers.push(
      shape("rose-panel", "rect", 104, 102, 872, 1146, "#fffaf8", "#d8aaa5", 2, 28),
      shape("top-orb", "circle", 698, 126, 220, 220, "#f0c7ca"),
      image("performer", performerVisual.cutoutPngUrl, 172, 258, 736, 690, "contain"),
      text("performer", performerName, 150, 164, 780, 54, 34, 700, "#9b5962", "center", "poster-nanum-gothic"),
      text("title", title, 152, 948, 776, 168, 70, 800, "#2f2526", "center", "Georgia"),
      text("meta", `${dateText}\n${venueName}`, 250, 1146, 580, 78, 27, 600, "#5f4548", "center", "poster-nanum-gothic"),
      qr("qr", qrTargetType, qrTargetUrl, 860, 1128, 96, "#2f2526", "#fffaf8", "LINK"),
    );
  }

  if (template.id === "experimental-contemporary") {
    commonLayers.push(
      shape("red-slash", "rect", 0, 854, 1080, 126, "#f06d3f"),
      shape("blue-slab", "rect", 102, 130, 746, 356, "#1f57d6"),
      image("performer", performerVisual.cutoutPngUrl, 642, 178, 342, 786, "contain"),
      text("number", `0${index + 1}`, 84, 92, 176, 100, 74, 900, "#111111", "left", "poster-nanum-gothic"),
      text("title", title, 74, 516, 498, 250, 74, 900, "#111111", "left", "poster-nanum-gothic"),
      text("subtitle", subtitle, 74, 792, 508, 70, 29, 700, "#ffffff", "left", "poster-nanum-gothic"),
      text("meta", `${dateText} / ${venueName}`, 74, 1052, 746, 48, 28, 800, "#111111", "left", "poster-nanum-gothic"),
      qr("qr", qrTargetType, qrTargetUrl, 850, 1070, 118, "#111111", "#ffffff", "INFO"),
    );
  }

  if (template.id === "premium-monochrome") {
    commonLayers.push(
      shape("mono-bg", "rect", 0, 0, 1080, 1350, "#111111"),
      image("performer", performerVisual.generatedImageUrl, 118, 116, 844, 772, "cover"),
      shape("fade", "rect", 118, 722, 844, 166, "rgba(17,17,17,0.72)"),
      text("title", title, 112, 928, 856, 166, 76, 800, "#ffffff", "center", "Georgia"),
      text("performer", performerName, 184, 1114, 712, 50, 30, 700, "#cfcfcf", "center", "poster-nanum-gothic"),
      text("meta", `${dateText} · ${venueName}`, 176, 1188, 728, 42, 24, 600, "#ffffff", "center", "poster-nanum-gothic"),
      qr("qr", qrTargetType, qrTargetUrl, 490, 1240, 88, "#111111", "#ffffff", ""),
    );
  }

  if (template.id === "grid-portfolio") {
    commonLayers.push(
      shape("grid-a", "rect", 70, 80, 440, 470, "#e6dfd2"),
      shape("grid-b", "rect", 540, 80, 470, 470, "#222222"),
      shape("grid-c", "rect", 70, 580, 940, 330, "#ffffff", "#111111", 2),
      image("performer-main", performerVisual.generatedImageUrl, 100, 110, 380, 410, "cover"),
      image("performer-cutout", performerVisual.cutoutPngUrl, 656, 116, 318, 786, "contain"),
      text("title", title, 104, 622, 430, 166, 58, 900, "#111111", "left", "poster-nanum-gothic"),
      text("subtitle", subtitle, 104, 806, 400, 54, 27, 700, "#555555", "left", "poster-nanum-gothic"),
      text("meta", `${performerName}\n${dateText}\n${venueName}`, 100, 986, 580, 128, 30, 700, "#111111", "left", "poster-nanum-gothic"),
      qr("qr", qrTargetType, qrTargetUrl, 820, 1000, 122, "#111111", "#ffffff", "QR"),
    );
  }

  const design: PosterDesign = {
    version: 1,
    canvas: {
      width: POSTER_CANVAS.width,
      height: POSTER_CANVAS.height,
      backgroundColor: resolveTemplateBackground(template, input.generationPlan),
    },
    templateId: template.id,
    title,
    qrTargetType,
    qrTargetUrl,
    layers: commonLayers,
  };

  return applyGenerationPlanToDesign(design, template, index, input.generationPlan);
}

function resolveTemplateBackground(template: PosterTemplateMeta, generationPlan?: PosterGenerationPlan) {
  if (!generationPlan) return template.background;
  if (generationPlan.backgroundJob.mode === "stage_background_generation" && template.id === "minimal-recital") return "#f3f1ea";
  if (generationPlan.backgroundJob.mode === "background_relight" && template.id === "modern-typography") return "#f7f8fb";
  return template.background;
}

function applyGenerationPlanToDesign(
  design: PosterDesign,
  template: PosterTemplateMeta,
  index: number,
  generationPlan?: PosterGenerationPlan,
): PosterDesign {
  if (!generationPlan) return design;

  const plannedLayers = design.layers.map((layer) => applyLayerPlan(layer, generationPlan));
  const backgroundLayers = buildOrchestratedBackgroundLayers(template, index, generationPlan);
  const insertIndex = leadingFullCanvasBackgroundCount(plannedLayers);

  return {
    ...design,
    layers: [
      ...plannedLayers.slice(0, insertIndex),
      ...backgroundLayers,
      ...plannedLayers.slice(insertIndex),
    ],
  };
}

function applyLayerPlan(layer: PosterLayer, generationPlan: PosterGenerationPlan): PosterLayer {
  if (layer.type !== "text") return layer;
  const typography = generationPlan.layoutJob.typography;
  const density = generationPlan.layoutJob.density;
  const isTitle = layer.id.includes("title");
  const isMeta = layer.id.includes("meta") || layer.id.includes("subtitle") || layer.id.includes("performer");
  const fontFamily = typography.includes("serif") && isTitle ? "Georgia" : typography.includes("bold Korean sans") ? "poster-gmarket-sans" : layer.fontFamily;
  const densityScale = density === "bold" && isTitle ? 1.08 : density === "quiet" && isMeta ? 0.92 : 1;
  const titleWeight = density === "bold" && isTitle ? Math.max(layer.fontWeight, 900) : layer.fontWeight;

  return {
    ...layer,
    fontFamily,
    fontSize: Math.max(12, Math.round(layer.fontSize * densityScale)),
    fontWeight: titleWeight,
    letterSpacing: 0,
  } satisfies PosterTextLayer;
}

function buildOrchestratedBackgroundLayers(
  template: PosterTemplateMeta,
  index: number,
  generationPlan: PosterGenerationPlan,
): PosterShapeLayer[] {
  const palette = resolvePlanPalette(generationPlan);
  if (generationPlan.backgroundJob.mode === "stage_background_generation") {
    return [
      planShape("orchestrator-stage-wash", "rect", 0, 0, 1080, 1350, palette.wash),
      planShape("orchestrator-stage-spotlight", "circle", 524 - index * 18, 76 + index * 24, 520, 520, palette.light),
      planShape("orchestrator-stage-shadow", "circle", -170 + index * 42, 770, 460, 460, palette.shadow),
    ];
  }

  if (generationPlan.backgroundJob.mode === "background_relight") {
    return [
      planShape("orchestrator-relight-wash", "rect", 0, 0, 1080, 1350, palette.wash),
      planShape("orchestrator-relight-halo", "circle", 620, 94 + index * 32, 360, 360, palette.light),
    ];
  }

  if (template.id === "minimal-recital" || template.id === "grid-portfolio") {
    return [
      planShape("orchestrator-paper-tone", "rect", 0, 0, 1080, 1350, palette.wash),
      planShape("orchestrator-quiet-orb", "circle", 760 - index * 36, 82, 250, 250, palette.light),
    ];
  }

  return [planShape("orchestrator-template-tone", "rect", 0, 0, 1080, 1350, palette.wash)];
}

function resolvePlanPalette(generationPlan: PosterGenerationPlan) {
  const palette = generationPlan.backgroundJob.palette.toLowerCase();
  if (palette.includes("rose") || palette.includes("burgundy")) {
    return {
      wash: "rgba(143, 82, 92, 0.08)",
      light: "rgba(244, 202, 204, 0.32)",
      shadow: "rgba(74, 43, 50, 0.12)",
    };
  }
  if (palette.includes("cobalt") || palette.includes("blue")) {
    return {
      wash: "rgba(31, 87, 214, 0.08)",
      light: "rgba(224, 232, 255, 0.34)",
      shadow: "rgba(28, 43, 91, 0.14)",
    };
  }
  if (palette.includes("black") || palette.includes("gold")) {
    return {
      wash: "rgba(217, 180, 105, 0.08)",
      light: "rgba(255, 236, 184, 0.28)",
      shadow: "rgba(16, 16, 18, 0.18)",
    };
  }
  return {
    wash: "rgba(110, 102, 89, 0.06)",
    light: "rgba(255, 250, 238, 0.38)",
    shadow: "rgba(55, 50, 44, 0.08)",
  };
}

function leadingFullCanvasBackgroundCount(layers: PosterLayer[]) {
  let count = 0;
  for (const layer of layers) {
    if (layer.type !== "shape" || layer.shape !== "rect") break;
    if (layer.x !== 0 || layer.y !== 0 || layer.width !== POSTER_CANVAS.width || layer.height !== POSTER_CANVAS.height) break;
    count += 1;
  }
  return count;
}

function planShape(
  id: string,
  shapeType: "rect" | "circle",
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
): PosterShapeLayer {
  return {
    id,
    name: id,
    type: "shape",
    shape: shapeType,
    x,
    y,
    width,
    height,
    fill,
    opacity: 1,
    visible: true,
    locked: true,
  };
}

function text(
  id: string,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  fontWeight: number,
  color: string,
  align: "left" | "center" | "right",
  fontFamily: string,
  options: Partial<Pick<PosterTextLayer, "fontStyle" | "lineHeight" | "letterSpacing">> = {},
): PosterLayer {
  return {
    id,
    name: id,
    type: "text",
    text: value,
    x,
    y,
    width,
    height,
    fontFamily,
    fontSize,
    fontWeight,
    color,
    align,
    fontStyle: options.fontStyle,
    lineHeight: options.lineHeight ?? 1.08,
    letterSpacing: options.letterSpacing ?? 0,
    opacity: 1,
    visible: true,
  };
}

function resolveRecitalRole(concertInfo: PosterConcertInfo) {
  const joined = [concertInfo.subtitle, concertInfo.title, concertInfo.program].filter(Boolean).join(" ").toLowerCase();
  if (/violin|바이올린/.test(joined)) return "VIOLIN RECITAL";
  if (/cello|첼로/.test(joined)) return "CELLO RECITAL";
  if (/vocal|voice|soprano|tenor|baritone|성악|소프라노|테너|바리톤/.test(joined)) return "VOCAL RECITAL";
  return "PIANO RECITAL";
}

function formatProgramLine(value: string) {
  return value
    .split(/\s{2,}|\n|,|;/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join("  ·  ");
}

function image(
  id: string,
  src: string,
  x: number,
  y: number,
  width: number,
  height: number,
  objectFit: "contain" | "cover",
): PosterLayer {
  const imageRole = id.includes("cutout") || id === "performer" ? "performer" : "reference";
  const lockedIdentity = imageRole === "performer";
  return {
    id,
    name: id,
    type: "image",
    src,
    x,
    y,
    width,
    height,
    objectFit,
    objectPosition: "50% 50%",
    opacity: 1,
    visible: true,
    locked: lockedIdentity,
    lockedIdentity,
    lockedFace: lockedIdentity,
    allowedOperations: lockedIdentity ? [...performerAssetAllowedOperations] : undefined,
    disallowedOperations: lockedIdentity ? [...performerAssetDisallowedOperations] : undefined,
    imageRole,
  };
}

function shape(
  id: string,
  shapeType: "rect" | "circle" | "line",
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  stroke?: string,
  strokeWidth?: number,
  radius?: number,
): PosterLayer {
  return {
    id,
    name: id,
    type: "shape",
    shape: shapeType,
    x,
    y,
    width,
    height,
    fill,
    stroke,
    strokeWidth,
    radius,
    opacity: 1,
    visible: true,
  };
}

function qr(
  id: string,
  targetType: PosterQrTargetType,
  targetUrl: string,
  x: number,
  y: number,
  size: number,
  foreground: string,
  background: string,
  caption: string,
): PosterLayer {
  return {
    id,
    name: id,
    type: "qr",
    targetType,
    targetUrl,
    x,
    y,
    width: size,
    height: size,
    foreground,
    background,
    caption,
    opacity: 1,
    visible: true,
  };
}
