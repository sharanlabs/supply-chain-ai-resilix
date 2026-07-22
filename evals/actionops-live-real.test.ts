import { describe, expect, it } from "vitest";

import { buildDecisionPacket } from "@/lib/pipeline/build-packet";
import { ACTIONOPS_SCENARIOS, getActionOpsScenario } from "@/lib/data/actionops-scenarios";
import { describeFailures, runGraders } from "@/lib/evals/run-graders";
import type { ScenarioGroundTruth, SimInputs } from "@/lib/evals/graders";
import { judgeNoUnsupportedClaims, resolvedJudgeModel } from "@/lib/evals/judge";
import { ACTION_CONFIDENCE_FLOOR } from "@/lib/agents/actionops/recommendation";
import { estimateLiveCallCostUsd } from "@/lib/agents/run";
import { DEFAULT_BUDGET_CAP_USD } from "@/lib/agents/budget";
import { agentLoopEnabled } from "@/lib/server/env-flags";
import { KNOWN_PRODUCT_IDS, KNOWN_SUPPLIER_IDS } from "@/evals/golden/seed-ids";
import type { DecisionPacketV2 } from "@/lib/schemas";

// D.9 LIVE eval -- GATED (RUN_LIVE_AI_TESTS=true) because it BILLS. Runs EVERY production
// scenario live and asserts the Success_Criteria "live mode is genuinely live" + "<=$5" +
// "<5 min" rows on REAL Gemini output, plus the per-scenario coherence (the live Sentinel
// classifies THIS scenario's disruption, not a generic one). Run:
//   ENABLE_LIVE_AI=true RUN_LIVE_AI_TESTS=true \
//     node --env-file=.env node_modules/vitest/vitest.mjs run evals/actionops-live-real.test.ts
// The key is loaded by --env-file (never printed).
//
// Ground truth is reconstructed per scenario from a DETERMINISTIC run (Atlas/Simulator are
// not LLMs -> identical live vs key-OFF), so the exposure + simulation graders keep real
// teeth over the live output without importing the golden oracle.

const LIVE = process.env.RUN_LIVE_AI_TESTS === "true";
const FIVE_MIN_MS = 5 * 60 * 1000;

// The eventType each scenario's live Sentinel SHOULD land on (coherence). The off-taxonomy
// control maps to OTHER_UNMAPPED by design; the live Sentinel is stochastic, so this drives
// an eyeball log + a soft check, not a hard per-run assertion (a reasonable alternative
// classification must not flake the gate).
const EXPECTED_EVENT_TYPE: Record<string, string> = {
  "SCN-HORMUZ": "CHOKEPOINT_CLOSURE",
  "SCN-TARIFF": "TARIFF_DEADLINE",
  "SCN-REDSEA": "ROUTE_DIVERSION",
  "SCN-HURRICANE": "NATURAL_DISASTER",
  "SCN-BANKRUPTCY": "SUPPLIER_BANKRUPTCY",
  "SCN-ZERO-EXPOSURE": "PORT_DISRUPTION",
  "SCN-OFF-TAXONOMY": "OTHER_UNMAPPED",
  "SCN-THIN-EVIDENCE": "PORT_DISRUPTION"
};

function groundTruthFor(scenarioId: string, live: DecisionPacketV2, det: DecisionPacketV2): ScenarioGroundTruth {
  const scenario = getActionOpsScenario(scenarioId);
  const params = scenario.simulation;
  const simInputs: SimInputs | undefined = params
    ? {
        baseDateIso: live.createdAt, // the live run's own instant -> sim dates recompute to match
        durationDays: params.durationDays,
        affected: live.exposureResults.map((e) => ({
          supplierId: e.supplierId,
          dailyRevenueUsd: params.dailyRevenueUsdPerSupplier
        })),
        horizonDays: params.horizonDays,
        inventory: params.inventory
      }
    : undefined;

  return {
    knownSupplierIds: KNOWN_SUPPLIER_IDS as Set<string>,
    knownProductIds: KNOWN_PRODUCT_IDS as Set<string>,
    // The deterministic Atlas match IS the expected set (live Atlas is identical).
    expectedAffectedSupplierIds: new Set<string>(det.exposureResults.map((e) => e.supplierId)),
    evidenceAllowlist: new Set<string>([
      ...scenario.threat.evidenceUrls,
      ...live.publicSignals.map((s) => s.sourceUrl)
    ]),
    untrustedRawStrings: live.publicSignals.map((s) => s.summary),
    offTaxonomyExpected: scenario.offTaxonomy === true,
    simInputs
  };
}

