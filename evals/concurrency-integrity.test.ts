import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as agentRunModule from "@/lib/agents/run";
import { applyApprovalDecision } from "@/lib/server/decision-packet-service";
import { runExceptionPipeline } from "@/lib/pipeline/run-exception";
import {
  getDecisionPacket,
  getDecisionPacketByIdempotencyKey,
  getPacketStoreMode,
  listDecisionPackets,
  saveDecisionPacket
} from "@/lib/server/store";

// These tests run in the default in-memory store mode (no DATABASE_URL), so
// they exercise the synchronous compare-and-set and the in-process mutex.
// The Postgres db.transaction path is NOT covered here; the gated
// evals/db-persistence.test.ts is the only exerciser of the pg driver.
describe("data-layer concurrency integrity (memory store)", () => {
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

  it("guards against running on the postgres store by accident", () => {
    expect(getPacketStoreMode()).toBe("memory");
  });

  it("resolves a concurrent approve/reject race with exactly one winner", async () => {
    const packet = await runExceptionPipeline({ useLiveSignals: false });

    // Precondition: the packet must be approvable, otherwise both calls would
    // return BLOCKED and the race assertions would be meaningless.
    expect(packet.approvalStatus).toBe("PENDING");
    expect(packet.gatekeeper.approvedForHumanReview).toBe(true);

    const [approve, reject] = await Promise.all([
      applyApprovalDecision({
        packetId: packet.id,
        approvalStatus: "APPROVED",
        reason: "Concurrent approve",
        actor: "race-approver",
        auditAction: "HUMAN_APPROVAL"
      }),
      applyApprovalDecision({
        packetId: packet.id,
        approvalStatus: "REJECTED",
        reason: "Concurrent reject",
        actor: "race-rejecter",
        auditAction: "HUMAN_APPROVAL"
      })
    ]);

    const statuses = [approve.status, reject.status].sort();
    // Exactly one wins (UPDATED), exactly one loses (CONFLICT).
    expect(statuses).toEqual(["CONFLICT", "UPDATED"]);

    const winner = approve.status === "UPDATED" ? approve : reject;
    if (winner.status !== "UPDATED") {
      throw new Error("Expected one UPDATED winner");
    }

    // The persisted status matches the winner (no lost update).
    const persisted = await getDecisionPacket(packet.id);
    expect(persisted?.approvalStatus).toBe(winner.packet.approvalStatus);
    expect(["APPROVED", "REJECTED"]).toContain(persisted?.approvalStatus);

    // The audit trail has exactly one human-approval entry (no double write).
    const humanApprovalEntries =
      persisted?.auditTrail.filter(
        (entry) => entry.action === "HUMAN_APPROVAL"
      ) ?? [];
    expect(humanApprovalEntries).toHaveLength(1);
  });

  it("runs the pipeline at most once for concurrent calls with the same idempotency key", async () => {
    const idempotencyKey = `idem-${randomUUID()}`;

    // Spy on the expensive boundary (the LLM/agent fan-out). The packet-id
    // equality below proves a fresh id was not minted, but it cannot prove the
    // agents did not re-run on a coalesced result; this counter does. The spy
    // wraps the real implementation so behavior is unchanged.
    const agentSpy = vi.spyOn(agentRunModule, "runLaunchOpsAgents");

    try {
      const [first, second] = await Promise.all([
        runExceptionPipeline({ useLiveSignals: false, idempotencyKey }),
        runExceptionPipeline({ useLiveSignals: false, idempotencyKey })
      ]);

      // Two concurrent same-key calls must execute the expensive agent boundary
      // exactly once. This is the direct single-execution assertion.
      expect(agentSpy).toHaveBeenCalledTimes(1);

      // Same packet id directly proves single execution: a second pipeline body
      // would mint a fresh DP-${randomUUID()} id, so equal ids => ran once.
      expect(first.id).toBe(second.id);

      // Exactly one packet exists for the key, and agent runs are identical.
      const byKey = await getDecisionPacketByIdempotencyKey(idempotencyKey);
      expect(byKey?.id).toBe(first.id);

      const packetsForKey = (await listDecisionPackets()).filter(
        (candidate) => candidate.id === first.id
      );
      expect(packetsForKey).toHaveLength(1);

      expect(first.agentRuns.map((run) => run.id)).toEqual(
        second.agentRuns.map((run) => run.id)
      );
    } finally {
      agentSpy.mockRestore();
    }
  });

  it("control: distinct-key concurrent calls each execute the agent boundary (spy observes real calls)", async () => {
    // Control for the single-execution assertion above. If the spy were
    // detached and silently counting nothing, BOTH this test (expects 2) and
    // the same-key test (expects 1) could not pass; this proves the spy
    // actually observes pipeline executions rather than coincidentally reading 0
    // or 1.
    const agentSpy = vi.spyOn(agentRunModule, "runLaunchOpsAgents");

    try {
      const [first, second] = await Promise.all([
        runExceptionPipeline({
          useLiveSignals: false,
          idempotencyKey: `idem-a-${randomUUID()}`
        }),
        runExceptionPipeline({
          useLiveSignals: false,
          idempotencyKey: `idem-b-${randomUUID()}`
        })
      ]);

      expect(agentSpy).toHaveBeenCalledTimes(2);
      expect(first.id).not.toBe(second.id);
    } finally {
      agentSpy.mockRestore();
    }
  });

  it("returns the persisted packet for a same-key call made after completion", async () => {
    const idempotencyKey = `idem-after-${randomUUID()}`;

    const first = await runExceptionPipeline({
      useLiveSignals: false,
      idempotencyKey
    });
    const second = await runExceptionPipeline({
      useLiveSignals: false,
      idempotencyKey
    });

    expect(second.id).toBe(first.id);
  });

  it("treats a repeated same-target approval as idempotent (single audit entry)", async () => {
    const packet = await runExceptionPipeline({ useLiveSignals: false });

    const first = await applyApprovalDecision({
      packetId: packet.id,
      approvalStatus: "APPROVED",
      reason: "First approval",
      actor: "approver",
      auditAction: "HUMAN_APPROVAL"
    });
    expect(first.status).toBe("UPDATED");

    const second = await applyApprovalDecision({
      packetId: packet.id,
      approvalStatus: "APPROVED",
      reason: "Repeat approval",
      actor: "approver",
      auditAction: "HUMAN_APPROVAL"
    });
    expect(second.status).toBe("IDEMPOTENT");

    const persisted = await getDecisionPacket(packet.id);
    const humanApprovalEntries =
      persisted?.auditTrail.filter(
        (entry) => entry.action === "HUMAN_APPROVAL"
      ) ?? [];
    expect(humanApprovalEntries).toHaveLength(1);
  });

  it("preserves the seam contract on a missing packet", async () => {
    const result = await applyApprovalDecision({
      packetId: `DP-${randomUUID()}`,
      approvalStatus: "APPROVED",
      reason: "No such packet",
      actor: "approver",
      auditAction: "HUMAN_APPROVAL"
    });

    expect(result.status).toBe("NOT_FOUND");
  });

  it("keeps the saveDecisionPacket idempotency index addressable", async () => {
    const idempotencyKey = `idem-direct-${randomUUID()}`;
    const packet = await runExceptionPipeline({ useLiveSignals: false });
    await saveDecisionPacket(packet, { idempotencyKey });
    const byKey = await getDecisionPacketByIdempotencyKey(idempotencyKey);
    expect(byKey?.id).toBe(packet.id);
  });
});
