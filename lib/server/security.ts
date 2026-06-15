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
