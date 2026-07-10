import type { PosterDesign, PosterLayer, PosterQrLayer } from "./types";

export type PosterQualitySeverity = "error" | "warning" | "info";
export type PosterQualityRating = "good" | "review" | "problem";

export type PosterQualityIssue = {
  id: string;
  severity: PosterQualitySeverity;
  category: "bounds" | "overlap" | "text" | "qr" | "performer" | "layer";
  layerIds: string[];
  message: string;
};

export type PosterQualityAutoFix = {
  id: string;
  category: PosterQualityIssue["category"];
  layerIds: string[];
  message: string;
};

export type PosterQualityReport = {
  version: 1;
  rating: PosterQualityRating;
  score: number;
  summary: string;
  issues: PosterQualityIssue[];
  autoFixes?: PosterQualityAutoFix[];
  checkedAt: string;
};

type Box = {
  id: string;
  type: PosterLayer["type"];
  x: number;
  y: number;
  width: number;
  height: number;
};

export function autoRepairPosterDesign(design: PosterDesign): { design: PosterDesign; fixes: PosterQualityAutoFix[] } {
  const fixes: PosterQualityAutoFix[] = [];
  const canvas = {
    width: design.canvas.width,
    height: design.canvas.height,
  };
  let layers = design.layers.map((layer) => {
    let next = { ...layer } as PosterLayer;

    if (next.visible === false) return next;

    if (next.type === "image" && next.imageRole === "performer") {
      if (!next.locked || !next.lockedIdentity || !next.lockedFace) {
        next = {
          ...next,
          locked: true,
          lockedIdentity: true,
          lockedFace: true,
        };
        fixes.push(autoFix("performer", [next.id], "연주자 에셋 레이어를 얼굴/정체성 잠금 상태로 보정했습니다."));
      }
    }

    if (next.type === "text" && next.fontSize < 18) {
      next = {
        ...next,
        fontSize: 18,
      };
      fixes.push(autoFix("text", [next.id], "너무 작은 텍스트를 최소 출력 크기로 키웠습니다."));
    }

    if (next.type === "qr") {
      const size = Math.max(96, Math.min(150, Math.max(next.width, next.height)));
      if (next.width !== size || next.height !== size) {
        next = {
          ...next,
          width: size,
          height: size,
        };
        fixes.push(autoFix("qr", [next.id], "QR을 스캔 가능한 최소 크기로 보정했습니다."));
      }
    }

    const clamped = clampLayerInsideCanvas(next, canvas.width, canvas.height, next.type === "qr" ? 48 : 0);
    if (clamped.x !== next.x || clamped.y !== next.y || clamped.width !== next.width || clamped.height !== next.height) {
      next = clamped;
      fixes.push(autoFix(next.type === "qr" ? "qr" : "bounds", [next.id], `${next.name} 레이어를 캔버스 안쪽으로 보정했습니다.`));
    }
    return next;
  });

  layers = moveQrLayersAwayFromImportantContent(layers, canvas.width, canvas.height, fixes);
  layers = reduceTextPerformerOverlap(layers, canvas.width, canvas.height, fixes);

  return {
    design: {
      ...design,
      layers,
    },
    fixes,
  };
}

