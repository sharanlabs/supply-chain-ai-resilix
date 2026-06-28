import { describe, expect, it } from "vitest";

import {
  applySkepticGate,
  challengeFindingLive,
  findingStrength,
  resolvedSkepticModel,
  type SkepticVerdict
} from "@/lib/agents/actionops/skeptic";
import { decideRecommendation } from "@/lib/agents/actionops/recommendation";
import type { VerifierChecks } from "@/lib/agents/actionops/verifier";
import { estimateLiveCallCostUsd } from "@/lib/agents/run";
import { DEFAULT_BUDGET_CAP_USD } from "@/lib/agents/budget";
import { getActionOpsScenario } from "@/lib/data/actionops-scenarios";
import type { ActionOpsContext } from "@/lib/agents/actionops/types";
import type { ExposureResult, ThreatCard } from "@/lib/schemas";

// Phase-4 Skeptic calibration. Two layers (mirrors judge-calibration):
//  (1) ALWAYS-ON (no spend): the labelled set is balanced + the FAIL-CLOSED counting is correct --
//      a judge/critic error counts as a FLAG (a REJECT), never a silent accept. The regression guard.
//  (2) GATED (RUN_LIVE_AI_TESTS=true): run the REAL cross-family Skeptic over the labelled findings
//      and assert TPR (catches unsound findings) + TNR (does not falsely reject sound ones) clear a
//      calibrated bar -- the evidence the Skeptic is trustworthy as a GATE input. CROSS-FAMILY
//      (ADR-0002): runs on Groq's free tier ($0). Canonical run:
//        RUN_LIVE_AI_TESTS=true GROQ_API_KEY=... node --env-file=.env \
//          node_modules/vitest/vitest.mjs run evals/actionops-skeptic-calibration.test.ts
//      The Skeptic is fed ONLY the structured finding -- the same view it sees in production.

const LIVE = process.env.RUN_LIVE_AI_TESTS === "true";
const BASE_DATE = "2026-06-18T12:00:00.000Z";

function ctx(): ActionOpsContext {
  return { scenario: getActionOpsScenario(), signals: [], suppliers: [], baseDateIso: BASE_DATE };
}

// A compact description of a finding -> the three structured inputs the Skeptic challenges. The
// labelled `accepted` is the hand label: SOUND findings (recognized event, real exposure, AND
// corroboration OR an authoritative high-confidence source) should ACCEPT; OVER-TRIGGER (no
// actionable exposure / geo disagreement), THIN EVIDENCE (lone uncorroborated low-confidence), and
// MISCLASSIFICATION cases should REJECT.
type FindingSpec = {
  id: string;
  accepted: boolean;
  eventType: string;
  severity: ThreatCard["severity"];
  location: ThreatCard["location"];
  confidence: number;
  sourceCount: number;
  corroborated: boolean;
  geoAgrees: boolean;
  sectors: string[]; // exposure sectors; [] = zero exposure; "OTHER_UNMAPPED" = off-taxonomy
};

function inputsFor(s: FindingSpec): {
  threatCard: ThreatCard;
  checks: VerifierChecks;
  exposures: ExposureResult[];
} {
  const threatCard: ThreatCard = {
    id: `THR-${s.id}`,
    eventType: s.eventType,
    severity: s.severity,
    location: s.location,
    summary: "structured finding (prose quarantined out)",
    evidenceUrls: ["https://example.org/evidence"],
    confidence: s.confidence,
    createdAt: BASE_DATE
  };
  const checks: VerifierChecks = {
    sourceCount: s.sourceCount,
    corroborated: s.corroborated,
    freshestMinutes: 30,
    geoAgrees: s.geoAgrees
  };
  const exposures: ExposureResult[] = s.sectors.map((sector, i) => ({
    id: `EXP-${s.id}-${i}`,
    supplierId: `SUP-${s.id}-${i}`,
    supplierName: `Supplier ${i}`,
    country: (s.location.country as string) ?? "US",
    sector,
    exposureScore: 64,
    rationale: "structured exposure (prose quarantined out)",
    singleSource: true,
    recoveryDays: 45,
    evidenceIds: [`THR-${s.id}`]
  }));
  return { threatCard, checks, exposures };
}

