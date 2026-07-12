import type { ReactNode, Ref } from "react";
import { MousePointer2 } from "lucide-react";
import { PosterUploadButton } from "./poster-upload-button";
import type { PosterDesign, PosterLayer } from "../poster/types";

type EditorStageProps = {
  design: PosterDesign | null;
  scale: number;
  busy: string | null;
  stageShellRef: Ref<HTMLDivElement>;
  onWheel: (event: React.WheelEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerEnd: () => void;
  onClearSelection: () => void;
  onImportPoster: (file: File | null) => void | Promise<void>;
  renderLayer: (layer: PosterLayer) => ReactNode;
};

export function EditorStage({
  design,
  scale,
  busy,
  stageShellRef,
  onWheel,
  onPointerMove,
  onPointerEnd,
  onClearSelection,
  onImportPoster,
  renderLayer,
}: EditorStageProps) {
  return (
    <div className="ai-stage-shell" ref={stageShellRef}>
      {design ? (
        <div
          className="ai-stage-viewport"
          style={{
            width: design.canvas.width * scale,
            height: design.canvas.height * scale,
          }}
          onWheel={onWheel}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          <div className="ai-canvas-size-chip">
            {design.canvas.width} x {design.canvas.height}px
          </div>
          <div
            className="ai-stage"
            style={{
              width: design.canvas.width,
              height: design.canvas.height,
              transform: `scale(${scale})`,
              background: design.canvas.backgroundColor,
            }}
            onPointerDown={onClearSelection}
          >
            {design.layers.map((layer) => renderLayer(layer))}
          </div>
        </div>
      ) : (
        <div className="ai-stage-empty">
          <MousePointer2 size={30} />
          <strong>포스터를 업로드하거나 포스터 시안을 선택하세요</strong>
          <span>업로드한 포스터는 간단 편집에서 색감 조정, OCR 텍스트 변환, 레이어 수정을 이어갈 수 있습니다.</span>
          <PosterUploadButton busy={busy} onFile={onImportPoster}>
            업로드 포스터 열기
          </PosterUploadButton>
        </div>
      )}
    </div>
  );
}
