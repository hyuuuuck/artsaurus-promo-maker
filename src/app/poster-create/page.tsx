import { SectionHeader } from "@/components/ui/card";
import { DevWorkspaceFrame } from "@/features/promo-maker/dev/DevWorkspaceFrame";
import { PosterCreateDevShell } from "@/features/promo-maker/dev/PosterCreateDevShell";
import { mockPosterPerformance } from "@/features/promo-maker/dev/mockData";

export default function PosterCreatePage() {
  return (
    <DevWorkspaceFrame>
      <section className="workspace-page">
        <SectionHeader
          eyebrow="POSTER CREATE DEV"
          title="포스터 생성 화면 단독 개발"
          description="ArtSaurus 본체 없이 포스터 생성 화면과 편집 UI만 개발하는 독립 앱입니다."
        />
        <PosterCreateDevShell initialPerformance={mockPosterPerformance} />
      </section>
    </DevWorkspaceFrame>
  );
}