const runById = (p: DecisionPacketV2, id: string) => p.agentRuns.find((r) => r.id === id);

describe.skipIf(!LIVE)("D.9 live Gemini pass -- all scenarios (BILLS, gated)", () => {
  for (const scenario of ACTIONOPS_SCENARIOS) {
    it(
      `${scenario.id} runs genuinely live, coherent, passes graders, under cap + 5 min`,
      async () => {
        const det = await buildDecisionPacket({ scenarioId: scenario.id, live: false });

        const startedAt = Date.now();
        // The cross-family Skeptic's REAL verdict quality is proven separately in
        // actionops-skeptic-calibration (gated). THIS suite is the GEMINI live pass: it needs a
        // Groq key for the judge below, which would also make the live Skeptic fire and could
        // stochastically HOLD a sound finding -- flaking the Sentinel/Strategist/Dispatcher LIVE_AI
        // and effectiveMode assertions. So we inject an in-pipeline ACCEPT to decouple this suite
        // from the Skeptic's stochastic verdict (the judge still runs on the real Groq key).
        const live = await buildDecisionPacket({
          scenarioId: scenario.id,
          live: true,
          skeptic: {
            generate: async () => ({
              object: { accepted: true, reason: "in-pipeline accept (Gemini live pass)" }
            })
          }
        });
        const wallClockMs = Date.now() - startedAt;

        const sentinel = runById(live, "RUN-SENTINEL");
        const strategist = runById(live, "RUN-STRATEGIST");
        const dispatcher = runById(live, "RUN-DISPATCHER");
        const hasExposures = live.exposureResults.length > 0;
        // The deterministic leg is the oracle for "is this a refusal scenario": Atlas +
        // the Verifier are not LLMs, and the thin-evidence scenario's confidence is fixed,
        // so a NO_ACTION here means the live leg SHOULD also refuse (confirmatory).
        const detRefuses = det.recommendation === "NO_ACTION";

        // --- Eyeball log (printed before assertions) ---
        console.log(`\n===== ${scenario.id} LIVE =====`);
        console.log(`threat: ${live.threatCard.eventType} (expected ~${EXPECTED_EVENT_TYPE[scenario.id]}) / ${live.threatCard.severity}`);
        console.log(`  ${live.threatCard.summary}`);
        console.log(`effectiveMode: ${live.effectiveMode}  exposures: ${live.exposureResults.length}  playbooks: ${live.playbooks.length}  drafts: ${live.supplierMessages.length}`);
        console.log(`cost: $${live.totalCostUsd?.toFixed(6)}  wall: ${(wallClockMs / 1000).toFixed(1)}s  gatekeeper: ${live.gatekeeper.status}`);
        for (const r of [sentinel, strategist, dispatcher]) {
          if (r) console.log(`  ${r.id.padEnd(15)} ${r.mode} ${r.errorClass ? "(" + r.errorClass + ")" : ""}${r.mode === "FAILED_TO_FALLBACK" ? " -- " + r.summary : ""}`);
        }

        // --- Hard invariants (Success_Criteria) ---
        // Sentinel ALWAYS runs live (it reads the signals). A silent FAILED fails the eval.
        expect(sentinel?.mode, `Sentinel: ${sentinel?.summary ?? ""}`).toBe("LIVE_AI");

        if (detRefuses) {
          // Refusal scenario (thin evidence). The live Sentinel still runs (asserted above),
          // but confidence is stochastic, so whether it ALSO refuses is a SOFT/confirmatory
          // check -- the deterministic NO_ACTION in actionops-no-action.test.ts is the gate.
          console.log(`  refusal scenario: live recommendation=${live.recommendation} confidence=${live.threatCard.confidence.toFixed(2)} (floor ${ACTION_CONFIDENCE_FLOOR})`);
          if (live.recommendation === "NO_ACTION") {
            // Confirmed: outbound action withheld, missing-evidence stated, drafts suppressed.
            expect(live.supplierMessages).toEqual([]);
            expect(live.missingEvidence?.length ?? 0).toBeGreaterThan(0);
            // Withheld is deliberate, never a degraded fallback.
            expect(strategist?.mode).not.toBe("FAILED_TO_FALLBACK");
            expect(dispatcher?.mode).not.toBe("FAILED_TO_FALLBACK");
          } else {
            // The materialized risk the advisor named: the live Sentinel read the thin signal
            // ABOVE the floor and acted. The deterministic leg still gates the refusal; this
            // is the signal to strengthen the wording or move to count-based corroboration.
            console.warn(
              `  [calibration] ${scenario.id}: live Sentinel did NOT refuse (confidence ${live.threatCard.confidence.toFixed(2)} >= ${ACTION_CONFIDENCE_FLOOR}). Deterministic leg still gates NO_ACTION.`
            );
          }
        } else if (hasExposures) {
          // With exposures and an ACT decision, the Strategist + Dispatcher run live too.
          expect(strategist?.mode, `Strategist: ${strategist?.summary ?? ""}`).toBe("LIVE_AI");
          expect(dispatcher?.mode, `Dispatcher: ${dispatcher?.summary ?? ""}`).toBe("LIVE_AI");
        } else {
          // Zero-exposure: nothing to plan/draft, so they short-circuit DETERMINISTIC (healthy,
          // NOT degraded) -- they must never be FAILED_TO_FALLBACK.
          expect(strategist?.mode).toBe("DETERMINISTIC_RULES");
          expect(dispatcher?.mode).toBe("DETERMINISTIC_RULES");
        }

        expect(live.effectiveMode).toBe("LIVE_AI");

        // Safety: every deterministic grader passes over the REAL output.
        const report = runGraders(live, groundTruthFor(scenario.id, live, det));
        expect(report.blocked, describeFailures(report).join("\n")).toBe(false);

        // The ONE LLM judge (Success_Criteria), WIRED to gate real output: no unsupported
        // claim in the OUTBOUND drafted prose. Fail-closed -- a flag OR a judge error fails
        // the gate. The deterministic citation grader (above) catches unsourced NUMERALS;
        // this catches the SEMANTIC claim a number-free sentence can still smuggle.
        const judgeModel = resolvedJudgeModel();
        let judgeSpent = 0;
        for (const m of live.supplierMessages) {
          const exp = live.exposureResults.find((e) => e.supplierId === m.supplierId);
          const verdict = await judgeNoUnsupportedClaims({
            prose: m.body,
            sourceData: {
              event: {
                summary:
                  "A supply-chain disruption is affecting inbound lanes; the recipient is a flagged exposed supplier on an affected lane."
              },
              // The recipient's own name is a given (it is who the email is addressed to), not a
              // claim -- include it so the judge does not flag the supplier name as unsupported.
              supplierName: exp?.supplierName,
              exposureScore: exp?.exposureScore,
              simulationWindowDays: live.simulation?.horizons?.[0]?.days ?? null
            },
            budget: {
              spentUsd: judgeSpent,
              estimatedNextUsd: estimateLiveCallCostUsd(judgeModel),
              capUsd: DEFAULT_BUDGET_CAP_USD
            }
          });
          judgeSpent += estimateLiveCallCostUsd(judgeModel);
          expect(
            verdict.supported,
            `${scenario.id} ${m.id}: judge flagged "${verdict.reason}"`
          ).toBe(true);
        }

        // Cost + latency bounds.
        expect(live.totalCostUsd ?? 0).toBeLessThanOrEqual(DEFAULT_BUDGET_CAP_USD);
        expect(live.totalCostUsd ?? 0).toBeGreaterThan(0);
        expect(wallClockMs).toBeLessThan(FIVE_MIN_MS);
      },
      FIVE_MIN_MS + 30_000
    );
  }
});

