import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeEffectiveMode } from "@/lib/agents/run";
import { runExceptionPipeline } from "@/lib/pipeline/run-exception";
import { parseStoredPacket } from "@/lib/server/store";
import { AgentModeSchema, type AgentMode, type AgentRun } from "@/lib/schemas";
import { makeV1Packet } from "./fixtures/decision-packet-v1";

// Constructs a minimal valid AgentRun carrying only the field under test (mode).
// model follows the production rule: the model id only when LIVE_AI, else
// "deterministic-rules" for every non-live value.
function agentRun(mode: AgentMode): AgentRun {
  return {
    id: `RUN-${mode}`,
    agentName: "Test Agent",
    model: mode === "LIVE_AI" ? "gemini-3-flash-preview" : "deterministic-rules",
    mode,
    latencyMs: 0,
    tokenEstimate: 1,
    inputHash: "in",
    outputHash: "out",
    validationStatus: "PASS",
    summary: "constructed for computeEffectiveMode unit test",
    createdAt: new Date().toISOString()
  };
}

describe("agent-mode taxonomy (R4-8)", () => {
  it("defines exactly the four taxonomy values", () => {
    expect(AgentModeSchema.options).toEqual([
      "LIVE_AI",
      "DETERMINISTIC_RULES",
      "REPLAY",
      "FAILED_TO_FALLBACK"
    ]);
  });

  describe("computeEffectiveMode", () => {
    it("returns DETERMINISTIC_RULES when every run is healthy deterministic (AI disabled)", () => {
      const runs = [
        agentRun("DETERMINISTIC_RULES"),
        agentRun("DETERMINISTIC_RULES"),
        agentRun("DETERMINISTIC_RULES")
      ];
      expect(computeEffectiveMode(runs, "DETERMINISTIC_RULES")).toBe("DETERMINISTIC_RULES");
    });

    it("returns LIVE_AI when any run succeeded live and none failed", () => {
      const runs = [
        agentRun("LIVE_AI"),
        agentRun("DETERMINISTIC_RULES"),
        agentRun("LIVE_AI")
      ];
      expect(computeEffectiveMode(runs, "LIVE_AI")).toBe("LIVE_AI");
    });

    it("returns FAILED_TO_FALLBACK when ANY run degraded, even alongside live successes", () => {
      const runs = [
        agentRun("LIVE_AI"),
        agentRun("FAILED_TO_FALLBACK"),
        agentRun("DETERMINISTIC_RULES")
      ];
      expect(computeEffectiveMode(runs, "LIVE_AI")).toBe("FAILED_TO_FALLBACK");
    });

    it("prioritizes FAILED_TO_FALLBACK over LIVE_AI (degradation wins)", () => {
      const runs = [agentRun("FAILED_TO_FALLBACK"), agentRun("LIVE_AI")];
      expect(computeEffectiveMode(runs, "LIVE_AI")).toBe("FAILED_TO_FALLBACK");
    });

    it("falls back to the requested mode when there are no agent runs", () => {
      expect(computeEffectiveMode([], "LIVE_AI")).toBe("LIVE_AI");
      expect(computeEffectiveMode([], "DETERMINISTIC_RULES")).toBe("DETERMINISTIC_RULES");
    });

    it("a healthy deterministic packet does NOT classify as the degraded value", () => {
      const runs = [agentRun("DETERMINISTIC_RULES")];
      expect(computeEffectiveMode(runs, "DETERMINISTIC_RULES")).not.toBe("FAILED_TO_FALLBACK");
    });

    it("returns REPLAY when every run is served from recorded fixtures", () => {
      const runs = [agentRun("REPLAY"), agentRun("REPLAY"), agentRun("REPLAY")];
      expect(computeEffectiveMode(runs, "REPLAY")).toBe("REPLAY");
    });

    it("returns REPLAY when replay runs mix with healthy deterministic runs", () => {
      const runs = [agentRun("REPLAY"), agentRun("DETERMINISTIC_RULES")];
      expect(computeEffectiveMode(runs, "REPLAY")).toBe("REPLAY");
    });

    it("prioritizes FAILED_TO_FALLBACK over REPLAY (degradation wins)", () => {
      const runs = [agentRun("REPLAY"), agentRun("FAILED_TO_FALLBACK")];
      expect(computeEffectiveMode(runs, "REPLAY")).toBe("FAILED_TO_FALLBACK");
    });

    it("prioritizes LIVE_AI over REPLAY (live success wins)", () => {
      const runs = [agentRun("REPLAY"), agentRun("LIVE_AI")];
      expect(computeEffectiveMode(runs, "REPLAY")).toBe("LIVE_AI");
    });
  });

  // P2.2 interim read shim: packets persisted before the taxonomy split lack
  // requestedMode/effectiveMode and may carry the retired run value
  // 'DETERMINISTIC_FALLBACK'. parseStoredPacket must normalize them on read.
  describe("parseStoredPacket backward-compatibility shim", () => {
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

    it("parses an old-shape packet (no mode fields + a DETERMINISTIC_FALLBACK run)", async () => {
      // A genuine pre-P2.2 payload is a LaunchOps V1 packet (V2 never existed
      // before P2.3), so the legacy-read path is exercised with a real V1 fixture
      // -- the live pipeline now emits V2, which would not round-trip through the
      // V1-legacy normalizer. Strip it back to the old shape: remove the packet-
      // level mode fields and rewrite one run to the retired 'DETERMINISTIC_
      // FALLBACK' value, exactly as a pre-P2.2 jsonb payload would.
      const valid = await makeV1Packet();

      const oldShape = JSON.parse(JSON.stringify(valid)) as Record<string, unknown>;
      // A genuine pre-P2.2 payload also predates P2.3, so it has no packetVersion.
      delete oldShape.packetVersion;
      delete oldShape.requestedMode;
      delete oldShape.effectiveMode;
      const oldRuns = oldShape.agentRuns as Array<Record<string, unknown>>;
      oldRuns[0].mode = "DETERMINISTIC_FALLBACK";

      const parsed = parseStoredPacket(oldShape);

      // The version-less legacy payload is tagged V1 (R4-7)...
      expect(parsed.packetVersion).toBe(1);
      // The retired run value is mapped to the degraded value...
      expect(parsed.agentRuns[0].mode).toBe("FAILED_TO_FALLBACK");
      // ...no run still carries the retired value...
      expect(
        parsed.agentRuns.some(
          (run) => (run.mode as string) === "DETERMINISTIC_FALLBACK"
        )
      ).toBe(false);
      // ...requestedMode is reconstructed to a non-failure value (no live runs
      // here, so deterministic rules)...
      expect(parsed.requestedMode).toBe("DETERMINISTIC_RULES");
      // ...and effectiveMode is derived from the normalized runs: the degraded
      // run makes the packet FAILED_TO_FALLBACK.
      expect(parsed.effectiveMode).toBe("FAILED_TO_FALLBACK");
    });

    it("leaves a current-shape packet unchanged", async () => {
      // The current pipeline output is now V2 (default Hormuz scenario); an
      // already-versioned payload passes straight through the normalizer unchanged.
      const valid = await runExceptionPipeline({ useLiveSignals: false });
      const roundTripped = JSON.parse(JSON.stringify(valid));

      const parsed = parseStoredPacket(roundTripped);

      expect(parsed.requestedMode).toBe("DETERMINISTIC_RULES");
      expect(parsed.effectiveMode).toBe("DETERMINISTIC_RULES");
      expect(
        parsed.agentRuns.every((run) => run.mode === "DETERMINISTIC_RULES")
      ).toBe(true);
    });
  });
});
