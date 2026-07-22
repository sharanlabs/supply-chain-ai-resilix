import { describe, expect, it } from "vitest";

import { DecisionPacketV2Schema } from "@/lib/schemas";
import { describeFailures, runGraders } from "@/lib/evals/run-graders";
import { GOLDEN_SCENARIOS, hormuz, hurricane, redSea } from "@/evals/golden/scenarios";
import { CORRUPTIONS } from "@/evals/golden/corruptions";
import { HORMUZ_SUPPLIERS, HORMUZ_SUPPLIER_IDS } from "@/evals/golden/seed-ids";

// Frozen, independently-computed snapshot of the 9 Hormuz supplier ids (computed
// once via canonicalSupplierId over the seed's Gulf rows). Pinning the literals --
// not re-deriving them through ingestSeed -- is what catches a seed/filter change
// that silently reshapes the exposure set (Codex: "self-derived goldens catch
// packet mutations, not wrong fixture logic").
const GOLDEN_HORMUZ_IDS = [
  "SUP-3fc84edef1e7aded", // Eastern Chemical Group 076 (SA)
  "SUP-b09f39b9d9ca6ebc", // Jubail Chemical Manufacturing 077 (SA)
  "SUP-518e5a10996d381f", // Abu Chemical Partners 078 (AE)
  "SUP-5fd536f25142a489", // Ras Chemical Systems 079 (QA)
  "SUP-618f1dc9c7b030d3", // Jebel Energy Group 092 (AE)
  "SUP-9fbd398ae5be35ae", // Abu Energy Manufacturing 093 (AE)
  "SUP-30c313786de0add0", // Eastern Energy Partners 094 (SA)
  "SUP-739c8751e1541f8e", // Ras Energy Systems 095 (QA)
  "SUP-40d0ceb654f7ec44" // Al Energy Solutions 096 (KW)
];

// ---------------------------------------------------------------------------
// The hard merge-BLOCK (G-8). This file runs inside `npm test` -> `verify`, so a
// golden record that stops satisfying the contract -- or, once the agent core
// exists, a live packet that fails a grader -- fails the build. Deterministic,
// offline, $0.
//
// PRE-KEY (today) this proves two things: every golden record is schema-valid and
// internally self-consistent, and every grader PASSES the correct record while
// FAILING its corrupted twin (teeth). POST-KEY the same runGraders() call grades
// the live pipeline output -- the assertion that "the pipeline matches the frozen
// golden" activates then. The labels below say which is which so a reader never
// mistakes the spec-check for a pipeline-check.
// ---------------------------------------------------------------------------

