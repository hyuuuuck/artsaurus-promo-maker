import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PosterUploadButton } from "./poster-upload-button";

type StartModePanelProps = {
  busy: string | null;
  onImportPoster: (file: File | null) => void | Promise<void>;
  onStartAiPoster: () => void;
};

export function StartModePanel({ busy, onImportPoster, onStartAiPoster }: StartModePanelProps) {
  return (
    <section className="ai-start-panel">
      <div>
        <p className="section-eyebrow">POSTER START</p>
        <h2>시작 방식 선택</h2>
        <span>갖고 있는 포스터를 바로 열거나, 연주자 사진으로 새 포스터 시안을 만들 수 있습니다.</span>
      </div>
      <div className="ai-start-actions">
        <PosterUploadButton busy={busy} primary onFile={onImportPoster}>
          기존 포스터 업로드
        </PosterUploadButton>
        <Button type="button" variant="secondary" onClick={onStartAiPoster}>
          <Sparkles size={16} />
          AI 포스터 시안 만들기
        </Button>
      </div>
    </section>
  );
}
