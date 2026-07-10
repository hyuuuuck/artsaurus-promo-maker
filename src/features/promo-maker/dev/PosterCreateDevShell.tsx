"use client";

/* eslint-disable @next/next/no-img-element -- Dev-only object URL previews cannot use Next Image optimization. */

import { useEffect, useMemo, useState } from "react";
import { ImageIcon, RotateCcw, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiPosterStudio, type InitialPerformance } from "..";

type DraftPerformance = InitialPerformance;

const defaultDraft: DraftPerformance = {
  id: "promo-maker-dev-performance",
  title: "여름 피아노 리사이틀",
  subtitle: "Beethoven, Debussy, Chopin",
  performerName: "정승혁",
  venueName: "한영아트센터",
  dateText: "2026년 7월 18일 토요일 오후 7:30",
  program: "L. v. Beethoven - Piano Sonata No. 14\nC. Debussy - Estampes\nF. Chopin - Ballade No. 1",
  profileImageUrl: "/icon.png",
};

export function PosterCreateDevShell({ initialPerformance = defaultDraft }: { initialPerformance?: InitialPerformance }) {
  const [draft, setDraft] = useState<DraftPerformance>(initialPerformance);
  const [applied, setApplied] = useState<DraftPerformance>(initialPerformance);
  const [profilePreviewUrl, setProfilePreviewUrl] = useState<string>(initialPerformance.profileImageUrl ?? "");
  const [profileObjectUrl, setProfileObjectUrl] = useState("");

  useEffect(() => {
    return () => {
      if (profileObjectUrl) URL.revokeObjectURL(profileObjectUrl);
    };
  }, [profileObjectUrl]);

  const studioKey = useMemo(
    () =>
      [
        applied.id,
        applied.title,
        applied.subtitle,
        applied.performerName,
        applied.venueName,
        applied.dateText,
        applied.program,
        applied.profileImageUrl,
      ].join("|"),
    [applied],
  );

  function updateDraft(field: keyof DraftPerformance, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function applyDraft() {
    setApplied({
      ...draft,
      id: draft.id.trim() || "promo-maker-dev-performance",
      title: draft.title.trim() || "무제 공연",
      performerName: draft.performerName.trim() || "연주자",
      venueName: draft.venueName?.trim() || "공연장",
      dateText: draft.dateText.trim() || "공연 일시",
      profileImageUrl: profilePreviewUrl || undefined,
    });
  }

  function resetDraft() {
    if (profileObjectUrl) URL.revokeObjectURL(profileObjectUrl);
    setProfileObjectUrl("");
    setProfilePreviewUrl(defaultDraft.profileImageUrl ?? "");
    setDraft(defaultDraft);
    setApplied(defaultDraft);
  }

  function handleProfileFile(file: File | null) {
    if (!file) return;
    if (profileObjectUrl) URL.revokeObjectURL(profileObjectUrl);
    const url = URL.createObjectURL(file);
    setProfileObjectUrl(url);
    setProfilePreviewUrl(url);
    setDraft((current) => ({ ...current, profileImageUrl: url }));
  }

  return (
    <div className="promo-dev-shell">
      <section className="promo-dev-panel" aria-label="개발용 공연 정보">
        <div className="promo-dev-panel-head">
          <div>
            <p className="section-eyebrow">DEV INPUT</p>
            <h2>포스터 생성 화면 목업 데이터</h2>
          </div>
          <div className="promo-dev-actions">
            <Button type="button" variant="secondary" onClick={resetDraft}>
              <RotateCcw size={16} />
              초기화
            </Button>
            <Button type="button" onClick={applyDraft}>
              <Sparkles size={16} />
              적용
            </Button>
          </div>
        </div>

        <div className="promo-dev-grid">
          <label>
            <span>공연 제목</span>
            <input value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} />
          </label>
          <label>
            <span>부제/프로그램 요약</span>
            <input value={draft.subtitle ?? ""} onChange={(event) => updateDraft("subtitle", event.target.value)} />
          </label>
          <label>
            <span>연주자</span>
            <input value={draft.performerName} onChange={(event) => updateDraft("performerName", event.target.value)} />
          </label>
          <label>
            <span>공연장</span>
            <input value={draft.venueName ?? ""} onChange={(event) => updateDraft("venueName", event.target.value)} />
          </label>
          <label>
            <span>일시</span>
            <input value={draft.dateText} onChange={(event) => updateDraft("dateText", event.target.value)} />
          </label>
          <label>
            <span>프로필 이미지 URL</span>
            <input value={draft.profileImageUrl ?? ""} onChange={(event) => {
              setProfilePreviewUrl(event.target.value);
              updateDraft("profileImageUrl", event.target.value);
            }} />
          </label>
          <label className="promo-dev-program">
            <span>프로그램</span>
            <textarea value={draft.program ?? ""} rows={4} onChange={(event) => updateDraft("program", event.target.value)} />
          </label>
          <label className="promo-dev-upload">
            <span>프로필 파일</span>
            <input type="file" accept="image/*" onChange={(event) => handleProfileFile(event.target.files?.[0] ?? null)} />
            <div className="promo-dev-upload-preview">
              {profilePreviewUrl ? <img src={profilePreviewUrl} alt="" /> : <ImageIcon size={24} />}
              <strong>
                <Upload size={16} />
                파일 선택
              </strong>
            </div>
          </label>
        </div>
      </section>

      <AiPosterStudio key={studioKey} initialPerformance={applied} demoMode />
    </div>
  );
}
