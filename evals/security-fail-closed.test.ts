import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  APPROVAL_TOKEN_HEADER,
  N8N_CALLBACK_SECRET_HEADER,
  secureModeRequired,
  verifyApprovalToken,
  verifyN8nCallbackSecret
} from "@/lib/server/security";
import { liveAiEnabled } from "@/lib/agents/run";
import { POST as uploadSuppliers } from "@/app/api/suppliers/upload/route";
import { POST as approvePacket } from "@/app/api/decision-packets/[id]/approve/route";
import { POST as runException } from "@/app/api/run-exception/route";
import { POST as n8nCallback } from "@/app/api/n8n/approval-callback/route";
import { __resetMemorySuppliersForTest } from "@/lib/server/supplier-store";
import { __resetRateLimitForTest } from "@/lib/server/rate-limit";

// P2.7 (R4-4) fail-closed auth. The centerpiece guard: secure mode + a missing
// token must DENY, not pass (the fail-open inversion this increment prevents).

// A configured token must be >= 16 chars (the security.ts MIN_APPROVAL_TOKEN_LENGTH).
const TOKEN = "test-approval-token-0001";

// Env keys this suite mutates -- saved + fully restored so it cannot leak.
const ENV_KEYS = [
  "DATABASE_URL",
  "ENABLE_LIVE_AI",
  "GEMINI_API_KEY",
  "REQUIRE_APPROVAL_TOKEN",
  "APPROVAL_TOKEN",
  "N8N_CALLBACK_SECRET"
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k]; // start every test from a clean, authless baseline
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function reqWith(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/x", { method: "POST", headers });
}
function bearer(token: string): Request {
  return reqWith({ [APPROVAL_TOKEN_HEADER]: `Bearer ${token}` });
}

describe("P2.7 secureModeRequired()", () => {
  it("FALSE for a pure in-memory demo (no DATABASE_URL, no live AI, no flag)", () => {
    expect(secureModeRequired()).toBe(false);
  });
  it("TRUE when DATABASE_URL is set", () => {
    process.env.DATABASE_URL = "postgres://x";
    expect(secureModeRequired()).toBe(true);
  });
  it("TRUE when live AI is enabled (ENABLE_LIVE_AI + GEMINI_API_KEY)", () => {
    process.env.ENABLE_LIVE_AI = "true";
    process.env.GEMINI_API_KEY = "k";
    expect(secureModeRequired()).toBe(true);
  });
  it("TRUE with the explicit REQUIRE_APPROVAL_TOKEN opt-in", () => {
    process.env.REQUIRE_APPROVAL_TOKEN = "true";
    expect(secureModeRequired()).toBe(true);
  });

  // Codex P2.7 [Med]: a strict `=== "true"` opt-in was a FAIL-OPEN -- an operator
  // who wrote True/1/yes/" true " stayed authless. envBool must honor intent.
  it("opt-in flag is robust (True/1/yes/on, case- + whitespace-insensitive) -- no fail-open", () => {
    for (const v of ["true", "TRUE", "True", " true ", "1", "yes", "on"]) {
      process.env.REQUIRE_APPROVAL_TOKEN = v;
      expect(secureModeRequired()).toBe(true);
    }
    for (const v of ["false", "0", "no", "off", "", "nope"]) {
      process.env.REQUIRE_APPROVAL_TOKEN = v;
      expect(secureModeRequired()).toBe(false);
    }
  });

  // liveAiEnabled is now a SHARED module (lib/server/env-flags), imported by both
  // security.ts and run.ts -- drift is structurally impossible. This confirms the
  // integration: the canonical predicate drives secureModeRequired's live-AI leg.
  it("live-AI leg uses the shared canonical liveAiEnabled()", () => {
    expect(liveAiEnabled()).toBe(false);
    expect(secureModeRequired()).toBe(false);

    process.env.ENABLE_LIVE_AI = "true"; // flag without key -> still off
    expect(liveAiEnabled()).toBe(false);
    expect(secureModeRequired()).toBe(false);

    process.env.GEMINI_API_KEY = "k"; // flag + key -> on
    expect(liveAiEnabled()).toBe(true);
    expect(secureModeRequired()).toBe(true);
  });
});

