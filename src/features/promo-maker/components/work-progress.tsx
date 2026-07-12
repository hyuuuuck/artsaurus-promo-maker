import { Loader2 } from "lucide-react";

export type WorkProgressState = {
  title: string;
  detail: string;
  meta: string;
  percent: number | null;
  steps: string[];
};

export function WorkProgress({ progress }: { progress: WorkProgressState }) {
  const percentLabel = progress.percent === null ? "처리 중" : `${Math.round(progress.percent)}%`;
  return (
    <div className="ai-work-progress" role="status" aria-live="polite">
      <div className="ai-work-progress-head">
        <div className="ai-work-progress-title">
          <Loader2 className="spin-icon" size={20} />
          <div>
            <strong>{progress.title}</strong>
            <span>{progress.detail}</span>
          </div>
        </div>
        <em>{percentLabel}</em>
      </div>
      <div className={`ai-work-progress-bar ${progress.percent === null ? "is-indeterminate" : "is-determinate"}`}>
        <span style={progress.percent === null ? undefined : { width: `${progress.percent}%` }} />
      </div>
      <div className="ai-work-progress-foot">
        <span>{progress.meta}</span>
        <div>
          {progress.steps.map((step) => (
            <b key={step}>{step}</b>
          ))}
        </div>
      </div>
    </div>
  );
}

export function buildWorkProgress(input: {
  busy: string | null;
  message: string;
  proposalCount: number;
  profileVariantCount: number;
  faceCandidatePoolSize: number;
  proposalCandidatePoolSize: number;
}): WorkProgressState | null {
  if (!input.busy) return null;

  const progress = parseProgressFraction(input.message);
  const percent = progress ? Math.max(4, Math.min(96, (progress.current / progress.total) * 100)) : null;
  const fallbackDetail = input.message || "작업을 처리하는 중입니다.";

  if (input.busy === "reference") {
    return {
      title: "사진 준비 중",
      detail: fallbackDetail,
      meta: "업로드와 썸네일 생성을 처리하고 있습니다.",
      percent,
      steps: ["업로드", "저장", "미리보기"],
    };
  }

  if (input.busy === "asset") {
    return {
      title: "연주자 에셋 생성 중",
      detail: fallbackDetail,
      meta: `Gemini 후보 최대 ${input.faceCandidatePoolSize}개를 만들고 DeepFace 점수 최고 후보를 고릅니다.`,
      percent,
      steps: ["Gemini 생성", "DeepFace 선별", "누끼 저장"],
    };
  }

  if (input.busy === "profile-variants") {
    return {
      title: "프로필 후보 생성 중",
      detail: fallbackDetail,
      meta: `최종 후보 ${input.profileVariantCount}개를 준비합니다. 각 후보는 얼굴 점수 선별을 거칩니다.`,
      percent,
      steps: ["후보 생성", "얼굴 검사", "통과 후보 정렬"],
    };
  }

  if (input.busy === "guided-flow") {
    return {
      title: "전체 시안 준비 중",
      detail: fallbackDetail,
      meta: "사진 준비, 연주자 에셋, 프로필 후보 생성을 이어서 처리합니다.",
      percent,
      steps: ["에셋 생성", "누끼", "후보 준비"],
    };
  }

  if (input.busy === "proposals") {
    return {
      title: "포스터 시안 생성 중",
      detail: fallbackDetail,
      meta: `포스터 ${input.proposalCount}개를 만들고 템플릿별 인물 후보 ${input.proposalCandidatePoolSize}개 중 최고점을 배정합니다.`,
      percent,
      steps: ["후보 선별", "레이아웃", "품질 검사"],
    };
  }

  if (input.busy === "poster-import") {
    return {
      title: "포스터 불러오는 중",
      detail: fallbackDetail,
      meta: "업로드 이미지를 잠금 레이어로 넣고 편집 캔버스를 준비합니다.",
      percent,
      steps: ["업로드", "캔버스 맞춤", "레이어 생성"],
    };
  }

  if (input.busy === "poster-ocr") {
    return {
      title: "OCR 텍스트 변환 중",
      detail: fallbackDetail,
      meta: "포스터 위 문구를 인식해 편집 가능한 텍스트 레이어로 바꿉니다.",
      percent,
      steps: ["문구 인식", "좌표 변환", "레이어 추가"],
    };
  }

  if (input.busy === "save") {
    return {
      title: "작업 저장 중",
      detail: fallbackDetail,
      meta: "현재 레이어와 캔버스 상태를 저장합니다.",
      percent,
      steps: ["직렬화", "저장", "목록 갱신"],
    };
  }

  if (input.busy === "export") {
    return {
      title: "PNG 저장 중",
      detail: fallbackDetail,
      meta: "캔버스를 이미지로 렌더링해 내려받을 파일을 만듭니다.",
      percent,
      steps: ["렌더링", "이미지 생성", "다운로드"],
    };
  }

  if (input.busy.startsWith("proposal-")) {
    return {
      title: "시안 여는 중",
      detail: fallbackDetail,
      meta: "선택한 포스터 시안을 편집 가능한 레이어 프로젝트로 변환합니다.",
      percent,
      steps: ["시안 선택", "레이어 변환", "간단 편집"],
    };
  }

  if (input.busy.startsWith("project-")) {
    return {
      title: "저장 작업 여는 중",
      detail: fallbackDetail,
      meta: "저장된 레이어와 캔버스를 다시 불러옵니다.",
      percent,
      steps: ["불러오기", "레이어 복원", "캔버스 이동"],
    };
  }

  return {
    title: "작업 처리 중",
    detail: fallbackDetail,
    meta: "요청을 처리하고 있습니다.",
    percent,
    steps: ["요청", "처리", "완료"],
  };
}

function parseProgressFraction(message: string) {
  const match = message.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return null;
  const current = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) return null;
  return { current, total };
}
