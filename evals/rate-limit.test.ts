import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MUTATION_RATE_LIMIT,
  __resetRateLimitForTest,
  checkRateLimit,
  clientIdFromRequest,
  enforceMutationRateLimit
} from "@/lib/server/rate-limit";
import { POST as uploadSuppliers } from "@/app/api/suppliers/upload/route";
import { POST as n8nCallback } from "@/app/api/n8n/approval-callback/route";
import { __resetMemorySuppliersForTest } from "@/lib/server/supplier-store";

// Item 1: dependency-free fixed-window rate limiter on the mutation surface.
// `now` is injected throughout so the window is driven deterministically (no sleeps).

const HEADER = "name,country,region,risk_tier,sector,standard_lead_time_days";
const ROW = "Acme Components,US,West,HIGH,SEMICONDUCTORS,30";

describe("rate-limit: core fixed-window decision", () => {
  beforeEach(() => __resetRateLimitForTest());
  afterEach(() => __resetRateLimitForTest());

  const small = { limit: 3, windowMs: 60_000 };

  it("allows requests up to the limit within one window", () => {
    const t0 = 1_000_000;
    expect(checkRateLimit("k", small, t0).allowed).toBe(true); // 1
    expect(checkRateLimit("k", small, t0 + 1).allowed).toBe(true); // 2
    const third = checkRateLimit("k", small, t0 + 2); // 3 -> last allowed
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
  });

  it("denies the request that breaches the limit with a 429-worthy decision", () => {
    const t0 = 2_000_000;
    for (let i = 0; i < small.limit; i++) {
      expect(checkRateLimit("k", small, t0).allowed).toBe(true);
    }
    const breach = checkRateLimit("k", small, t0); // 4th in the same window
    expect(breach.allowed).toBe(false);
    expect(breach.remaining).toBe(0);
    // Retry-After is rounded UP and never below 1s.
    expect(breach.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(breach.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("resets once the window has fully elapsed", () => {
    const t0 = 3_000_000;
    for (let i = 0; i < small.limit; i++) {
      checkRateLimit("k", small, t0);
    }
    expect(checkRateLimit("k", small, t0).allowed).toBe(false); // still in window

    // Step PAST the window boundary -> a fresh window, count restarts at 1.
    const after = checkRateLimit("k", small, t0 + small.windowMs);
    expect(after.allowed).toBe(true);
    expect(after.remaining).toBe(small.limit - 1);
  });

  it("keys are independent (one key exhausting does not block another)", () => {
    const t0 = 4_000_000;
    for (let i = 0; i < small.limit; i++) {
      checkRateLimit("a", small, t0);
    }
    expect(checkRateLimit("a", small, t0).allowed).toBe(false);
    // A different key has its own fresh budget.
    expect(checkRateLimit("b", small, t0).allowed).toBe(true);
  });

  it("Retry-After rounds a sub-second remainder up to 1s", () => {
    const t0 = 5_000_000;
    const win = { limit: 1, windowMs: 60_000 };
    checkRateLimit("k", win, t0); // consume the only slot
    // 200ms before the window rolls over: remaining = 0.2s -> ceil -> 1s.
    const breach = checkRateLimit("k", win, t0 + (win.windowMs - 200));
    expect(breach.allowed).toBe(false);
    expect(breach.retryAfterSeconds).toBe(1);
  });
});

describe("rate-limit: client identifier derivation", () => {
  function req(headers: Record<string, string>): Request {
    return new Request("http://localhost/api/x", { method: "POST", headers });
  }

  it("prefers the bearer token, FINGERPRINTED (never the raw secret as a key)", () => {
    const id = clientIdFromRequest(req({ authorization: "Bearer abc123" }));
    expect(id).toMatch(/^tok:[0-9a-f]{16}$/); // a SHA-256 prefix, not the raw token
    expect(id).not.toContain("abc123"); // the secret never appears in the key
    // Stable (same token -> same key, so per-token limiting still works) + distinct per token.
    expect(clientIdFromRequest(req({ authorization: "Bearer abc123" }))).toBe(id);
    expect(clientIdFromRequest(req({ authorization: "Bearer xyz789" }))).not.toBe(id);
  });
  it("falls back to the first x-forwarded-for hop", () => {
    expect(clientIdFromRequest(req({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }))).toBe(
      "ip:9.9.9.9"
    );
  });
  it("falls back to x-real-ip", () => {
    expect(clientIdFromRequest(req({ "x-real-ip": "8.8.8.8" }))).toBe("ip:8.8.8.8");
  });
  it("uses the shared demo bucket when there is no caller signal", () => {
    expect(clientIdFromRequest(req({}))).toBe("demo:shared");
  });

  it("the same route + same client share a bucket; different routes do not", () => {
    __resetRateLimitForTest();
    const t0 = 6_000_000;
    const r = req({ "x-forwarded-for": "1.1.1.1" });
    // Exhaust one route's budget for this client.
    for (let i = 0; i < MUTATION_RATE_LIMIT.limit; i++) {
      expect(enforceMutationRateLimit("route-a", r, t0).allowed).toBe(true);
    }
    expect(enforceMutationRateLimit("route-a", r, t0).allowed).toBe(false);
    // A different route still has a fresh budget for the same client.
    expect(enforceMutationRateLimit("route-b", r, t0).allowed).toBe(true);
    __resetRateLimitForTest();
  });
});

describe("rate-limit: route-level 429 (authless demo, in-memory)", () => {
  beforeEach(() => __resetRateLimitForTest());
  afterEach(() => {
    __resetRateLimitForTest();
    __resetMemorySuppliersForTest();
  });

  function uploadReq(): Request {
    // A unique x-forwarded-for so this client's bucket is isolated from any other
    // test's demo bucket -- the IP-key path.
    return new Request("http://localhost/api/suppliers/upload", {
      method: "POST",
      headers: { "content-type": "text/csv", "x-forwarded-for": "203.0.113.7" },
      body: `${HEADER}\n${ROW}`
    });
  }

  it("returns 429 with a Retry-After header once the per-window limit is exceeded", async () => {
    // Drive the route up to its limit; every call must succeed (200).
    for (let i = 0; i < MUTATION_RATE_LIMIT.limit; i++) {
      const ok = await uploadSuppliers(uploadReq());
      expect(ok.status).toBe(200);
    }
    // The next call in the same window is braked.
    const blocked = await uploadSuppliers(uploadReq());
    expect(blocked.status).toBe(429);
    const retryAfter = blocked.headers.get("Retry-After");
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThanOrEqual(1);
    const body = await blocked.json();
    expect(body.error).toBe("RATE_LIMITED");
  });

  it("rate-limits the n8n approval-callback route too (the 4th mutating route)", async () => {
    // The limiter runs AFTER the (demo-authless) secret check and BEFORE the body parse, so the
    // first <=limit calls fall through (not 429 -- they reach body/mutation and 4xx there), and
    // the next is braked at 429. Unique x-forwarded-for isolates this client's bucket.
    function n8nReq(): Request {
      return new Request("http://localhost/api/n8n/approval-callback", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.8" },
        body: JSON.stringify({ decisionPacketId: "DP-rl-probe", approvalStatus: "APPROVED" })
      });
    }
    for (let i = 0; i < MUTATION_RATE_LIMIT.limit; i++) {
      const r = await n8nCallback(n8nReq());
      expect(r.status).not.toBe(429);
    }
    const blocked = await n8nCallback(n8nReq());
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
  });
});
