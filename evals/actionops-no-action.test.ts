import { describe, expect, it } from "vitest";

import { buildDecisionPacket } from "@/lib/pipeline/build-packet";
import {
  ACTION_CONFIDENCE_FLOOR,
  decideRecommendation
} from "@/lib/agents/actionops/recommendation";
import type { ExposureResult } from "@/lib/schemas";

// The NO_ACTION refusal path -- the accountability differentiator made executable: when a
// real, actionable disruption is reported by a lone uncorroborated, low-confidence source,
// the pipeline REFUSES to draft outbound action and states exactly what evidence is missing.
//
// Two layers: (1) decideRecommendation as a pure unit (every branch of the three-part rule),
// and (2) the deterministic pipeline on the SCN-THIN-EVIDENCE scenario (the must-pass gate;
// the live leg in actionops-live-real is confirmatory). The regression guard at the end is
// the load-bearing one: a single AUTHORITATIVE source (hurricane / bankruptcy) must still
// ACT -- the refusal is about UNVERIFIED evidence, never raw source count.

// A real-sector exposure (sector != OTHER_UNMAPPED) -> "there is something to act on".
function realExposure(): ExposureResult {
  return {
    id: "EXP-1",
    supplierId: "SUP-1",
    supplierName: "Test Supplier",
    country: "US",
    sector: "LOGISTICS",
    exposureScore: 50,
    rationale: "MEDIUM risk tier; test.",
    evidenceIds: []
  };
}

function offTaxonomyExposure(): ExposureResult {
  return { ...realExposure(), sector: "OTHER_UNMAPPED" };
}

const LOW = ACTION_CONFIDENCE_FLOOR - 0.1; // in the "low" band
const HIGH = ACTION_CONFIDENCE_FLOOR + 0.3; // an authoritative single source (e.g. NWS)

describe("decideRecommendation -- the act/refuse rule", () => {
  it("REFUSES a lone, low-confidence source on a real-sector exposure", () => {
    const { recommendation, missingEvidence } = decideRecommendation({
      corroborated: false,
      confidence: LOW,
      exposureResults: [realExposure()]
    });
    expect(recommendation).toBe("NO_ACTION");
    // Both gaps are stated: corroboration AND authoritative confirmation.
    expect(missingEvidence.length).toBe(2);
    expect(missingEvidence.map((m) => m.requirement)).toEqual([
      "Independent corroboration",
      "Authoritative confirmation"
    ]);
    // Each carries what would flip the decision.
    for (const item of missingEvidence) {
      expect(item.wouldFlipIf.length).toBeGreaterThan(0);
    }
  });

  it("ACTS on a single AUTHORITATIVE (high-confidence) source -- the discriminator is verification, not count", () => {
    const { recommendation, missingEvidence } = decideRecommendation({
      corroborated: false,
      confidence: HIGH,
      exposureResults: [realExposure()]
    });
    expect(recommendation).toBe("ACT");
    expect(missingEvidence).toEqual([]);
  });

  it("ACTS when corroborated, even at low confidence (the >=2-source bar is met)", () => {
    const { recommendation } = decideRecommendation({
      corroborated: true,
      confidence: LOW,
      exposureResults: [realExposure()]
    });
    expect(recommendation).toBe("ACT");
  });

  it("ACTS at EXACTLY the confidence floor (the rule is a strict <, not <=)", () => {
    // Pins the boundary: a confidence sitting exactly on the floor is NOT "below" it, so a
    // lone source at the floor still acts. A flip of `<` to `<=` would be caught here.
    const { recommendation } = decideRecommendation({
      corroborated: false,
      confidence: ACTION_CONFIDENCE_FLOOR,
      exposureResults: [realExposure()]
    });
    expect(recommendation).toBe("ACT");
  });

  it("does NOT refuse when there is no actionable exposure (zero-exposure disposition)", () => {
    const { recommendation } = decideRecommendation({
      corroborated: false,
      confidence: LOW,
      exposureResults: []
    });
    expect(recommendation).toBe("ACT");
  });

  it("does NOT refuse when every exposure is OTHER_UNMAPPED (off-taxonomy disposition)", () => {
    const { recommendation } = decideRecommendation({
      corroborated: false,
      confidence: LOW,
      exposureResults: [offTaxonomyExposure()]
    });
    expect(recommendation).toBe("ACT");
  });

  it("the refusal carries ZERO numerals -- the citation contract, applied to NO_ACTION", () => {
    const { missingEvidence } = decideRecommendation({
      corroborated: false,
      confidence: LOW,
      exposureResults: [realExposure()]
    });
    const prose = missingEvidence
      .flatMap((m) => [m.requirement, m.detail, m.wouldFlipIf])
      .join(" ");
    // No digit anywhere in the refusal prose: counts are spelled as words, so a
    // NO_ACTION packet has no unsourced figure to cite (same honesty as the action path).
    expect(prose).not.toMatch(/[0-9]/);
  });
});

