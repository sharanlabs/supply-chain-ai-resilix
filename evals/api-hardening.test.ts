import { describe, expect, it } from "vitest";
import { POST as approvePacket } from "@/app/api/decision-packets/[id]/approve/route";
import { POST as runException } from "@/app/api/run-exception/route";
import { runExceptionPipeline } from "@/lib/pipeline/run-exception";
import { IDEMPOTENCY_KEY_HEADER } from "@/lib/server/security";
import { saveDecisionPacket } from "@/lib/server/store";

describe("api hardening", () => {
  it("rejects malformed JSON with a no-store error response", async () => {
    const response = await runException(
      new Request("http://localhost/api/run-exception", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{"
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.error).toBe("INVALID_JSON");
  });

  it("rejects oversized JSON request bodies", async () => {
    const response = await runException(
      new Request("http://localhost/api/run-exception", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId: "SCN-LAUNCH-001", padding: "x".repeat(20_000) })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toBe("REQUEST_TOO_LARGE");
  });

  it("returns the same packet for repeated run requests with the same idempotency key", async () => {
    const idempotencyKey = `test-run-${Date.now()}`;
    const first = await runException(runRequest(idempotencyKey));
    const second = await runException(runRequest(idempotencyKey));
    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstBody.packet.id).toBe(secondBody.packet.id);
  });

  it("prevents terminal approval decisions from being flipped", async () => {
    const packet = await runExceptionPipeline({ useLiveSignals: false });

    const approved = await approvePacket(approvalRequest("APPROVED"), routeParams(packet.id));
    const rejected = await approvePacket(approvalRequest("REJECTED"), routeParams(packet.id));
    const rejectedBody = await rejected.json();

    expect(approved.status).toBe(200);
    expect(rejected.status).toBe(409);
    expect(rejectedBody.error).toBe("CONFLICT");
  });

  it("prevents approval when the gatekeeper has blocked the packet", async () => {
    const packet = await runExceptionPipeline({ useLiveSignals: false });
    const blockedPacket = await saveDecisionPacket({
      ...packet,
      id: `${packet.id}-blocked`,
      approvalStatus: "PENDING",
      gatekeeper: {
        ...packet.gatekeeper,
        status: "BLOCKED",
        failures: ["forced blocked packet for approval hardening test"],
        approvedForHumanReview: false
      }
    });

    const response = await approvePacket(
      approvalRequest("APPROVED"),
      routeParams(blockedPacket.id)
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe("BLOCKED");
  });
});

function runRequest(idempotencyKey: string) {
  return new Request("http://localhost/api/run-exception", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [IDEMPOTENCY_KEY_HEADER]: idempotencyKey
    },
    body: JSON.stringify({
      scenarioId: "SCN-LAUNCH-001",
      useLiveSignals: false
    })
  });
}

function approvalRequest(status: "APPROVED" | "REJECTED") {
  return new Request("http://localhost/api/decision-packets/test/approve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      status,
      reason: `${status} during route hardening test.`
    })
  });
}

function routeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}
