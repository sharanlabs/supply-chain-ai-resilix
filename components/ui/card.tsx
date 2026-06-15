import { cn } from "@/lib/utils";

export function Card({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel rounded-lg p-4", className)}>{children}</section>
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
    <div className="mb-3 flex min-h-10 items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-bold uppercase tracking-normal text-zinc-900">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm leading-5 text-zinc-600">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
