import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { GoldenCustomsCase, LabelClass } from "@/evals/golden/customs/cases";

// The scenario picker -- the landing when no case is selected. The 24 golden cases
// grouped by labelClass, each row a deep-link to `?case=<id>` (server-rendered,
// replay-first). Rows are clickable list items, so a card-like affordance is
// justified here (the row IS the interaction). No disposition is spoiled in the
// row -- the walk reveals the outcome.

const GROUPS: Array<{ labelClass: LabelClass; heading: string; blurb: string }> = [
  {
    labelClass: "sound",
    heading: "Sound",
    blurb: "Complete, consistent evidence with the disclosure window open. The engine should assemble a filing-grade packet.",
  },
  {
    labelClass: "under-evidenced",
    heading: "Under-evidenced",
    blurb: "The signature refusal — a missing load-bearing record, a contradiction, or a lapsed window. The engine holds the disclosure back.",
  },
  {
    labelClass: "adversarial",
    heading: "Adversarial",
    blurb: "An exhibit carries an instruction-injection payload. The quarantine must hold: the disposition never moves, no laundered figures.",
  },
];

function CaseRow({ c }: { c: GoldenCustomsCase }) {
  return (
    <li>
      <Link
        href={`/customs?case=${c.id}`}
        className="group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-sink focus-visible:bg-sink"
      >
        <span className="mt-px flex w-40 shrink-0 flex-col gap-1">
          <span className="font-mono text-[0.8125rem] font-medium text-ink">{c.id}</span>
          {c.patternSource ? (
            <span className="font-mono text-[0.625rem] leading-tight text-ink-faint">
              models {c.patternSource.court} {c.patternSource.docket}
            </span>
          ) : null}
        </span>
        <span className="min-w-0 flex-1 text-[0.875rem] leading-relaxed text-ink-muted">{c.narrative}</span>
        <ChevronRight
          className="mt-0.5 size-4 shrink-0 text-ink-faint transition-colors group-hover:text-accent-strong"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}

export function ScenarioPicker({ cases }: { cases: GoldenCustomsCase[] }) {
  return (
    <nav aria-label="Scenario picker" className="flex flex-col gap-6">
      {GROUPS.map((group, gi) => {
        const rows = cases.filter((c) => c.labelClass === group.labelClass);
        return (
          <section
            key={group.labelClass}
            className="reveal panel overflow-hidden rounded-(--radius-card)"
            style={{ "--d": 80 + gi * 90 } as React.CSSProperties}
            aria-labelledby={`group-${group.labelClass}`}
          >
            <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h2
                  id={`group-${group.labelClass}`}
                  className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-faint uppercase"
                >
                  {group.heading}
                </h2>
                <p className="mt-1.5 max-w-[64ch] text-[0.8125rem] leading-relaxed text-ink-muted">{group.blurb}</p>
              </div>
              <span className="tnum shrink-0 font-mono text-[0.8125rem] font-medium text-ink-faint">
                {rows.length} cases
              </span>
            </header>
            <ul className="divide-y divide-line">
              {rows.map((c) => (
                <CaseRow key={c.id} c={c} />
              ))}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}
