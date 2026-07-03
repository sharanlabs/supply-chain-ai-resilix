// Per-workflow deterministic sufficiency predicates (plan §5 D2, Codex plan-gate
// R1 #2). These booleans -- not model prose -- are what the refusal keys off
// (authoritative-binding discipline: the DISPOSITION is decided here, in code).
//
// Gap vocabulary is shared with the golden set (evals/golden/customs/cases.ts):
//   MISSING:<EXHIBIT_KIND> | CONTRADICTION:ORIGIN | INELIGIBLE:INVESTIGATION_COMMENCED

import type { Workflow } from "./edge-case-matrix";
import type { SyntheticCase, ExhibitKind } from "./synthetic-entries";
import type { QuarantinedExhibit } from "./exhibit-quarantine";

// The exhibits an origin claim cannot stand without (mirrors the generator's
// LOAD_BEARING set -- the golden suite cross-checks the two stay in sync).
const LOAD_BEARING_EXHIBITS: ExhibitKind[] = ["PRODUCTION_RECORD", "BILL_OF_MATERIALS"];

export interface SufficiencyVerdict {
  workflow: Workflow;
  sufficient: boolean;
  gaps: string[]; // ordered: eligibility first, then missing, then contradictions
  checkedExhibits: number;
}

export function assessSufficiency(
  workflow: Workflow,
  quarantined: QuarantinedExhibit[],
  meta: SyntheticCase["meta"]
): SufficiencyVerdict {
  const gaps: string[] = [];

  // Eligibility gate -- PRIOR_DISCLOSURE only (19 CFR 162.74: a disclosure is valid
  // only before CBP commences a formal investigation of the same circumstances).
  if (workflow === "PRIOR_DISCLOSURE" && meta.investigationCommenced) {
    gaps.push("INELIGIBLE:INVESTIGATION_COMMENCED");
  }

  // Missing load-bearing exhibits.
  const presentKinds = new Set(quarantined.map((q) => q.kind));
  for (const kind of LOAD_BEARING_EXHIBITS) {
    if (!presentKinds.has(kind)) gaps.push(`MISSING:${kind}`);
  }

  // Origin contradictions among the exhibits that ARE present.
  if (quarantined.some((q) => !q.consistentWithEntry)) {
    gaps.push("CONTRADICTION:ORIGIN");
  }

  return {
    workflow,
    sufficient: gaps.length === 0,
    gaps,
    checkedExhibits: quarantined.length,
  };
}