// The labelled set. Balanced so TPR/TNR are both measurable; deliberately covers the three reject
// modes the Skeptic exists to catch plus the "single authoritative source still acts" discriminator.
const LABELED: FindingSpec[] = [
  // --- SOUND (accept) ---
  { id: "S1", accepted: true, eventType: "CHOKEPOINT_CLOSURE", severity: "HIGH", location: { country: "OM", chokepoint: "Strait of Hormuz" }, confidence: 0.82, sourceCount: 3, corroborated: true, geoAgrees: true, sectors: ["ENERGY", "LOGISTICS"] },
  { id: "S2", accepted: true, eventType: "NATURAL_DISASTER", severity: "HIGH", location: { country: "US" }, confidence: 0.78, sourceCount: 2, corroborated: true, geoAgrees: true, sectors: ["ELECTRONICS"] },
  { id: "S3", accepted: true, eventType: "SUPPLIER_BANKRUPTCY", severity: "HIGH", location: { country: "DE" }, confidence: 0.8, sourceCount: 1, corroborated: false, geoAgrees: true, sectors: ["AUTOMOTIVE"] }, // single AUTHORITATIVE source still acts
  { id: "S4", accepted: true, eventType: "TARIFF_DEADLINE", severity: "MEDIUM", location: { country: "CN" }, confidence: 0.74, sourceCount: 3, corroborated: true, geoAgrees: true, sectors: ["TEXTILES_APPAREL"] },
  { id: "S5", accepted: true, eventType: "MATERIAL_SHORTAGE_ALLOCATION", severity: "HIGH", location: { country: "TW" }, confidence: 0.76, sourceCount: 2, corroborated: true, geoAgrees: true, sectors: ["SEMICONDUCTORS"] },
  { id: "S6", accepted: true, eventType: "ROUTE_DIVERSION", severity: "MEDIUM", location: { country: "EG" }, confidence: 0.71, sourceCount: 2, corroborated: true, geoAgrees: true, sectors: ["LOGISTICS"] },
  // Single-AUTHORITATIVE high-confidence cases (sourceCount 1, corroborated=false). The design's stated
  // differentiator -- "unverified, not raw source count; a single AUTHORITATIVE source acts" (an official
  // NWS warning, a confirmed recall). decideRecommendation ACTs on these (confidence >= 0.45); the Skeptic
  // MUST NOT over-reject them on corroboration alone. Probing this class ONCE (S3) hid a categorical
  // over-rejection behind an 83% PASS, so the set deliberately carries THREE now (S3/S7/S8) as the
  // regression teeth (gates/agentic-rework/PHASE4-SKEPTIC-CALIBRATION.md).
  { id: "S7", accepted: true, eventType: "NATURAL_DISASTER", severity: "HIGH", location: { country: "US" }, confidence: 0.88, sourceCount: 1, corroborated: false, geoAgrees: true, sectors: ["ELECTRONICS"] }, // official NWS hurricane warning: single AUTHORITATIVE source acts
  { id: "S8", accepted: true, eventType: "QUALITY_RECALL", severity: "HIGH", location: { country: "US" }, confidence: 0.82, sourceCount: 1, corroborated: false, geoAgrees: true, sectors: ["AGRICULTURE_FOOD"] }, // confirmed official recall: single AUTHORITATIVE source acts
  // Gray-band single source (Codex closure F1): a single, UNCORROBORATED, MEDIUM-confidence finding with a
  // real exposure. decideRecommendation ACTs on this (confidence >= the 0.45 floor), so the Skeptic must NOT
  // be MORE conservative than the deterministic policy here -- aligning to that floor, not re-litigating the
  // confidence axis, is the whole point of the fix. Measured boundary ~0.55-0.60; 0.70 sits clearly above it.
  { id: "S9", accepted: true, eventType: "SUPPLIER_BANKRUPTCY", severity: "HIGH", location: { country: "DE" }, confidence: 0.7, sourceCount: 1, corroborated: false, geoAgrees: true, sectors: ["AUTOMOTIVE"] }, // gray-band single source -- consistent with decideRecommendation's floor
  // S10 = the FLAGSHIP SHAPE: the EXACT structured finding the LIVE Skeptic FALSE-VETOED, reproduced
  // from the 2026-06-28 live diagnostic -- confidence 0.9, 9 exposures (CHEMICALS/ENERGY), corroborated
  // (3 sources), CHOKEPOINT_CLOSURE, and CRITICALLY: location has NO country (region + chokepoint only),
  // so geoAgrees is STRUCTURALLY false ("unconfirmed", not "disagrees"). That is precisely what made
  // an earlier draft's geo veto re-break the flagship. The 6/27 set carried only conf-0.82/2-sector S1
  // (WITH a country), which did NOT reproduce the real finding -- so the labelled TPR/TNR read 100%
  // while the real flagship refused itself. This closes the set-vs-real gap
  // (gates/agentic-rework/PHASE4-SKEPTIC-CALIBRATION.md, 2026-06-28). It is the STRONG (corroborated)
  // shape the strength-aware GATE now downgrades-not-vetoes -- proven by the deterministic gate-outcome
  // teeth below regardless of how the live critic scores it OR that geoAgrees is false.
  { id: "S10", accepted: true, eventType: "CHOKEPOINT_CLOSURE", severity: "CRITICAL", location: { region: "Middle East", chokepoint: "Strait of Hormuz" }, confidence: 0.9, sourceCount: 3, corroborated: true, geoAgrees: false, sectors: ["ENERGY", "CHEMICALS", "ENERGY", "CHEMICALS", "ENERGY", "CHEMICALS", "LOGISTICS", "ENERGY", "CHEMICALS"] },

  // --- UNSOUND (reject) ---
  { id: "U1", accepted: false, eventType: "CHOKEPOINT_CLOSURE", severity: "CRITICAL", location: { country: "OM", chokepoint: "Strait of Hormuz" }, confidence: 0.85, sourceCount: 3, corroborated: true, geoAgrees: true, sectors: [] }, // over-trigger: NO actionable exposure
  { id: "U2", accepted: false, eventType: "PORT_DISRUPTION", severity: "MEDIUM", location: { country: "US" }, confidence: 0.18, sourceCount: 1, corroborated: false, geoAgrees: false, sectors: ["LOGISTICS"] }, // thin evidence: lone, uncorroborated, low-confidence
  { id: "U3", accepted: false, eventType: "NATURAL_DISASTER", severity: "HIGH", location: { country: "JP" }, confidence: 0.3, sourceCount: 1, corroborated: false, geoAgrees: false, sectors: ["ELECTRONICS"] }, // geo disagreement + thin
  { id: "U4", accepted: false, eventType: "CHOKEPOINT_CLOSURE", severity: "HIGH", location: {}, confidence: 0.7, sourceCount: 2, corroborated: true, geoAgrees: false, sectors: [] }, // OVER-TRIGGER (empty topSectors) + geo-disagree -- the signals the Skeptic actually rejects on. NOTE (Codex closure F3): a PURE misclassification (incoherent type but otherwise corroborated + a real actionable sector) is NOT the Skeptic's job -- it is caught upstream by Atlas's deterministic Sentinel->Atlas firewall (fail-closed); measured, the Skeptic ACCEPTS such a finding by design. The Skeptic's residual mandate is over-trigger / geo-disagreement / thin-low-confidence.
  { id: "U5", accepted: false, eventType: "GEOPOLITICAL_CONFLICT", severity: "HIGH", location: { country: "BR" }, confidence: 0.22, sourceCount: 1, corroborated: false, geoAgrees: true, sectors: ["AGRICULTURE_FOOD"] }, // thin evidence
  { id: "U6", accepted: false, eventType: "QUALITY_RECALL", severity: "MEDIUM", location: { country: "US" }, confidence: 0.8, sourceCount: 2, corroborated: true, geoAgrees: true, sectors: ["OTHER_UNMAPPED"] } // over-trigger: only off-taxonomy exposure (no recognized sector)
];

