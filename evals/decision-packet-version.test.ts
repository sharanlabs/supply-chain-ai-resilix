import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DecisionPacketSchema,
  DecisionPacketV2Schema
} from "@/lib/schemas";
import type { DecisionPacketV1 } from "@/lib/schemas";
import {
  getDecisionPacket,
  parseStoredPacket,
  saveDecisionPacket,
  toDecisionPacketRow,
  transitionApproval
} from "@/lib/server/store";
import { runExceptionPipeline } from "@/lib/pipeline/run-exception";
import { makeV2Packet } from "./fixtures/decision-packet-v2";

// A V1 packet from the live (deterministic) pipeline, used to exercise the V1
// arm of the union and the legacy read-compat path.
async function buildV1Packet(): Promise<DecisionPacketV1> {
  const packet = await runExceptionPipeline({
    scenarioId: "SCN-LAUNCH-001",
    useLiveSignals: false
  });
  if (packet.packetVersion !== 1) {
    throw new Error("pipeline unexpectedly produced a non-V1 packet");
  }
  return packet;
}

describe("decision packet versioning (R4-7)", () => {
  const originalEnableLiveAi = process.env.ENABLE_LIVE_AI;

  beforeAll(() => {
    process.env.ENABLE_LIVE_AI = "false";
  });

  afterAll(() => {
    if (originalEnableLiveAi === undefined) {
      delete process.env.ENABLE_LIVE_AI;
      return;
    }
    process.env.ENABLE_LIVE_AI = originalEnableLiveAi;
  });

  it("accepts the live pipeline's V1 packet under the union", async () => {
    const packet = await buildV1Packet();
    expect(packet.packetVersion).toBe(1);
    expect(DecisionPacketSchema.safeParse(packet).success).toBe(true);
  });

  it("accepts a V2 (ActionOps) packet under the union", () => {
    const parsed = DecisionPacketSchema.safeParse(makeV2Packet());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.packetVersion).toBe(2);
    }
  });

  it("rejects an unknown packetVersion", () => {
    const bad = { ...makeV2Packet(), packetVersion: 3 };
    expect(DecisionPacketSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a V2 packet missing an ActionOps section", () => {
    const { threatCard: _threatCard, ...withoutThreatCard } = makeV2Packet();
    void _threatCard;
    expect(DecisionPacketV2Schema.safeParse(withoutThreatCard).success).toBe(false);
  });

  it("does not carry the LaunchOps options/executionDraft contract into V2", () => {
    // R4-7's intent: V2 must not silently reuse the V1 shape. Zod strips unknown
    // keys, so a V2 parse of an object that also has options/executionDraft drops
    // them — proving they are not part of the V2 contract.
    const parsed = DecisionPacketV2Schema.parse({
      ...makeV2Packet(),
      options: [{ id: "OPT-X" }],
      executionDraft: { supplierMessage: "x" }
    });
    expect("options" in parsed).toBe(false);
    expect("executionDraft" in parsed).toBe(false);
  });

  it("reads a legacy (pre-P2.3) payload back as V1 with backfilled modes", async () => {
    const packet = await buildV1Packet();
    // Simulate a payload persisted before P2.3 (and before the P2.2 mode split):
    // no packetVersion, no requested/effective mode.
    const legacy = structuredClone(packet) as Record<string, unknown>;
    delete legacy.packetVersion;
    delete legacy.requestedMode;
    delete legacy.effectiveMode;

    const restored = parseStoredPacket(legacy);
    expect(restored.packetVersion).toBe(1);
    expect(restored.requestedMode).toBe("DETERMINISTIC_RULES");
    expect(restored.effectiveMode).toBe("DETERMINISTIC_RULES");
  });

  it("remaps the retired DETERMINISTIC_FALLBACK run mode on a legacy payload", async () => {
    const packet = await buildV1Packet();
    const legacy = structuredClone(packet) as Record<string, unknown>;
    delete legacy.packetVersion;
    delete legacy.requestedMode;
    delete legacy.effectiveMode;
    // A pre-P2.2 run carried the now-retired 'DETERMINISTIC_FALLBACK' value.
    const runs = legacy.agentRuns as Array<Record<string, unknown>>;
    runs[0].mode = "DETERMINISTIC_FALLBACK";

    const restored = parseStoredPacket(legacy);
    expect(restored.packetVersion).toBe(1);
    expect(restored.agentRuns[0].mode).toBe("FAILED_TO_FALLBACK");
    // A failed live attempt makes the effective mode the degraded value.
    expect(restored.effectiveMode).toBe("FAILED_TO_FALLBACK");
  });

  it("passes an already-versioned V2 payload straight through parseStoredPacket", () => {
    const v2 = makeV2Packet();
    const restored = parseStoredPacket(v2);
    expect(restored.packetVersion).toBe(2);
    expect(restored).toEqual(v2);
  });

  it("fails loudly on a malformed V2 payload (missing modes), not silently repaired", () => {
    // The normalizer only upgrades version-less legacy payloads; an already-
    // versioned packet is NOT mode-backfilled, so a malformed V2 must reject.
    const {
      requestedMode: _requestedMode,
      effectiveMode: _effectiveMode,
      ...malformed
    } = makeV2Packet();
    void _requestedMode;
    void _effectiveMode;
    expect(() => parseStoredPacket(malformed)).toThrow();
  });

  it("fails loudly on a V2 payload carrying the retired run mode, not remapped", () => {
    // On a version-less legacy payload this value is remapped; on a VERSIONED
    // payload it must fail the schema rather than be silently patched.
    const malformed = {
      ...makeV2Packet(),
      agentRuns: [
        {
          id: "RUN-legacy",
          agentName: "Test Agent",
          model: "deterministic-rules",
          mode: "DETERMINISTIC_FALLBACK",
          latencyMs: 0,
          tokenEstimate: 1,
          inputHash: "in",
          outputHash: "out",
          validationStatus: "PASS",
          summary: "retired-mode run",
          createdAt: "2026-06-13T12:00:00.000Z"
        }
      ]
    };
    expect(() => parseStoredPacket(malformed)).toThrow();
  });

  it("derives the NOT NULL exception_id from the right field per version", async () => {
    const v1 = await buildV1Packet();
    const v2 = makeV2Packet();
    // V1 keys the column off the launch exception; V2 off the threat card. A
    // null here would fail the NOT NULL column on the Postgres insert path.
    expect(toDecisionPacketRow(v1).exceptionId).toBe(v1.exception.id);
    expect(toDecisionPacketRow(v2).exceptionId).toBe(v2.threatCard.id);
  });

  it("round-trips a V2 packet through the store", async () => {
    const v2 = makeV2Packet({ id: "DP-v2-roundtrip" });
    await saveDecisionPacket(v2);
    const loaded = await getDecisionPacket("DP-v2-roundtrip");
    expect(loaded?.packetVersion).toBe(2);
    expect(loaded).toEqual(v2);
  });

  it("approves a V2 packet without fabricating a V1 exception field", async () => {
    const v2 = makeV2Packet({ id: "DP-v2-approve" });
    await saveDecisionPacket(v2);

    const result = await transitionApproval({
      packetId: "DP-v2-approve",
      approvalStatus: "APPROVED",
      reason: "V2 approval path test.",
      actor: "tester",
      auditAction: "HUMAN_APPROVAL"
    });

    expect(result.status).toBe("UPDATED");
    if (result.status !== "UPDATED") return;
    expect(result.packet.packetVersion).toBe(2);
    expect(result.packet.approvalStatus).toBe("APPROVED");
    // V2 has no embedded exception; the approval mutation must not invent one.
    expect("exception" in result.packet).toBe(false);
    // The audit row is appended in the same shape as V1.
    expect(result.packet.auditTrail.at(-1)).toMatchObject({
      actor: "tester",
      action: "HUMAN_APPROVAL"
    });
  });
});
