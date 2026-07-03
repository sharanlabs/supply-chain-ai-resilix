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
  return lines.join("\n");
}
