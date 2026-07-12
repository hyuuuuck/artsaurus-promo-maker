/* eslint-disable @next/next/no-img-element -- Profile candidates are generated blob/upload URLs. */

import type { Ref } from "react";

export type ProfileVariantFailureRecord = {
  index: number;
  label: string;
  reason: string;
};

type ProfileVariantPanelAsset = {
  id: string;
  generatedImageUrl?: string;
  thumbnailUrl?: string;
  cutoutPngUrl?: string;
};

type ProfileVariantPanelProps<TAsset extends ProfileVariantPanelAsset> = {
  panelRef?: Ref<HTMLDivElement>;
  assets: TAsset[];
  failures: ProfileVariantFailureRecord[];
  activeAssetId?: string;
  busy: boolean;
  getAssetLabel: (asset: TAsset) => string;
  onUseAsset: (asset: TAsset) => void;
};

export function ProfileVariantPanel<TAsset extends ProfileVariantPanelAsset>({
  panelRef,
  assets,
  failures,
  activeAssetId,
  busy,
  getAssetLabel,
  onUseAsset,
}: ProfileVariantPanelProps<TAsset>) {
  if (!assets.length && !failures.length) return null;

  return (
    <div className="ai-profile-variant-panel" ref={panelRef}>
      <div className="ai-profile-variant-head">
        <strong>생성된 프로필 후보</strong>
        <span>
          성공 {assets.length}개
          {failures.length ? ` / 실패 ${failures.length}개` : ""} · 가장 닮고 공연 홍보물에 어울리는 프로필 후보를 선택하세요.
        </span>
      </div>
      <div className="ai-profile-variant-grid">
        {assets.map((asset, index) => (
          <button
            key={asset.id}
            type="button"
            className={activeAssetId === asset.id ? "ai-profile-variant-card active" : "ai-profile-variant-card"}
            onClick={() => onUseAsset(asset)}
            disabled={busy}
          >
            <span>{index + 1}</span>
            <img src={asset.generatedImageUrl || asset.thumbnailUrl || asset.cutoutPngUrl} alt="" />
            <strong>{getAssetLabel(asset)}</strong>
            <em>이 프로필 후보 사용</em>
          </button>
        ))}
        {failures.map((failure) => (
          <div key={`${failure.index}-${failure.label}`} className="ai-profile-variant-card is-failed">
            <span>실패</span>
            <div className="ai-profile-variant-failure">
              <strong>생성 실패</strong>
              <small>{failure.label}</small>
            </div>
            <strong>{failure.label}</strong>
            <em>{failure.reason}</em>
          </div>
        ))}
      </div>
    </div>
  );
}
