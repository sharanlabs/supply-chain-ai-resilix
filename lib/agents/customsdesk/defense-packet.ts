// CustomsDefensePacket -- the explicit domain contract (Codex plan-gate R1 #4:
// its own schema, never a stretched DecisionPacketV2).
//
// Binding rule (the moat): every numeral in section prose exists FIRST as a
// citedFigure whose value came from a deterministic tool return (scoper, calculator,
// clocks, quarantine counts). The renderer writes prose FROM those figures; the
// citation grader then re-checks the finished prose (produce-time output-safety,
// R1 #3). Exhibit body text can never appear here -- it never crossed quarantine.

import type { CitedFigure } from "./packet-graders";
import type { Workflow } from "./edge-case-matrix";
import type { DeadlineClock } from "./deadline-clocks";
import type { QuarantinedExhibit } from "./exhibit-quarantine";
import type { PolicyCitation } from "./policy-table";

export interface CustomsDefensePacket {
  contractVersion: "customs-defense-packet/1";
  workflow: Workflow;
  caseRef: string;
  disposition: "PROCEED" | "REFUSE";
  sections: Array<{ heading: string; text: string }>;
  citedFigures: CitedFigure[];
  namedGaps: string[];
  deadlines: DeadlineClock[];
  policyCitations: PolicyCitation[];
  exhibitAudit: Array<Pick<QuarantinedExhibit, "kind" | "bodyDigest" | "injectionSignals">>;
  provenance: {
    synthetic: true; // this prototype structurally excludes real customer data
    generatedFrom: string; // cellId + seed
    approvalState: "PENDING_COUNSEL_REVIEW"; // no outward artifact without approval
  };
}

export function renderPacketText(packet: CustomsDefensePacket): string {
  const lines: string[] = [
    `# ${packet.workflow === "PRIOR_DISCLOSURE" ? "Prior-Disclosure Support Packet" : "CF-28 Response Packet"} — ${packet.disposition}`,
    `Synthetic demonstration data (${packet.provenance.generatedFrom}); not legal advice; counsel review required before any use.`,
  ];
  for (const section of packet.sections) {
    lines.push(`\n## ${section.heading}\n${section.text}`);
  }
  if (packet.namedGaps.length > 0) {
    lines.push(`\n## Named gaps\n${packet.namedGaps.map((g) => `- ${g}`).join("\n")}`);
  }
  // Appendices (2026-07-16 re-review, C-01): the exported artifact must CONTAIN what its
  // prose says is attached. Every numeral below is covered by citedFigures at assembly
  // (statutory-section numerals are bound from the structured PolicyCitation fields in
  // pipeline.ts); exhibit digests render as SHA-<hex> so the numeral extractor treats
  // them structurally as identifiers, never as asserted figures.
  if (packet.policyCitations.length > 0) {
    lines.push(
      `\n## Policy citations (statutory sources)\n` +
        packet.policyCitations
          .map((c) => `- ${c.sourceId} — ${c.section} — as of ${c.asOf} — layer: ${c.layer}`)
          .join("\n")
    );
  }
  if (packet.citedFigures.length > 0) {
    lines.push(
      `\n## Figure provenance ledger\n` +
        packet.citedFigures.map((f) => `- ${f.value} — ${f.sourceKind} — ${f.sourceRef}`).join("\n")
    );
  }
  if (packet.deadlines.length > 0) {
    lines.push(
      `\n## Deadline clocks\n` +
        packet.deadlines
          .map((d) => `- ${d.kind}: due ${d.dueOn} (${d.windowDays} days from mailing; ${d.sourceStatus})`)
          .join("\n")
    );
  }
  if (packet.exhibitAudit.length > 0) {
    lines.push(
      `\n## Exhibit audit (bodies never cross quarantine)\n` +
        packet.exhibitAudit
          .map(
            (e) =>
              `- ${e.kind} — digest SHA-${e.bodyDigest} — ${
                e.injectionSignals.length > 0
                  ? `injection signals: ${e.injectionSignals.join(", ")}`
                  : "no injection signals"
              }`
          )
          .join("\n")
    );
  }
  return lines.join("\n");
}
