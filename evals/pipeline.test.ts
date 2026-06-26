import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runExceptionPipeline } from "@/lib/pipeline/run-exception";
import { getDecisionPacket } from "@/lib/server/store";
import {
  DecisionPacketV2Schema,
  type DecisionPacket,
  type DecisionPacketV2
} from "@/lib/schemas";

// D.1 V2 cutover: the live pipeline now emits the ActionOps V2 packet (it replaced
// the LaunchOps V1 body). buildDecisionPacket owns the PURE assembly + schema
// validation -- evals/actionops-pipeline.test.ts grades that and the F graders.
// THIS file asserts the pipeline WRAPPER's two added responsibilities: it emits a
// valid V2 AND persists it (the UI render path calls buildDecisionPacket directly
// and never writes), plus the key-OFF mode invariant (every run is a healthy
// DETERMINISTIC_RULES run, never mislabeled live or degraded).
function expectV2(packet: DecisionPacket): asserts packet is DecisionPacketV2 {
  expect(packet.packetVersion).toBe(2);
  if (packet.packetVersion !== 2) {
    throw new Error(`expected a V2 packet, got packetVersion=${packet.packetVersion}`);
  }
}

describe("exception pipeline (V2 cutover)", () => {
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

  it("emits a schema-valid V2 packet and persists it", async () => {
    const packet = await runExceptionPipeline({ useLiveSignals: false });

    expectV2(packet);
    expect(DecisionPacketV2Schema.safeParse(packet).success).toBe(true);
    expect(packet.gatekeeper.status).not.toBe("BLOCKED");
    // The seven ActionOps agents ran (the six original + the Phase-4 Skeptic) and produced the
    // briefing payload. The Skeptic key-OFF is a deterministic affirmative pass.
    expect(packet.agentRuns).toHaveLength(7);
    expect(packet.exposureResults.length).toBeGreaterThan(0);
    expect(packet.supplierMessages.length).toBeGreaterThan(0);

    // The wrapper persists (assembly does not): the packet is retrievable by id.
    const stored = await getDecisionPacket(packet.id);
    expect(stored?.id).toBe(packet.id);
    expect(stored?.packetVersion).toBe(2);
  });

  it("records repeatable agent metadata without live model credentials", async () => {
    const packet = await runExceptionPipeline({ useLiveSignals: false });

    expectV2(packet);
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
