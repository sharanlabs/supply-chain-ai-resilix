import { ShieldCheck, Scale, Hash, FileCheck2, Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { humanizeGap, injectionSignalLabel } from "@/components/customs/parts";
import type { CustomsDefenseOutcome } from "@/lib/agents/customsdesk/pipeline";
import type { MatrixCell } from "@/lib/agents/customsdesk/edge-case-matrix";

// The pipeline walk -- a readable narrative of what the frozen engine CHECKED and
// what it FOUND, in the order the trust spine runs them. Everything already happened
// deterministically at render; this is a report of the run, not a fake progress bar.

type Tone = "accent" | "caution";

function Stage({
  icon: Icon,
  label,
  tone,
  children,
}: {
  icon: typeof ShieldCheck;
  label: string;
  tone: Tone;
  children: React.ReactNode;
}) {
  return (
    <li className="relative pl-9">
      <span
        aria-hidden="true"
        className={`absolute top-0.5 left-0 flex size-6 items-center justify-center rounded-full border ${
          tone === "caution"
            ? "border-caution/30 bg-caution-soft text-caution-ink"
            : "border-accent/25 bg-accent-soft text-accent-strong"
        }`}
      >
        <Icon className="size-3.5" strokeWidth={2} />
      </span>
      <h3 className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-faint uppercase">{label}</h3>
      <div className="mt-1.5 text-[0.875rem] leading-relaxed text-ink-muted">{children}</div>
    </li>
  );
}

export function PipelineWalk({ outcome, cell }: { outcome: CustomsDefenseOutcome; cell: MatrixCell }) {
  const { packet, disposition, namedGaps } = outcome;
  const exhibitCount = packet.exhibitAudit.length;
  const injectionSignals = [
    ...new Set(packet.exhibitAudit.flatMap((e) => e.injectionSignals)),
  ];
  const figureCount = packet.citedFigures.length;
  const isProceed = disposition === "PROCEED";

  return (
    <section
      className="reveal panel rounded-(--radius-card) p-6"
      style={{ "--d": 200 } as React.CSSProperties}
      aria-labelledby="walk-h"
    >
      <h2 id="walk-h" className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-faint uppercase">
        How the engine reached this
      </h2>
      <p className="mt-1.5 max-w-[68ch] text-[0.875rem] leading-relaxed text-ink-muted">
        Four deterministic stages, run in order. The disposition is decided in code from structured fields — never from
        exhibit prose.
      </p>

      <ol className="relative mt-6 flex flex-col gap-6 before:absolute before:top-1 before:bottom-1 before:left-3 before:w-px before:bg-line">
        <Stage icon={ShieldCheck} label="1 · Exhibit quarantine" tone="accent">
          <span className="tnum font-medium text-ink">{exhibitCount}</span> exhibits examined under per-document
          quarantine. Each body is third-party free text — it is held at the boundary, and only enum-typed structured
          fields cross into the analysis.
          {injectionSignals.length > 0 ? (
            <span className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[0.8125rem] text-ink-faint">Flagged for audit, quarantine held:</span>
              {injectionSignals.map((s) => (
                <Badge key={s} tone="warning">
                  {injectionSignalLabel(s)}
                </Badge>
              ))}
            </span>
          ) : null}
        </Stage>

        <Stage icon={Scale} label="2 · Evidence sufficiency" tone={isProceed ? "accent" : "caution"}>
          {isProceed ? (
            <>
              Sufficiency predicates passed: every load-bearing record is present and consistent with the declared
              origin
              {cell.deadline !== "LAPSED" ? ", and the disclosure window is open" : ""}. The engine may proceed to a
              packet.
            </>
          ) : (
            <>
              Sufficiency predicates blocked the disclosure —{" "}
              <span className="font-medium text-ink">
                {namedGaps.length} {namedGaps.length === 1 ? "gap" : "gaps"}
              </span>
              :
              <span className="mt-2 flex flex-col gap-1.5">
                {namedGaps.map((g) => (
                  <span key={g} className="flex items-baseline gap-2">
                    <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-caution" />
                    <span className="text-[0.8125rem] text-ink">{humanizeGap(g).title}</span>
                  </span>
                ))}
              </span>
            </>
          )}
        </Stage>

        <Stage icon={Hash} label="3 · Cited figures" tone="accent">
          {isProceed ? (
            <>
              <span className="tnum font-medium text-ink">{figureCount}</span> figures bound, each to a deterministic
              tool return — the entry scoper, the penalty calculator, and the deadline clocks. No number originates in
              prose; a produce-time citation guard fails closed on any uncited numeral.
            </>
          ) : (
            <>
              No exposure figures are derived for a withheld disclosure. Only the quarantine count is cited — the same
              produce-time guard still fails closed on any uncited numeral in the refusal memo.
            </>
          )}
        </Stage>

        <Stage
          icon={isProceed ? FileCheck2 : Ban}
          label={isProceed ? "4 · Support packet" : "4 · Refusal"}
          tone={isProceed ? "accent" : "caution"}
        >
          {isProceed ? (
            <>A filing-grade support packet was assembled from the bound figures — shown below, draft until counsel approves.</>
          ) : (
            <>The engine withheld the disclosure. The refusal below names each gap plainly — there is nothing to export.</>
          )}
        </Stage>
      </ol>
    </section>
  );
}
