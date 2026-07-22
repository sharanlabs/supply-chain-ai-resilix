import { describe, expect, it } from "vitest";
import { POST as approvePacket } from "@/app/api/decision-packets/[id]/approve/route";
import { POST as runException } from "@/app/api/run-exception/route";
import { runExceptionPipeline } from "@/lib/pipeline/run-exception";
import { IDEMPOTENCY_KEY_HEADER } from "@/lib/server/security";
import { GatekeeperReportSchema, gatekeeperClearsApproval } from "@/lib/schemas";
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
        body: JSON.stringify({ scenarioId: "SCN-HORMUZ", padding: "x".repeat(20_000) })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toBe("REQUEST_TOO_LARGE");
  });

  it("rejects an unknown scenario id with a 400, not a pipeline 500", async () => {
    const response = await runException(
      new Request("http://localhost/api/run-exception", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scenarioId: "SCN-DOES-NOT-EXIST",
          useLiveSignals: false
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("INVALID_SCENARIO_ID");
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

  // S-01 (2026-07-16 re-review): the approval boundary must gate on the WHOLE gatekeeper trio,
  // not the boolean alone. A stored report tampered to approvedForHumanReview=true while still
  // BLOCKED with failures (saveDecisionPacket does not re-parse, so this state is reachable --
  // exactly the DB-payload-tamper shape) used to sail through the boolean check and get APPROVED.
  it("prevents approval when a TAMPERED report says approved=true but is BLOCKED with failures", async () => {
    const packet = await runExceptionPipeline({ useLiveSignals: false });
    const tampered = await saveDecisionPacket({
      ...packet,
      id: `${packet.id}-tampered-gk`,
      approvalStatus: "PENDING",
      gatekeeper: {
        ...packet.gatekeeper,
        status: "BLOCKED",
        failures: ["real failure the tamper tried to bury"],
        approvedForHumanReview: true // the tamper
      }
    });

    const response = await approvePacket(
      approvalRequest("APPROVED"),
      routeParams(tampered.id)
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe("BLOCKED");
  });
});

describe("S-01 gatekeeper coherence (schema + the ONE approval predicate)", () => {
  const coherent = {
    status: "PASS" as const,
    failures: [],
    warnings: [],
    approvedForHumanReview: true,
    checkedAt: "2026-07-22T00:00:00.000Z"
  };

  it("the schema REJECTS an incoherent report (BLOCKED or failures with approved=true)", () => {
    expect(GatekeeperReportSchema.safeParse(coherent).success).toBe(true);
    expect(
      GatekeeperReportSchema.safeParse({ ...coherent, status: "BLOCKED" }).success
    ).toBe(false);
    expect(
      GatekeeperReportSchema.safeParse({ ...coherent, failures: ["f"] }).success
    ).toBe(false);
    // Coherent BLOCKED (approved=false) still parses -- the refine pins the UNSAFE combination
    // only, it does not reject legitimate blocked reports.
    expect(
      GatekeeperReportSchema.safeParse({
        ...coherent,
        status: "BLOCKED",
        failures: ["f"],
        approvedForHumanReview: false
      }).success
    ).toBe(true);
  });

  it("gatekeeperClearsApproval requires the WHOLE trio, not the boolean", () => {
    expect(gatekeeperClearsApproval(coherent)).toBe(true);
    expect(gatekeeperClearsApproval({ ...coherent, approvedForHumanReview: false })).toBe(false);
    expect(gatekeeperClearsApproval({ ...coherent, status: "BLOCKED" })).toBe(false);
    expect(gatekeeperClearsApproval({ ...coherent, failures: ["f"] })).toBe(false);
    // WARN with no failures is approvable (warnings never block).
    expect(gatekeeperClearsApproval({ ...coherent, status: "WARN" })).toBe(true);
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
      scenarioId: "SCN-HORMUZ",
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
