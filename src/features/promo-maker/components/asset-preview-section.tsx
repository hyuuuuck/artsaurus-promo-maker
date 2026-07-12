/* eslint-disable @next/next/no-img-element -- Performer assets are generated/uploaded preview URLs. */

import type { Ref } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProfileVariantPanel, type ProfileVariantFailureRecord } from "./profile-variant-panel";

export type AssetPreviewRecord = {
  id: string;
  thumbnailUrl: string;
  cutoutPngUrl: string;
  generatedImageUrl: string;
  generationMode: string;
  provider: string;
};

type AssetPreviewSectionProps<TAsset extends AssetPreviewRecord> = {
  asset: TAsset;
  assetLabel: string;
  cutoutProviderLabel: string;
  cutoutStatusClass: string;
  cutoutStatusLabel: string;
  faceIdentityStatusClass: string;
  faceIdentityStatusLabel: string;
  hasTransparentCutout: boolean;
  selectedAssetNeedsProfileCandidate: boolean;
  performerAssetApproved: boolean;
  needsMoreProfileCandidatesForProposals: boolean;
  currentAssetCanGenerateProposals: boolean;
  shouldShowProfileVariantControls: boolean;
  profileVariantAssets: TAsset[];
  profileVariantFailures: ProfileVariantFailureRecord[];
  profileVariantPanelRef?: Ref<HTMLDivElement>;
  profileVariantCount: number;
  profileVariantCountOptions: readonly number[];
  selectedProfileVariantTemplates: Array<{ label: string }>;
  proposalCount: number;
  proposalsLength: number;
  projectExists: boolean;
  busy: string | null;
  onApproveAsset: () => void;
  onGenerateProfileVariants: () => void;
  onGenerateProposals: () => void;
  onProfileVariantCountChange: (count: number) => void;
  onUseProfileVariant: (asset: TAsset) => void;
  getAssetLabel: (asset: TAsset) => string;
};