export function analyzePosterProposalQuality(design: PosterDesign, checkedAt = new Date()): PosterQualityReport {
  const issues: PosterQualityIssue[] = [];
  const visibleLayers = design.layers.filter((layer) => layer.visible !== false);
  const boxes = visibleLayers.map(layerBox);
  const canvas = {
    id: "canvas",
    type: "shape" as const,
    x: 0,
    y: 0,
    width: design.canvas.width,
    height: design.canvas.height,
  };

  for (const layer of visibleLayers) {
    const box = layerBox(layer);
    const outsideRatio = 1 - intersectionRatio(box, canvas, "self");
    if (outsideRatio > 0.02) {
      issues.push(issue("bounds", outsideRatio > 0.16 ? "error" : "warning", [layer.id], `${layer.name} 레이어가 캔버스 밖으로 나갑니다.`));
    }
    if (layer.width <= 0 || layer.height <= 0) {
      issues.push(issue("layer", "error", [layer.id], `${layer.name} 레이어 크기가 올바르지 않습니다.`));
    }
  }

  const performerLayers = visibleLayers.filter((layer) => layer.type === "image" && layer.imageRole === "performer");
  if (!performerLayers.length) {
    issues.push(issue("performer", "error", [], "승인된 연주자 에셋 레이어가 없습니다."));
  }
  for (const performer of performerLayers) {
    if (!performer.lockedIdentity || !performer.lockedFace || performer.locked !== true) {
      issues.push(issue("performer", "warning", [performer.id], "연주자 에셋은 얼굴/정체성 잠금 상태여야 합니다."));
    }
  }

  const textLayers = visibleLayers.filter((layer) => layer.type === "text");
  for (const textLayer of textLayers) {
    if (textLayer.fontSize < 18) {
      issues.push(issue("text", "warning", [textLayer.id], `${textLayer.name} 글자가 너무 작아 출력물에서 읽기 어려울 수 있습니다.`));
    }
    if (!textLayer.text.trim()) {
      issues.push(issue("text", "warning", [textLayer.id], `${textLayer.name} 텍스트가 비어 있습니다.`));
    }
  }

  const qrLayers = visibleLayers.filter((layer) => layer.type === "qr");
  if (!qrLayers.length) {
    issues.push(issue("qr", "warning", [], "예매/연결용 QR 레이어가 없습니다."));
  }
  for (const qrLayer of qrLayers) {
    if (Math.min(qrLayer.width, qrLayer.height) < 86) {
      issues.push(issue("qr", "warning", [qrLayer.id], "QR 크기가 작아 스캔 안정성이 떨어질 수 있습니다."));
    }
    if (intersectionRatio(layerBox(qrLayer), canvas, "self") < 0.98) {
      issues.push(issue("qr", "error", [qrLayer.id], "QR이 캔버스 밖으로 잘려 보입니다."));
    }
  }

  addOverlapIssues(issues, boxes, visibleLayers);

  const score = Math.max(
    0,
    100 -
      issues.filter((item) => item.severity === "error").length * 28 -
      issues.filter((item) => item.severity === "warning").length * 9 -
      issues.filter((item) => item.severity === "info").length * 3,
  );
  const rating: PosterQualityRating = score >= 85 ? "good" : score >= 65 ? "review" : "problem";
  return {
    version: 1,
    rating,
    score,
    summary: qualitySummary(rating, issues),
    issues: issues.slice(0, 12),
    checkedAt: checkedAt.toISOString(),
  };
}

function addOverlapIssues(issues: PosterQualityIssue[], boxes: Box[], layers: PosterLayer[]) {
  const layerById = new Map(layers.map((layer) => [layer.id, layer]));
  for (let index = 0; index < boxes.length; index += 1) {
    const first = boxes[index];
    if (!first) continue;
    for (let nextIndex = index + 1; nextIndex < boxes.length; nextIndex += 1) {
      const second = boxes[nextIndex];
      if (!second) continue;
      const firstLayer = layerById.get(first.id);
      const secondLayer = layerById.get(second.id);
      if (!firstLayer || !secondLayer) continue;

      const overlap = intersectionRatio(first, second, "smaller");
      if (overlap <= 0.04) continue;

      const pairTypes = new Set([first.type, second.type]);
      const involvesQr = pairTypes.has("qr");
      const involvesText = pairTypes.has("text");
      const involvesShape = pairTypes.has("shape");
      const involvesPerformer = [firstLayer, secondLayer].some((layer) => layer.type === "image" && layer.imageRole === "performer");
      const bothDecorative = !involvesText && !involvesQr;

      if (bothDecorative) continue;
      if (involvesText && involvesShape && !involvesQr && !involvesPerformer) continue;
      if (involvesQr && involvesShape && !involvesText && !involvesPerformer) continue;
      if (involvesQr && overlap > 0.02) {
        issues.push(issue("qr", "warning", [first.id, second.id], "QR 위에 다른 요소가 겹쳐 스캔이 어려울 수 있습니다."));
        continue;
      }
      if (involvesText && involvesPerformer && overlap > 0.1) {
        issues.push(issue("overlap", "warning", [first.id, second.id], "주요 텍스트가 연주자 이미지와 겹칩니다."));
        continue;
      }
      if (involvesText && overlap > 0.22) {
        issues.push(issue("overlap", "warning", [first.id, second.id], "텍스트와 다른 요소가 과하게 겹칩니다."));
      }
    }
  }
}

function layerBox(layer: PosterLayer): Box {
  return {
    id: layer.id,
    type: layer.type,
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
  };
}

function clampLayerInsideCanvas<T extends PosterLayer>(layer: T, canvasWidth: number, canvasHeight: number, margin: number): T {
  const maxWidth = Math.max(1, canvasWidth - margin * 2);
  const maxHeight = Math.max(1, canvasHeight - margin * 2);
  let width = layer.width;
  let height = layer.height;

  if (width > maxWidth || height > maxHeight) {
    const scale = Math.min(maxWidth / Math.max(1, width), maxHeight / Math.max(1, height));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }

  const x = Math.round(Math.min(canvasWidth - margin - width, Math.max(margin, layer.x)));
  const y = Math.round(Math.min(canvasHeight - margin - height, Math.max(margin, layer.y)));
  return {
    ...layer,
    x,
    y,
    width,
    height,
  };
}

