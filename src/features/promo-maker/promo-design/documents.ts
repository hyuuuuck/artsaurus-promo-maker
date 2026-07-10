import type {
  PromoCanvas,
  PromoCanvasSizingMode,
  PromoDocument,
  PromoDocumentKind,
  PromoImageLayer,
  PromoLayer,
  PromoLayerIdFactory,
  PromoPanel,
} from "./types";

export const PROMO_DOCUMENT_SPECS: Record<PromoDocumentKind, PromoCanvas> = {
  poster: { width: 1080, height: 1440, backgroundColor: "#ffffff", overflow: "hidden" },
  "pamphlet-bifold": { width: 2480, height: 3508, backgroundColor: "#ffffff", overflow: "hidden" },
  "instagram-feed": { width: 1080, height: 1080, backgroundColor: "#ffffff", overflow: "hidden" },
  "instagram-story": { width: 1080, height: 1920, backgroundColor: "#ffffff", overflow: "hidden" },
  "linkedin-cover": { width: 1584, height: 396, backgroundColor: "#ffffff", overflow: "hidden" },
};

let idSeed = 0;

export const defaultPromoIdFactory: PromoLayerIdFactory = (prefix) => {
  idSeed += 1;
  return `${prefix}-${idSeed}`;
};

export function makePromoCanvas(kind: PromoDocumentKind): PromoCanvas {
  return { ...PROMO_DOCUMENT_SPECS[kind] };
}

export function getBifoldPanels(canvas: PromoCanvas = makePromoCanvas("pamphlet-bifold")): PromoPanel[] {
  const panelWidth = canvas.width / 2;
  const panelHeight = canvas.height / 2;

  return [
    { id: "backCover", label: "뒷표지", x: 0, y: 0, width: panelWidth, height: panelHeight },
    { id: "frontCover", label: "앞표지", x: panelWidth, y: 0, width: panelWidth, height: panelHeight },
    { id: "insideLeft", label: "안쪽 왼쪽면", x: 0, y: panelHeight, width: panelWidth, height: panelHeight },
    { id: "insideRight", label: "안쪽 오른쪽면", x: panelWidth, y: panelHeight, width: panelWidth, height: panelHeight },
  ];
}

export function createBifoldPamphletFromPoster(
  poster: PromoDocument,
  idFactory: PromoLayerIdFactory = defaultPromoIdFactory,
): PromoDocument {
  const canvas = makePromoCanvas("pamphlet-bifold");
  const panels = getBifoldPanels(canvas);
  const frontCover = panels.find((panel) => panel.id === "frontCover");

  if (!frontCover) {
    throw new Error("BIFOLD_FRONT_COVER_MISSING");
  }

  const frontCoverLayers = poster.layers
    .filter((layer) => layer.isVisible)
    .map((layer, index) => copyLayerIntoFrame(layer, poster.canvas, frontCover, index, idFactory, "fill"));

  return {
    id: idFactory("pamphlet"),
    kind: "pamphlet-bifold",
    title: `${poster.title} 2단 팜플렛`,
    canvas,
    panels,
    layers: frontCoverLayers,
    sourcePosterDocumentId: poster.id,
    sourcePosterLayerIds: poster.layers.map((layer) => layer.id),
  };
}

export function createSocialDocumentFromPoster(
  poster: PromoDocument,
  kind: Extract<PromoDocumentKind, "instagram-feed" | "instagram-story">,
  sizingMode: PromoCanvasSizingMode = "fit",
  idFactory: PromoLayerIdFactory = defaultPromoIdFactory,
): PromoDocument {
  const canvas = makePromoCanvas(kind);
  const bounds = getScaledCanvasBounds(poster.canvas, canvas, sizingMode);
  const layers = poster.layers
    .filter((layer) => layer.isVisible)
    .map((layer, index) => scaleLayerIntoBounds(layer, bounds, index, idFactory));

  return {
    id: idFactory(kind),
    kind,
    title: `${poster.title} ${kind === "instagram-feed" ? "Instagram Feed" : "Instagram Story"}`,
    canvas,
    layers,
    sizingMode,
    sourcePosterDocumentId: poster.id,
    sourcePosterLayerIds: poster.layers.map((layer) => layer.id),
  };
}

