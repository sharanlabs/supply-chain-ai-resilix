import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decisionPacketAuditEvents } from "@/db/schema";
import { buildDecisionPacket } from "@/lib/pipeline/build-packet";
import { runExceptionPipeline } from "@/lib/pipeline/run-exception";
import { getDb } from "@/lib/server/db";
import { applyApprovalDecision } from "@/lib/server/decision-packet-service";
import {
  getDecisionPacket,
  getDecisionPacketByIdempotencyKey,
  getPacketStoreMode,
  saveDecisionPacket
} from "@/lib/server/store";

// Gated identically to evals/db-persistence.test.ts: only runs against a real
// Postgres when RUN_DB_INTEGRATION_TESTS=true AND DATABASE_URL is set. In normal
// CI (no DB) this file collects-then-skips, which is expected. It is the only
// exerciser of the db.transaction concurrency paths (F1/F4) under genuine
// connection-level parallelism: Promise.all over the pg Pool gives each
// db.transaction its own pooled connection, so the SELECT ... FOR UPDATE row
// lock and the unique processed_approval_events(event_id) insert are exercised
// for real, not coalesced onto one connection.
const shouldRun =
  process.env.RUN_DB_INTEGRATION_TESTS === "true" &&
  Boolean(process.env.DATABASE_URL?.trim());

const describeDb = shouldRun ? describe : describe.skip;

