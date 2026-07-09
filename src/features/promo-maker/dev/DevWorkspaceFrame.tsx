import { WorkspaceSidebar } from "@/components/layout/workspace-sidebar";

const devUser = {
  email: "promo-maker-dev@artsaurus.local",
  artistProfile: { id: "promo-maker-dev-artist" },
};

export function DevWorkspaceFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="page-shell workspace-layout promo-maker-dev-workspace">
      <WorkspaceSidebar user={devUser} />
      <section className="workspace-content">{children}</section>
    </main>
  );
}
