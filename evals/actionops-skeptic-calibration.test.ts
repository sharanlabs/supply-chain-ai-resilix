import { describe, expect, it } from "vitest";

import {
  applySkepticGate,
  challengeFindingLive,
  findingStrength,
  resolvedSkepticModel,
  type SkepticVerdict
} from "@/lib/agents/actionops/skeptic";
import { decideRecommendation } from "@/lib/agents/actionops/recommendation";
import type { GeoStatus, VerifierChecks } from "@/lib/agents/actionops/verifier";
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
// actionable exposure / geo CONFLICT -- named country contradicted by the sources), THIN EVIDENCE
// (lone uncorroborated low-confidence), and MISCLASSIFICATION cases should REJECT.
type FindingSpec = {
  id: string;
  accepted: boolean;
  eventType: string;
  severity: ThreatCard["severity"];
  location: ThreatCard["location"];
  confidence: number;
  sourceCount: number;
  corroborated: boolean;
  geo: GeoStatus; // AGREES | UNCONFIRMED (no single country, e.g. chokepoint) | CONFLICT (sources name a different country)
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
    geo: s.geo
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
  { id: "S1", accepted: true, eventType: "CHOKEPOINT_CLOSURE", severity: "HIGH", location: { country: "OM", chokepoint: "Strait of Hormuz" }, confidence: 0.82, sourceCount: 3, corroborated: true, geo: "AGREES", sectors: ["ENERGY", "LOGISTICS"] },
  { id: "S2", accepted: true, eventType: "NATURAL_DISASTER", severity: "HIGH", location: { country: "US" }, confidence: 0.78, sourceCount: 2, corroborated: true, geo: "AGREES", sectors: ["ELECTRONICS"] },
  { id: "S3", accepted: true, eventType: "SUPPLIER_BANKRUPTCY", severity: "HIGH", location: { country: "DE" }, confidence: 0.8, sourceCount: 1, corroborated: false, geo: "AGREES", sectors: ["AUTOMOTIVE"] }, // single AUTHORITATIVE source still acts
  { id: "S4", accepted: true, eventType: "TARIFF_DEADLINE", severity: "MEDIUM", location: { country: "CN" }, confidence: 0.74, sourceCount: 3, corroborated: true, geo: "AGREES", sectors: ["TEXTILES_APPAREL"] },
  { id: "S5", accepted: true, eventType: "MATERIAL_SHORTAGE_ALLOCATION", severity: "HIGH", location: { country: "TW" }, confidence: 0.76, sourceCount: 2, corroborated: true, geo: "AGREES", sectors: ["SEMICONDUCTORS"] },
  { id: "S6", accepted: true, eventType: "ROUTE_DIVERSION", severity: "MEDIUM", location: { country: "EG" }, confidence: 0.71, sourceCount: 2, corroborated: true, geo: "AGREES", sectors: ["LOGISTICS"] },
  // Single-AUTHORITATIVE high-confidence cases (sourceCount 1, corroborated=false). The design's stated
  // differentiator -- "unverified, not raw source count; a single AUTHORITATIVE source acts" (an official
  // NWS warning, a confirmed recall). decideRecommendation ACTs on these (confidence >= 0.45); the Skeptic
  // MUST NOT over-reject them on corroboration alone. Probing this class ONCE (S3) hid a categorical
  // over-rejection behind an 83% PASS, so the set deliberately carries THREE now (S3/S7/S8) as the
  // regression teeth (gates/agentic-rework/PHASE4-SKEPTIC-CALIBRATION.md).
  { id: "S7", accepted: true, eventType: "NATURAL_DISASTER", severity: "HIGH", location: { country: "US" }, confidence: 0.88, sourceCount: 1, corroborated: false, geo: "AGREES", sectors: ["ELECTRONICS"] }, // official NWS hurricane warning: single AUTHORITATIVE source acts
  { id: "S8", accepted: true, eventType: "QUALITY_RECALL", severity: "HIGH", location: { country: "US" }, confidence: 0.82, sourceCount: 1, corroborated: false, geo: "AGREES", sectors: ["AGRICULTURE_FOOD"] }, // confirmed official recall: single AUTHORITATIVE source acts
  // Gray-band single source (Codex closure F1): a single, UNCORROBORATED, MEDIUM-confidence finding with a
  // real exposure. decideRecommendation ACTs on this (confidence >= the 0.45 floor), so the Skeptic must NOT
  // be MORE conservative than the deterministic policy here -- aligning to that floor, not re-litigating the
  // confidence axis, is the whole point of the fix. Measured boundary ~0.55-0.60; 0.70 sits clearly above it.
  { id: "S9", accepted: true, eventType: "SUPPLIER_BANKRUPTCY", severity: "HIGH", location: { country: "DE" }, confidence: 0.7, sourceCount: 1, corroborated: false, geo: "AGREES", sectors: ["AUTOMOTIVE"] }, // gray-band single source -- consistent with decideRecommendation's floor
  // S10 = the FLAGSHIP SHAPE: the EXACT structured finding the LIVE Skeptic FALSE-VETOED, reproduced
  // from the 2026-06-28 live diagnostic -- confidence 0.9, 9 exposures (CHEMICALS/ENERGY), corroborated
  // (3 sources), CHOKEPOINT_CLOSURE, and CRITICALLY: location has NO country (region + chokepoint only),
  // so its geo is UNCONFIRMED (no single country to match), NOT a disagreement -- the old boolean
  // geoAgrees collapsed both to "false", which is precisely what made an earlier draft's geo veto
  // re-break the flagship. The 6/27 set carried only conf-0.82/2-sector S1 (WITH a country), which did
  // NOT reproduce the real finding -- so the labelled TPR/TNR read 100% while the real flagship refused
  // itself. This closes the set-vs-real gap (gates/agentic-rework/PHASE4-SKEPTIC-CALIBRATION.md,
  // 2026-06-28). It is the STRONG (corroborated, geo UNCONFIRMED) shape the strength-aware GATE
  // downgrades-not-vetoes -- proven by the deterministic gate-outcome teeth below regardless of how the
  // live critic scores it. With the UNCONFIRMED-vs-CONFLICT split + prompt fix, the LIVE critic should
  // now ACCEPT it (geo UNCONFIRMED is explicitly neutral) -- the goal that lets the flagship read "cleared".
  { id: "S10", accepted: true, eventType: "CHOKEPOINT_CLOSURE", severity: "CRITICAL", location: { region: "Middle East", chokepoint: "Strait of Hormuz" }, confidence: 0.9, sourceCount: 3, corroborated: true, geo: "UNCONFIRMED", sectors: ["ENERGY", "CHEMICALS", "ENERGY", "CHEMICALS", "ENERGY", "CHEMICALS", "LOGISTICS", "ENERGY", "CHEMICALS"] },

  // --- UNSOUND (reject) ---
  { id: "U1", accepted: false, eventType: "CHOKEPOINT_CLOSURE", severity: "CRITICAL", location: { country: "OM", chokepoint: "Strait of Hormuz" }, confidence: 0.85, sourceCount: 3, corroborated: true, geo: "AGREES", sectors: [] }, // over-trigger: NO actionable exposure
  { id: "U2", accepted: false, eventType: "PORT_DISRUPTION", severity: "MEDIUM", location: { country: "US" }, confidence: 0.18, sourceCount: 1, corroborated: false, geo: "UNCONFIRMED", sectors: ["LOGISTICS"] }, // thin evidence: lone, uncorroborated, low-confidence (geo unconfirmed -- the lone source carries no country)
  { id: "U3", accepted: false, eventType: "NATURAL_DISASTER", severity: "HIGH", location: { country: "JP" }, confidence: 0.3, sourceCount: 1, corroborated: false, geo: "CONFLICT", sectors: ["ELECTRONICS"] }, // geo CONFLICT (named JP, sources name a different country) + thin
  { id: "U4", accepted: false, eventType: "CHOKEPOINT_CLOSURE", severity: "HIGH", location: {}, confidence: 0.7, sourceCount: 2, corroborated: true, geo: "UNCONFIRMED", sectors: [] }, // OVER-TRIGGER (empty topSectors) -- the decisive reject signal here is the EMPTY exposure, NOT geo (no country => UNCONFIRMED, neutral). NOTE (Codex closure F3): a PURE misclassification (incoherent type but otherwise corroborated + a real actionable sector) is NOT the Skeptic's job -- it is caught upstream by Atlas's deterministic Sentinel->Atlas firewall (fail-closed); measured, the Skeptic ACCEPTS such a finding by design. The Skeptic's residual mandate is over-trigger / geo-CONFLICT / thin-low-confidence.
  { id: "U5", accepted: false, eventType: "GEOPOLITICAL_CONFLICT", severity: "HIGH", location: { country: "BR" }, confidence: 0.22, sourceCount: 1, corroborated: false, geo: "AGREES", sectors: ["AGRICULTURE_FOOD"] }, // thin evidence
  { id: "U6", accepted: false, eventType: "QUALITY_RECALL", severity: "MEDIUM", location: { country: "US" }, confidence: 0.8, sourceCount: 2, corroborated: true, geo: "AGREES", sectors: ["OTHER_UNMAPPED"] }, // over-trigger: only off-taxonomy exposure (no recognized sector)
  // U7 = the GENUINE GEO-CONFLICT case (new with the UNCONFIRMED-vs-CONFLICT split; closes Codex's
  // deferred [P1] #2). Otherwise ACT-worthy -- corroborated (3 sources), high confidence (0.82), a
  // real ELECTRONICS exposure -- BUT the finding names JP while every corroborating source resolves to
  // a DIFFERENT country (geo CONFLICT), a likely misclassification the critic SHOULD reject. The scope
  // (C)+(A) close is the DOWNGRADE gap: a critic REJECT on U7 now HARD-VETOES (geoConflict => non-strong)
  // rather than being downgraded to a caution like the UNCONFIRMED flagship S10 -- that is exactly what
  // [P1] #2 asked for, and the deterministic teeth below prove it (forced REJECT on U7 -> VETOED, on S10
  // -> ANNOTATED). NOTE the scope boundary (honest): the gate does NOT veto a CONFLICT independently of
  // the critic -- a critic ACCEPT on U7 lets it ACT (the forced-ACCEPT teeth allow it), gated by the
  // mandatory human approval like any ACCEPTED finding. Empirically the live critic REJECTS this shape
  // (the labelled TPR below counts U7), so the accept-a-conflict path is rare; making CONFLICT a
  // critic-INDEPENDENT deterministic veto is a separate, owner-gated hardening, not claimed here.
  { id: "U7", accepted: false, eventType: "NATURAL_DISASTER", severity: "HIGH", location: { country: "JP" }, confidence: 0.82, sourceCount: 3, corroborated: true, geo: "CONFLICT", sectors: ["ELECTRONICS"] }
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
    // This asserts PRODUCTION behaviour only: a broken critic must HOLD, never silently accept.
    //
    // CORRECTED 2026-07-27. This comment previously read "the calibration tally treats
    // `accepted === false` as a flag; an errored HOLD is one too, so a broken critic can only hurt
    // TNR, never inflate TPR." That claim about the TALLY was mathematically FALSE (Codex [High]) --
    // an errored HOLD WAS being counted as a true positive, so a critic that threw on every unsound
    // control reported TPR 100% with zero real detections. The tally now buckets errors separately
    // (see the live calibration below). The `errored` flag on the verdict is still exactly what
    // makes that bucketing possible, which is why this test matters.
    expect(verdict.accepted).toBe(false);
    expect(verdict.errored).toBe(true);
  });

  // ROUTE-BACK 1 DISCHARGE (acceptance-gate, 2026-07-28) -- the discriminating control the previous
  // round lacked. With `errors === 0`, the OLD (broken) tally and the NEW (bucketed) tally produce
  // IDENTICAL numbers: tp=7, tn=10, fn=0, fp=0. So the live re-measurement could NOT distinguish a
  // fixed implementation from the broken one, and the two new teeth were vacuously satisfied. That
  // is precisely the failure lesson L-5 names -- "a defensive branch that has never been OBSERVED
  // firing is untested code on the exact path you claim to have secured."
  //
  // This drives an ERROR through the SAME classification the live loop uses, deterministically and
  // at $0, and asserts the three properties that separate the fixed tally from the broken one.
  it("an ERRORED verdict is bucketed as an error -- NOT counted as a detection (L-4 regression)", async () => {
    const unsound = LABELED.find((s) => !s.accepted);
    expect(unsound, "the labelled set must contain an unsound control").toBeDefined();

    const { threatCard, checks, exposures } = inputsFor(unsound!);
    const { verdict } = await challengeFindingLive(ctx(), threatCard, checks, exposures, {
      enabled: () => true,
      generate: async () => {
        throw new Error("simulated critic outage");
      }
    });

    // Drive the REAL shared classifier -- the SAME function the gated live pass calls. Not a copy:
    // an earlier version of this test re-implemented the branch inline and therefore compared a copy
    // against itself (f(x)===f(x)), so mutating the live loop left it green. Calling the shared
    // function is what gives this test teeth over the live path.
    const tally = emptyTally();
    classifyCalibrationVerdict(unsound!, verdict, tally);

    // 1. The error is bucketed, not scored.
    expect(tally.errors).toBe(1);
    // 2. It did NOT become a true positive. Under the OLD tally this was tp === 1 -- the whole bug.
    expect(tally.tp).toBe(0);
    // 3. The unsound control is recorded as having ERRORED rather than detected, which is what makes
    //    `expect(erroredUnsound).toEqual([])` in the live pass a real gate instead of a vacuous one:
    //    a critic that errors on every unsound item now FAILS there.
    expect(tally.erroredUnsound).toEqual([unsound!.id]);
    // 4. And it is NOT silently dropped: the miss list names it, so an errored control can never
    //    vanish from the report the way an unbucketed error used to vanish into `tp`.
    expect(tally.misses.join(" ")).toContain(`ERR ${unsound!.id}`);
  });

  // The complement: a NON-errored genuine reject on the same unsound spec MUST still score as a
  // true positive. Without this, "bucket the errors" could be satisfied by a classifier that scores
  // nothing at all -- the mirror of the bug being fixed.
  it("a genuine (non-errored) REJECT on an unsound control still scores as a detection", () => {
    const unsound = LABELED.find((s) => !s.accepted);
    const tally = emptyTally();
    classifyCalibrationVerdict(
      unsound!,
      { accepted: false, errored: false, reason: "genuinely rejected" },
      tally
    );
    expect(tally.tp).toBe(1);
    expect(tally.errors).toBe(0);
    expect(tally.erroredUnsound).toEqual([]);
  });
});

