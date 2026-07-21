// The customs-defense pipeline (D2+D3) -- deterministic, key-off, replay-first.
// Replaces pipeline-stub.ts. Order is the trust spine transplanted:
//   quarantine every exhibit -> sufficiency predicates decide the DISPOSITION in
//   code -> figures come only from tool returns -> packet rendered from those
//   figures -> produce-time citation check fails CLOSED -> approval state pending.
//
// The LLM judgment seams (narrative polish, evidence characterization) attach later
// and can only DECORATE this skeleton -- never bind numbers, never flip dispositions.

import { findCell } from "./edge-case-matrix";
import type { SyntheticCase } from "./synthetic-entries";
import { quarantineAll } from "./exhibit-quarantine";
import { assessSufficiency } from "./evidence-sufficiency";
import { scopeEntryPopulation } from "./entry-scoper";
import { computePenaltyExposure } from "./penalty-exposure";
import { computeDeadlines, type NoticeEvent } from "./deadline-clocks";
import { gradeCustomsCitationCoverage, type CitedFigure } from "./packet-graders";
import { renderPacketText, type CustomsDefensePacket } from "./defense-packet";
import { extractSourceableNumerals } from "@/lib/evals/numerals";
import type { PolicyCitation } from "./policy-table";

// Statutory-section numerals for the rendered policy-citation appendix (C-01): the
// appendix lines render FROM the structured PolicyCitation fields, so every numeral a
// section string carries ("19 CFR 162.74") is bound here from that same field — a
// SOURCE_DOCUMENT figure referencing the citation it appears in. Without this, the
// produce-time guard would (correctly) block its own appendix.
export function policyCitationFigures(citations: PolicyCitation[]): CitedFigure[] {
  const out: CitedFigure[] = [];
  for (const c of citations) {
    const { figures } = extractSourceableNumerals(c.section);
    for (const value of figures) {
      out.push({ value, sourceKind: "SOURCE_DOCUMENT", sourceRef: `policy-table#${c.sourceId}` });
    }
  }
  return out;
}

export interface CustomsDefenseOutcome {
  disposition: "PROCEED" | "REFUSE";
  namedGaps: string[];
  packetText: string;
  packet: CustomsDefensePacket;
}

// Demo-scenario constants -- explicit, labeled, deterministic. Synthetic cases carry
// no calendar dates, so the demo pins them; the packet states every assumption.
// Exported: the Skeptic re-derives the full figure set from raw inputs under the
// same declared demo model (the model is the packet's stated assumption; the
// COMPUTATION is what the Skeptic refuses to trust).
export const DEMO_NOTICE_MAILED_ON = "2026-06-15";
export const DEMO_INTEREST = { annualRatePct: 6, days: 365 };

