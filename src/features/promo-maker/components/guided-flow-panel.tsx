export type GuidedFlowStage = "input" | "profile" | "proposal" | "poster" | "edit";

const guidedFlowSteps: Array<{ key: GuidedFlowStage; label: string; copy: string }> = [
  {
    key: "input",
    label: "사진 준비",
    copy: "공연 정보와 연주자 사진을 넣고 전체 시안 준비를 누르면 프로필 후보까지 이어서 준비합니다.",
  },
  {
    key: "profile",
    label: "프로필 선택",
    copy: "얼굴이 가장 닮고 홍보물에 어울리는 프로필 후보를 하나 고르면 됩니다.",
  },
  {
    key: "proposal",
    label: "시안 생성",
    copy: "승인한 프로필 후보로 포스터 시안을 만들 차례입니다.",
  },
  {
    key: "poster",
    label: "포스터 선택",
    copy: "마음에 드는 포스터 시안을 선택하면 간단 편집으로 넘어갑니다.",
  },
  {
    key: "edit",
    label: "편집/저장",
    copy: "간단 편집에서 문구, QR, 색감, 위치를 정리하고 저장하면 됩니다.",
  },
];

type GuidedFlowPanelProps = {
  stage: GuidedFlowStage;
};

export function GuidedFlowPanel({ stage }: GuidedFlowPanelProps) {
  const activeIndex = Math.max(0, guidedFlowSteps.findIndex((step) => step.key === stage));
  const activeCopy = guidedFlowSteps[activeIndex]?.copy ?? guidedFlowSteps[0]!.copy;

  return (
    <section className="ai-guided-flow-panel" aria-label="홍보물 제작 흐름">
      <div className="ai-guided-flow-steps">
        {guidedFlowSteps.map((step, index) => (
          <span key={step.key} className={index < activeIndex ? "done" : index === activeIndex ? "active" : ""}>
            {step.label}
          </span>
        ))}
      </div>
      <strong>{activeCopy}</strong>
    </section>
  );
}
