/* eslint-disable @next/next/no-img-element -- Saved project thumbnails are generated/exported URLs. */

import { FileText, History, Loader2, MousePointer2, RefreshCw } from "lucide-react";

export type SavedProjectShelfRecord = {
  id: string;
  title: string;
  thumbnailUrl?: string | null;
  exportUrl?: string | null;
  sourceKind?: string | null;
  sourceTitle?: string | null;
  sourceTemplateId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type SavedProjectShelfProps<TProject extends SavedProjectShelfRecord> = {
  projects: TProject[];
  loading: boolean;
  activeProjectId?: string;
  busy: string | null;
  onRefresh: () => void;
  onOpen: (projectId: string) => void;
};

export function SavedProjectShelf<TProject extends SavedProjectShelfRecord>({
  projects,
  loading,
  activeProjectId,
  busy,
  onRefresh,
  onOpen,
}: SavedProjectShelfProps<TProject>) {
  return (
    <div className="ai-saved-projects">
      <div className="ai-saved-projects-head">
        <strong>
          <History size={16} />
          최근 저장 작업
        </strong>
        <span>{projects.length ? `${projects.length}개 중 최근 6개` : "저장된 작업 없음"}</span>
        <button type="button" onClick={onRefresh} disabled={loading || Boolean(busy)} aria-label="저장 작업 새로고침">
          {loading ? <Loader2 className="spin-icon" size={14} /> : <RefreshCw size={14} />}
        </button>
      </div>
      {projects.length ? (
        <div className="ai-saved-project-list">
          {projects.slice(0, 6).map((item) => (
            <article key={item.id} className={activeProjectId === item.id ? "ai-saved-project active" : "ai-saved-project"}>
              <button type="button" className="ai-saved-project-preview" onClick={() => onOpen(item.id)} disabled={Boolean(busy)} aria-label={`${item.title} 열기`}>
                {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" /> : <FileText size={22} />}
                <span>{item.sourceKind === "ai_proposal" ? "AI" : "업로드"}</span>
              </button>
              <div className="ai-saved-project-body">
                <strong>{shortProjectTitle(item.title)}</strong>
                <p>{item.sourceTitle && item.sourceTitle !== item.title ? item.sourceTitle : projectSourceLabel(item)}</p>
                <span>{[formatProjectTime(item.updatedAt ?? item.createdAt ?? "") || "저장됨", projectSourceLabel(item)].filter(Boolean).join(" · ")}</span>
                <div className="ai-saved-project-actions">
                  {item.exportUrl ? (
                    <a href={item.exportUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                      PNG 보기
                    </a>
                  ) : (
                    <em>PNG 없음</em>
                  )}
                  <button type="button" onClick={() => onOpen(item.id)} disabled={Boolean(busy)}>
                    {busy === `project-${item.id}` ? <Loader2 className="spin-icon" size={14} /> : <MousePointer2 size={14} />}
                    편집 계속
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="ai-generation-history-empty">아직 저장된 편집 작업이 없습니다. 포스터 시안을 열거나 업로드 포스터를 저장하면 여기에 나타납니다.</p>
      )}
    </div>
  );
}

function shortProjectTitle(title: string) {
  return title.replace(/\s+업로드 포스터$/u, " · 업로드").replace(/\s+포스터$/u, " · 포스터");
}

function projectSourceLabel(project: SavedProjectShelfRecord) {
  if (project.sourceKind === "ai_proposal") {
    return project.sourceTemplateId ? `AI 시안 · ${posterTemplateLabel(project.sourceTemplateId)}` : "AI 시안";
  }
  return "업로드 포스터";
}

function posterTemplateLabel(templateId: string) {
  const labels: Record<string, string> = {
    "recital-photo-editorial": "리사이틀 포토",
    "minimal-recital": "미니멀 리사이틀",
    "black-editorial": "블랙 에디토리얼",
    "concert-hall-classic": "콘서트홀 클래식",
    "modern-typography": "모던 타이포",
    "soft-romantic": "소프트 로맨틱",
    "experimental-contemporary": "컨템포러리",
    "premium-monochrome": "프리미엄 모노",
    "grid-portfolio": "그리드 포트폴리오",
  };
  return labels[templateId] ?? templateId;
}

function formatProjectTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
