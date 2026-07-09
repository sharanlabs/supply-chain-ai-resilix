import { describe, expect, it } from "vitest";

import { loadLoopTrajectory } from "@/lib/pipeline/replay-loop";
import { DecisionPacketSchema } from "@/lib/schemas";

// The /loop exhibit loader. Like replay-packet.test.ts this is the DRIFT GUARD:
// loadLoopTrajectory parses the frozen evals/fixtures/loop/LOOP-HORMUZ.json through the
// canonical schema and applies the exhibit's semantic guards (genuine LIVE loop capture,
// real cross-family Skeptic, recorded tool sequence) -- a regeneration that captured a
// waterfall, key-off, or injected-Skeptic run fails HERE in npm test, never renders as
// a fabricated trace.
//
// NOTE (house pattern, mirrors replay-packet.test.ts): the guards' negative paths read a
// static import, so they are exercised by the REAL fixture's happy path + simple
// fail-loud throws; add DI if a reject path ever needs first-hand proof.

describe("loadLoopTrajectory -- the /loop recorded-run exhibit", () => {
  it("loads + re-validates the frozen loop capture (fails loud on drift)", () => {
    const t = loadLoopTrajectory();
    const parsed = DecisionPacketSchema.safeParse(t.packet);
    expect(
      parsed.success,
      parsed.success ? "" : JSON.stringify(parsed.error?.issues, null, 2)
    ).toBe(true);
    expect(t.packet.packetVersion).toBe(2);
  });

  it("is a genuine LIVE loop capture, not a waterfall or key-off run", () => {
    const t = loadLoopTrajectory();
    expect(t.packet.effectiveMode).toBe("LIVE_AI");
    expect(t.meteredCostUsd).toBeGreaterThan(0);
    expect(t.investigator.mode).toBe("LIVE_AI");
    // The model-driven tool order the exhibit renders -- the loop's signature.
    expect(t.toolSequence.length).toBeGreaterThanOrEqual(3);
    expect(t.toolSequence).toContain("challengeFinding");
  });

  it("carries the REAL cross-family Skeptic verdict, never injected or deterministic", () => {
    const t = loadLoopTrajectory();
    expect(t.skepticModel).not.toBe("deterministic-rules");
    // Cross-family = not the Gemini family that drives the loop.
    expect(t.skepticModel.toLowerCase()).not.toContain("gemini");
    expect(["ACCEPTED", "ANNOTATED", "VETOED"]).toContain(t.gateOutcome);
    // The injected-accept marker used by the D.9 landing recorder must NEVER appear here.
    expect(t.skeptic.summary ?? "").not.toContain("in-pipeline accept");
  });

  it("stays consistent with the gate semantics the packet claims", () => {
    const t = loadLoopTrajectory();
    const rec = t.packet.recommendation ?? "ACT";
    if (t.gateOutcome === "VETOED") expect(rec).toBe("NO_ACTION");
    if (t.gateOutcome === "ANNOTATED") expect(rec).toBe("ACT");
  });
});