describe("P2.7 verifyApprovalToken() -- fail-closed", () => {
  it("pure demo: AUTHLESS pass (no Authorization header needed)", () => {
    const r = verifyApprovalToken(reqWith());
    expect(r.ok).toBe(true);
    expect(r.ok && r.mode).toBe("DEMO_UNCONFIGURED");
  });

  it("DENY-ON-MISSING-CONFIG: DATABASE_URL set + APPROVAL_TOKEN unset -> 503", () => {
    process.env.DATABASE_URL = "postgres://x";
    const r = verifyApprovalToken(bearer("anything"));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.status).toBe(503);
    expect(!r.ok && r.code).toBe("AUTH_NOT_CONFIGURED");
  });

  it("DENY: a too-short configured APPROVAL_TOKEN is a misconfig -> 503", () => {
    process.env.DATABASE_URL = "postgres://x";
    process.env.APPROVAL_TOKEN = "short"; // < 16 chars
    const r = verifyApprovalToken(bearer("short"));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.status).toBe(503);
  });

  describe("secure mode + a strong APPROVAL_TOKEN set", () => {
    beforeEach(() => {
      process.env.DATABASE_URL = "postgres://x";
      process.env.APPROVAL_TOKEN = TOKEN;
    });
    it("correct Bearer token -> AUTHORIZED", () => {
      const r = verifyApprovalToken(bearer(TOKEN));
      expect(r.ok).toBe(true);
      expect(r.ok && r.mode).toBe("AUTHORIZED");
    });
    it("wrong token -> 401", () => {
      const r = verifyApprovalToken(bearer("wrong-but-long-enough-xx"));
      expect(!r.ok && r.status).toBe(401);
    });
    it("missing Authorization header -> 401", () => {
      const r = verifyApprovalToken(reqWith());
      expect(!r.ok && r.status).toBe(401);
    });
    it("bare token (no Bearer scheme) -> 401", () => {
      const r = verifyApprovalToken(reqWith({ [APPROVAL_TOKEN_HEADER]: TOKEN }));
      expect(!r.ok && r.status).toBe(401);
    });
    it("Bearer scheme is case-insensitive", () => {
      const r = verifyApprovalToken(reqWith({ [APPROVAL_TOKEN_HEADER]: `bearer ${TOKEN}` }));
      expect(r.ok).toBe(true);
    });
  });

  it("corollary: live-AI mode (no DATABASE_URL) still requires the token", () => {
    process.env.ENABLE_LIVE_AI = "true";
    process.env.GEMINI_API_KEY = "k";
    process.env.APPROVAL_TOKEN = TOKEN;
    expect(verifyApprovalToken(reqWith()).ok).toBe(false); // no token -> denied
    expect(verifyApprovalToken(bearer(TOKEN)).ok).toBe(true); // correct -> ok
  });
});

describe("P2.7 verifyN8nCallbackSecret() -- mandatory in secure mode", () => {
  it("pure demo + secret unset -> AUTHLESS pass (preserved)", () => {
    const r = verifyN8nCallbackSecret(reqWith());
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("DEMO_UNCONFIGURED");
  });
  it("secure mode + secret unset -> DENIED (no demo pass-through)", () => {
    process.env.DATABASE_URL = "postgres://x";
    const r = verifyN8nCallbackSecret(reqWith());
    expect(r.ok).toBe(false);
    expect(r.mode).toBe("SECRET_REQUIRED_UNCONFIGURED");
  });
  it("secure mode + secret set but TOO SHORT -> DENIED (weak-config, fail-closed)", () => {
    process.env.DATABASE_URL = "postgres://x";
    process.env.N8N_CALLBACK_SECRET = "short-secret"; // < 16 chars
    const r = verifyN8nCallbackSecret(reqWith({ [N8N_CALLBACK_SECRET_HEADER]: "short-secret" }));
    expect(r.ok).toBe(false);
    expect(r.mode).toBe("SECRET_REQUIRED_UNCONFIGURED");
  });
  it("secure mode + secret set and STRONG -> verified against the header", () => {
    process.env.DATABASE_URL = "postgres://x";
    process.env.N8N_CALLBACK_SECRET = "a-strong-callback-secret-value"; // >= 16 chars
    expect(
      verifyN8nCallbackSecret(
        reqWith({ [N8N_CALLBACK_SECRET_HEADER]: "a-strong-callback-secret-value" })
      ).ok
    ).toBe(true);
  });
  it("secret set + correct header -> ok", () => {
    process.env.N8N_CALLBACK_SECRET = "cb-secret";
    expect(
      verifyN8nCallbackSecret(reqWith({ [N8N_CALLBACK_SECRET_HEADER]: "cb-secret" })).ok
    ).toBe(true);
  });
  it("secret set + wrong header -> denied", () => {
    process.env.N8N_CALLBACK_SECRET = "cb-secret";
    expect(
      verifyN8nCallbackSecret(reqWith({ [N8N_CALLBACK_SECRET_HEADER]: "nope" })).ok
    ).toBe(false);
  });
});

