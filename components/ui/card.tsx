import { cn } from "@/lib/utils";

// A panel section. Cardless-by-default is the design preference, so a Card is
// used only as a real container for a grouped briefing section. Header title is
// a quiet label (uppercase tracked grotesk), not a marketing heading.
export function Card({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel rounded-(--radius-card) p-5", className)}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  action
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex min-h-7 items-start justify-between gap-3">
      <div>
        <h2 className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-faint uppercase">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm leading-5 text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
