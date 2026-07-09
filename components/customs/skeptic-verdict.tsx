import { Check, AlertTriangle } from "lucide-react";
import type { SkepticVerdict as Verdict } from "@/lib/agents/customsdesk/skeptic-check";

// The Skeptic verdict -- an INDEPENDENT re-derivation of the outcome from the raw
// case inputs (maker != judge). Acceptance reads as quiet confirmation in the one
// the single accent, never celebratory chrome; objections are listed as the adversarial
// re-check they are.

export function SkepticVerdict({ verdict }: { verdict: Verdict }) {
  const accepted = verdict.accepted;
  return (
    <section
      className="reveal panel rounded-(--radius-card) p-5"
      style={{ "--d": 360 } as React.CSSProperties}
      aria-labelledby="skeptic-h"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="skeptic-h" className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-faint uppercase">
          Skeptic re-check
        </h2>
        <span
          className={`inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-wide uppercase ${
            accepted ? "text-accent-strong" : "text-caution-ink"
          }`}
        >
          <span
            aria-hidden="true"
            className={`flex size-4 items-center justify-center rounded-full ${
              accepted ? "bg-accent-soft text-accent-strong" : "bg-caution-soft text-caution-ink"
            }`}
          >
            {accepted ? <Check className="size-2.5" strokeWidth={3} /> : <AlertTriangle className="size-2.5" strokeWidth={2.5} />}
          </span>
          {accepted ? "Agrees" : `${verdict.objections.length} objection${verdict.objections.length === 1 ? "" : "s"}`}
        </span>
      </div>

      <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-muted">
        An independent re-derivation from the raw case inputs — the disposition, the cited figures, and the
        quarantine boundary are re-checked, never trusted because the pipeline wrote them.
      </p>

      {accepted ? (
        <p className="mt-3 border-t border-line pt-3 text-[0.8125rem] text-ink">
          The re-derived disposition and every re-checked figure match the outcome. No objections.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
          {verdict.objections.map((o, i) => (
            <li key={i} className="flex gap-2 text-[0.8125rem] leading-relaxed text-ink">
              <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-caution" />
              <span>{o}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
