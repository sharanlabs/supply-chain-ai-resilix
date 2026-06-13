import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runExceptionPipeline } from "@/lib/pipeline/run-exception";

describe("exception pipeline", () => {
  const originalEnableLiveAi = process.env.ENABLE_LIVE_AI;

  beforeEach(() => {
    process.env.ENABLE_LIVE_AI = "false";
  });

  afterEach(() => {
    if (originalEnableLiveAi === undefined) {
      delete process.env.ENABLE_LIVE_AI;
      return;
    }
    process.env.ENABLE_LIVE_AI = originalEnableLiveAi;
  });

  it("creates a valid decision packet with cached public signal fallback", async () => {
    const packet = await runExceptionPipeline({
      scenarioId: "SCN-LAUNCH-001",
      useLiveSignals: false
    });

    expect(packet.options).toHaveLength(3);
    expect(packet.gatekeeper.status).not.toBe("BLOCKED");
    expect(packet.agentRuns.map((run) => run.agentName)).toEqual([
      "Signal Analyst",
      "Impact Analyst",
      "Resolution Planner",
      "Decision Gatekeeper",
      "Execution Drafter"
    ]);
    expect(packet.executionDraft.supplierMessage).toContain("48MP folded camera");
  });

  it("records repeatable agent metadata without live model credentials", async () => {
    const packet = await runExceptionPipeline({
      scenarioId: "SCN-LAUNCH-001",
      useLiveSignals: false
    });

    expect(packet.recommendedOptionId).toBe("OPT-EXPEDITE-SPLIT");
    expect(packet.agentRuns).toHaveLength(5);
    // Live AI disabled by config is a HEALTHY deterministic run (R4-8), NOT degraded.
    expect(packet.agentRuns.every((run) => run.mode === "DETERMINISTIC_RULES")).toBe(true);
    // Packet-level: requested + effective both resolve to the healthy deterministic
    // value, so no "degraded - no live AI" badge fires.
    expect(packet.requestedMode).toBe("DETERMINISTIC_RULES");
    expect(packet.effectiveMode).toBe("DETERMINISTIC_RULES");
    expect(packet.agentRuns.every((run) => run.validationStatus === "PASS")).toBe(true);
    expect(packet.agentRuns.every((run) => run.inputHash.length > 0)).toBe(true);
    expect(packet.agentRuns.every((run) => run.outputHash.length > 0)).toBe(true);
  });
});
