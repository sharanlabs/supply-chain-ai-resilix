// S4 -- the committed, page-cited customs policy CORPUS for lexical retrieval.
//
// Every chunk is DERIVED from the already-D0-D6-Codex-gated primary-source encoding
// in policy-table.ts -- NOT re-typed from memory. The disposition ranges, prior-
// disclosure rules, factor lists, deadline windows, and the EO-14411 directive are
// read from the exported constants, so a change to the verified policy table
// propagates here and the two cannot drift. Each chunk carries the SAME
// {sourceId, section, asOf, layer} citation the calculator uses, so a retrieved
// chunk passes the fail-closed produce-time citation bar BY CONSTRUCTION -- a chunk
// with no citation is structurally impossible (asserted in the golden test).
//
// This is the "lowest rung" (plan S4): a small, committed, keyless, no-DB corpus.
// pg_textsearch is the documented enterprise upgrade; the raw ingest cache is
// gitignored and deliberately NOT indexed (plan S4 DECISION, skip-with-reason).

import {
  DISPOSITION_RANGES,
  PRIOR_DISCLOSURE_RULES,
  MITIGATING_FACTORS,
  AGGRAVATING_FACTORS,
  DEADLINE_RULES,
  EO_14411_DIRECTED,
  type PolicyCitation,
  type DispositionRange
} from "@/lib/agents/customsdesk/policy-table";

export interface PolicyChunk {
  id: string;
  // Retrievable text: a plain-language statement of the rule, plus the exact terms
  // a practitioner would query on. Numbers here come from the policy constants.
  text: string;
  // The SAME citation the penalty calculator binds to -- never null, never empty.
  citation: PolicyCitation;
}

function rangeText(r: DispositionRange): string {
  const cul = r.culpability.toLowerCase().replace(/_/g, " ");
  if (r.lossType === "DUTY_LOSS") {
    return (
      `Penalty disposition for ${cul}, duty-loss violation (19 USC 1592): ` +
      `${r.minHundredths / 100} to ${r.maxHundredths / 100} times the total loss of revenue, ` +
      `capped at the domestic value of the merchandise. Mitigation guidelines range.`
    );
  }
  return (
    `Penalty disposition for ${cul}, non-duty-loss violation (19 USC 1592): ` +
    `${r.minHundredths / 100} to ${r.maxHundredths / 100} percent of the dutiable value, ` +
    `capped at the domestic value of the merchandise. Mitigation guidelines range.`
  );
}

// Build the corpus once at module load from the verified constants.
export const POLICY_CORPUS: PolicyChunk[] = [
  ...DISPOSITION_RANGES.map((r) => ({
    id: `disposition-${r.culpability}-${r.lossType}`.toLowerCase(),
    text: rangeText(r),
    citation: r.citation
  })),
  {
    id: "prior-disclosure-fraud-duty",
    text:
      `Prior disclosure disposition, fraud, duty-loss: the penalty is ` +
      `${PRIOR_DISCLOSURE_RULES.fraudDutyLossTotalLorHundredths} percent of the total ` +
      "loss of duty (actual plus potential), with no mitigation available. Filing a valid prior " +
      "disclosure under 19 CFR 162.74 before an investigation commences collapses the exposure to " +
      "this floor.",
    citation: PRIOR_DISCLOSURE_RULES.citation
  },
  {
    id: "prior-disclosure-fraud-nonduty",
    text:
      "Prior disclosure disposition, fraud, non-duty-loss: the penalty is " +
      `${PRIOR_DISCLOSURE_RULES.fraudNonDutyPctOfDutiableHundredths / 100} percent of the dutiable ` +
      "value, with no mitigation available.",
    citation: PRIOR_DISCLOSURE_RULES.citation
  },
  {
    id: "prior-disclosure-negligence",
    text:
      "Prior disclosure disposition, negligence and gross negligence: for a duty-loss violation the " +
      "disposition is interest on the actual loss of duty from liquidation to tender, with no " +
      "monetary penalty where the duty loss is only potential; for a non-duty-loss violation there is " +
      "no monetary penalty and issued claims are remitted in full. This is why a prior disclosure " +
      "before an investigation opens is the strongest available posture for a negligence-tier error.",
    citation: PRIOR_DISCLOSURE_RULES.citation
  },
  {
    id: "mitigating-factors",
    text:
      "Mitigating factors that can reduce a 1592 penalty (non-exhaustive): " +
      MITIGATING_FACTORS.map((f) => f.toLowerCase().replace(/_/g, " ")).join(", ") +
      ". Cooperation with the investigation and immediate remedial action are the factors most " +
      "within an importer's control after a filing error is discovered. This list is the ICP's " +
      "own non-exhaustive enumeration.",
    citation: { sourceId: "ICP-1592", section: "VII/VIII", asOf: "2026-07-03", layer: "operative" }
  },
  {
    id: "aggravating-factors",
    text:
      "Aggravating factors that can increase a 1592 penalty: " +
      AGGRAVATING_FACTORS.map((f) => f.toLowerCase().replace(/_/g, " ")).join(", ") +
      ". Obstructing the investigation or withholding evidence weighs heavily against mitigation.",
    citation: { sourceId: "ICP-1592", section: "VII/VIII", asOf: "2026-07-03", layer: "operative" }
  },
  ...DEADLINE_RULES.filter((d) => d.citation !== null).map((d) => ({
    id: `deadline-${d.kind}`.toLowerCase(),
    text:
      `Response deadline, ${d.kind.toLowerCase().replace(/_/g, " ")}: ${d.windowDays} days. ${d.note}`,
    citation: d.citation as PolicyCitation
  })),
  {
    id: "eo-14411-directed",
    text:
      "Executive Order 14411 (directed, not yet codified): directs a minimum penalty floor of not " +
      `less than ${EO_14411_DIRECTED.minFloorPctOfAssessed} percent of the assessed penalty absent ` +
      "exceptional circumstances, and eliminates mitigation for repeat offenders. This is a signed " +
      "directive inside its codification window, NOT operative law; it is applied only in explicitly " +
      "scenario-labeled analysis, never by default.",
    citation: EO_14411_DIRECTED.citation
  }
];

// Structural invariant (pinned by the golden test): every chunk carries a real
// citation with a non-empty sourceId + section. Retrieval can therefore never
// surface an uncited chunk, so the produce-time citation bar holds by construction.
export function everyChunkIsCited(): boolean {
  return POLICY_CORPUS.every(
    (c) => c.citation.sourceId.trim().length > 0 && c.citation.section.trim().length > 0
  );
}
