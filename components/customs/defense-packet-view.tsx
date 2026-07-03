import { FileCheck2, CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DispositionBadge,
  PolicyCitations,
  ExhibitAudit,
  ProvenanceLine,
  workflowLabel,
} from "@/components/customs/parts";
import type { CustomsDefensePacket } from "@/lib/agents/customsdesk/defense-packet";

// The PROCEED outcome: the filing-grade defense packet, rendered as a human
// briefing. Every numeral in the section prose exists first as a cited figure whose
// value came from a deterministic tool return -- surfaced here as a provenance
// ledger so "every figure traces to a tool return" is visible, not just asserted.

function PacketTitle(packet: CustomsDefensePacket): string {
  return packet.workflow === "PRIOR_DISCLOSURE" ? "Prior-disclosure support packet" : "CF-28 response packet";
}

function figureLabel(sourceRef: string): string {
  // The tool-return refs read as `tool#field`; the field half is the human hook.
  const field = sourceRef.split("#")[1] ?? sourceRef;
  return field
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._]/g, " ")
    .toLowerCase();
}

export function DefensePacketView({ packet }: { packet: CustomsDefensePacket }) {
  const deadline = packet.deadlines[0];
  return (
    <section
      className="reveal panel overflow-hidden rounded-(--radius-card)"
      style={{ "--d": 280 } as React.CSSProperties}
      aria-labelledby="packet-h"
    >
      {/* Steel-accent cap marks the produced artifact. */}
      <div className="border-t-2 border-accent" />
      <header className="flex items-start justify-between gap-3 px-6 pt-5 pb-4">
        <div className="flex items-start gap-3">
          <FileCheck2 className="mt-0.5 size-5 shrink-0 text-accent-strong" aria-hidden="true" />
          <div>
            <h2 id="packet-h" className="text-[1.125rem] leading-tight font-semibold text-ink">
              {PacketTitle(packet)}
            </h2>
            <p className="mt-1 font-mono text-[0.6875rem] text-ink-faint">
              {workflowLabel(packet.workflow)} · {packet.caseRef}
            </p>
          </div>
        </div>
        <DispositionBadge disposition="PROCEED" />
      </header>

      <div className="border-t border-line px-6 py-5">
        {/* Narrative sections -- the prose a human reads. */}
        <div className="flex flex-col gap-5">
          {packet.sections.map((s) => (
            <div key={s.heading}>
              <h3 className="text-[0.9375rem] font-semibold text-ink">{s.heading}</h3>
              <p className="tnum mt-1.5 max-w-[70ch] text-[0.875rem] leading-relaxed text-ink-muted">{s.text}</p>
            </div>
          ))}
        </div>

        {/* Figure provenance -- the moat made visible. */}
        <div className="mt-7">
          <h3 className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-faint uppercase">
            Figure provenance
          </h3>
          <p className="mt-1.5 max-w-[64ch] text-[0.8125rem] leading-relaxed text-ink-muted">
            Every numeral above binds to a deterministic tool return. The produce-time citation guard fails closed on
            any figure without a backing source.
          </p>
          <div className="table-scroll mt-3">
            <table className="brief-table">
              <thead>
                <tr>
                  <th scope="col">Figure</th>
                  <th scope="col">Meaning</th>
                  <th scope="col">Bound to</th>
                </tr>
              </thead>
              <tbody>
                {packet.citedFigures.map((f, i) => (
                  <tr key={`${f.sourceRef}-${i}`}>
                    <td className="tnum font-mono font-medium text-ink">{f.value.toLocaleString("en-US")}</td>
                    <td className="text-[0.8125rem] text-ink-muted">{figureLabel(f.sourceRef)}</td>
                    <td className="font-mono text-[0.75rem] text-ink-faint">{f.sourceRef}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Policy citations. */}
        {packet.policyCitations.length > 0 ? (
          <div className="mt-7">
            <h3 className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-faint uppercase">
              Policy citations
            </h3>
            <PolicyCitations citations={packet.policyCitations} />
          </div>
        ) : null}

        {/* Live enforcement clock (only when a CF-28/audit signal is present). */}
        {deadline ? (
          <div className="mt-7">
            <h3 className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-faint uppercase">
              Enforcement clock
            </h3>
            <div className="mt-3 flex items-start gap-3 rounded-md border border-line bg-sink px-4 py-3">
              <CalendarClock className="mt-0.5 size-4 shrink-0 text-caution-ink" aria-hidden="true" />
              <div className="min-w-0">
                <p className="tnum text-[0.875rem] text-ink">
                  <span className="font-mono font-medium">{deadline.kind}</span> — response due{" "}
                  <span className="font-medium">{deadline.dueOn}</span>,{" "}
                  <span className="font-medium">{deadline.windowDays}</span> days from mailing.
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[0.75rem] text-ink-muted">
                  <span className="font-mono">{deadline.citation}</span>
                  <Badge tone={deadline.sourceStatus === "primary-verified" ? "accent" : "warning"}>
                    {deadline.sourceStatus.replace(/-/g, " ")}
                  </Badge>
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {/* Exhibit audit trail -- digests + quarantine flags, bodies never shown. */}
        <div className="mt-7">
          <h3 className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-faint uppercase">Exhibit audit</h3>
          <p className="mt-1.5 max-w-[64ch] text-[0.8125rem] leading-relaxed text-ink-muted">
            Each exhibit crosses the boundary only as a length and a digest. Bodies never enter the packet.
          </p>
          <ExhibitAudit audit={packet.exhibitAudit} />
        </div>

        <ProvenanceLine provenance={packet.provenance} />
      </div>
    </section>
  );
}