function moveQrLayersAwayFromImportantContent(
  layers: PosterLayer[],
  canvasWidth: number,
  canvasHeight: number,
  fixes: PosterQualityAutoFix[],
) {
  return layers.map((layer) => {
    if (layer.type !== "qr" || layer.visible === false) return layer;

    const currentOverlap = qrOverlapScore(layer, layers);
    const insideRatio = intersectionRatio(layerBox(layer), { id: "canvas", type: "shape", x: 0, y: 0, width: canvasWidth, height: canvasHeight }, "self");
    if (currentOverlap <= 0.02 && insideRatio >= 0.98) return layer;

    const margin = 62;
    const candidates = [
      { x: canvasWidth - margin - layer.width, y: canvasHeight - margin - layer.height },
      { x: margin, y: canvasHeight - margin - layer.height },
      { x: canvasWidth - margin - layer.width, y: margin },
      { x: margin, y: margin },
    ].map((candidate) => ({ ...layer, ...candidate }));
    const best = candidates.reduce((selected, candidate) => (qrOverlapScore(candidate, layers) < qrOverlapScore(selected, layers) ? candidate : selected), candidates[0] ?? layer);
    if (best.x !== layer.x || best.y !== layer.y) {
      fixes.push(autoFix("qr", [layer.id], "QR이 잘리거나 겹치지 않도록 안전한 모서리로 이동했습니다."));
    }
    return best;
  });
}

function qrOverlapScore(qrLayer: PosterQrLayer, layers: PosterLayer[]) {
  const qrBox = layerBox(qrLayer);
  return layers
    .filter((layer) => layer.id !== qrLayer.id && layer.visible !== false)
    .filter((layer) => layer.type === "text" || layer.type === "qr" || (layer.type === "image" && layer.imageRole === "performer"))
    .reduce((score, layer) => score + intersectionRatio(qrBox, layerBox(layer), "smaller"), 0);
}

function reduceTextPerformerOverlap(
  layers: PosterLayer[],
  canvasWidth: number,
  canvasHeight: number,
  fixes: PosterQualityAutoFix[],
) {
  const performerLayers = layers.filter((layer) => layer.type === "image" && layer.imageRole === "performer" && layer.visible !== false);
  if (!performerLayers.length) return layers;

  return layers.map((layer) => {
    if (layer.type !== "text" || layer.visible === false) return layer;
    const textBox = layerBox(layer);
    const performer = performerLayers.find((item) => intersectionRatio(textBox, layerBox(item), "smaller") > 0.12);
    if (!performer) return layer;

    const performerBox = layerBox(performer);
    const gap = 28;
    const belowY = performerBox.y + performerBox.height + gap;
    const aboveY = performerBox.y - layer.height - gap;
    const nextY = belowY + layer.height <= canvasHeight - gap ? belowY : Math.max(gap, aboveY);
    const repaired = clampLayerInsideCanvas(
      {
        ...layer,
        y: Math.round(nextY),
      },
      canvasWidth,
      canvasHeight,
      0,
    );
    if (repaired.y !== layer.y) {
      fixes.push(autoFix("overlap", [layer.id, performer.id], "연주자 이미지와 겹친 텍스트를 안전한 영역으로 이동했습니다."));
    }
    return repaired;
  });
}

function intersectionRatio(first: Box, second: Box, mode: "self" | "smaller") {
  const x = Math.max(first.x, second.x);
  const y = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);
  const width = Math.max(0, right - x);
  const height = Math.max(0, bottom - y);
  const intersectionArea = width * height;
  const firstArea = Math.max(1, first.width * first.height);
  const secondArea = Math.max(1, second.width * second.height);
  return intersectionArea / (mode === "smaller" ? Math.min(firstArea, secondArea) : firstArea);
}

function issue(
  category: PosterQualityIssue["category"],
  severity: PosterQualitySeverity,
  layerIds: string[],
  message: string,
): PosterQualityIssue {
  return {
    id: `${category}-${severity}-${layerIds.join("-") || "global"}-${message.length}`,
    category,
    severity,
    layerIds,
    message,
  };
}

function autoFix(category: PosterQualityIssue["category"], layerIds: string[], message: string): PosterQualityAutoFix {
  return {
    id: `fix-${category}-${layerIds.join("-") || "global"}-${message.length}`,
    category,
    layerIds,
    message,
  };
}

function qualitySummary(rating: PosterQualityRating, issues: PosterQualityIssue[]) {
  const errors = issues.filter((item) => item.severity === "error").length;
  const warnings = issues.filter((item) => item.severity === "warning").length;
  if (rating === "good") return "바로 검토 가능한 시안입니다.";
  if (errors) return `문제 ${errors}개, 확인 ${warnings}개가 있습니다.`;
  return `확인할 항목 ${warnings}개가 있습니다.`;
}