function centsToUsdText(cents: number): string {
  const usd = cents / 100;
  return usd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function runCustomsDefenseCase(input: SyntheticCase): CustomsDefenseOutcome {
  const cell = findCell(input.cellId);
  if (!cell) {
    // Outside the declared edge-case matrix -> refusal is the ONLY permitted output.
    return refuse(input, [`OUTSIDE_DECLARED_COVERAGE:${input.cellId}`], []);
  }

  // 1. Quarantine: bodies stop here; structured fields cross.
  const quarantined = quarantineAll(input.exhibits);

  // 2. Disposition decided by code (never prose).
  const verdict = assessSufficiency(cell.workflow, quarantined, input.meta);
  if (!verdict.sufficient) {
    return refuse(input, verdict.gaps, quarantined);
  }

  // 3. Figures -- every one a tool return.
  const scope = scopeEntryPopulation(input.entries, {});
  // Demo LOR model (labeled in the packet): the disclosed error is a rate
  // misclassification such that the correct duty is 2x the declared duty, so the
  // actual loss of revenue equals the declared duty total.
  const actualLorCents = scope.totalDeclaredDutyCents;
  const caught = computePenaltyExposure({
    culpability: "NEGLIGENCE",
    lossType: "DUTY_LOSS",
    actualLossOfDutyCents: actualLorCents,
    potentialLossOfDutyCents: 0,
    dutiableValueCents: scope.totalEnteredValueCents,
    domesticValueCents: scope.totalEnteredValueCents * 2,
    priorDisclosure: false,
    aggravating: [],
    mitigating: [],
  });
  const disclosed = computePenaltyExposure({
    culpability: "NEGLIGENCE",
    lossType: "DUTY_LOSS",
    actualLossOfDutyCents: actualLorCents,
    potentialLossOfDutyCents: 0,
    dutiableValueCents: scope.totalEnteredValueCents,
    domesticValueCents: scope.totalEnteredValueCents * 2,
    priorDisclosure: true,
    interestAssumption: DEMO_INTEREST,
    aggravating: [],
    mitigating: [],
  });
  const deadlines = input.meta.enforcementSignal
    ? computeDeadlines([{ kind: "CF28_RESPONSE", mailedOn: DEMO_NOTICE_MAILED_ON } as NoticeEvent])
    : [];

  const policyCitations = [...caught.citations, ...disclosed.citations];
  const citedFigures: CitedFigure[] = [
    // The seed appears in the rendered provenance line ("cellId:seed"), and the
    // guard now grades the FULL rendered text (Codex D6 #3) -- so the seed is a
    // first-class cited figure. Honest kind (C-05): it is a raw case INPUT passed
    // through, not a tool-computed return.
    { value: input.seed, sourceKind: "RAW_INPUT", sourceRef: "case-input#seed" },
    { value: scope.entryCount, sourceKind: "TOOL_RETURN", sourceRef: "entry-scoper#entryCount" },
    { value: scope.lineCount, sourceKind: "TOOL_RETURN", sourceRef: "entry-scoper#lineCount" },
    { value: scope.totalEnteredValueCents / 100, sourceKind: "TOOL_RETURN", sourceRef: "entry-scoper#totalEnteredValue" },
    { value: scope.totalDeclaredDutyCents / 100, sourceKind: "TOOL_RETURN", sourceRef: "entry-scoper#totalDeclaredDuty" },
    { value: actualLorCents / 100, sourceKind: "TOOL_RETURN", sourceRef: "lor-model#actual" },
    { value: caught.minCents / 100, sourceKind: "TOOL_RETURN", sourceRef: "penalty-exposure#caught.min" },
    { value: caught.maxCents / 100, sourceKind: "TOOL_RETURN", sourceRef: "penalty-exposure#caught.max" },
    { value: disclosed.maxCents / 100, sourceKind: "TOOL_RETURN", sourceRef: "penalty-exposure#disclosed.max" },
    { value: quarantined.length, sourceKind: "TOOL_RETURN", sourceRef: "exhibit-quarantine#count" },
    // Honest kinds (C-05): the interest rate/days are DISCLOSED demo-model constants,
    // not tool computations — labeling them TOOL_RETURN was declarative provenance.
    { value: DEMO_INTEREST.annualRatePct, sourceKind: "DECLARED_ASSUMPTION", sourceRef: "demo-model#interestRateAssumption" },
    { value: DEMO_INTEREST.days, sourceKind: "DECLARED_ASSUMPTION", sourceRef: "demo-model#interestDaysAssumption" },
    ...deadlines.map((d) => ({
      value: d.windowDays,
      sourceKind: "TOOL_RETURN" as const,
      sourceRef: `deadline-clocks#${d.kind}`,
    })),
    ...policyCitationFigures(policyCitations),
  ];

  const packet: CustomsDefensePacket = {
    contractVersion: "customs-defense-packet/1",
    workflow: cell.workflow,
    caseRef: `${input.cellId}:${input.seed}`,
    disposition: "PROCEED",
    sections: [
      {
        heading: "Disclosure scope",
        text:
          `The disclosure covers ${scope.entryCount} entry summaries (${scope.lineCount} lines) with total entered value ` +
          `${centsToUsdText(scope.totalEnteredValueCents)} and total declared duty ${centsToUsdText(scope.totalDeclaredDutyCents)}. ` +
          `Declared origin: ${input.meta.declaredOrigin}.`,
      },
      {
        heading: "Loss of revenue (assumed demo model)",
        text:
          `Assumed error model: the correct duty rate is double the declared rate, so the actual loss of revenue equals the ` +
          `declared duty total: ${centsToUsdText(actualLorCents)}. This is a synthetic-scenario assumption, stated on the packet.`,
      },
      {
        heading: "Exposure: penalty if caught vs. valid prior disclosure",
        text:
          `If assessed at the negligence tier without disclosure, the disposition range is ${centsToUsdText(caught.minCents)} ` +
          `to ${centsToUsdText(caught.maxCents)} under the mitigation-guidelines disposition table, capped at domestic value. ` +
          `With a valid prior disclosure the disposition is interest on the actual loss of revenue: ` +
          `${centsToUsdText(disclosed.maxCents)} at an assumed ${DEMO_INTEREST.annualRatePct} percent simple rate over ` +
          `${DEMO_INTEREST.days} days. Statutory sources are attached as structured policy citations.`,
      },
      {
        heading: "Evidence basis",
        text:
          `${quarantined.length} exhibits passed per-document quarantine; all load-bearing records are present and consistent ` +
          `with the declared origin. Exhibit bodies never enter this packet; see the exhibit audit trail.`,
      },
      ...(deadlines.length > 0
        ? [
            {
              heading: "Live enforcement clock",
              text: deadlines
                .map(
                  (d) =>
                    `${d.kind}: response due ${d.dueOn}, ${d.windowDays} days from mailing (${d.sourceStatus}; regulatory source attached to the clock record).`
                )
                .join(" "),
            },
          ]
        : []),
    ],
    citedFigures,
    namedGaps: [],
    deadlines,
    policyCitations,
    exhibitAudit: quarantined.map(({ kind, bodyDigest, injectionSignals }) => ({ kind, bodyDigest, injectionSignals })),
    provenance: {
      synthetic: true,
      generatedFrom: `${input.cellId}:${input.seed}`,
      approvalState: "PENDING_COUNSEL_REVIEW",
    },
  };

  failClosedOnUncitedNumerals(packet);
  return { disposition: "PROCEED", namedGaps: [], packetText: renderPacketText(packet), packet };
}

function refuse(
  input: SyntheticCase,
  gaps: string[],
  quarantined: ReturnType<typeof quarantineAll>
): CustomsDefenseOutcome {
  const cell = findCell(input.cellId);
  const refusalCitations: PolicyCitation[] = gaps.includes("INELIGIBLE:INVESTIGATION_COMMENCED")
    ? [{ sourceId: "eCFR", section: "19 CFR 162.74 (prior disclosure)", asOf: "2026-07-03", layer: "operative" }]
    : [];
  const packet: CustomsDefensePacket = {
    contractVersion: "customs-defense-packet/1",
    workflow: cell?.workflow ?? "PRIOR_DISCLOSURE",
    caseRef: `${input.cellId}:${input.seed}`,
    disposition: "REFUSE",
    sections: [
      {
        heading: "Do not disclose yet",
        text:
          `The evidence file does not support proceeding. Each named gap below must be resolved before a filing-grade ` +
          `packet can be assembled; filing now would expose the claim to challenge on exactly these points. ` +
          `${quarantined.length} exhibits were examined under per-document quarantine.`,
      },
      {
        heading: "What resolving each gap requires",
        text: gaps
          .map((gap) => {
            if (gap.startsWith("MISSING:")) return `${gap}: obtain the record from the supplier or their upstream tier.`;
            if (gap === "CONTRADICTION:ORIGIN") return `${gap}: reconcile the origin stated across exhibits before any figure is derived.`;
            if (gap === "INELIGIBLE:INVESTIGATION_COMMENCED") return `${gap}: a valid prior disclosure is no longer available for these circumstances under the prior-disclosure regulation (see policy citations); route to penalty-response posture with counsel.`;
            return `${gap}: outside declared coverage -- this system refuses rather than improvises.`;
          })
          .join(" "),
      },
    ],
    citedFigures: [
      { value: input.seed, sourceKind: "RAW_INPUT", sourceRef: "case-input#seed" },
      { value: quarantined.length, sourceKind: "TOOL_RETURN", sourceRef: "exhibit-quarantine#count" },
      ...policyCitationFigures(refusalCitations),
    ],
    namedGaps: gaps,
    deadlines: [],
    policyCitations: refusalCitations,
    exhibitAudit: quarantined.map(({ kind, bodyDigest, injectionSignals }) => ({ kind, bodyDigest, injectionSignals })),
    provenance: {
      synthetic: true,
      generatedFrom: `${input.cellId}:${input.seed}`,
      approvalState: "PENDING_COUNSEL_REVIEW",
    },
  };
  failClosedOnUncitedNumerals(packet);
  return { disposition: "REFUSE", namedGaps: gaps, packetText: renderPacketText(packet), packet };
}

// Produce-time output-safety check (Codex plan-gate R1 #3): the citation grader runs
// AT PACKET PRODUCTION, not only in evals. A packet that fails does not exist.
// Codex D6 #3: the guard grades the EXACT text the renderer emits -- header,
// provenance, and named-gap lines included -- not only the section bodies, so no
// rendered numeral can ride outside the graded surface.
function failClosedOnUncitedNumerals(packet: CustomsDefensePacket): void {
  const grade = gradeCustomsCitationCoverage({
    sections: [...packet.sections, { heading: "RENDERED_PACKET_TEXT", text: renderPacketText(packet) }],
    citedFigures: packet.citedFigures,
  });
  if (grade.blocked) {
    throw new Error(`packet failed produce-time citation coverage: ${grade.violations.join(" | ")}`);
  }
}