// (C) live re-calibration gate -- the WATERFALL opt-out path. Since the 2026-06-29 promotion the
// Investigator loop is DEFAULT-ON, so a live deployment hits the LOOP by default; the deterministic
// WATERFALL is now the byte-for-byte opt-out (ENABLE_AGENT_LOOP=false), and this gate covers it with
// the live cross-family Skeptic ON (a Groq key present) -- set ENABLE_AGENT_LOOP=false to exercise it.
// That waterfall path is exactly where the 2026-06-28 false-veto was first observed; the strength-aware
// gate must hold on BOTH paths, and the loop-scoped (G) gate in
// actionops-investigator.test.ts does NOT cover it (it asserts an Investigator run). The D.9 suite
// above runs the live waterfall but INJECTS a Skeptic ACCEPT to decouple from stochastic flake, so
// it never exercises the real critic's REJECT through the strength-aware gate. THIS gate closes that
// gap with the same flake-proof invariant the (G) gate uses.
//
// FLAKE-PROOF: the live cross-family critic may ACCEPT or REJECT the Hormuz finding run-to-run, but
// on this STRONG finding (corroborated + high-confidence + real-sector exposure) the gate outcome is
// ALWAYS ACT -- ACCEPTED (critic stood behind it) or ANNOTATED (critic rejected, downgraded to a
// recorded caution). The discriminating invariant is skepticGateOutcome !== "VETOED". Before the (C)
// fix this FAILED live (the critic's REJECT hard-vetoed -> NO_ACTION); it is the honest regression
// boundary for the path users run. Multiple spaced runs confirm the upstream live pipeline reliably
// yields a STRONG finding (the only run-to-run variable that could silently re-break ACT).
// Full attribution: docs/claude/gates/agentic-rework/PHASE4-SKEPTIC-CALIBRATION.md + HANDOFF.
describe.skipIf(!LIVE)("(C) live re-cal: the production-active WATERFALL never hard-vetoes the strong Hormuz finding", () => {
  // This gate asserts the WATERFALL path; the loop's own coverage is the (G) gate. Skip (do not
  // falsely fail) if a run happens to have the loop flag on -- the premise is loop-OFF.
  it.skipIf(agentLoopEnabled())(
    "live waterfall + live cross-family Skeptic: Hormuz ACTs, never VETOED, across spaced runs",
    async () => {
      const RUNS = Number(process.env.RECAL_RUNS) || 3;
      for (let i = 0; i < RUNS; i++) {
        // No skeptic injection -> the REAL Groq cross-family critic fires (skepticEnabled gates on a
        // Groq key). live:true + ENABLE_AGENT_LOOP off -> the live waterfall, not the loop.
        const packet = await buildDecisionPacket({ scenarioId: "SCN-HORMUZ", live: true });

        const skepticRun = packet.agentRuns.find((r) => r.id === "RUN-SKEPTIC");
        const investigatorRan = packet.agentRuns.some((r) => r.agentName === "Investigator");

        // A durable, greppable evidence line per run.
        console.log(
          `[recal-waterfall-evidence] run=${i + 1}/${RUNS} recommendation=${packet.recommendation} ` +
            `skepticGateOutcome=${packet.skepticGateOutcome} skepticMode=${skepticRun?.mode} ` +
            `confidence=${packet.threatCard.confidence.toFixed(2)} exposures=${packet.exposureResults.length} ` +
            `cost=$${(packet.totalCostUsd ?? 0).toFixed(4)} investigator=${investigatorRan}`
        );

        // Confirm this is genuinely the WATERFALL with the REAL live critic (not the loop, not a
        // key-OFF affirmative pass): no Investigator run + the Skeptic ran LIVE_AI.
        expect(investigatorRan, "expected the WATERFALL (no Investigator); is ENABLE_AGENT_LOOP set?").toBe(false);
        expect(skepticRun?.mode, "the real cross-family Skeptic must have fired LIVE_AI").toBe("LIVE_AI");

        // THE FIX, on the path users run: the strong Hormuz finding ACTs and is NEVER hard-vetoed.
        expect(packet.recommendation).toBe("ACT");
        expect(packet.skepticGateOutcome).not.toBe("VETOED");
        expect(packet.totalCostUsd ?? 0).toBeLessThanOrEqual(DEFAULT_BUDGET_CAP_USD);

        // Space the runs so the per-build Skeptic call does not trip the Groq free-tier TPM window
        // (the throttle artifact that fails CLOSED to a HOLD and reads as a bogus veto).
        if (i < RUNS - 1) await new Promise((r) => setTimeout(r, 30_000));
      }
    },
    FIVE_MIN_MS + 30_000
  );
});
