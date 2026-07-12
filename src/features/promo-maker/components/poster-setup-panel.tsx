import type { ReactNode } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  POSTER_PROPOSAL_COUNT_MAX,
  POSTER_PROPOSAL_COUNT_MIN,
} from "../poster/types";
import { posterPromptPresets, type PosterPromptPreset } from "./poster-prompt-presets";

type PosterSetupConcertInfo = {
  title: string;
  subtitle?: string;
  performerName: string;
  program?: string;
  venueName?: string;
  dateText: string;
};

type PosterSetupPanelProps = {
  concertInfo: PosterSetupConcertInfo;
  posterBriefTemplateId: string;
  proposalCount: number;
  busy: string | null;
  hasTransparentCutout: boolean;
  needsMoreProfileCandidates: boolean;
  savedPosterCandidateCount: number;
  performerAssetState: {
    exists: boolean;
    approved: boolean;
    needsProfileCandidate: boolean;
  };
  operatorContent?: ReactNode;
  message?: string;
  onConcertInfoChange: (patch: Partial<PosterSetupConcertInfo>) => void;
  onApplyPreset: (preset: PosterPromptPreset) => void;
  onProposalCountChange: (value: string) => void;
  onGenerateProfileVariants: () => void;
  onGenerateProposals: () => void;
};

export function PosterSetupPanel({
  concertInfo,
  posterBriefTemplateId,
  proposalCount,
  busy,
  hasTransparentCutout,
  needsMoreProfileCandidates,
  savedPosterCandidateCount,
  performerAssetState,
  operatorContent,
  message,
  onConcertInfoChange,
  onApplyPreset,
  onProposalCountChange,
  onGenerateProfileVariants,
  onGenerateProposals,
}: PosterSetupPanelProps) {
  const proposalDisabled =
    Boolean(busy) ||
    Boolean(
      performerAssetState.exists &&
        (!performerAssetState.approved || performerAssetState.needsProfileCandidate || needsMoreProfileCandidates),
    );
  const proposalButtonLabel =
    performerAssetState.exists && performerAssetState.needsProfileCandidate
      ? "프로필 후보 선택 후 포스터 시안 만들기"
      : performerAssetState.exists && needsMoreProfileCandidates
        ? `프로필 후보 ${proposalCount}개 먼저 만들기`
        : performerAssetState.exists && !performerAssetState.approved
          ? "프로필 후보 승인 후 포스터 시안 만들기"
          : `${proposalCount}개 포스터 시안 만들기`;

  return (
    <div className="ai-poster-panel">
      <div className="ai-poster-panel-head">
        <Sparkles size={18} />
        <h2>포스터 시안 만들기</h2>
      </div>
      <label className="ai-field">
        <span>공연 제목</span>
        <input value={concertInfo.title} onChange={(event) => onConcertInfoChange({ title: event.target.value })} />
      </label>
      <label className="ai-field">
        <span>연주자</span>
        <input value={concertInfo.performerName} onChange={(event) => onConcertInfoChange({ performerName: event.target.value })} />
      </label>
      <label className="ai-field">
        <span>프로그램/부제</span>
        <textarea value={concertInfo.program || concertInfo.subtitle || ""} onChange={(event) => onConcertInfoChange({ program: event.target.value })} />
      </label>
      <div className="ai-field-grid">
        <label className="ai-field">
          <span>일시</span>
          <input value={concertInfo.dateText} onChange={(event) => onConcertInfoChange({ dateText: event.target.value })} />
        </label>
        <label className="ai-field">
          <span>장소</span>
          <input value={concertInfo.venueName ?? ""} onChange={(event) => onConcertInfoChange({ venueName: event.target.value })} />
        </label>
      </div>
      <div className="ai-field ai-prompt-field">
        <span>포스터 방향 템플릿</span>
        <div className="ai-prompt-presets is-template-grid">
          {posterPromptPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={posterBriefTemplateId === preset.id ? "active" : ""}
              onClick={() => onApplyPreset(preset)}
            >
              <strong>{preset.label}</strong>
              <small>{preset.description}</small>
            </button>
          ))}
        </div>
        <div className="ai-prompt-status">
          <span>선택한 템플릿 기준으로 포스터 시안을 만듭니다.</span>
        </div>
      </div>
      <div className="ai-generation-inline">
        <div className="ai-field">
          <span>포스터 시안 수</span>
          <input
            type="number"
            min={POSTER_PROPOSAL_COUNT_MIN}
            max={POSTER_PROPOSAL_COUNT_MAX}
            step={1}
            value={proposalCount}
            onChange={(event) => onProposalCountChange(event.target.value)}
            disabled={Boolean(busy)}
          />
        </div>
        {needsMoreProfileCandidates ? (
          <div className="ai-profile-shortage">
            <strong>프로필 후보 부족</strong>
            <span>
              {savedPosterCandidateCount}/{proposalCount}개 준비됨 · 같은 누끼 복붙 포스터 시안은 만들지 않습니다.
            </span>
            <Button type="button" variant="secondary" onClick={onGenerateProfileVariants} disabled={Boolean(busy) || !hasTransparentCutout}>
              {busy === "profile-variants" ? <Loader2 className="spin-icon" size={16} /> : <Sparkles size={16} />}
              프로필 후보 {proposalCount}개 만들기
            </Button>
          </div>
        ) : null}
        <Button type="button" onClick={onGenerateProposals} disabled={proposalDisabled} className="w-full">
          {busy === "proposals" ? <Loader2 className="spin-icon" size={16} /> : <Sparkles size={16} />}
          {proposalButtonLabel}
        </Button>
        {operatorContent ? (
          <details className="ai-operator-panel">
            <summary>생성 상태 / 기록</summary>
            <div className="ai-operator-panel-body">{operatorContent}</div>
          </details>
        ) : null}
        {message ? <p className="ai-status">{message}</p> : null}
      </div>
    </div>
  );
}
