import { describe, expect, it } from "vitest";
import { buildDecisionPacket } from "@/lib/pipeline/build-packet";
import { runSimulator } from "@/lib/agents/actionops/simulator";
import { recomputeSimulation, type SimInputs } from "@/lib/pipeline/simulation-math";
import { getActionOpsScenario } from "@/lib/data/actionops-scenarios";
import { ingestSeed } from "@/lib/ingest/seed-suppliers";
import type { ActionOpsContext } from "@/lib/agents/actionops/types";

// D.3 Simulator: the f(x) === f(x) defeat. The producer (lib/agents/actionops/
// simulator.ts) now OWNS the canonical runway math (lib/pipeline/simulation-math.ts)
// instead of borrowing it from the grader, so the producer/grader code identity that
// made a correct run match BY CONSTRUCTION is gone. Independence is proven HERE: the
// expected numbers are HAND-DERIVED (arithmetic worked in the comments below), NOT
// produced by calling recomputeSimulation -- so if the producer's math drifts, the
// pinned absolute value catches it. The runout DATE is checked by a genuinely
// different code path (UTC calendar-component addition via Date.UTC), never by the
// producer's addDaysUtc, so the date arithmetic is independently verified too.
//
// Hormuz sim params (lib/data/actionops-scenarios.ts):
//   durationDays 30, horizonDays [7, 30, 90], dailyRevenueUsdPerSupplier 10_000,
//   9 affected Gulf suppliers, inventory PROD-GULF-CHEM onHand 1000 / dailyUse 40.

// revenueAtRisk(H) = (affected suppliers) x (daily revenue) x min(H, durationDays).
// Hand-worked with 9 affected suppliers at 10_000/day and a 30-day disruption:
//   @7d  = 9 x 10_000 x min(7, 30)  = 9 x 10_000 x 7  = 630_000
//   @30d = 9 x 10_000 x min(30, 30) = 9 x 10_000 x 30 = 2_700_000
//   @90d = 9 x 10_000 x min(90, 30) = 9 x 10_000 x 30 = 2_700_000  (capped at duration)
const EXPECTED_REVENUE_AT_RISK_USD: Record<number, number> = {
  7: 630_000,
  30: 2_700_000,
  90: 2_700_000
};

// runout(PROD-GULF-CHEM) = floor(onHand / dailyUse) = floor(1000 / 40) = 25 days
// after the run base date. Whole days only -- a partial day of cover buys no extra
// whole day of runway.
const EXPECTED_RUNOUT_DAYS = 25;
const EXPECTED_AFFECTED_SUPPLIER_COUNT = 9;

// Add whole days to a UTC instant by CALENDAR components (Date.UTC normalizes
// day-overflow across month/year). This is intentionally NOT the producer's
// addDaysUtc (which does millisecond addition) -- a different code path that is
// nonetheless provably equal for whole-day UTC offsets, so the runout date is
// checked independently rather than against a clone of the function under test.
function addDaysUtcByCalendar(baseIso: string, days: number): string {
  const base = new Date(baseIso);
  return new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + days)
  )
    .toISOString()
    .slice(0, 10);
}

describe("Simulator arithmetic (D.3, hand-pinned, independent of producer math)", () => {
  it("matches HAND-DERIVED revenue-at-risk and runout for the live Hormuz run", async () => {
    // useLiveSignals: false -> cached signals, no network, deterministic, key-OFF.
    const packet = await buildDecisionPacket({ useLiveSignals: false });

    // Asserting the 9-supplier count explicitly so a drift in the exposure match
    // fails diagnostically HERE, not cryptically inside the revenue figure (which
    // silently bakes in "Atlas matched exactly nine").
    expect(packet.exposureResults).toHaveLength(EXPECTED_AFFECTED_SUPPLIER_COUNT);

    const sim = packet.simulation;
    expect(sim, "live Hormuz run must produce a simulation section").toBeDefined();
    if (!sim) return; // narrow for the type checker; the assertion above is the real gate.

    // Exactly the three declared horizons -- no missing, no fabricated.
    expect(sim.horizons).toHaveLength(3);
    for (const horizon of sim.horizons) {
      const expected = EXPECTED_REVENUE_AT_RISK_USD[horizon.days];
      expect(expected, `unexpected horizon ${horizon.days}d`).toBeDefined();
      // Strong teeth: the hand-pinned ABSOLUTE value, to the dollar.
      expect(horizon.revenueAtRiskUsd, `${horizon.days}d revenue-at-risk`).toBe(expected);
    }

    // Exactly one runout, for the one declared product.
    expect(sim.productRunouts).toHaveLength(1);
    const runout = sim.productRunouts[0];
    expect(runout.productId).toBe("PROD-GULF-CHEM");

    // The runout base date is the run instant (packet.simulation.generatedAt). The
    // expected date is computed by the INDEPENDENT calendar path, so this checks the
    // producer's date arithmetic, not a copy of it.
    const expectedRunoutDate = addDaysUtcByCalendar(sim.generatedAt, EXPECTED_RUNOUT_DAYS);
    expect(runout.runoutDate).toBe(expectedRunoutDate);
  });
});

