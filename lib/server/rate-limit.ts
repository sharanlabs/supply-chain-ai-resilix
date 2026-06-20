// ---------------------------------------------------------------------------
// Dependency-free fixed-window rate limiter for the mutation surface (supplier
// upload, packet approve, run-exception). Keyed per client so one abusive caller
// cannot starve the others, with a deny -> HTTP 429 + Retry-After contract.
//
// WHY a fixed window (not a token bucket / sliding log): the goal here is a cheap,
// predictable abuse brake on three low-QPS mutation routes, not precise traffic
// shaping. A fixed window is O(1) memory per key and trivially deterministic to
// test (the whole window resets at a boundary), which is exactly what this
// portfolio artifact needs.
//
// SINGLE-INSTANCE ONLY: state lives in this module's process memory. It is the
// right brake for the in-memory demo + a single deployed instance, but it does
// NOT coordinate across replicas. The production path is a shared store (Redis
// INCR + EXPIRE, or a managed gateway/WAF limiter) -- documented, not built here.
//
// `now` is injectable so tests drive the window deterministically instead of
// sleeping; production calls fall through to Date.now().
// ---------------------------------------------------------------------------

export type RateLimitDecision = {
  allowed: boolean;
  // Seconds the caller should wait before retrying (only meaningful when denied).
  // Always >= 1 so a Retry-After header is never "0".
  retryAfterSeconds: number;
  // Requests still allowed in the current window after THIS call (0 when denied).
  remaining: number;
  limit: number;
};

type WindowState = { count: number; windowStartMs: number };

// Per-route limits. Chosen with real headroom over the test suites' per-file call
// volume (each route test file makes well under 30 calls), so existing tests are
// never tripped by the limiter -- only a genuine burst is. These are intentionally
// generous for a demo; a production deployment would tune them down per route.
export const MUTATION_RATE_LIMIT = { limit: 30, windowMs: 60_000 } as const;

// Keyed by `${routeKey}:${clientId}` so the three routes have independent budgets
// (one noisy upload caller cannot exhaust the approve budget).
const buckets = new Map<string, WindowState>();

// Soft cap on distinct keys before we sweep. Without it a key-rotating caller (rotating a
// spoofable client id) could grow the Map unbounded (Codex LOW). We sweep fully-elapsed
// windows only when bucket CREATION crosses this cap, so the common path stays O(1) and
// the Map stays bounded (60s windows expire fast, so the sweep reclaims aggressively).
const MAX_TRACKED_KEYS = 10_000;

function pruneExpired(now: number, windowMs: number): void {
  for (const [key, state] of buckets) {
    if (now - state.windowStartMs >= windowMs) {
      buckets.delete(key);
    }
  }
}

// Core decision. Pure aside from the module Map; `now` is injected for tests.
export function checkRateLimit(
  bucketKey: string,
  { limit, windowMs }: { limit: number; windowMs: number } = MUTATION_RATE_LIMIT,
  now: number = Date.now()
): RateLimitDecision {
  const existing = buckets.get(bucketKey);

  // New key, or the previous window has fully elapsed -> start a fresh window.
  // This is the "window resets" behavior: once now >= windowStart + windowMs the
  // count is discarded, not decayed.
  if (!existing || now - existing.windowStartMs >= windowMs) {
    if (buckets.size >= MAX_TRACKED_KEYS) {
      pruneExpired(now, windowMs);
    }
    buckets.set(bucketKey, { count: 1, windowStartMs: now });
    return { allowed: true, retryAfterSeconds: 0, remaining: limit - 1, limit };
  }

  if (existing.count >= limit) {
    const elapsed = now - existing.windowStartMs;
    // Round UP so Retry-After never tells the caller to retry before the window
    // actually rolls over (a 0.4s remainder must surface as 1s, not 0s).
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - elapsed) / 1000));
    return { allowed: false, retryAfterSeconds, remaining: 0, limit };
  }

  existing.count += 1;
  return {
    allowed: true,
    retryAfterSeconds: 0,
    remaining: limit - existing.count,
    limit
  };
}

// Derive a stable client identifier for the limiter key. Preference order:
//   1. the bearer APPROVAL_TOKEN (an authorized caller is rate-limited per token)
//   2. the first x-forwarded-for hop, else x-real-ip (the in-memory demo posture)
//   3. a constant demo bucket (no proxy headers, no token) -- shared, by design,
//      since the authless local demo has no per-caller signal to key on.
// The bearer token is hashed-by-prefix only via length here (we do not log it);
// it is used verbatim as a map key, which never leaves the process.
export function clientIdFromRequest(request: Request): string {
  const auth = request.headers.get("authorization")?.trim() ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(auth);
  if (bearer) {
    return `tok:${bearer[1].trim()}`;
  }

  const forwarded = request.headers.get("x-forwarded-for")?.trim();
  if (forwarded) {
    // x-forwarded-for is a comma-separated list; the first hop is the client.
    return `ip:${forwarded.split(",")[0].trim()}`;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return `ip:${realIp}`;
  }

  return "demo:shared";
}

// Convenience used by the routes: build the per-route key and apply the limit.
export function enforceMutationRateLimit(
  routeKey: string,
  request: Request,
  now: number = Date.now()
): RateLimitDecision {
  const key = `${routeKey}:${clientIdFromRequest(request)}`;
  return checkRateLimit(key, MUTATION_RATE_LIMIT, now);
}

// Test-only: clear all buckets so module state cannot leak across test files or
// `it` blocks. Vitest isolates module state per file, but route tests in the same
// file accumulate into the shared demo bucket -- calling this in their afterEach
// removes that fragility. NOT for production use.
export function __resetRateLimitForTest(): void {
  buckets.clear();
}
