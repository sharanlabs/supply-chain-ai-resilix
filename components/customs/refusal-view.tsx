import { ShieldAlert } from "lucide-react";
import {
  DispositionBadge,
  PolicyCitations,
  ExhibitAudit,
  ProvenanceLine,
  humanizeGap,
  workflowLabel,
} from "@/components/customs/parts";
import type { CustomsDefensePacket } from "@/lib/agents/customsdesk/defense-packet";

// The REFUSE outcome, rendered as first-class as the packet -- the product's honesty
// story. The engine withheld the disclosure; the named gaps are listed plainly so a
// non-lawyer sees exactly what is missing and what filing now would expose.

export function RefusalView({ packet }: { packet: CustomsDefensePacket }) {
  const exhibitCount = packet.exhibitAudit.length;
  return (
    <section
      className="reveal panel overflow-hidden rounded-(--radius-card)"
      style={{ "--d": 280 } as React.CSSProperties}
      aria-labelledby="refusal-h"
    >
      {/* A warm caution cap marks a considered "held" -- not a red alarm. */}
      <div className="border-t-2 border-caution" />
      <header className="flex items-start justify-between gap-3 px-6 pt-5 pb-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-caution-ink" aria-hidden="true" />
          <div>
            <h2 id="refusal-h" className="text-[1.125rem] leading-tight font-semibold text-ink">
              Do not disclose yet
            </h2>
            <p className="mt-1 font-mono text-[0.6875rem] text-ink-faint">
              {workflowLabel(packet.workflow)} · {packet.caseRef}
            </p>
          </div>
        </div>
        <DispositionBadge disposition="REFUSE" />
      </header>

      <div className="border-t border-line px-6 py-5">
        <p className="max-w-[70ch] text-[0.875rem] leading-relaxed text-ink-muted">
          The evidence file does not support proceeding. Filing now would expose the claim to challenge on exactly the
          points below. <span className="tnum font-medium text-ink">{exhibitCount}</span> exhibits were examined under
          per-document quarantine before the engine reached this decision.
        </p>

        {/* Named gaps -- the plain-English "here's what's missing". */}
        <div className="mt-6 flex flex-col gap-3">
          {packet.namedGaps.map((g) => {
            const { title, detail } = humanizeGap(g);
            return (
              <div key={g} className="flex gap-3 rounded-md border border-line bg-sink px-4 py-3">
                <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-caution" />
                <div className="min-w-0">
                  <p className="text-[0.875rem] font-medium text-ink">{title}</p>
                  <p className="mt-1 max-w-[64ch] text-[0.8125rem] leading-relaxed text-ink-muted">{detail}</p>
                  <p className="mt-1.5 font-mono text-[0.625rem] text-ink-faint">{g}</p>
                </div>
              </div>
            );
          })}
        </div>

        {packet.policyCitations.length > 0 ? (
          <div className="mt-7">
            <h3 className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-faint uppercase">
              Policy citations
            </h3>
            <PolicyCitations citations={packet.policyCitations} />
          </div>
        ) : null}

        <div className="mt-7">
          <h3 className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-faint uppercase">Exhibit audit</h3>
          <p className="mt-1.5 max-w-[64ch] text-[0.8125rem] leading-relaxed text-ink-muted">
            Each exhibit crosses the boundary only as a length and a digest. Bodies never enter the analysis, even when
            the disclosure is withheld.
          </p>
          <ExhibitAudit audit={packet.exhibitAudit} />
        </div>

        <ProvenanceLine provenance={packet.provenance} />
      </div>
    </section>
  );
}