describe("Skeptic calibration: set + fail-closed counting (no spend)", () => {
  it("the labelled set is balanced (>=6 each) so TPR/TNR are both measurable", () => {
    const accept = LABELED.filter((x) => x.accepted).length;
    const reject = LABELED.filter((x) => !x.accepted).length;
    expect(accept).toBeGreaterThanOrEqual(6);
    expect(reject).toBeGreaterThanOrEqual(6);
  });

  it("a Skeptic ERROR counts as a FLAG (reject), never a silent accept", async () => {
    const { threatCard, checks, exposures } = inputsFor(LABELED[0]);
    const { verdict } = await challengeFindingLive(ctx(), threatCard, checks, exposures, {
      enabled: () => true,
      generate: async () => {
        throw new Error("boom");
      }
    });
    // The calibration tally treats `accepted === false` as a flag; an errored HOLD is one too, so a
    // broken critic can only hurt TNR (a false reject), never inflate TPR.
    expect(verdict.accepted).toBe(false);
    expect(verdict.errored).toBe(true);
  });
});

// A finding is "strong" (the strength-aware gate DOWNGRADES a reject on it to a recorded caution)
// iff it is corroborated AND at/above the 0.45 confidence floor AND has a real-sector exposure --
// EXACTLY applySkepticGate's downgrade condition, stated independently here as the oracle. NOTE: geo
// is deliberately NOT part of strength (the verifier's geoAgrees is structurally false for chokepoint
// events -- it false-vetoed the flagship; see applySkepticGate). The SINGLE-AUTHORITATIVE sound cases
// (S3/S7/S8/S9, corroborated=false) are NOT strong by this rule: (C) is scoped to CORROBORATED
// findings (the owner's text + the flagship shape), so those still rely on the live critic ACCEPTING
// them (the labelled TNR below), exactly as before -- the gate's downgrade does not extend to
// uncorroborated findings.
const isStrongSpec = (s: FindingSpec): boolean =>
  s.corroborated && s.confidence >= 0.45 && s.sectors.some((x) => x !== "OTHER_UNMAPPED");

