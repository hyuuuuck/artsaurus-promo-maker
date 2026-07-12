/* eslint-disable @next/next/no-img-element -- Reference previews use raw blob/data URLs before upload persistence. */

import type { ReactNode } from "react";
import { ImageIcon, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ReferencePhotoSlot<TValue extends string = string> = {
  value: TValue;
  label: string;
  fallbackLabel: string;
  preview: string;
  fileName?: string;
  uploaded: boolean;
};

type ReferencePhotoStepProps<TValue extends string> = {
  busy: string | null;
  referenceSlots: Array<ReferencePhotoSlot<TValue>>;
  personImageConsent: boolean;
  usageRightsConfirmed: boolean;
  instrument: string;
  assetGenerationDisabled: boolean;
  advancedContent?: ReactNode;
  onReferenceFileChange: (value: TValue, file: File | null) => void;
  onPersonImageConsentChange: (checked: boolean) => void;
  onUsageRightsConfirmedChange: (checked: boolean) => void;
  onInstrumentChange: (value: string) => void;
  onPrepareGuidedPosterBatch: () => void;
};

export function ReferencePhotoStep<TValue extends string>({
  busy,
  referenceSlots,
  personImageConsent,
  usageRightsConfirmed,
  instrument,
  assetGenerationDisabled,
  advancedContent,
  onReferenceFileChange,
  onPersonImageConsentChange,
  onUsageRightsConfirmedChange,
  onInstrumentChange,
  onPrepareGuidedPosterBatch,
}: ReferencePhotoStepProps<TValue>) {
  const guidedBusy = busy === "guided-flow" || busy === "profile-variants" || busy === "proposals";

  return (
    <div className="ai-poster-panel">
      <div className="ai-poster-panel-head">
        <ImageIcon size={18} />
        <h2>연주자 사진</h2>
      </div>
      <div className="ai-reference-grid">
        {referenceSlots.map((slot) => (
          <label key={slot.value} className="ai-upload-box ai-reference-upload">
            <strong>{slot.label}</strong>
            {slot.preview ? <img src={slot.preview} alt="" /> : <ImageIcon size={28} />}
            <span>{slot.uploaded ? `업로드 완료 · ${slot.fileName ?? slot.fallbackLabel}` : slot.fileName ? `업로드 중 · ${slot.fileName}` : slot.fallbackLabel}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => onReferenceFileChange(slot.value, event.target.files?.[0] ?? null)}
            />
          </label>
        ))}
      </div>
      <div className="ai-consent-box">
        <label className="ai-checkbox-field">
          <input type="checkbox" checked={personImageConsent} onChange={(event) => onPersonImageConsentChange(event.target.checked)} />
          <span>이 사진은 본인 또는 사용 권한이 있는 인물의 사진이며, 공연 포스터 제작용 AI 편집에 동의합니다.</span>
        </label>
        <label className="ai-checkbox-field">
          <input type="checkbox" checked={usageRightsConfirmed} onChange={(event) => onUsageRightsConfirmedChange(event.target.checked)} />
          <span>이 이미지를 공연 포스터 제작에 사용할 권한이 있습니다.</span>
        </label>
      </div>
      <label className="ai-field">
        <span>악기/파트</span>
        <input value={instrument} onChange={(event) => onInstrumentChange(event.target.value)} placeholder="예: 피아노, 첼로, 성악" />
      </label>
      <div className="ai-guided-cta-card">
        <strong>전체 시안 준비</strong>
        <span>사진을 프로필 후보로 정리한 뒤, 가장 닮은 후보를 고르면 포스터 시안으로 이어집니다.</span>
        <Button type="button" onClick={onPrepareGuidedPosterBatch} disabled={assetGenerationDisabled}>
          {guidedBusy ? <Loader2 className="spin-icon" size={16} /> : <Sparkles size={16} />}
          전체 시안 준비
        </Button>
      </div>
      {advancedContent ? (
        <details className="ai-advanced-panel">
          <summary>고급 설정 / 재시도</summary>
          <div className="ai-advanced-panel-body">{advancedContent}</div>
        </details>
      ) : null}
    </div>
  );
}