// Runout FLOOR semantics: every existing runout fixture uses an exact-integer
// quotient (onHand / dailyUse is whole), where floor == round == ceil -- so the floor
// rule (a partial day of cover buys NO extra whole day of runway) was never actually
// tested. This pins a NON-integer quotient that DISCRIMINATES floor from round/ceil:
//   1030 / 40 = 25.75  ->  floor = 25, round = 26, ceil = 26.
// If the producer ever rounded or ceiled instead of floored, the runout date would be
// a day late and THIS test catches it (the exact-integer fixtures cannot). The
// expected date is built by the SAME independent calendar path the Hormuz test uses
// (Date.UTC component addition), not the producer's addDaysUtc, so the date arithmetic
// is checked against a different code path, not a clone of the function under test.
describe("Simulator runout floor semantics (non-integer quotient)", () => {
  it("floors a fractional runway (1030/40 = 25.75 -> 25 days, NOT 26)", () => {
    const baseIso = "2026-06-18T12:00:00.000Z";
    const inputs: SimInputs = {
      baseDateIso: baseIso,
      durationDays: 30,
      affected: [{ supplierId: "SUP-FLOOR", dailyRevenueUsd: 1_000 }],
      horizonDays: [7],
      // 1030 / 40 = 25.75 -- the fractional part (> 0.5) is what makes floor (25)
      // differ from round/ceil (26), so this fixture proves FLOOR specifically.
      inventory: [{ productId: "PROD-FLOOR", onHandUnits: 1_030, dailyUseUnits: 40 }]
    };

    const FLOORED_RUNOUT_DAYS = 25; // floor(25.75); round/ceil would be 26
    const sim = recomputeSimulation(inputs);

    expect(sim.productRunouts).toHaveLength(1);
    const runout = sim.productRunouts[0];
    expect(runout.productId).toBe("PROD-FLOOR");

    // The floored date, via the independent calendar path -- proves the producer
    // floored (25 days out), not rounded/ceiled (which would land a day later).
    const expectedFloored = addDaysUtcByCalendar(baseIso, FLOORED_RUNOUT_DAYS);
    expect(runout.runoutDate).toBe(expectedFloored);
    // And explicitly NOT the round/ceil date -- the discriminating assertion.
    const rounded = addDaysUtcByCalendar(baseIso, FLOORED_RUNOUT_DAYS + 1);
    expect(runout.runoutDate).not.toBe(rounded);
  });
});

// Tier-1 control: a scenario with NO simulation params must yield NO simulation
// section and a dataGaps note explaining why runway was not simulated. Constructed
// by omitting scenario.simulation and driving runSimulator directly (cleaner than
// routing a synthetic Tier-1 scenario through the whole pipeline).
describe("Simulator Tier-1 control (D.3, no inventory -> no simulation)", () => {
  it("produces no simulation section and records why runway is not simulated", () => {
    const base = getActionOpsScenario();
    // Drop the simulation params and mark the tier Tier-1 to model a no-inventory
    // upload. Everything else (the matched scope) is irrelevant to this control --
    // the Simulator only branches on scenario.simulation presence. Building the
    // copy without a `simulation` key (rather than rest-destructuring it out) keeps
    // the no-inventory state explicit and avoids an unused binding.
    const tier1Scenario = { ...base, simulation: undefined, dataTier: "TIER_1" as const };
    const ctx: ActionOpsContext = {
      scenario: tier1Scenario,
      signals: [],
      suppliers: ingestSeed().suppliers,
      baseDateIso: "2026-06-18T12:00:00.000Z"
    };

    const { simulation, dataGaps, agentRun } = runSimulator(ctx, []);

    expect(simulation).toBeUndefined();
    expect(dataGaps.join(" ")).toMatch(/no inventory columns provided.*runway is not simulated/i);
    // A healthy Tier-1 run is still a deterministic PASS -- "no runway" is an honest
    // outcome, not a failure.
    expect(agentRun.validationStatus).toBe("PASS");
    expect(agentRun.mode).toBe("DETERMINISTIC_RULES");
  });
});