export function AssetPreviewSection<TAsset extends AssetPreviewRecord>({
  asset,
  assetLabel,
  cutoutProviderLabel,
  cutoutStatusClass,
  cutoutStatusLabel,
  faceIdentityStatusClass,
  faceIdentityStatusLabel,
  hasTransparentCutout,
  selectedAssetNeedsProfileCandidate,
  performerAssetApproved,
  needsMoreProfileCandidatesForProposals,
  currentAssetCanGenerateProposals,
  shouldShowProfileVariantControls,
  profileVariantAssets,
  profileVariantFailures,
  profileVariantPanelRef,
  profileVariantCount,
  profileVariantCountOptions,
  selectedProfileVariantTemplates,
  proposalCount,
  proposalsLength,
  projectExists,
  busy,
  onApproveAsset,
  onGenerateProfileVariants,
  onGenerateProposals,
  onProfileVariantCountChange,
  onUseProfileVariant,
  getAssetLabel,
}: AssetPreviewSectionProps<TAsset>) {
  return (
    <section className="ai-asset-preview">
      <div className="ai-section-title">
        <div>
          <p className="section-eyebrow">PERFORMER ASSET</p>
          <h2>에셋 미리보기</h2>
        </div>
        <span>{assetLabel}</span>
      </div>
      <div className={hasTransparentCutout ? "ai-asset-preview-grid" : "ai-asset-preview-grid is-source-only"}>
        <figure>
          <img src={asset.generatedImageUrl} alt="" />
          <figcaption>{asset.generationMode === "source-lock" ? "업로드 사진 기반 원본" : hasTransparentCutout ? "생성 원본" : "포스터 시안용 이미지"}</figcaption>
        </figure>
        {hasTransparentCutout ? (
          <figure className="is-cutout">
            <img src={asset.cutoutPngUrl} alt="" />
            <figcaption>누끼 PNG</figcaption>
          </figure>
        ) : null}
        <div className="ai-asset-preview-side">
          <strong>{selectedAssetNeedsProfileCandidate ? "이 에셋은 프로필 후보 생성용 재료" : "이 에셋으로 포스터 시안 생성 가능"}</strong>
          <span>
            이미지: {asset.provider} / 누끼: {cutoutProviderLabel}
          </span>
          <p className={`ai-cutout-status is-${cutoutStatusClass}`}>{cutoutStatusLabel}</p>
          <p className={`ai-cutout-status is-${faceIdentityStatusClass}`}>{faceIdentityStatusLabel}</p>
          {asset.generationMode === "mock" ? <p className="ai-pipeline-note">현재 결과는 AI 사진 보정이 아니라 업로드 이미지를 기반으로 한 mock 결과입니다.</p> : null}
          <div className="ai-next-action-card">
            <div className="ai-flow-steps" aria-label="포스터 생성 단계">
              <span className="done">에셋</span>
              <span className={!selectedAssetNeedsProfileCandidate ? "done" : profileVariantAssets.length ? "active" : "pending"}>프로필 후보</span>
              <span className={performerAssetApproved ? "done" : !selectedAssetNeedsProfileCandidate ? "active" : "pending"}>승인</span>
              <span className={proposalsLength ? "done" : currentAssetCanGenerateProposals ? "active" : "pending"}>포스터 시안</span>
              <span className={projectExists ? "done" : proposalsLength ? "active" : "pending"}>편집</span>
            </div>
            {selectedAssetNeedsProfileCandidate ? (
              profileVariantAssets.length ? (
                <>
                  <strong>다음 작업: 프로필 후보 선택</strong>
                  <span>아래 카드 중 얼굴이 가장 안정적인 프로필 후보를 선택하세요.</span>
                </>
              ) : (
                <>
                  <strong>다음 작업: 프로필 후보 생성</strong>
                  <span>선택한 개수만큼 정해진 프로필 템플릿 슬롯을 생성합니다.</span>
                  <Button type="button" onClick={onGenerateProfileVariants} disabled={Boolean(busy) || !hasTransparentCutout} title={!hasTransparentCutout ? "누끼가 완료된 에셋이 필요합니다." : undefined}>
                    {busy === "profile-variants" ? <Loader2 className="spin-icon" size={16} /> : <Sparkles size={16} />}
                    {profileVariantCount}개 프로필 후보 만들기
                  </Button>
                </>
              )
            ) : !performerAssetApproved ? (
              <>
                <strong>다음 작업: 프로필 후보 승인</strong>
                <span>이 이미지를 포스터의 잠금 연주자 레이어로 사용합니다.</span>
                <Button type="button" onClick={onApproveAsset} disabled={Boolean(busy)}>
                  프로필 후보 승인
                </Button>
              </>
            ) : needsMoreProfileCandidatesForProposals ? (
              <>
                <strong>다음 작업: 프로필 후보 추가</strong>
                <span>같은 누끼 복붙 포스터 시안을 막기 위해 서로 다른 프로필 후보가 {proposalCount}개 필요합니다.</span>
                <Button type="button" onClick={onGenerateProfileVariants} disabled={Boolean(busy) || !hasTransparentCutout}>
                  {busy === "profile-variants" ? <Loader2 className="spin-icon" size={16} /> : <Sparkles size={16} />}
                  {proposalCount}개 프로필 후보 만들기
                </Button>
              </>
            ) : proposalsLength ? (
              <>
                <strong>다음 작업: 포스터 시안 선택</strong>
                <span>아래 포스터 시안 카드를 열면 간단 편집으로 넘어갑니다.</span>
              </>
            ) : (
              <>
                <strong>다음 작업: 포스터 시안 생성</strong>
                <span>{hasTransparentCutout ? "승인한 연주자 에셋은 얼굴/정체성 잠금 레이어로 들어갑니다." : "누끼가 불안정해도 이 에셋을 버리지 않고 사진형 포스터 시안으로 만듭니다."}</span>
                <Button type="button" onClick={onGenerateProposals} disabled={Boolean(busy) || !currentAssetCanGenerateProposals}>
                  {busy === "proposals" ? <Loader2 className="spin-icon" size={16} /> : <Sparkles size={16} />}
                  {proposalCount}개 포스터 시안 만들기
                </Button>
              </>
            )}
          </div>
          {shouldShowProfileVariantControls ? (
            <div className="ai-profile-variant-actions">
              <strong>프로필 후보 생성 슬롯</strong>
              <div className="segmented-control proposal-count-control" role="group" aria-label="프로필 후보 수 선택">
                {profileVariantCountOptions.map((count) => (
                  <button key={count} type="button" className={profileVariantCount === count ? "active" : ""} onClick={() => onProfileVariantCountChange(count)} disabled={Boolean(busy)}>
                    {count}개
                  </button>
                ))}
              </div>
              <div className="ai-template-slot-list" aria-label="생성될 프로필 후보 템플릿">
                {selectedProfileVariantTemplates.map((template, index) => (
                  <span key={template.label}>
                    {index + 1}. {template.label}
                  </span>
                ))}
              </div>
              <Button type="button" variant="secondary" onClick={onGenerateProfileVariants} disabled={Boolean(busy) || !hasTransparentCutout}>
                {busy === "profile-variants" ? <Loader2 className="spin-icon" size={16} /> : <Sparkles size={16} />}
                프로필 후보 다시 만들기
              </Button>
            </div>
          ) : null}
          {selectedAssetNeedsProfileCandidate ? (
            <p className="ai-pipeline-note is-blocked">포스터 시안 전 프로필 후보 선택 필요</p>
          ) : (
            <p className={performerAssetApproved ? "ai-pipeline-note is-ready" : "ai-pipeline-note"}>{performerAssetApproved ? "포스터용 고정 에셋 승인됨" : "승인 대기"}</p>
          )}
        </div>
      </div>
      <ProfileVariantPanel
        panelRef={profileVariantPanelRef}
        assets={profileVariantAssets}
        failures={profileVariantFailures}
        activeAssetId={asset.id}
        busy={Boolean(busy)}
        getAssetLabel={getAssetLabel}
        onUseAsset={onUseProfileVariant}
      />
    </section>
  );
}
