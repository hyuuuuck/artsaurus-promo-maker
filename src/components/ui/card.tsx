import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("surface app-card p-5 sm:p-6", className)} {...props} />;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-header">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="section-eyebrow">{eyebrow}</p>
        ) : null}
        <h1 className="section-title">{title}</h1>
        {description ? <p className="section-description">{description}</p> : null}
      </div>
      {action ? <div className="section-action">{action}</div> : null}
    </div>
  );
}