// A finding is "strong" (the strength-aware gate DOWNGRADES a reject on it to a recorded caution)
// iff it is corroborated AND at/above the 0.45 confidence floor AND has a real-sector exposure AND
// has NO real geo CONFLICT -- EXACTLY applySkepticGate's downgrade condition, stated independently
// here as the oracle (keep the two in LOCKSTEP). NOTE on geo: only a real CONFLICT (named country
// contradicted by the sources) disqualifies strength; UNCONFIRMED (the verifier's structurally-empty
// geo for a chokepoint, which false-vetoed the flagship) does NOT -- that is the whole point of the
// UNCONFIRMED-vs-CONFLICT split. The SINGLE-AUTHORITATIVE sound cases (S3/S7/S8/S9, corroborated=false)
// are NOT strong by this rule: (C) is scoped to CORROBORATED findings (the owner's text + the flagship
// shape), so those still rely on the live critic ACCEPTING them (the labelled TNR below), exactly as
// before -- the gate's downgrade does not extend to uncorroborated findings.
const isStrongSpec = (s: FindingSpec): boolean =>
  s.corroborated &&
  s.confidence >= 0.45 &&
  s.sectors.some((x) => x !== "OTHER_UNMAPPED") &&
  s.geo !== "CONFLICT";

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
        // Non-strong (over-trigger / thin / single-authoritative / geo-CONFLICT): the hard veto stands.
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

