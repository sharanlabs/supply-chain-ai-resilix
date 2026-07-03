// Shared, server-safe presentational atoms + label helpers for the Customs Defense
// Desk surface (D5.2). Pure functions and stateless JSX only -- no "use client",
// no engine mutation. Every label maps a frozen-engine enum to plain English so the
// machinery reads as a human briefing, never as raw tokens on the glass.

import { Badge } from "@/components/ui/badge";
import type { MatrixCell } from "@/lib/agents/customsdesk/edge-case-matrix";
import type { LabelClass } from "@/evals/golden/customs/cases";
import type { PolicyCitation, PolicyLayer } from "@/lib/agents/customsdesk/policy-table";
import type { CustomsDefensePacket } from "@/lib/agents/customsdesk/defense-packet";

// --- plain-English label maps (frozen-engine enums -> briefing prose) -------------

const WORKFLOW_LABEL: Record<string, string> = {
  PRIOR_DISCLOSURE: "Prior disclosure",
  CF28_RESPONSE: "CF-28 response",
};

const POSTURE_LABEL: Record<string, string> = {
  COMPLETE: "Complete evidence",
  PARTIAL: "Load-bearing records missing",
  CONTRADICTORY: "Exhibits contradict",
  ADVERSARIAL_INJECTED: "Injected exhibit",
};

const ORIGIN_LABEL: Record<string, string> = {
  SINGLE_COUNTRY: "Single country",
  TRANSSHIPMENT_PATTERN: "Transshipment pattern",
  MULTI_TIER_BOM: "Multi-tier BOM",
};

const DEADLINE_LABEL: Record<string, string> = {
  AMPLE: "No enforcement clock",
  IMMINENT: "Enforcement clock running",
  LAPSED: "Disclosure window lapsed",
};

const EXHIBIT_LABEL: Record<string, string> = {
  COMMERCIAL_INVOICE: "Commercial invoice",
  PRODUCTION_RECORD: "Production record",
  BILL_OF_MATERIALS: "Bill of materials",
  SUPPLIER_AFFIDAVIT: "Supplier affidavit",
  FACTORY_AUDIT_REPORT: "Factory audit report",
  BROKER_CORRESPONDENCE: "Broker correspondence",
};

const INJECTION_SIGNAL_LABEL: Record<string, string> = {
  "instruction-override": "Instruction-override attempt",
  "disposition-steering": "Disposition-steering language",
  "figure-steering": "Figure-steering ($0) language",
  "role-hijack": "Role-hijack attempt",
};

export function workflowLabel(w: string): string {
  return WORKFLOW_LABEL[w] ?? w;
}
export function exhibitKindLabel(k: string): string {
  return EXHIBIT_LABEL[k] ?? k;
}
export function injectionSignalLabel(s: string): string {
  return INJECTION_SIGNAL_LABEL[s] ?? s;
}

// The refusal gap vocabulary -> a plain sentence a non-lawyer can act on.
export function humanizeGap(gap: string): { title: string; detail: string } {
  if (gap.startsWith("MISSING:")) {
    const kind = gap.slice("MISSING:".length);
    return {
      title: `Missing load-bearing record — ${exhibitKindLabel(kind)}`,
      detail: "The origin claim cannot stand without it. Obtain it from the supplier or their upstream tier before filing.",
    };
  }
  if (gap === "CONTRADICTION:ORIGIN") {
    return {
      title: "Origin contradiction",
      detail: "Exhibits on file disagree on the country of origin. Reconcile them before any figure is derived.",
    };
  }
  if (gap === "INELIGIBLE:INVESTIGATION_COMMENCED") {
    return {
      title: "Ineligible — investigation already commenced",
      detail: "A valid prior disclosure is no longer available for these circumstances (19 CFR 162.74). Route to a penalty-response posture with counsel.",
    };
  }
  if (gap.startsWith("OUTSIDE_DECLARED_COVERAGE:")) {
    return {
      title: "Outside declared coverage",
      detail: "This situation is not one of the declared edge-case cells. The system refuses rather than improvises.",
    };
  }
  return { title: gap, detail: "Resolve this gap before a filing-grade packet can be assembled." };
}

// --- badges -----------------------------------------------------------------------

// labelClass is a TAXONOMY, not a severity -- kept in neutral chrome so the amber
// ramp stays reserved for the genuine caution states (refusal, injection flags).
export function LabelClassBadge({ labelClass }: { labelClass: LabelClass }) {
  const text =
    labelClass === "under-evidenced" ? "Under-evidenced" : labelClass === "adversarial" ? "Adversarial" : "Sound";
  return <Badge tone="neutral">{text}</Badge>;
}

