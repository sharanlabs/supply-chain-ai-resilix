import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as n8nApprovalCallback } from "@/app/api/n8n/approval-callback/route";
import { runExceptionPipeline } from "@/lib/pipeline/run-exception";
import { getDecisionPacket } from "@/lib/server/store";
import { N8N_CALLBACK_SECRET_HEADER } from "@/lib/server/security";

describe("n8n approval callback controls", () => {
  const originalEnableLiveAi = process.env.ENABLE_LIVE_AI;
  const originalCallbackSecret = process.env.N8N_CALLBACK_SECRET;

  beforeEach(() => {
    process.env.ENABLE_LIVE_AI = "false";
    process.env.N8N_CALLBACK_SECRET = "callback-secret-for-test";
  });

  afterEach(() => {
    restoreEnv("ENABLE_LIVE_AI", originalEnableLiveAi);
    restoreEnv("N8N_CALLBACK_SECRET", originalCallbackSecret);
  });

  it("rejects callbacks when the configured shared secret is missing", async () => {
    const packet = await runExceptionPipeline({ useLiveSignals: false });

    const response = await n8nApprovalCallback(callbackRequest(packet.id));

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(getDecisionPacket(packet.id)).resolves.toMatchObject({
      approvalStatus: "PENDING"
    });
  });

  it("accepts callbacks when the shared secret matches", async () => {
    const packet = await runExceptionPipeline({ useLiveSignals: false });

    const response = await n8nApprovalCallback(
      callbackRequest(packet.id, "callback-secret-for-test")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.packet.approvalStatus).toBe("APPROVED");
    expect(body.packet.auditTrail.at(-1).actor).toBe("n8n-test-approver");
  });

  it("requires replay protection fields when callback secret is configured", async () => {
    const packet = await runExceptionPipeline({ useLiveSignals: false });

    const response = await n8nApprovalCallback(
      callbackRequest(packet.id, "callback-secret-for-test", {
        callbackEventId: undefined,
        callbackSentAt: undefined
      })
    );

    expect(response.status).toBe(400);
    await expect(getDecisionPacket(packet.id)).resolves.toMatchObject({
      approvalStatus: "PENDING"
    });
  });

  it("treats a repeated callback event as idempotent and does not duplicate audit entries", async () => {
    const packet = await runExceptionPipeline({ useLiveSignals: false });

    const first = await n8nApprovalCallback(
      callbackRequest(packet.id, "callback-secret-for-test", {
        callbackEventId: "evt-n8n-repeat-001"
      })
    );
    const packetAfterFirst = await getDecisionPacket(packet.id);
    const auditLengthAfterFirst = packetAfterFirst?.auditTrail.length;
    const second = await n8nApprovalCallback(
      callbackRequest(packet.id, "callback-secret-for-test", {
        callbackEventId: "evt-n8n-repeat-001"
      })
    );
    const secondBody = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(secondBody.mutationStatus).toBe("IDEMPOTENT");
    const packetAfterSecond = await getDecisionPacket(packet.id);
    expect(packetAfterSecond?.auditTrail).toHaveLength(auditLengthAfterFirst ?? 0);
  });
});

function callbackRequest(
  packetId: string,
  callbackSecret?: string,
  options: {
    callbackEventId?: string;
    callbackSentAt?: string;
  } = {}
) {
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };
  if (callbackSecret) {
    headers[N8N_CALLBACK_SECRET_HEADER] = callbackSecret;
  }

  return new Request("http://localhost/api/n8n/approval-callback", {
    method: "POST",
    headers,
    body: JSON.stringify({
      decisionPacketId: packetId,
      approvalStatus: "APPROVED",
      approver: "n8n-test-approver",
      reason: "Approved from protected callback test.",
      callbackEventId:
        "callbackEventId" in options
          ? options.callbackEventId
          : "evt-n8n-callback-test",
      callbackSentAt:
        "callbackSentAt" in options
          ? options.callbackSentAt
          : new Date().toISOString()
    })
  });
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
