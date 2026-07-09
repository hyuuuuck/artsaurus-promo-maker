import { CalendarDays, Heart, History, Ticket, UserRound, Users } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

type WorkspaceSidebarUser = {
  email: string;
  artistProfile: { id: string } | null;
};

const artistItems = [
  { href: "/app/performances", label: "나의 공연", icon: CalendarDays },
  { href: "/app/history", label: "이력관리", icon: History },
];

const audienceItems = [
  { href: "/audience/reservations", label: "예약 내역", icon: Ticket },
];

const socialItems = [
  { href: "/app/followers", label: "팔로워", icon: Users, artistOnly: true },
  { href: "/audience/following", label: "팔로잉", icon: Heart, artistOnly: false },
];

export function WorkspaceSidebar({ user }: { user: WorkspaceSidebarUser }) {
  const hasArtistWorkspace = Boolean(user.artistProfile);

  return (
    <aside className="workspace-sidebar">
      <div className="workspace-identity">
        <p className="workspace-identity-title">나의공간</p>
        <p className="workspace-identity-email">{user.email}</p>
      </div>

      <nav className="workspace-menu" aria-label="나의공간 메뉴">
        <ButtonLink href="/app/profile" variant="ghost" size="sm" className="workspace-menu-link">
          <UserRound size={14} />
          프로필
        </ButtonLink>

        {hasArtistWorkspace ? (
          <SidebarGroup>
            {artistItems.map((item) => {
              const Icon = item.icon;
              return (
                <ButtonLink key={item.href} href={item.href} variant="ghost" size="sm" className="workspace-menu-link">
                  <Icon size={14} />
                  {item.label}
                </ButtonLink>
              );
            })}
          </SidebarGroup>
        ) : null}

        <SidebarGroup separated label="팔로우">
          {socialItems
            .filter((item) => !item.artistOnly || hasArtistWorkspace)
            .map((item) => {
              const Icon = item.icon;
              return (
                <ButtonLink key={item.href} href={item.href} variant="ghost" size="sm" className="workspace-menu-link">
                  <Icon size={14} />
                  {item.label}
                </ButtonLink>
              );
            })}
        </SidebarGroup>

        <SidebarGroup separated label="관객">
          {audienceItems.map((item) => {
            const Icon = item.icon;
            return (
              <ButtonLink key={item.href} href={item.href} variant="ghost" size="sm" className="workspace-menu-link">
                <Icon size={14} />
                {item.label}
              </ButtonLink>
            );
          })}
        </SidebarGroup>
      </nav>
    </aside>
  );
}

function SidebarGroup({ children, label, separated = false }: { children: React.ReactNode; label?: string; separated?: boolean }) {
  return (
    <div className={separated ? "workspace-menu-group is-separated" : "workspace-menu-group"}>
      {label ? <p className="workspace-menu-group-label">{label}</p> : null}
      <div className="workspace-menu-group-inner">{children}</div>
    </div>
  );
}
