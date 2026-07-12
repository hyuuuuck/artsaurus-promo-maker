import { ExternalLink, Loader2, TextCursorInput } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PosterUploadButton } from "./poster-upload-button";

type EditorHeaderProps = {
  title: string;
  busy: string | null;
  detailEditorHref: string;
  canRunOcr: boolean;
  onImportPoster: (file: File | null) => void | Promise<void>;
  onRunOcr: () => void;
};

export function EditorHeader({
  title,
  busy,
  detailEditorHref,
  canRunOcr,
  onImportPoster,
  onRunOcr,
}: EditorHeaderProps) {
  return (
    <div className="ai-section-title ai-editor-title">
      <div>
        <h2>간단 편집</h2>
        <span>{title}</span>
      </div>
      <div className="ai-editor-toolbar" aria-label="간단 편집 작업">
        <PosterUploadButton busy={busy} onFile={onImportPoster}>
          업로드 포스터 열기
        </PosterUploadButton>
        <Button
          type="button"
          variant="secondary"
          onClick={onRunOcr}
          disabled={!canRunOcr || Boolean(busy)}
          title={canRunOcr ? "업로드 포스터의 텍스트를 편집 가능한 레이어로 변환" : "업로드 포스터를 먼저 열어 주세요"}
        >
          {busy === "poster-ocr" ? <Loader2 className="spin-icon" size={16} /> : <TextCursorInput size={16} />}
          OCR 텍스트 변환
        </Button>
        <a
          className="ai-file-button ai-detail-editor-link"
          href={detailEditorHref}
          target="_blank"
          rel="noreferrer"
          title="레이어 상세 편집, 2단 팜플렛, SNS 규격 변환 열기"
        >
          <ExternalLink size={16} />
          상세 편집 열기
        </a>
      </div>
    </div>
  );
}
