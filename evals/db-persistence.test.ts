import { randomUUID } from "node:crypto";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { runExceptionPipeline } from "@/lib/pipeline/run-exception";
import {
  getDecisionPacket,
  getDecisionPacketByIdempotencyKey,
  getPacketStoreMode
} from "@/lib/server/store";
import { applyApprovalDecision } from "@/lib/server/decision-packet-service";

const shouldRun =
  process.env.RUN_DB_INTEGRATION_TESTS === "true" &&
  Boolean(process.env.DATABASE_URL?.trim());

const describeDb = shouldRun ? describe : describe.skip;

describeDb("Postgres packet store integration", () => {
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

  it("persists scenario packets, run idempotency, approval status, and callback event idempotency", async () => {
    expect(getPacketStoreMode()).toBe("postgres");

    const idempotencyKey = `db-${randomUUID()}`;
    const callbackEventId = `cb-${randomUUID()}`;

    const packet = await runExceptionPipeline({
      useLiveSignals: false,
      idempotencyKey
    });

    const packetById = await getDecisionPacket(packet.id);
    expect(packetById?.id).toBe(packet.id);
    expect(packetById?.approvalStatus).toBe("PENDING");

    const packetByKey = await getDecisionPacketByIdempotencyKey(idempotencyKey);
    expect(packetByKey?.id).toBe(packet.id);

    const repeatedRun = await runExceptionPipeline({
      useLiveSignals: false,
      idempotencyKey
    });
    expect(repeatedRun.id).toBe(packet.id);

    const approval = await applyApprovalDecision({
      packetId: packet.id,
      approvalStatus: "APPROVED",
      reason: "Database integration approval proof",
      actor: "db-integration-test",
      auditAction: "N8N_APPROVAL_CALLBACK",
      eventId: callbackEventId
    });

    expect(approval.status).toBe("UPDATED");
    if (approval.status !== "UPDATED") {
      throw new Error(`Expected approval update, received ${approval.status}`);
    }
    expect(approval.packet.approvalStatus).toBe("APPROVED");

    const repeatedApproval = await applyApprovalDecision({
      packetId: packet.id,
      approvalStatus: "APPROVED",
      reason: "Database integration approval proof",
      actor: "db-integration-test",
      auditAction: "N8N_APPROVAL_CALLBACK",
      eventId: callbackEventId
    });

    expect(repeatedApproval.status).toBe("IDEMPOTENT");

    const approvedPacket = await getDecisionPacket(packet.id);
    expect(approvedPacket?.approvalStatus).toBe("APPROVED");
    expect(
      approvedPacket?.auditTrail.some(
        (entry) =>
          entry.actor === "db-integration-test" &&
          entry.action === "N8N_APPROVAL_CALLBACK"
      )
    ).toBe(true);
  });
});
