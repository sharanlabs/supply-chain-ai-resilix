// ---------------------------------------------------------------------------
// Dependency-free fixed-window rate limiter for the mutation surface (supplier
// upload, packet approve, run-exception, and the n8n approval callback). Keyed per
// client so one abusive caller cannot starve the others, with a deny -> HTTP 429 +
// Retry-After contract.
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

// node:crypto is a Node built-in (no npm dependency added) -- used only to fingerprint a
// bearer token before it becomes a map key, never to store the raw secret.
import { createHash } from "node:crypto";

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

// HARD cap on distinct keys. A key-rotating caller (rotating a spoofable client id) could
// otherwise grow the Map unbounded (Codex LOW). When bucket CREATION crosses this cap we first
// sweep fully-elapsed windows (cheap, the common reclaim), and if that is not enough -- a burst
// of DISTINCT still-ACTIVE keys, which pruneExpired cannot touch -- we EVICT the oldest windows
// until we are back under the cap. So the Map size is genuinely bounded by MAX_TRACKED_KEYS, not
// merely swept (EV-13, 2026-07-16 re-review: the prior sweep-only path was a SOFT cap that a
// same-tick spoofed-id flood defeated).
//
// TRUSTED-IDENTITY NOTE: eviction fails OPEN for the evicted caller (their window is dropped, so
// their next call starts fresh) -- never closed. That is acceptable ONLY because the production
// limiter key must be a TRUSTED identity (an authenticated token, or a gateway/WAF-provided
// client id), not a spoofable header; see clientIdFromRequest's preference order + the
// single-instance caveat in the file header. On a spoofable-header deployment this cap bounds
// MEMORY, not abuse -- the shared-store/gateway limiter is the real abuse control.
const MAX_TRACKED_KEYS = 10_000;

function pruneExpired(now: number, windowMs: number): void {
  for (const [key, state] of buckets) {
    if (now - state.windowStartMs >= windowMs) {
      buckets.delete(key);
    }
  }
}

// Evict the single entry with the oldest window start, via ONE O(n) pass -- no clone, no sort.
// Because enforceKeyCap runs before EVERY key insert, the Map can never exceed the cap, so at
// most one eviction is ever needed per insert. A clone+sort here (an earlier draft) would have
// turned every at-cap insert into an attacker-triggered O(n log n) allocation -- the Codex
// cross-model pass caught that; a linear min-scan matches the cost profile the pre-existing
// pruneExpired sweep already accepted (one O(n) pass per at-cap insert).
function evictOldestWindow(): void {
  let oldestKey: string | null = null;
  let oldestStart = Infinity;
  for (const [key, state] of buckets) {
    if (state.windowStartMs < oldestStart) {
      oldestStart = state.windowStartMs;
      oldestKey = key;
    }
  }
  if (oldestKey !== null) buckets.delete(oldestKey);
}

// Bring the Map strictly UNDER the cap before inserting a new key, so size never exceeds it.
// Invariant: called before every new-key insert, so size <= MAX_TRACKED_KEYS always holds and
// the while-loop below runs at most once per insert (it is a loop only as a safety backstop).
function enforceKeyCap(now: number, windowMs: number): void {
  if (buckets.size < MAX_TRACKED_KEYS) return;
  pruneExpired(now, windowMs);
  while (buckets.size >= MAX_TRACKED_KEYS) {
    evictOldestWindow();
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
    // A brand-new key grows the Map; enforce the hard cap first so a key-rotating flood
    // cannot grow it without bound. Updating an EXISTING active window (the else path below)
    // never adds a key, so it needs no cap check.
    if (!existing) {
      enforceKeyCap(now, windowMs);
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
// The bearer token is FINGERPRINTED (SHA-256 prefix) before it becomes a map key -- never
// stored raw -- so the in-memory key set can't be turned back into the secret (e.g. by a heap
// dump), while staying a stable, distinct per-token identity (Codex design grill, 2026-06-20).
export function clientIdFromRequest(request: Request): string {
  const auth = request.headers.get("authorization")?.trim() ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(auth);
  if (bearer) {
    const fingerprint = createHash("sha256").update(bearer[1].trim()).digest("hex").slice(0, 16);
    return `tok:${fingerprint}`;
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

// Test-only: observe the tracked-key count so the hard-cap bound (EV-13) is assertable without
// exporting the Map itself. NOT for production use.
export function __rateLimitTrackedKeyCount(): number {
  return buckets.size;
}

// Test-only: the hard cap, exported so a test pins the exact bound rather than a magic number.
export const __MAX_TRACKED_KEYS_FOR_TEST = MAX_TRACKED_KEYS;
