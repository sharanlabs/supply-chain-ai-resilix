import { describe, expect, it } from "vitest";

import { challengeFindingLive, resolvedSkepticModel } from "@/lib/agents/actionops/skeptic";
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

  // --- UNSOUND (reject) ---
  { id: "U1", accepted: false, eventType: "CHOKEPOINT_CLOSURE", severity: "CRITICAL", location: { country: "OM", chokepoint: "Strait of Hormuz" }, confidence: 0.85, sourceCount: 3, corroborated: true, geoAgrees: true, sectors: [] }, // over-trigger: NO actionable exposure
  { id: "U2", accepted: false, eventType: "PORT_DISRUPTION", severity: "MEDIUM", location: { country: "US" }, confidence: 0.18, sourceCount: 1, corroborated: false, geoAgrees: false, sectors: ["LOGISTICS"] }, // thin evidence: lone, uncorroborated, low-confidence
  { id: "U3", accepted: false, eventType: "NATURAL_DISASTER", severity: "HIGH", location: { country: "JP" }, confidence: 0.3, sourceCount: 1, corroborated: false, geoAgrees: false, sectors: ["ELECTRONICS"] }, // geo disagreement + thin
  { id: "U4", accepted: false, eventType: "CHOKEPOINT_CLOSURE", severity: "HIGH", location: {}, confidence: 0.7, sourceCount: 2, corroborated: true, geoAgrees: false, sectors: [] }, // misclassification: a chokepoint closure with no chokepoint and no exposure
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

      // Calibrated bar: reject >=80% of unsound findings AND keep sound-finding false-rejects low
      // (>=80% TNR). Below this the Skeptic is not trustworthy as a gate input -> step the model up
      // (SKEPTIC_MODEL=a stronger Groq model) or sharpen the prompt before relying on it.
      expect(tpr, `TPR ${(tpr * 100).toFixed(1)}% below bar`).toBeGreaterThanOrEqual(0.8);
      expect(tnr, `TNR ${(tnr * 100).toFixed(1)}% below bar`).toBeGreaterThanOrEqual(0.8);
    },
    600_000
  );
});