describe("golden records: schema-valid + pass every grader (pre-key: spec self-consistency)", () => {
  for (const scenario of GOLDEN_SCENARIOS) {
    it(`${scenario.id} is a valid DecisionPacketV2`, () => {
      const parsed = DecisionPacketV2Schema.safeParse(scenario.packet);
      expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error?.issues, null, 2)).toBe(
        true
      );
    });

    it(`${scenario.id} passes every deterministic grader`, () => {
      const report = runGraders(scenario.packet, scenario.groundTruth);
      // Surface the specific failures if any grader trips -- a bare `false` would
      // make a regression a guessing game.
      expect(report.blocked, describeFailures(report).join("\n")).toBe(false);
    });
  }

  it("covers all seven eval scenarios", () => {
    const ids = new Set(GOLDEN_SCENARIOS.map((s) => s.id));
    for (const required of [
      "hormuz",
      "tariff",
      "redsea",
      "hurricane",
      "bankruptcy",
      "zero-exposure",
      "off-taxonomy"
    ]) {
      expect(ids.has(required), `missing golden scenario: ${required}`).toBe(true);
    }
  });

  it("every record carries a complete traceability manifest (Success_Criteria fixture-traceability)", () => {
    // Manifests are co-located with each golden record (one source of truth, no
    // record/manifest file drift) rather than separate JSON artifacts. Assert EVERY
    // required field: sources, accessed date, extracted claim, confidence, and the
    // do-not-encode list (illustrative values never to be read as live truth).
    for (const scenario of GOLDEN_SCENARIOS) {
      const m = scenario.manifest;
      expect(m.sources.length, `${scenario.id} has no sources`).toBeGreaterThan(0);
      expect(m.accessedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(m.extractedClaim.length).toBeGreaterThan(0);
      expect(["LOW", "MEDIUM", "HIGH"]).toContain(m.confidence);
      expect(Array.isArray(m.doNotEncode), `${scenario.id} doNotEncode not an array`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Teeth: each corruption is a minimal mutation that exactly one grader must catch.
// This is what proves the BLOCK is real and not a pass-through (a grader that
// cannot fail provides no assurance).
// ---------------------------------------------------------------------------
describe("the deterministic graders BLOCK on corruption (teeth)", () => {
  for (const corruption of CORRUPTIONS) {
    it(`${corruption.grader}: ${corruption.label}`, () => {
      const packet = structuredClone(corruption.base.packet);
      corruption.mutate(packet);
      const gt = corruption.groundTruth ?? corruption.base.groundTruth;

      const report = runGraders(packet, gt);
      expect(report.blocked, "corruption did not block").toBe(true);

      const result = report.results.find((r) => r.grader === corruption.grader);
      expect(result, `no result for grader ${corruption.grader}`).toBeDefined();
      expect(result!.pass, `expected ${corruption.grader} to fail`).toBe(false);
      expect(
        result!.failures.some((f) => corruption.expect.test(f)),
        `no failure matched ${corruption.expect} -- got: ${result!.failures.join(" | ")}`
      ).toBe(true);
    });
  }

  it("every grader is proven by at least one corruption (no unproven grader)", () => {
    const provedGraders = new Set(CORRUPTIONS.map((c) => c.grader));
    const allGraders = runGraders(
      GOLDEN_SCENARIOS[0].packet,
      GOLDEN_SCENARIOS[0].groundTruth
    ).results.map((r) => r.grader);
    for (const grader of allGraders) {
      expect(provedGraders.has(grader), `grader ${grader} has no corruption proving its teeth`).toBe(
        true
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Independent anchors -- the teeth the recompute-vs-recompute checks CANNOT give.
// The simulator grader recomputes with the same function the record was built by,
// so on the good record it compares the recompute to itself (f(x)===f(x)); a wrong
// FORMULA would be baked into both sides and stay green. These pin the literal
// hand-computed numbers, so the arithmetic itself is validated against an
// independent source (lesson #27: real teeth = an independent golden snapshot).
// ---------------------------------------------------------------------------
describe("independent arithmetic + matching anchors (not f(x)===f(x))", () => {
  it("Hormuz simulation matches the hand-computed values to the cent/day", () => {
    // 9 Gulf suppliers x $10,000/day = $90,000/day. P1 TTS spine: loss starts at RUNOUT,
    // not day 0 -- survivalDays = floor(1,000/40) = 25, so exposedDays(H) = max(0, min(H,30)-25):
    //   7d  = 90,000 x 0 = 0          (still covered -- 25-day inventory buffer)
    //   30d = 90,000 x 5 = 450,000    (5 exposed days between runout and the 30-day end)
    //   90d = 90,000 x 5 = 450,000    (capped at the 30-day disruption)
    //   runout = floor(1,000 / 40) = 25 days from 2026-06-17 = 2026-07-12
    const sim = hormuz.packet.simulation;
    expect(sim).toBeDefined();
    const at = (days: number) => sim!.horizons.find((h) => h.days === days)?.revenueAtRiskUsd;
    expect(at(7)).toBe(0);
    expect(at(30)).toBe(450_000);
    expect(at(90)).toBe(450_000);
    expect(sim!.productRunouts[0].runoutDate).toBe("2026-07-12");
  });

  it("the Hormuz expected-exposure set is exactly the Gulf ENERGY/CHEMICALS suppliers", () => {
    // Pins the SET MEANING (the joint country x sector cell the demo rests on),
    // independent of the count assertion in seed-ids.ts.
    const gulf = new Set(["SA", "AE", "QA", "KW"]);
    for (const supplier of HORMUZ_SUPPLIERS) {
      expect(gulf.has(supplier.country), `${supplier.name} is not Gulf-origin`).toBe(true);
      expect(
        supplier.sector === "ENERGY" || supplier.sector === "CHEMICALS",
        `${supplier.name} is ${supplier.sector}, not ENERGY/CHEMICALS`
      ).toBe(true);
    }
    expect(hormuz.groundTruth.expectedAffectedSupplierIds).toEqual(HORMUZ_SUPPLIER_IDS);
  });

  it("the Hormuz id set matches the frozen literal snapshot", () => {
    expect(HORMUZ_SUPPLIER_IDS).toEqual(new Set(GOLDEN_HORMUZ_IDS));
  });

  it("Red Sea simulation matches the hand-computed values (5 IN suppliers x $8,000, 60-day cap)", () => {
    //   5 IN suppliers x $8,000/day = $40,000/day. P1 TTS: survivalDays = floor(900/30) = 30,
    //   exposedDays(H) = max(0, min(H,60)-30):
    //   7d = 0; 30d = 0 (covered through the 30-day buffer); 90d = 40,000 x (60-30) = 1,200,000
    //   runout = floor(900/30)=30d = 2026-07-17
    const sim = redSea.packet.simulation!;
    const at = (d: number) => sim.horizons.find((h) => h.days === d)?.revenueAtRiskUsd;
    expect(at(7)).toBe(0);
    expect(at(30)).toBe(0);
    expect(at(90)).toBe(1_200_000);
    expect(sim.productRunouts[0].runoutDate).toBe("2026-07-17");
  });

  it("Hurricane simulation matches the hand-computed values (1 supplier x $25,000, 14-day cap)", () => {
    //   1 supplier x $25,000/day. P1 TTS: survivalDays = floor(300/30) = 10,
    //   exposedDays(H) = max(0, min(H,14)-10):
    //   7d = 0 (covered); 30d = 25,000 x (min(30,14)-10) = 25,000 x 4 = 100,000
    //   runout = floor(300/30)=10d = 2026-06-27
    const sim = hurricane.packet.simulation!;
    const at = (d: number) => sim.horizons.find((h) => h.days === d)?.revenueAtRiskUsd;
    expect(at(7)).toBe(0);
    expect(at(30)).toBe(100_000);
    expect(sim.productRunouts[0].runoutDate).toBe("2026-06-27");
  });
});