export function createLinkedInCoverFromPoster(
  poster: PromoDocument,
  sizingMode: PromoCanvasSizingMode = "fit",
  idFactory: PromoLayerIdFactory = defaultPromoIdFactory,
): PromoDocument {
  const canvas = makePromoCanvas("linkedin-cover");
  const representativeImage = findRepresentativeImageLayer(poster.layers);
  const layers = representativeImage
    ? [createRepresentativeCoverLayer(representativeImage, canvas, sizingMode, idFactory)]
    : [];

  return {
    id: idFactory("linkedin-cover"),
    kind: "linkedin-cover",
    title: `${poster.title} LinkedIn 커버`,
    canvas,
    layers,
    sizingMode,
    sourcePosterDocumentId: poster.id,
    sourcePosterLayerIds: representativeImage ? [representativeImage.id] : [],
  };
}

export function findRepresentativeImageLayer(layers: PromoLayer[]): PromoImageLayer | null {
  const images = layers.filter((layer): layer is PromoImageLayer => {
    if (layer.type !== "image" || !layer.isVisible) return false;
    if (layer.imageRole === "qr" || layer.imageRole === "barcode") return false;
    return !/(^|\s)(qr|qrcode|barcode|bar\s*code|바코드|큐알)($|\s)/i.test(layer.name);
  });

  return images.sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? null;
}

function copyLayerIntoFrame(
  layer: PromoLayer,
  sourceCanvas: PromoCanvas,
  frame: PromoPanel,
  zIndex: number,
  idFactory: PromoLayerIdFactory,
  sizingMode: "fit" | "fill" = "fit",
): PromoLayer {
  const scale =
    sizingMode === "fill"
      ? Math.max(frame.width / sourceCanvas.width, frame.height / sourceCanvas.height)
      : Math.min(frame.width / sourceCanvas.width, frame.height / sourceCanvas.height);
  const offsetX = frame.x + (frame.width - sourceCanvas.width * scale) / 2;
  const offsetY = frame.y + (frame.height - sourceCanvas.height * scale) / 2;

  return {
    ...layer,
    id: idFactory("layer"),
    x: offsetX + layer.x * scale,
    y: offsetY + layer.y * scale,
    width: layer.width * scale,
    height: layer.height * scale,
    zIndex,
    isLocked: false,
    sourceLayerId: layer.id,
    clipToPanelId: frame.id,
  } as PromoLayer;
}

function scaleLayerIntoBounds(
  layer: PromoLayer,
  bounds: { x: number; y: number; scale: number },
  zIndex: number,
  idFactory: PromoLayerIdFactory,
): PromoLayer {
  return {
    ...layer,
    id: idFactory("layer"),
    x: bounds.x + layer.x * bounds.scale,
    y: bounds.y + layer.y * bounds.scale,
    width: layer.width * bounds.scale,
    height: layer.height * bounds.scale,
    zIndex,
    isLocked: false,
    sourceLayerId: layer.id,
  } as PromoLayer;
}

function getScaledCanvasBounds(source: PromoCanvas, target: PromoCanvas, sizingMode: PromoCanvasSizingMode) {
  const scale =
    sizingMode === "original"
      ? 1
      : sizingMode === "fill"
        ? Math.max(target.width / source.width, target.height / source.height)
        : Math.min(target.width / source.width, target.height / source.height);

  return {
    x: (target.width - source.width * scale) / 2,
    y: (target.height - source.height * scale) / 2,
    scale,
  };
}

function createRepresentativeCoverLayer(
  image: PromoImageLayer,
  canvas: PromoCanvas,
  sizingMode: PromoCanvasSizingMode,
  idFactory: PromoLayerIdFactory,
): PromoImageLayer {
  const naturalWidth = image.naturalWidth ?? image.width;
  const naturalHeight = image.naturalHeight ?? image.height;
  const scale =
    sizingMode === "original"
      ? 1
      : sizingMode === "fill"
        ? Math.max(canvas.width / naturalWidth, canvas.height / naturalHeight)
        : Math.min(canvas.width / naturalWidth, canvas.height / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;

  return {
    ...image,
    id: idFactory("cover-image"),
    name: "LinkedIn 대표 이미지",
    x: (canvas.width - width) / 2,
    y: (canvas.height - height) / 2,
    width,
    height,
    rotation: 0,
    objectFit: sizingMode === "fill" ? "cover" : sizingMode === "fit" ? "contain" : "none",
    crop: { scale: 1, offsetX: 0, offsetY: 0 },
    zIndex: 0,
    isLocked: false,
    sourceLayerId: image.id,
  };
}