// THE SHARED CALIBRATION TALLY -- ONE implementation, called by BOTH the gated live pass and the
// deterministic regression test below.
//
// WHY IT EXISTS (acceptance-gate route-back, 2026-07-28): the first attempt to prove the L-4 fix
// added a deterministic test that RE-IMPLEMENTED this branch inline. That test compared a copy
// against itself -- the repo's own f(x)===f(x) failure -- so mutating the LIVE loop left it green,
// and its "negative control" only ever proved that the copy discriminated. The live loop also sits
// behind `describe.skipIf(!LIVE)`, so `npm run verify` never executes it; without extraction there
// was NO deterministic guard on the classification at all.
//
// Now there is exactly one classifier. Mutating it to the pre-fix form (drop the `errored` branch
// and let `flagged = verdict.accepted === false` swallow errors) turns the deterministic test RED.
// That is the property the previous round claimed but could not deliver.
export type CalibrationTally = {
  tp: number;
  fn: number;
  tn: number;
  fp: number;
  errors: number;
  erroredUnsound: string[];
  misses: string[];
};

export function emptyTally(): CalibrationTally {
  return { tp: 0, fn: 0, tn: 0, fp: 0, errors: 0, erroredUnsound: [], misses: [] };
}

// Classify ONE labelled finding's verdict into the tally, in place.
//
// An ERRORED verdict is NOT a judgement -- it is the critic failing. It is bucketed separately and
// kept out of every rate (EV-09 shape, mirroring the judge harness). Production behaviour is
// unchanged and still fail-closed: a broken critic HOLDs the finding. What changes is that a
// failure can no longer MASQUERADE as a detection in the metric.
export function classifyCalibrationVerdict(
  spec: { id: string; accepted: boolean },
  verdict: Pick<SkepticVerdict, "accepted" | "errored" | "reason">,
  tally: CalibrationTally
): void {
  if (verdict.errored) {
    tally.errors++;
    if (!spec.accepted) tally.erroredUnsound.push(spec.id);
    tally.misses.push(
      `ERR ${spec.id} (${spec.accepted ? "sound" : "unsound"}): critic ERRORED -- excluded from TPR/TNR`
    );
    return;
  }

  const flagged = verdict.accepted === false; // a real, non-errored REJECT

  if (!spec.accepted) {
    if (flagged) tally.tp++;
    else {
      tally.fn++;
      tally.misses.push(`FN ${spec.id}: Skeptic ACCEPTED an unsound finding`);
    }
  } else {
    if (!flagged) tally.tn++;
    else {
      tally.fp++;
      tally.misses.push(`FP ${spec.id}: Skeptic REJECTED a sound finding (${verdict.reason})`);
    }
  }
}

