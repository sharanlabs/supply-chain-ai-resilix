import { createHash, timingSafeEqual } from "node:crypto";
import { envBool, liveAiEnabled } from "./env-flags";

export const N8N_CALLBACK_SECRET_HEADER = "x-resilix-callback-secret";
export const IDEMPOTENCY_KEY_HEADER = "idempotency-key";
export const APPROVAL_TOKEN_HEADER = "authorization";

// A configured APPROVAL_TOKEN shorter than this is treated as a misconfiguration
// (a weak server secret) -- denied (503), not accepted.
const MIN_APPROVAL_TOKEN_LENGTH = 16;

// Same weak-secret floor for the n8n callback secret: in secure mode a configured-but-
// too-short secret is a misconfiguration, denied (fail-closed), mirroring the approval
// token. Kept equal to the approval-token floor so "a strong server secret" is one bar.
const MIN_N8N_CALLBACK_SECRET_LENGTH = 16;

// ---------------------------------------------------------------------------
// P2.7 (R4-4) -- fail-closed authentication on the mutation surface.
//
// THE RULE (one rule, no contradiction): the pure in-memory demo (no
// DATABASE_URL, no live AI, no explicit opt-in) stays AUTHLESS by design -- a
// throwaway local showcase, disclosed as such. The MOMENT the app holds real
// state or spends the live-AI budget, the mutation routes (supplier upload,
// packet approve, run-exception) require a bearer APPROVAL_TOKEN and the n8n
// callback secret becomes mandatory.
//
// FAIL-CLOSED means DENY-ON-MISSING-CONFIG, not merely enforce-when-set: if the
// operator enables secure mode (DATABASE_URL / live AI / REQUIRE_APPROVAL_TOKEN)
// but forgets to set APPROVAL_TOKEN (or N8N_CALLBACK_SECRET), the routes DENY
// rather than silently passing. Enabling persistence yet leaving mutations open
// is the exact inversion this increment exists to prevent.
//
// Corollary (Codex): live-AI runs are never exposed authlessly -- otherwise the
// $5 Gemini budget is unenforceable by strangers hitting /api/run-exception.
// secureModeRequired() folds the live-AI predicate in, so run-exception is gated
// whenever live AI is on.
// ---------------------------------------------------------------------------

// Is the app in a posture that REQUIRES auth on the mutation surface?
// DATABASE_URL set (persistent data) OR live AI enabled ($ budget) OR an explicit
// operator opt-in (REQUIRE_APPROVAL_TOKEN -- e.g. an exposed in-memory demo).
// liveAiEnabled + envBool come from the dependency-free env-flags module: shared
// with the canonical liveAiEnabled in lib/agents/run.ts (no drift, and no AI-SDK
// pulled into this per-request path), and envBool means an operator's
// REQUIRE_APPROVAL_TOKEN=True / =1 cannot silently leave the surface authless.
export function secureModeRequired(): boolean {
  return (
    Boolean(process.env.DATABASE_URL?.trim()) ||
    liveAiEnabled() ||
    envBool("REQUIRE_APPROVAL_TOKEN") ||
    // A hosted production server (`next start`, NODE_ENV=production) is secure by
    // default: an exposed PUBLIC deploy must never leave the mutation surface
    // authless. Local `next dev` (development) and the test runner (NODE_ENV=test)
    // are unaffected, so the zero-config local demo and the suite keep working. A
    // production deploy that wants a live mutation surface sets APPROVAL_TOKEN; a
    // REPLAY-only public demo sets nothing and mutations stay fail-closed (503),
    // while the read-only landing REPLAY still renders.
    process.env.NODE_ENV === "production"
  );
}

export type ApprovalAuthResult =
  | { ok: true; mode: "DEMO_UNCONFIGURED" | "AUTHORIZED" }
  | { ok: false; status: number; code: string; message: string };

