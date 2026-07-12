import { Plus } from "lucide-react";
import type { PosterImageLayer, PosterLayer } from "../poster/types";

type PosterImageRegionControlsProps = {
  layer: PosterImageLayer;
  updateTypedLayer: <T extends PosterLayer>(layerId: string, updater: (layer: T) => T) => void;
};

export function PosterImageRegionControls({ layer, updateTypedLayer }: PosterImageRegionControlsProps) {
  const addProtectedArea = () => {
    updateTypedLayer<PosterImageLayer>(layer.id, (item) => ({
      ...item,
      protectedAreas: [
        ...(item.protectedAreas ?? []),
        {
          id: `protect-${Date.now()}`,
          name: `색감 제외 ${(item.protectedAreas?.length ?? 0) + 1}`,
          shape: "rect",
          x: Math.round(item.width * 0.58),
          y: Math.round(item.height * 0.1),
          width: Math.round(item.width * 0.28),
          height: Math.round(item.height * 0.28),
        },
      ],
    }));
  };

  return (
    <div className="ai-image-region-tools">
      <div className="ai-region-head">
        <strong>색감 제외 영역</strong>
        <button type="button" onClick={addProtectedArea}>
          <Plus size={14} />
          영역
        </button>
      </div>
      {(layer.protectedAreas ?? []).length ? (
        <div className="ai-region-list">
          {(layer.protectedAreas ?? []).map((area) => (
            <div key={area.id} className="ai-region-card">
              <div className="ai-region-card-head">
                <input
                  value={area.name}
                  onChange={(event) => updateProtectedArea(updateTypedLayer, layer.id, area.id, { name: event.target.value })}
                  aria-label="색감 제외 영역 이름"
                />
                <button type="button" onClick={() => removeProtectedArea(updateTypedLayer, layer.id, area.id)}>
                  삭제
                </button>
              </div>
              <div className="ai-field-grid">
                <RegionNumberField label="X" value={area.x} onChange={(value) => updateProtectedArea(updateTypedLayer, layer.id, area.id, { x: clampRegionValue(value, 0, layer.width) })} />
                <RegionNumberField label="Y" value={area.y} onChange={(value) => updateProtectedArea(updateTypedLayer, layer.id, area.id, { y: clampRegionValue(value, 0, layer.height) })} />
                <RegionNumberField label="W" value={area.width} onChange={(value) => updateProtectedArea(updateTypedLayer, layer.id, area.id, { width: clampRegionValue(value, 1, layer.width) })} />
                <RegionNumberField label="H" value={area.height} onChange={(value) => updateProtectedArea(updateTypedLayer, layer.id, area.id, { height: clampRegionValue(value, 1, layer.height) })} />
              </div>
              <div className="segmented-control">
                {(["rect", "ellipse", "freeform"] as const).map((shape) => (
                  <button
                    key={shape}
                    type="button"
                    className={(area.shape ?? "rect") === shape ? "active" : ""}
                    onClick={() => updateProtectedArea(updateTypedLayer, layer.id, area.id, { shape })}
                  >
                    {shape === "rect" ? "직사각형" : shape === "ellipse" ? "타원" : "자유형"}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="ai-region-empty">인물 사진이나 로고처럼 색을 유지할 부분을 추가하세요.</p>
      )}

      {(layer.coverPatches ?? []).length ? (
        <p className="ai-region-empty">OCR 가림 영역 {(layer.coverPatches ?? []).length}개가 적용됐습니다. 문구는 생성된 OCR 텍스트 레이어를 선택해서 수정하세요.</p>
      ) : (
        <p className="ai-region-empty">글자 수정이 필요하면 포스터 레이어에서 OCR 텍스트 인식을 실행하세요.</p>
      )}
    </div>
  );
}

function RegionNumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="ai-field">
      <span>{label}</span>
      <input type="number" value={Math.round(value)} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function updateProtectedArea(
  updateTypedLayer: <T extends PosterLayer>(layerId: string, updater: (layer: T) => T) => void,
  layerId: string,
  areaId: string,
  patch: Partial<NonNullable<PosterImageLayer["protectedAreas"]>[number]>,
) {
  updateTypedLayer<PosterImageLayer>(layerId, (item) => ({
    ...item,
    protectedAreas: (item.protectedAreas ?? []).map((area) => (area.id === areaId ? { ...area, ...patch } : area)),
  }));
}

function removeProtectedArea(
  updateTypedLayer: <T extends PosterLayer>(layerId: string, updater: (layer: T) => T) => void,
  layerId: string,
  areaId: string,
) {
  updateTypedLayer<PosterImageLayer>(layerId, (item) => ({
    ...item,
    protectedAreas: (item.protectedAreas ?? []).filter((area) => area.id !== areaId),
  }));
}

function clampRegionValue(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.round(Math.min(max, Math.max(min, value)));
}
