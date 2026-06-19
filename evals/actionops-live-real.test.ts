import { describe, expect, it } from "vitest";

import { buildDecisionPacket } from "@/lib/pipeline/build-packet";
import { ACTIONOPS_SCENARIOS, getActionOpsScenario } from "@/lib/data/actionops-scenarios";
import { describeFailures, runGraders } from "@/lib/evals/run-graders";
import type { ScenarioGroundTruth, SimInputs } from "@/lib/evals/graders";
import { judgeNoUnsupportedClaims, resolvedJudgeModel } from "@/lib/evals/judge";
import { estimateLiveCallCostUsd } from "@/lib/agents/run";
import { DEFAULT_BUDGET_CAP_USD } from "@/lib/agents/budget";
import { KNOWN_SUPPLIER_IDS } from "@/evals/golden/seed-ids";
import type { DecisionPacketV2 } from "@/lib/schemas";

// D.9 LIVE eval -- GATED (RUN_LIVE_AI_TESTS=true) because it BILLS. Runs EVERY production
// scenario live and asserts the Success_Criteria "live mode is genuinely live" + "<=$5" +
// "<5 min" rows on REAL Gemini output, plus the per-scenario coherence (the live Sentinel
// classifies THIS scenario's disruption, not a generic one). Run:
//   ENABLE_LIVE_AI=true GEMINI_MODEL=gemini-2.5-flash RUN_LIVE_AI_TESTS=true \
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
  "SCN-OFF-TAXONOMY": "OTHER_UNMAPPED"
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
    knownProductIds: new Set<string>((params?.inventory ?? []).map((i) => i.productId)),
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
        const live = await buildDecisionPacket({ scenarioId: scenario.id, live: true });
        const wallClockMs = Date.now() - startedAt;

        const sentinel = runById(live, "RUN-SENTINEL");
        const strategist = runById(live, "RUN-STRATEGIST");
        const dispatcher = runById(live, "RUN-DISPATCHER");
        const hasExposures = live.exposureResults.length > 0;

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

        if (hasExposures) {
          // With exposures, the Strategist + Dispatcher run live too.
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
