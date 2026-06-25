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
  // P1 margin-at-risk: the contribution-margin fraction (0..1) applied to revenue-at-risk
  // to get margin-at-risk. Optional + back-compat -- absent (e.g. the golden oracle inputs
  // that predate it) means no marginAtRiskUsd is emitted, not a 0 (keeps the field truly
  // optional through the round-trip).
  marginPct?: number;
};

// Add whole days to a UTC instant, returning a YYYY-MM-DD date. UTC-pinned so the
// runout date is deterministic regardless of the runner's local zone (the P8
// calendar-shift lesson). Day count is floored: a partial day of cover does not
// buy an extra whole day of runway.
export function addDaysUtc(baseIso: string, days: number): string {
  return new Date(new Date(baseIso).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

// Days of inventory cover for one position -- floored, since a partial day of cover
// buys no extra whole day of runway (the runout-floor lesson).
function coverDays(inv: { onHandUnits: number; dailyUseUnits: number }): number {
  return Math.floor(inv.onHandUnits / inv.dailyUseUnits);
}

// The Simulator's deterministic arithmetic, recomputed from primitive inputs.
//
// P1 TTS spine (HBR/Simchi-Levi): revenue is NOT lost while inventory still covers
// demand -- the loss clock starts at RUNOUT (time-to-survive), not day 0. So the
// exposure window at horizon H is the disruption days that fall AFTER the buffer is
// gone: exposedDays(H) = max(0, min(H, duration) - survivalDays).
//   survivalDays     = the EARLIEST product runout (the binding stockout across all
//                      positions); 0 when there is no inventory to buffer with.
//   revenueAtRisk(H) = sum over affected suppliers of dailyRevenue x exposedDays(H)
//   marginAtRisk(H)  = revenueAtRisk(H) x marginPct           (only when marginPct set)
//   runout(product)  = baseDate + floor(onHand / dailyUse) days
export function recomputeSimulation(inputs: SimInputs): {
  horizons: { days: number; revenueAtRiskUsd: number; marginAtRiskUsd?: number }[];
  productRunouts: { productId: string; runoutDate: string }[];
  survivalDays: number | null;
} {
  // TTS = the earliest stockout. No inventory -> no buffer -> survivalDays 0 (loss from
  // day 0, the pre-P1 behaviour) and a null TTS surfaced (nothing to project cover from).
  const survivalDays =
    inputs.inventory.length > 0 ? Math.min(...inputs.inventory.map(coverDays)) : null;
  const buffer = survivalDays ?? 0;

  return {
    horizons: inputs.horizonDays.map((days) => {
      const exposedDays = Math.max(0, Math.min(days, inputs.durationDays) - buffer);
      const revenueAtRiskUsd = inputs.affected.reduce(
        (sum, a) => sum + a.dailyRevenueUsd * exposedDays,
        0
      );
      return {
        days,
        revenueAtRiskUsd,
        // Emit margin ONLY when a contribution fraction was provided, so the field stays
        // genuinely absent (not a 0) on the inputs that predate it. Rounded to whole USD
        // (revenue is whole dollars; the x marginPct product is otherwise float-noisy --
        // 450000 * 0.34 = 153000.00000000003 -- which would break exact-value assertions).
        ...(inputs.marginPct !== undefined
          ? { marginAtRiskUsd: Math.round(revenueAtRiskUsd * inputs.marginPct) }
          : {})
      };
    }),
    productRunouts: inputs.inventory.map((inv) => ({
      productId: inv.productId,
      runoutDate: addDaysUtc(inputs.baseDateIso, coverDays(inv))
    })),
    survivalDays
  };
}