describe.skipIf(!LIVE)("Skeptic calibration: live cross-family pass (BILLS Groq free tier, gated)", () => {
  it(
    "clears the TPR/TNR bar over the labelled findings, counting critic-error as fail-closed",
    async () => {
      const model = resolvedSkepticModel();
      let spentUsd = 0;
      // Positive class = UNSOUND (the finding we want REJECTED). TPR = rejected / actually-unsound;
      // TNR = accepted / actually-sound.
      //
      // ⚠ CORRECTED 2026-07-27 (Codex cross-model [High]). The previous comment here claimed "a
      // critic error counts as a flag (fail-closed), so it can only hurt TNR, never inflate TPR."
      // That was MATHEMATICALLY FALSE and it is the exact opposite of the truth. A fail-closed error
      // sets accepted=false, and the old code classified any accepted===false on an unsound item as
      // a TRUE POSITIVE -- so a critic that THREW on all seven unsound cases reported **TPR 100%
      // with zero genuine detections**. The metric that was supposed to prove the critic works could
      // be satisfied by a critic that does not work at all. The judge harness already had the right
      // shape (a separate `errors` bucket, EV-09); this one did not.
      //
      // Errors are now their OWN bucket, excluded from every rate, and bounded by an explicit
      // error-rate ceiling so exclusion cannot become a loophole. In addition, every unsound control
      // must earn a NON-ERRORED rejection -- an error is not a detection, and TPR must be a claim
      // about judgement, never about failure.
      // ONE shared tally + ONE shared classifier (see classifyCalibrationVerdict above). The
      // deterministic regression test calls the SAME function, so mutating it fails that test --
      // which is what makes this live pass's numbers trustworthy rather than merely reported.
      const tally = emptyTally();

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
        // Space the calls under the Groq free-tier TPM window. A throttled (429) call fails CLOSED
        // to a HOLD, which this harness then scores as a false REJECT -- so an under-spaced run
        // reports a bogus TNR collapse and slanders a healthy critic.
        //
        // RE-CALIBRATED 2026-07-27 (L-1): 4,000ms was sized for llama-4-scout's ~30K TPM allowance.
        // The gpt-oss models cap at 8,000 TPM on this key, and Groq reserves
        // `input + max_completion_tokens` per call (~1,421 + 1,200 = ~2,621 here -- SUPERSEDED
        // 2026-07-28: measured in=1,373 -> ~2,573; the 20s spacing below stays because the larger
        // figure is the CONSERVATIVE direction, and both give ~3 calls/min), so the window
        // sustains only ~3 calls/minute => ~20s between calls. At 4s the suite measured TNR 40%,
        // then 80% with 6 and 2 misses respectively -- EVERY miss tagged "(error)", i.e. the
        // instrument was measuring its own throttling, not the Skeptic's judgement.
        //
        // This is a gated, rarely-run calibration, so the wall-clock cost is the right trade for a
        // measurement that means what it says. Re-derive if the model, its TPM tier, the prompt
        // size, or SKEPTIC_MAX_OUTPUT_TOKENS changes.
        await new Promise((r) => setTimeout(r, 20_000));
        classifyCalibrationVerdict(spec, verdict, tally);
      }

      const { tp, fn, tn, fp, errors, erroredUnsound, misses } = tally;

      // Rates are computed over NON-ERRORED verdicts only. `|| 0` guards the degenerate case where
      // every item of a class errored: that must read as 0%, never NaN (a NaN silently passes a
      // `>=` assertion in JS -- another way a broken critic could slip the bar).
      const tpr = tp + fn > 0 ? tp / (tp + fn) : 0;
      const tnr = tn + fp > 0 ? tn / (tn + fp) : 0;
      const errorRate = errors / LABELED.length;
      console.log(`\n===== PHASE-4 SKEPTIC CALIBRATION (${model}) =====`);
      console.log(`TPR (rejects unsound):  ${(tpr * 100).toFixed(1)}%  (${tp}/${tp + fn})   [non-errored only]`);
      console.log(`TNR (accepts sound):    ${(tnr * 100).toFixed(1)}%  (${tn}/${tn + fp})   [non-errored only]`);
      console.log(`errors (excluded):      ${errors}/${LABELED.length}`);
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

      // ADDED 2026-07-27 (Codex cross-model [High]) -- the teeth that close the "an error looked
      // like a detection" hole:
      //  (a) EVERY unsound control must earn a REAL, non-errored rejection. Without this, a critic
      //      that errored on all seven unsound items would still satisfy `fn === 0` (an error is
      //      not an ACCEPT), so the zero-tolerance gate above could be cleared by a critic that
      //      never actually judged anything.
      //  (b) A bounded error rate, so excluding errors from the rates cannot become a loophole
      //      (the EV-09 rule the judge harness already enforced).
      expect(
        erroredUnsound,
        `unsound control(s) ERRORED instead of being genuinely rejected -- an error is NOT a detection: ${erroredUnsound.join(", ")}`
      ).toEqual([]);
      expect(
        errorRate,
        `critic error rate ${errors}/${LABELED.length} too high -- unreliable as a gate input regardless of how the completed calls scored`
      ).toBeLessThanOrEqual(0.1);
    },
    600_000
  );
});