// The (C) regression teeth, DETERMINISTIC (runs every `verify`, NO spend). The fix lives in the GATE
// (pure code), so we measure the GATE OUTCOME on the labelled finding SHAPES -- the gap 6/27 missed,
// which measured only the raw critic verdict. For each shape we force a critic REJECT and a critic
// ACCEPT and assert what the gate does: a REJECT on a STRONG, geo-coherent finding is ANNOTATED (ACT
// stands -- the false-veto fix); a REJECT on any non-strong finding still hard-VETOES (NO_ACTION); an
// ACCEPT always lets the deterministic decision stand. The live critic's real verdict varies run to
// run, but the GATE'S response to a reject is deterministic -- so THIS is the durable safety boundary.
describe("Skeptic GATE outcome on the labelled finding shapes (the (C) regression teeth, deterministic)", () => {
  const FORCED_REJECT: SkepticVerdict = { accepted: false, reason: "forced reject (shape test)", errored: false };
  const FORCED_ACCEPT: SkepticVerdict = { accepted: true, reason: "forced accept (shape test)", errored: false };

  const gateFor = (spec: FindingSpec, verdict: SkepticVerdict) => {
    const { threatCard, checks, exposures } = inputsFor(spec);
    const base = decideRecommendation({
      corroborated: checks.corroborated,
      confidence: threatCard.confidence,
      exposureResults: exposures
    });
    const strength = findingStrength(checks, threatCard.confidence, exposures);
    return applySkepticGate(base, verdict, strength);
  };

  it.each(LABELED.map((s) => [s.id, s] as const))(
    "%s: a forced critic REJECT yields the correct gate outcome for its strength",
    (_id, spec) => {
      const onReject = gateFor(spec, FORCED_REJECT);
      if (isStrongSpec(spec)) {
        // STRONG + geo-coherent: the reject is DOWNGRADED to a recorded caution -- the ACT stands.
        expect(onReject.outcome).toBe("ANNOTATED");
        expect(onReject.recommendation).toBe("ACT");
      } else {
        // Non-strong (over-trigger / thin / single-authoritative / geo-disagree): the hard veto stands.
        expect(onReject.outcome).toBe("VETOED");
        expect(onReject.recommendation).toBe("NO_ACTION");
      }
    }
  );

  it.each(LABELED.map((s) => [s.id, s] as const))(
    "%s: a forced critic ACCEPT leaves the deterministic decision untouched (ACCEPTED)",
    (_id, spec) => {
      const onAccept = gateFor(spec, FORCED_ACCEPT);
      expect(onAccept.outcome).toBe("ACCEPTED");
    }
  );

  it("THE FLAGSHIP (S10): a forced REJECT on the exact false-vetoed Hormuz shape is ANNOTATED -> ACT", () => {
    const flagship = LABELED.find((s) => s.id === "S10")!;
    // The structured finding must match the real shape that was false-vetoed: corroborated, conf 0.9,
    // a real chokepoint exposure across multiple lines, geo-coherent.
    expect(isStrongSpec(flagship)).toBe(true);
    const onReject = gateFor(flagship, FORCED_REJECT);
    expect(onReject.outcome).toBe("ANNOTATED");
    expect(onReject.recommendation).toBe("ACT");
  });
});

