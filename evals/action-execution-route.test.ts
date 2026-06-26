import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildDecisionPacket } from "@/lib/pipeline/build-packet";
import type { DecisionPacketV2 } from "@/lib/schemas";
import { getDecisionPacket, saveDecisionPacket } from "@/lib/server/store";
import { __resetRateLimitForTest } from "@/lib/server/rate-limit";
import { __resetExecutedActionsForTest } from "@/lib/server/action-executor";
import { POST as executePacket } from "@/app/api/decision-packets/[id]/execute/route";

// ---------------------------------------------------------------------------
// Phase 5 -- the execute route. Secure mode is enabled via REQUIRE_APPROVAL_TOKEN
// (no DATABASE_URL => in-memory store, no Postgres needed), mirroring the P2.7
// security-fail-closed route tests. The default transport is the Noop, so this route
// can never fire a real outward send.
// ---------------------------------------------------------------------------

const TOKEN = "test-approval-token-0001"; // >= 16 chars (security.ts floor)

const ENV_KEYS = [
  "DATABASE_URL",
  "ENABLE_LIVE_AI",
  "GEMINI_API_KEY",
  "REQUIRE_APPROVAL_TOKEN",
  "APPROVAL_TOKEN",
  "ENABLE_REVERSIBLE_AUTO_EXECUTE"
] as const;

let saved: Record<string, string | undefined>;
let basePacket: DecisionPacketV2;
let seq = 0;

function executeReq(id: string, token?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(`http://localhost/api/decision-packets/${id}/execute`, {
    method: "POST",
    headers
  });
}

async function persistPacket(
  approvalStatus: DecisionPacketV2["approvalStatus"]
): Promise<DecisionPacketV2> {
  // A unique id per fixture so executed-action keys + stored status never bleed
  // across tests.
  seq += 1;
  const packet: DecisionPacketV2 = {
    ...basePacket,
    id: `DP-route-${seq}`,
    approvalStatus
  };
  await saveDecisionPacket(packet);
  return packet;
}

beforeAll(async () => {
  basePacket = await buildDecisionPacket({ useLiveSignals: false });
});

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  // Secure mode without a DB: the route requires the bearer token.
  process.env.REQUIRE_APPROVAL_TOKEN = "true";
  process.env.APPROVAL_TOKEN = TOKEN;
  __resetExecutedActionsForTest();
});

afterEach(() => {
  __resetRateLimitForTest();
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("execute route -- auth / fail-closed", () => {
  it("no token in secure mode -> 401 (denied before any work)", async () => {
    const res = await executePacket(executeReq("DP-anything"), {
      params: Promise.resolve({ id: "DP-anything" })
    });
    expect(res.status).toBe(401);
  });

  it("correct token, missing packet -> 404 (auth passed)", async () => {
    const res = await executePacket(executeReq("DP-missing", TOKEN), {
      params: Promise.resolve({ id: "DP-missing" })
    });
    expect(res.status).toBe(404);
  });

  it("an unapproved (PENDING) packet -> 422 NOT_APPROVED", async () => {
    const packet = await persistPacket("PENDING");
    const res = await executePacket(executeReq(packet.id, TOKEN), {
      params: Promise.resolve({ id: packet.id })
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("NOT_APPROVED");
  });
});

describe("execute route -- graduated autonomy on an APPROVED packet", () => {
  it("default (flag OFF): reversible SKIPPED, outward PENDING, nothing executed", async () => {
    const packet = await persistPacket("APPROVED");
    const res = await executePacket(executeReq(packet.id, TOKEN), {
      params: Promise.resolve({ id: packet.id })
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    const summary = body.execution;
    expect(summary.executed).toBe(0);
    for (const row of summary.actions) {
      expect(row.status).toBe(
        row.reversibility === "REVERSIBLE" ? "SKIPPED" : "PENDING"
      );
    }
  });

  it("flag ON: reversible auto-fires via the Noop; outward stays PENDING (never sent)", async () => {
    process.env.ENABLE_REVERSIBLE_AUTO_EXECUTE = "true";
    const packet = await persistPacket("APPROVED");
    const res = await executePacket(executeReq(packet.id, TOKEN), {
      params: Promise.resolve({ id: packet.id })
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    const summary = body.execution;
    expect(summary.executed).toBeGreaterThan(0);

    for (const row of summary.actions) {
      if (row.reversibility === "REVERSIBLE") {
        expect(row.status).toBe("EXECUTED");
        // The route uses the DEFAULT Noop transport -- logged, not really sent.
        expect(row.auditDetail).toContain("noop");
        expect(row.auditDetail).toContain("delivered=false");
      } else {
        // Outward/irreversible is never auto-sent, flag or no flag.
        expect(row.status).toBe("PENDING");
      }
    }

    // Execution is recorded on the packet's audit trail -- the same surface human
    // approval writes to, so an execution shows up where the approval does.
    const stored = await getDecisionPacket(packet.id);
    expect(
      stored?.auditTrail.some((e) => e.action === "ACTION_EXECUTION")
    ).toBe(true);
  });
});