// Fail-closed bearer-APPROVAL_TOKEN check for the mutation routes. Returns plain
// data (no Response) so it stays pure + unit-testable; the route maps it to an
// apiError. Call sites gate on `.ok` (the P2.5 upload seam already did).
export function verifyApprovalToken(request: Request): ApprovalAuthResult {
  if (!secureModeRequired()) {
    // Pure in-memory demo: authless by design (disclosed in the UI/limitations).
    return { ok: true, mode: "DEMO_UNCONFIGURED" };
  }
  const expected = process.env.APPROVAL_TOKEN?.trim();
  if (!expected || expected.length < MIN_APPROVAL_TOKEN_LENGTH) {
    // Secure mode enabled but no token (or a weak, too-short one) configured
    // -> DENY (server misconfig). Forcing a strong token is part of fail-closed.
    return {
      ok: false,
      status: 503,
      code: "AUTH_NOT_CONFIGURED",
      message:
        "Server is in secure mode (DATABASE_URL / live AI / REQUIRE_APPROVAL_TOKEN) " +
        `but APPROVAL_TOKEN is unset or shorter than ${MIN_APPROVAL_TOKEN_LENGTH} chars; ` +
        "mutations are denied until a strong token is configured."
    };
  }
  const provided = bearerToken(request);
  if (!provided || !constantTimeEquals(provided, expected)) {
    return {
      ok: false,
      status: 401,
      code: "UNAUTHORIZED",
      message: "Missing or invalid Authorization: Bearer <APPROVAL_TOKEN>."
    };
  }
  return { ok: true, mode: "AUTHORIZED" };
}

// n8n approval-callback secret. P2.7 HARDENS the existing check to fail-closed in
// secure mode (no DEMO_UNCONFIGURED pass-through once persistence/live-AI is on);
// it does NOT extend the n8n path (AGENTS.md: the n8n callback is out of the
// ActionOps core loop -- harden, don't grow it).
export function verifyN8nCallbackSecret(request: Request) {
  const expected = process.env.N8N_CALLBACK_SECRET?.trim();
  if (!expected) {
    if (secureModeRequired()) {
      // fail-closed: secure mode requires the callback secret to be configured.
      return { ok: false, mode: "SECRET_REQUIRED_UNCONFIGURED" as const };
    }
    return { ok: true, mode: "DEMO_UNCONFIGURED" as const };
  }
  // A configured-but-too-short secret is a weak-config misconfiguration: in secure mode
  // deny (fail-closed), the same bar as APPROVAL_TOKEN. (The authless demo still verifies
  // a set secret as-is -- the floor only bites once the surface actually requires auth.)
  if (secureModeRequired() && expected.length < MIN_N8N_CALLBACK_SECRET_LENGTH) {
    return { ok: false, mode: "SECRET_REQUIRED_UNCONFIGURED" as const };
  }

  const provided = request.headers.get(N8N_CALLBACK_SECRET_HEADER)?.trim() ?? "";
  return {
    ok: constantTimeEquals(provided, expected),
    mode: "SECRET_REQUIRED" as const
  };
}

// Extract the token from an `Authorization: Bearer <token>` header. The Bearer
// scheme is REQUIRED (case-insensitive); a bare/other-scheme header yields ""
// (-> denied), so a client cannot accidentally pass a raw secret as the username.
function bearerToken(request: Request): string {
  const header = request.headers.get(APPROVAL_TOKEN_HEADER)?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : "";
}

export function validateRecentIsoTimestamp(
  value: string,
  {
    maxAgeMs = 15 * 60 * 1000,
    maxFutureSkewMs = 2 * 60 * 1000
  }: { maxAgeMs?: number; maxFutureSkewMs?: number } = {}
) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const now = Date.now();
  return timestamp >= now - maxAgeMs && timestamp <= now + maxFutureSkewMs;
}

// Length-oblivious constant-time compare: hash both sides to a fixed 32-byte
// SHA-256 digest first, so the comparison never early-returns on a length
// mismatch (which would leak the configured secret's length).
function constantTimeEquals(actual: string, expected: string): boolean {
  const a = createHash("sha256").update(actual).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// S3 -- the MCP surface's bearer check. STRICTER than verifyApprovalToken by
// design: there is NO demo pass-through -- a remote agent protocol surface is
// never authless, so the endpoint stays fail-closed (401) unless a strong
// MCP_ACCESS_TOKEN (>= MIN_APPROVAL_TOKEN_LENGTH) is configured AND the caller
// presents it. Pure boolean (the mcp-handler withMcpAuth wrapper maps a falsy
// verify to 401 + the RFC 9728 WWW-Authenticate challenge); same shared
// constant-time compare as every other secret on this server (P2.7).
export function verifyMcpToken(bearer: string | undefined): boolean {
  const expected = process.env.MCP_ACCESS_TOKEN?.trim();
  if (!expected || expected.length < MIN_APPROVAL_TOKEN_LENGTH) return false;
  if (!bearer) return false;
  return constantTimeEquals(bearer, expected);
}