describe("NO_ACTION pipeline (deterministic, SCN-THIN-EVIDENCE)", () => {
  it("refuses: withholds drafts + playbooks, keeps the contingent exposure, states the gap", async () => {
    const packet = await buildDecisionPacket({ scenarioId: "SCN-THIN-EVIDENCE", live: false });

    expect(packet.recommendation).toBe("NO_ACTION");
    expect(packet.missingEvidence?.length ?? 0).toBeGreaterThan(0);

    // The action is withheld -- including the scored recovery options (P1): a refusal that
    // cannot justify drafting messages cannot justify recommending mitigation options.
    expect(packet.supplierMessages).toEqual([]);
    expect(packet.playbooks).toEqual([]);
    expect(packet.actionItems).toEqual([]);
    expect(packet.recoveryOptions ?? []).toEqual([]);

    // The exposure is real and kept (situational awareness), flagged contingent.
    expect(packet.exposureResults.length).toBeGreaterThan(0);
    expect(packet.dataGaps.join(" ")).toMatch(/contingent on the disruption being confirmed/i);

    // The six-run audit trail stays complete -- Strategist + Dispatcher record a $0
    // withheld run rather than vanishing, so the packet is auditable and never reads
    // as a degraded/failed run.
    expect(packet.agentRuns).toHaveLength(6);
    const withheld = packet.agentRuns.filter((r) => /Withheld: NO_ACTION/.test(r.summary));
    expect(withheld.map((r) => r.agentName).sort()).toEqual(["Dispatcher", "Strategist"]);
    expect(withheld.every((r) => (r.costUsd ?? 0) === 0)).toBe(true);
    // A withhold is a deliberate decision, NOT a validation failure.
    expect(withheld.every((r) => r.validationStatus === "PASS")).toBe(true);
    // The load-bearing invariant: a withheld run is DETERMINISTIC_RULES, never
    // FAILED_TO_FALLBACK -- so a LIVE NO_ACTION run (Sentinel LIVE_AI + these
    // deterministic) still computes effectiveMode LIVE_AI, never a degraded label. If a
    // withhold ever flipped to FAILED_TO_FALLBACK, computeEffectiveMode would mislabel the
    // whole run degraded; this assertion guards that in key-OFF CI.
    expect(withheld.every((r) => r.mode === "DETERMINISTIC_RULES")).toBe(true);

    // A refusal is still a healthy, approvable-shape packet (not BLOCKED, not degraded).
    expect(packet.gatekeeper.status).not.toBe("BLOCKED");
    expect(packet.effectiveMode).toBe("DETERMINISTIC_RULES");
  });
});

describe("NO_ACTION regression guard -- a single AUTHORITATIVE source still ACTS", () => {
  // The load-bearing guard: hurricane (one NWS warning) and bankruptcy (one wire) are
  // single-source but high-confidence/authoritative. They must NOT be swept into the
  // refusal -- the rule keys off unverified+low-confidence, not source count.
  it("SCN-HURRICANE acts (drafts an outbound response)", async () => {
    const packet = await buildDecisionPacket({ scenarioId: "SCN-HURRICANE", live: false });
    expect(packet.recommendation ?? "ACT").toBe("ACT");
    expect(packet.supplierMessages.length).toBeGreaterThan(0);
  });

  it("SCN-BANKRUPTCY acts (drafts an outbound response)", async () => {
    const packet = await buildDecisionPacket({ scenarioId: "SCN-BANKRUPTCY", live: false });
    expect(packet.recommendation ?? "ACT").toBe("ACT");
    expect(packet.supplierMessages.length).toBeGreaterThan(0);
  });
});
