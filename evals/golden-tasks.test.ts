import { describe, expect, it } from "vitest";

import { DecisionPacketV2Schema } from "@/lib/schemas";
import { describeFailures, runGraders } from "@/lib/evals/run-graders";
import { GOLDEN_SCENARIOS } from "@/evals/golden/scenarios";
import { CORRUPTIONS } from "@/evals/golden/corruptions";

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

  it("covers all six eval scenarios", () => {
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

  it("every record carries a traceability manifest (Success_Criteria fixture-traceability)", () => {
    for (const scenario of GOLDEN_SCENARIOS) {
      expect(scenario.manifest.sources.length, `${scenario.id} has no sources`).toBeGreaterThan(0);
      expect(scenario.manifest.accessedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(scenario.manifest.extractedClaim.length).toBeGreaterThan(0);
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
