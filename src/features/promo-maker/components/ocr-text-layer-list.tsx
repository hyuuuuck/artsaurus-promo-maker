import type { PosterImageLayer, PosterLayer, PosterTextLayer } from "../poster/types";

type OcrTextLayerListProps = {
  sourceLayer: PosterImageLayer;
  textLayers: PosterTextLayer[];
  updateTypedLayer: <T extends PosterLayer>(layerId: string, updater: (layer: T) => T) => void;
  selectLayer: (layerId: string) => void;
};

export function OcrTextLayerList({ sourceLayer, textLayers, updateTypedLayer, selectLayer }: OcrTextLayerListProps) {
  if (!textLayers.length) {
    return (
      <div className="ai-ocr-edit-list is-empty">
        <strong>OCR 문구 편집</strong>
        <p>아직 편집 가능한 OCR 문구가 없습니다. 위의 OCR 텍스트 인식을 먼저 실행하세요.</p>
      </div>
    );
  }

  return (
    <div className="ai-ocr-edit-list">
      <div className="ai-ocr-edit-head">
        <strong>OCR 문구 편집</strong>
        <span>
          {textLayers.length}개 문구 / 가림 {sourceLayer.coverPatches?.length ?? 0}개
        </span>
      </div>
      <div className="ai-ocr-edit-items">
        {textLayers.map((textLayer, index) => (
          <div key={textLayer.id} className="ai-ocr-edit-item">
            <button type="button" onClick={() => selectLayer(textLayer.id)} aria-label={`${index + 1}번 OCR 문구 캔버스에서 선택`}>
              {index + 1}
            </button>
            <label>
              <span>
                {textLayer.ocrConfidence != null ? `신뢰도 ${Math.round(textLayer.ocrConfidence)}%` : "OCR 문구"}
                {textLayer.ocrOriginalText && textLayer.ocrOriginalText !== textLayer.text ? ` · 원문: ${textLayer.ocrOriginalText}` : ""}
              </span>
              <textarea
                value={textLayer.text}
                onChange={(event) =>
                  updateTypedLayer<PosterTextLayer>(textLayer.id, (item) => ({
                    ...item,
                    text: event.target.value,
                  }))
                }
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
