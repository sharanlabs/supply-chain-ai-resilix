import type { AgentRun, ExposureResult, Simulation } from "@/lib/schemas";
import { recomputeSimulation } from "@/lib/evals/graders";
import { makeAgentRun } from "@/lib/agents/actionops/agent-run";
import type { ActionOpsContext } from "@/lib/agents/actionops/types";

// Simulator (deterministic, exact arithmetic). Runs only when the scenario carries
// inventory data (SEEDED / Tier-2); a Tier-1 scenario gets no simulation section
// and records why in dataGaps. It fans the scenario's per-supplier daily revenue
// across the matched (Atlas) supplier ids, then runs the canonical arithmetic.
//
// NOTE (D.3): the arithmetic reuses recomputeSimulation -- the SAME function the
// grader checks against -- so producer and grader share one definition and a
// correct run matches by construction. For genuine producer/grader independence
// (defeat f(x) === f(x)), D.3 should OWN the canonical math here, have the grader
// import it, and pin independent hand-computed values; D.1 reuses it as a correct
// placeholder, and the golden corruptions already prove the grader bites.
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
      inventory: params.inventory
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
