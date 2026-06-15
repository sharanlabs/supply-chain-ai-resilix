import { timingSafeEqual } from "node:crypto";

export const N8N_CALLBACK_SECRET_HEADER = "x-resilix-callback-secret";
export const IDEMPOTENCY_KEY_HEADER = "idempotency-key";

export function verifyN8nCallbackSecret(request: Request) {
  const expected = process.env.N8N_CALLBACK_SECRET?.trim();
  if (!expected) {
    return { ok: true, mode: "DEMO_UNCONFIGURED" as const };
  }

  const provided = request.headers.get(N8N_CALLBACK_SECRET_HEADER)?.trim() ?? "";
  return {
    ok: constantTimeEquals(provided, expected),
    mode: "SECRET_REQUIRED" as const
  };
}

export const APPROVAL_TOKEN_HEADER = "authorization";

// Single permissive no-op auth chokepoint for the upload/mutate surface (P2.5).
// It CURRENTLY ALWAYS PASSES, returning DEMO_UNCONFIGURED in the same shape as
// verifyN8nCallbackSecret so the seam is consistent. The fail-closed behavior is
// deliberately deferred.
//
// P2.7 (R4-4) fills this: fail-closed APPROVAL_TOKEN when DATABASE_URL or uploads enabled
//
// When P2.7 lands it flips this one function to require a bearer APPROVAL_TOKEN
// (and make the n8n callback secret mandatory) whenever DATABASE_URL is set or
// uploads are enabled -- with no retrofit at the call sites, which already gate on
// `ok`.
export function verifyUploadAuthorization(request: Request) {
  // The header is read now so the seam is realistic; its value is intentionally
  // NOT validated yet (deferred to P2.7). Reading it keeps the signature stable so
  // P2.7 adds the timing-safe comparison here with zero call-site churn.
  const provided = request.headers.get(APPROVAL_TOKEN_HEADER)?.trim() ?? "";
  void provided;
  return { ok: true, mode: "DEMO_UNCONFIGURED" as const };
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

function constantTimeEquals(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}