describeDb("Postgres data-layer concurrency integrity", () => {
  const originalEnableLiveAi = process.env.ENABLE_LIVE_AI;

  beforeAll(() => {
    process.env.ENABLE_LIVE_AI = "false";
  });

  afterAll(() => {
    if (originalEnableLiveAi === undefined) {
      delete process.env.ENABLE_LIVE_AI;
    } else {
      process.env.ENABLE_LIVE_AI = originalEnableLiveAi;
    }
  });

  it("resolves a concurrent approve/reject race on one PENDING packet with exactly one winner", async () => {
    expect(getPacketStoreMode()).toBe("postgres");

    const packet = await runExceptionPipeline({
      useLiveSignals: false,
      idempotencyKey: `db-race-${randomUUID()}`
    });

    // Precondition: the packet must be approvable, otherwise both calls return
    // BLOCKED and the race assertions are vacuous.
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

    // Exactly one wins (UPDATED), exactly one loses (CONFLICT). The losing
    // branch decides CONFLICT from the approval_status COLUMN (F4), so this
    // holds regardless of jsonb payload contents.
    const statuses = [approve.status, reject.status].sort();
    expect(statuses).toEqual(["CONFLICT", "UPDATED"]);

    const winner = approve.status === "UPDATED" ? approve : reject;
    if (winner.status !== "UPDATED") {
      throw new Error("Expected one UPDATED winner");
    }

    // Persisted status matches the winner (no lost update).
    const persisted = await getDecisionPacket(packet.id);
    expect(persisted?.approvalStatus).toBe(winner.packet.approvalStatus);
    expect(["APPROVED", "REJECTED"]).toContain(persisted?.approvalStatus);

    // Exactly one human-approval audit entry in the jsonb payload (no double
    // write).
    const humanApprovalEntries =
      persisted?.auditTrail.filter(
        (entry) => entry.action === "HUMAN_APPROVAL"
      ) ?? [];
    expect(humanApprovalEntries).toHaveLength(1);

    // F3 atomicity: the audit PROJECTION table (decision_packet_audit_events),
    // not just the payload, must hold exactly one HUMAN_APPROVAL row for the
    // winner. The transition writes the update + this projection in one
    // transaction, so a partial commit would surface here as 0 or >1 rows.
    const projectedAuditRows = await getDb()
      .select({ id: decisionPacketAuditEvents.id })
      .from(decisionPacketAuditEvents)
      .where(
        and(
          eq(decisionPacketAuditEvents.packetId, packet.id),
          eq(decisionPacketAuditEvents.action, "HUMAN_APPROVAL")
        )
      );
    expect(projectedAuditRows).toHaveLength(1);
  });

  it("never lets one eventId approve two different packets (F1 reservation race)", async () => {
    expect(getPacketStoreMode()).toBe("postgres");

    // Two independent PENDING packets (distinct idempotency keys => distinct
    // rows, so each approval can lock its own row and conditional-UPDATE
    // independently).
    const packetA = await runExceptionPipeline({
      useLiveSignals: false,
      idempotencyKey: `db-event-a-${randomUUID()}`
    });
    const packetB = await runExceptionPipeline({
      useLiveSignals: false,
      idempotencyKey: `db-event-b-${randomUUID()}`
    });

    expect(packetA.id).not.toBe(packetB.id);
    // Preconditions: both must be approvable for the race to be meaningful.
    expect(packetA.approvalStatus).toBe("PENDING");
    expect(packetA.gatekeeper.approvedForHumanReview).toBe(true);
    expect(packetB.approvalStatus).toBe("PENDING");
    expect(packetB.gatekeeper.approvedForHumanReview).toBe(true);

    // Same eventId, different packets, fired concurrently. The unique
    // processed_approval_events(event_id) insert is the atomic guard: at most
    // one transition may commit for this eventId.
    const sharedEventId = `cb-shared-${randomUUID()}`;

    const [resultA, resultB] = await Promise.all([
      applyApprovalDecision({
        packetId: packetA.id,
        approvalStatus: "APPROVED",
        reason: "Concurrent callback A",
        actor: "n8n-callback",
        auditAction: "N8N_APPROVAL_CALLBACK",
        eventId: sharedEventId
      }),
      applyApprovalDecision({
        packetId: packetB.id,
        approvalStatus: "APPROVED",
        reason: "Concurrent callback B",
        actor: "n8n-callback",
        auditAction: "N8N_APPROVAL_CALLBACK",
        eventId: sharedEventId
      })
    ]);

    // Exactly one UPDATED, exactly one EVENT_CONFLICT.
    const statuses = [resultA.status, resultB.status].sort();
    expect(statuses).toEqual(["EVENT_CONFLICT", "UPDATED"]);

    // Only one packet ends APPROVED; the other stays PENDING (its transition was
    // rolled back when its eventId reservation lost the race).
    const persistedA = await getDecisionPacket(packetA.id);
    const persistedB = await getDecisionPacket(packetB.id);
    const approvedCount = [persistedA, persistedB].filter(
      (p) => p?.approvalStatus === "APPROVED"
    ).length;
    const pendingCount = [persistedA, persistedB].filter(
      (p) => p?.approvalStatus === "PENDING"
    ).length;
    expect(approvedCount).toBe(1);
    expect(pendingCount).toBe(1);

    // The EVENT_CONFLICT loser reports the winning packet id.
    const loser = resultA.status === "EVENT_CONFLICT" ? resultA : resultB;
    const winner = resultA.status === "UPDATED" ? resultA : resultB;
    if (loser.status !== "EVENT_CONFLICT" || winner.status !== "UPDATED") {
      throw new Error("Expected exactly one EVENT_CONFLICT and one UPDATED");
    }
    expect(loser.packet?.id).toBe(winner.packet.id);
  });

  it("closes the cross-instance same-key save race: one packet persists, no orphan, both callers get the winner", async () => {
    expect(getPacketStoreMode()).toBe("postgres");

    // Two distinct packets that differ ONLY in id, sharing ONE idempotency key -- the
    // cross-instance scenario (two Node instances each built their own packet for the same
    // request). saveDecisionPacket is called DIRECTLY (not via runExceptionPipeline) to bypass
    // the in-process mutex and exercise the DB-layer reservation under genuine connection-level
    // parallelism (Promise.all over the pg Pool).
    const base = await buildDecisionPacket({ useLiveSignals: false });
    const sharedKey = `db-idem-race-${randomUUID()}`;
    const packetA = { ...base, id: `PKT-A-${randomUUID()}` };
    const packetB = { ...base, id: `PKT-B-${randomUUID()}` };

    const [savedA, savedB] = await Promise.all([
      saveDecisionPacket(packetA, { idempotencyKey: sharedKey }),
      saveDecisionPacket(packetB, { idempotencyKey: sharedKey })
    ]);

    // First-writer-wins: both callers receive the SAME winning packet.
    expect(savedA.id).toBe(savedB.id);
    const winnerId = savedA.id;
    expect([packetA.id, packetB.id]).toContain(winnerId);
    const loserId = winnerId === packetA.id ? packetB.id : packetA.id;

    // The key resolves to the winner; the winner persisted; the loser's packet was rolled back
    // (NO orphan) -- the F2 fix.
    expect((await getDecisionPacketByIdempotencyKey(sharedKey))?.id).toBe(winnerId);
    expect(await getDecisionPacket(winnerId)).toBeDefined();
    expect(await getDecisionPacket(loserId)).toBeUndefined();
  });
});
