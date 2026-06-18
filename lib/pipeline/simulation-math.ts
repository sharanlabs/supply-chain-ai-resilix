// The canonical Simulator arithmetic -- the SINGLE source of truth for runway math,
// OWNED by the producer side of the pipeline (D.3). Both the live producer
// (lib/agents/actionops/simulator.ts) and the grader (lib/evals/graders.ts) import
// it from HERE; neither owns a private copy and the producer no longer borrows it
// FROM the grader.
//
// WHY this module exists: before D.3 the producer imported recomputeSimulation
// from the grader, so a correct run matched the grader BY CONSTRUCTION (the
// f(x) === f(x) trap) and the grader could not catch a producer arithmetic bug.
// The grader's job is to check the producer against an INDEPENDENT oracle. With a
// shared function that independence cannot live in code identity, so it lives in
// the test (evals/actionops-simulator.test.ts) which pins HAND-DERIVED values and
// asserts the live producer matches them -- that is where f(x) === f(x) is defeated.
// This module just removes the producer->grader dependency edge so the pieces are
// arranged honestly.

// Primitive inputs to the Simulator's deterministic arithmetic. Resolved at run
// time from the scenario's params plus the matched supplier ids. Absent on a
// Tier-1 record (no inventory -> no simulation).
export type SimInputs = {
  // The run's "as of" instant (UTC); runout dates are measured from here.
  baseDateIso: string;
  // How long the disruption lasts -- caps the revenue-at-risk per horizon.
  durationDays: number;
  // Per-affected-supplier daily revenue flowing through the disrupted lane.
  affected: { supplierId: string; dailyRevenueUsd: number }[];
  // Horizons to project (days).
  horizonDays: number[];
  // Inventory positions for runout projection.
  inventory: { productId: string; onHandUnits: number; dailyUseUnits: number }[];
};

// Add whole days to a UTC instant, returning a YYYY-MM-DD date. UTC-pinned so the
// runout date is deterministic regardless of the runner's local zone (the P8
// calendar-shift lesson). Day count is floored: a partial day of cover does not
// buy an extra whole day of runway.
export function addDaysUtc(baseIso: string, days: number): string {
  return new Date(new Date(baseIso).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

// The Simulator's deterministic arithmetic, recomputed from primitive inputs.
// revenueAtRisk(H) = sum over affected suppliers of dailyRevenue x min(H, duration)
// runout(product)  = baseDate + floor(onHand / dailyUse) days
export function recomputeSimulation(inputs: SimInputs): {
  horizons: { days: number; revenueAtRiskUsd: number }[];
  productRunouts: { productId: string; runoutDate: string }[];
} {
  return {
    horizons: inputs.horizonDays.map((days) => ({
      days,
      revenueAtRiskUsd: inputs.affected.reduce(
        (sum, a) => sum + a.dailyRevenueUsd * Math.min(days, inputs.durationDays),
        0
      )
    })),
    productRunouts: inputs.inventory.map((inv) => ({
      productId: inv.productId,
      runoutDate: addDaysUtc(inputs.baseDateIso, Math.floor(inv.onHandUnits / inv.dailyUseUnits))
    }))
  };
}
