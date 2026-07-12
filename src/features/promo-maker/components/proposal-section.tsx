/* eslint-disable @next/next/no-img-element -- Proposal previews are generated poster image URLs. */

import type { Ref } from "react";
import { Loader2, MousePointer2 } from "lucide-react";

export type ProposalQualityReportRecord = {
  rating: "good" | "review" | "problem";
  score: number;
  summary: string;
  issues: Array<{
    id: string;
    severity: "error" | "warning" | "info";
    category: string;
    layerIds: string[];
    message: string;
  }>;
  autoFixes?: Array<{
    id: string;
    category: string;
    layerIds: string[];
    message: string;
  }>;
};

type ProposalSectionRecord = {
  id: string;
  title: string;
  thumbnailUrl: string;
  previewUrl: string;
  qualityReportJson?: string | null;
};

type ProposalSectionProps<TProposal extends ProposalSectionRecord> = {
  sectionRef?: Ref<HTMLElement>;
  proposals: TProposal[];
  busyProposalId?: string | null;
  onSelect: (proposal: TProposal) => void;
};

export function ProposalSection<TProposal extends ProposalSectionRecord>({
  sectionRef,
  proposals,
  busyProposalId,
  onSelect,
}: ProposalSectionProps<TProposal>) {
  return (
    <section className="ai-proposal-section" ref={sectionRef}>
      <div className="ai-section-title">
        <h2>AI 포스터 시안</h2>
        <span>{proposals.length ? `${proposals.length}개` : "사진과 정보를 입력한 뒤 생성"}</span>
      </div>
      <div className="ai-proposal-grid">
        {proposals.map((proposal, index) => (
          <ProposalCard
            key={proposal.id}
            proposal={proposal}
            index={index}
            busy={busyProposalId === proposal.id}
            onSelect={() => onSelect(proposal)}
          />
        ))}
      </div>
    </section>
  );
}

function ProposalCard({
  proposal,
  index,
  busy,
  onSelect,
}: {
  proposal: ProposalSectionRecord;
  index: number;
  busy: boolean;
  onSelect: () => void;
}) {
  const qualityReport = parseProposalQualityReport(proposal.qualityReportJson);
  return (
    <article className="ai-proposal-card">
      <span>{index + 1}</span>
      <img src={proposal.previewUrl || proposal.thumbnailUrl} alt="" />
      <strong>{proposal.title}</strong>
      {qualityReport ? (
        <div className={`ai-quality-badge is-${qualityReport.rating}`}>
          <b>{qualityRatingLabel(qualityReport.rating)}</b>
          <em>{qualityReport.score}점</em>
        </div>
      ) : null}
      {qualityReport?.issues.length ? (
        <div className="ai-quality-issues">
          {qualityReport.issues.slice(0, 2).map((issue) => (
            <small key={issue.id}>{issue.message}</small>
          ))}
        </div>
      ) : null}
      {qualityReport?.autoFixes?.length ? <small className="ai-quality-autofix">자동 보정 {qualityReport.autoFixes.length}개 적용</small> : null}
      <button type="button" className="ai-proposal-open-button" onClick={onSelect} disabled={busy}>
        {busy ? <Loader2 className="spin-icon" size={16} /> : <MousePointer2 size={16} />}
        간단 편집으로 열기
      </button>
    </article>
  );
}

function parseProposalQualityReport(value?: string | null): ProposalQualityReportRecord | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as ProposalQualityReportRecord;
    if (!parsed || typeof parsed !== "object" || !["good", "review", "problem"].includes(parsed.rating)) return null;
    return {
      rating: parsed.rating,
      score: Number.isFinite(parsed.score) ? Math.round(parsed.score) : 0,
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      autoFixes: Array.isArray(parsed.autoFixes) ? parsed.autoFixes : [],
    };
  } catch {
    return null;
  }
}

function qualityRatingLabel(rating: ProposalQualityReportRecord["rating"]) {
  if (rating === "good") return "추천";
  if (rating === "review") return "확인 필요";
  return "문제 있음";
}