// Route-level proof the gates actually fire -- in-memory (REQUIRE_APPROVAL_TOKEN,
// no DATABASE_URL) so no Postgres is needed. approve + run-exception were UNGATED
// before P2.7; these are the regression guards.
describe("P2.7 route gates (secure mode via REQUIRE_APPROVAL_TOKEN, in-memory)", () => {
  beforeEach(() => {
    process.env.REQUIRE_APPROVAL_TOKEN = "true";
    process.env.APPROVAL_TOKEN = TOKEN;
  });
  afterEach(() => {
    __resetMemorySuppliersForTest();
    __resetRateLimitForTest();
  });

  it("approve: no token -> 401 (route was previously unauthenticated)", async () => {
    const res = await approvePacket(
      new Request("http://localhost/api/decision-packets/PKT-1/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "APPROVED", reason: "ok" })
      }),
      { params: Promise.resolve({ id: "PKT-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("approve: correct token passes auth (404 not 401 -- packet absent)", async () => {
    const res = await approvePacket(
      new Request("http://localhost/api/decision-packets/PKT-MISSING/approve", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${TOKEN}`
        },
        body: JSON.stringify({ status: "APPROVED", reason: "ok" })
      }),
      { params: Promise.resolve({ id: "PKT-MISSING" }) }
    );
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(404);
  });

  it("run-exception: no token -> 401 (route was previously unauthenticated)", async () => {
    const res = await runException(
      new Request("http://localhost/api/run-exception", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId: "SCN-HORMUZ" })
      })
    );
    expect(res.status).toBe(401);
  });

  it("n8n callback: secure mode + missing N8N_CALLBACK_SECRET -> 401 (denied before any mutation)", async () => {
    // secure mode is on (REQUIRE_APPROVAL_TOKEN), but no callback secret is set.
    const res = await n8nCallback(
      new Request("http://localhost/api/n8n/approval-callback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ callbackEventId: "EVT-1", packetId: "PKT-1", status: "APPROVED" })
      })
    );
    expect(res.status).toBe(401);
  });

  it("upload: token unset in secure mode -> 503 (deny-on-missing-config)", async () => {
    delete process.env.APPROVAL_TOKEN;
    const res = await uploadSuppliers(
      new Request("http://localhost/api/suppliers/upload", {
        method: "POST",
        headers: { "content-type": "text/csv" },
        body: "name,country\nAcme,US"
      })
    );
    expect(res.status).toBe(503);
  });

  it("upload: correct token -> proceeds (200, in-memory store)", async () => {
    const res = await uploadSuppliers(
      new Request("http://localhost/api/suppliers/upload", {
        method: "POST",
        headers: {
          "content-type": "text/csv",
          authorization: `Bearer ${TOKEN}`
        },
        body:
          "name,country,region,risk_tier,sector,standard_lead_time_days\n" +
          "Acme Components,US,West,HIGH,SEMICONDUCTORS,30"
      })
    );
    expect(res.status).toBe(200);
  });
});