// Disposition carries meaning: PROCEED is the calm steel accent; REFUSE is a
// considered "held back" -- one warm caution tone, never a red alarm.
export function DispositionBadge({ disposition }: { disposition: "PROCEED" | "REFUSE" }) {
  return disposition === "PROCEED" ? (
    <Badge tone="accent" className="shrink-0 whitespace-nowrap">
      Proceed — packet
    </Badge>
  ) : (
    <Badge tone="warning" className="shrink-0 whitespace-nowrap">
      Refuse — held
    </Badge>
  );
}

// --- matrix-cell dimension strip --------------------------------------------------

export function MatrixCellDims({ cell }: { cell: MatrixCell }) {
  const rows: Array<[string, string]> = [
    ["Workflow", workflowLabel(cell.workflow)],
    ["Evidence", POSTURE_LABEL[cell.posture] ?? cell.posture],
    ["Origin", ORIGIN_LABEL[cell.origin] ?? cell.origin],
    ["Clock", DEADLINE_LABEL[cell.deadline] ?? cell.deadline],
  ];
  return (
    <dl className="mt-5 grid grid-cols-4 gap-x-4 border-t border-line pt-4">
      {rows.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="font-mono text-[0.625rem] tracking-[0.08em] text-ink-faint uppercase">{k}</dt>
          <dd className="mt-1 text-[0.8125rem] leading-snug font-medium text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// --- shared provenance blocks (both PROCEED and REFUSE render these) ---------------

const LAYER_TONE: Record<PolicyLayer, "accent" | "warning" | "neutral"> = {
  operative: "accent",
  directed_pending: "warning",
  scenario_only: "neutral",
};

export function PolicyCitations({ citations }: { citations: PolicyCitation[] }) {
  if (citations.length === 0) return null;
  // De-dupe identical (sourceId, section) pairs -- the calculator emits the same
  // statutory row for both the caught and disclosed legs.
  const seen = new Set<string>();
  const unique = citations.filter((c) => {
    const key = `${c.sourceId}|${c.section}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return (
    <ul className="mt-3 flex flex-col gap-2">
      {unique.map((c) => (
        <li
          key={`${c.sourceId}-${c.section}`}
          className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-md border border-line bg-sink px-3 py-2"
        >
          <span className="font-mono text-[0.6875rem] font-semibold text-ink">{c.sourceId}</span>
          <span className="text-[0.8125rem] text-ink-muted">{c.section}</span>
          <span className="ml-auto flex items-center gap-2">
            <Badge tone={LAYER_TONE[c.layer]}>{c.layer.replace("_", " ")}</Badge>
            <span className="tnum font-mono text-[0.625rem] text-ink-faint">as of {c.asOf}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

type ExhibitAuditRow = CustomsDefensePacket["exhibitAudit"][number];

export function ExhibitAudit({ audit }: { audit: ExhibitAuditRow[] }) {
  if (audit.length === 0) return null;
  return (
    <div className="table-scroll mt-3">
      <table className="brief-table">
        <thead>
          <tr>
            <th scope="col">Exhibit</th>
            <th scope="col">Body digest</th>
            <th scope="col">Quarantine flags</th>
          </tr>
        </thead>
        <tbody>
          {audit.map((row, i) => (
            <tr key={`${row.kind}-${i}`}>
              <td className="font-medium text-ink">{exhibitKindLabel(row.kind)}</td>
              <td className="font-mono text-[0.75rem] text-ink-muted">{row.bodyDigest}</td>
              <td>
                {row.injectionSignals.length === 0 ? (
                  <span className="text-[0.8125rem] text-ink-faint">clean</span>
                ) : (
                  <span className="flex flex-wrap gap-1.5">
                    {row.injectionSignals.map((s) => (
                      <Badge key={s} tone="warning">
                        {injectionSignalLabel(s)}
                      </Badge>
                    ))}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProvenanceLine({ provenance }: { provenance: CustomsDefensePacket["provenance"] }) {
  return (
    <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 font-mono text-[0.6875rem] text-ink-faint">
      <span>
        generated from <span className="text-ink-muted">{provenance.generatedFrom}</span>
      </span>
      <span aria-hidden="true">·</span>
      <span>synthetic = {String(provenance.synthetic)}</span>
      <span aria-hidden="true">·</span>
      <span>approval = {provenance.approvalState}</span>
    </p>
  );
}

// The persistent honesty chip -- present in the masthead on EVERY state of the page.
export function SyntheticChip() {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-muted shadow-[var(--shadow-e1)]"
      title="Every figure is derived from the frozen engine over synthetic entries -- no live services, no model calls, zero API keys."
    >
      <span aria-hidden="true" className="size-[0.4375rem] rounded-full bg-caution shadow-[0_0_0_3px_var(--color-caution-soft)]" />
      <span className="font-medium text-caution-ink">Synthetic data</span>
      <span className="text-ink-faint">— demonstration</span>
    </span>
  );
}
