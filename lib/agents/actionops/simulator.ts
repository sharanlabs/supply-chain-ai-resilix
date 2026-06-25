import type { AgentRun, ExposureResult, Simulation } from "@/lib/schemas";
import { recomputeSimulation } from "@/lib/pipeline/simulation-math";
import { makeAgentRun } from "@/lib/agents/actionops/agent-run";
import type { ActionOpsContext } from "@/lib/agents/actionops/types";

// Simulator (deterministic, exact arithmetic). Runs only when the scenario carries
// inventory data (SEEDED / Tier-2); a Tier-1 scenario gets no simulation section
// and records why in dataGaps. It fans the scenario's per-supplier daily revenue
// across the matched (Atlas) supplier ids, then runs the canonical arithmetic.
//
// D.3: the producer now OWNS the canonical math via @/lib/pipeline/simulation-math
// and no longer borrows it from the grader. Producer and grader share that one
// source of truth, but their independence is proven elsewhere -- the grader checks
// against gt.simInputs, and evals/actionops-simulator.test.ts pins HAND-DERIVED
// values and asserts this live producer matches them (the f(x) === f(x) defeat).
export function runSimulator(
  ctx: ActionOpsContext,
  exposureResults: ExposureResult[]
): { simulation?: Simulation; dataGaps: string[]; agentRun: AgentRun } {
  const { scenario, baseDateIso } = ctx;
  const dataGaps: string[] = [...(scenario.dataGaps ?? [])];

  let simulation: Simulation | undefined;
  if (scenario.simulation) {
    const params = scenario.simulation;
    const computed = recomputeSimulation({
      baseDateIso,
      durationDays: params.durationDays,
      affected: exposureResults.map((e) => ({
        supplierId: e.supplierId,
        dailyRevenueUsd: params.dailyRevenueUsdPerSupplier
      })),
      horizonDays: params.horizonDays,
      inventory: params.inventory,
      // P1 margin-at-risk: thread the scenario's contribution-margin fraction so each
      // horizon carries marginAtRiskUsd alongside revenueAtRiskUsd. survivalDays (TTS)
      // rides along in `computed` from the shared math.
      marginPct: params.marginPct
    });
    simulation = { ...computed, generatedAt: baseDateIso };
  } else {
    dataGaps.push(
      "Tier-1 upload: no inventory columns provided, so runway is not simulated."
    );
  }

  const agentRun = makeAgentRun({
    id: "RUN-SIMULATOR",
    agentName: "Simulator",
    input: scenario.simulation ?? { tier: scenario.dataTier },
    output: simulation ?? { simulated: false },
    summary: simulation
      ? `Projected ${simulation.horizons.length} revenue horizon(s) and ${simulation.productRunouts.length} runout(s).`
      : "Tier-1 scenario: no inventory data, runway not simulated.",
    createdAt: baseDateIso
  });

  return { simulation, dataGaps, agentRun };
}