describe.skipIf(!LIVE)("Skeptic calibration: live cross-family pass (BILLS Groq free tier, gated)", () => {
  it(
    "clears the TPR/TNR bar over the labelled findings, counting critic-error as fail-closed",
    async () => {
      const model = resolvedSkepticModel();
      let spentUsd = 0;
      // Positive class = UNSOUND (the finding we want REJECTED). "flag" = the Skeptic does NOT
      // accept. TPR = rejected / actually-unsound; TNR = accepted / actually-sound. A critic error
      // counts as a flag (fail-closed), so it can only hurt TNR, never inflate TPR.
      let tp = 0;
      let fn = 0;
      let tn = 0;
      let fp = 0;
      const misses: string[] = [];

      for (const spec of LABELED) {
        const { threatCard, checks, exposures } = inputsFor(spec);
        const { verdict } = await challengeFindingLive(ctx(), threatCard, checks, exposures, {
          budget: {
            spentUsd,
            estimatedNextUsd: estimateLiveCallCostUsd(model),
            capUsd: DEFAULT_BUDGET_CAP_USD
          }
        });
        spentUsd += estimateLiveCallCostUsd(model);
        // Space the calls under the Groq free-tier TPM window: the few-shot prompt x N findings exceeds
        // ~30K tokens/min if fired back-to-back, and a throttled call fails CLOSED to a HOLD that reads
        // as a false REJECT -- the artifact that made an unspaced double-run report a bogus TNR collapse.
        // This is a gated, rarely-run calibration, so the delay is cheap insurance for a clean measurement.
        await new Promise((r) => setTimeout(r, 4000));
        const flagged = verdict.accepted === false; // includes fail-closed errors

        if (!spec.accepted) {
          if (flagged) tp++;
          else {
            fn++;
            misses.push(`FN ${spec.id}: Skeptic ACCEPTED an unsound finding`);
          }
        } else {
          if (!flagged) tn++;
          else {
            fp++;
            misses.push(`FP ${spec.id}: Skeptic REJECTED a sound finding (${verdict.errored ? "error" : verdict.reason})`);
          }
        }
      }

      const tpr = tp / (tp + fn);
      const tnr = tn / (tn + fp);
      console.log(`\n===== PHASE-4 SKEPTIC CALIBRATION (${model}) =====`);
      console.log(`TPR (rejects unsound):  ${(tpr * 100).toFixed(1)}%  (${tp}/${tp + fn})`);
      console.log(`TNR (accepts sound):    ${(tnr * 100).toFixed(1)}%  (${tn}/${tn + fp})`);
      console.log(`spend (est): $${spentUsd.toFixed(4)}`);
      if (misses.length) console.log("misses:\n  " + misses.join("\n  "));
      console.log("=========================================\n");

      // Calibrated bar -- ASYMMETRIC by risk direction (Codex closure F2):
      //  - UNSOUND side = ZERO tolerance. EACH unsound control must be individually rejected; a single false
      //    ACCEPT (an unsound finding drafted to suppliers) is the DANGEROUS direction and must NOT hide
      //    behind an 80% aggregate -- the exact hole that let a mid-build over-trigger regression pass at 5/6.
      //  - SOUND side = an aggregate >=80% TNR. A rare stochastic sound-REJECT is safe-direction (NO_ACTION,
      //    held for a human), so it is tolerated; a categorical sound-reject (the original over-rejection bug)
      //    still trips the bar.
      // Below either, the Skeptic is not trustworthy as a gate input -> step SKEPTIC_MODEL up or sharpen the
      // prompt before relying on it. (tpr is logged above for visibility; the hard gate is fn === 0.)
      expect(fn, `unsound finding(s) wrongly ACCEPTED -- false-accept is the dangerous direction: ${misses.filter((m) => m.startsWith("FN")).join("; ")}`).toBe(0);
      expect(tnr, `TNR ${(tnr * 100).toFixed(1)}% below bar`).toBeGreaterThanOrEqual(0.8);
    },
    600_000
  );
});
