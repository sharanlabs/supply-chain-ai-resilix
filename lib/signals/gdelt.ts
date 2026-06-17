import { createHash } from "node:crypto";
import type { PublicSignal } from "@/lib/schemas";
import { PublicSignalSchema } from "@/lib/schemas";
import {
  MAX_FIELD_LEN,
  MAX_SUMMARY_LEN,
  isSafeHttpUrl,
  sanitizeText
} from "@/lib/signals/sanitize";

// GDELT DOC 2.0 artlist (no API key) is the core ActionOps disruption signal.
// Two facts shape it: GDELT throttles (>=5s between requests) and an article title
// is untrusted text. So in front of the call: >=5s spacing, a bounded per-scan
// cache, a long timeout, and 429/error backoff that degrades to fresh-enough cache
// or a FAILED result. Behind it: control-char-stripped fields and http(s)-only
// urls. The fetcher never throws into the pipeline; fetchImpl + now are injectable
// for deterministic tests. Live-probe record + canon mapping: BUILD-JOURNAL.md.

const GDELT_DOC_URL = "https://api.gdeltproject.org/api/v2/doc/doc";
const DEFAULT_TIMEOUT_MS = 25_000;
const MIN_SPACING_MS = 5_000;
const CACHE_TTL_MS = 5 * 60_000;
const MAX_SERVE_STALE_MS = 60 * 60_000; // a failure never serves cache older than this
const MAX_CACHE_ENTRIES = 64;
const MAX_RECORDS = 50;
const MAX_QUERY_LEN = 200;
const STALE_UNKNOWN_MINUTES = 7 * 24 * 60; // an unknowable date is "very stale", never 0 (= freshest)
const MAX_TIMESTAMP_MS = 8.64e15; // JS Date's ISO-safe range (+/-); past it toISOString() throws
const MAX_FUTURE_SKEW_MS = 5 * 60_000; // small clock skew is tolerated; a date further ahead is bad data

// Raw GDELT DOC 2.0 artlist article -- live-verified shape (2026-06-17).
export interface GdeltArticle {
  url?: string;
  url_mobile?: string;
  title?: string;
  seendate?: string; // "YYYYMMDDTHHMMSSZ"
  socialimage?: string;
  domain?: string;
  language?: string;
  sourcecountry?: string;
}

export type GdeltStatus = "LIVE" | "CACHED" | "FAILED";

export interface GdeltResult {
  signals: PublicSignal[];
  status: GdeltStatus;
  servedFromCache: boolean;
  ageMs: number; // age of the served data (0 for a fresh LIVE fetch)
  skipped: number; // articles dropped (missing/unsafe url, schema-invalid)
  note: string;
}

export interface GdeltOptions {
  query?: string;
  timespan?: string;
  maxRecords?: number;
  replayArticles?: GdeltArticle[]; // replay-first: map a recorded fixture, no network
  fetchImpl?: typeof fetch; // DI for HTTP edge cases
  now?: () => number; // DI clock for spacing/cache/freshness
}

interface CacheEntry {
  at: number;
  signals: PublicSignal[];
}

// Per-process state (single-instance MVP). lastCallAt = -Infinity so the first call
// is never throttled. inFlight coalesces concurrent identical live fetches.
const state: {
  lastCallAt: number;
  cache: Map<string, CacheEntry>;
  inFlight: Map<string, Promise<GdeltResult>>;
} = {
  lastCallAt: Number.NEGATIVE_INFINITY,
  cache: new Map(),
  inFlight: new Map()
};

/** Test hook: clear cache + spacing + in-flight state. */
export function __resetGdeltStateForTest(): void {
  state.lastCallAt = Number.NEGATIVE_INFINITY;
  state.cache.clear();
  state.inFlight.clear();
}

export async function fetchGdeltSignals(opts: GdeltOptions = {}): Promise<GdeltResult> {
  const clock = finiteClock(opts.now ?? Date.now);
  const fetchImpl = opts.fetchImpl ?? fetch;
  const query = normalizeQuery(opts.query);
  const timespan = normalizeTimespan(opts.timespan);
  const maxRecords = clampInt(opts.maxRecords ?? 10, 1, MAX_RECORDS);

  if (opts.replayArticles) {
    const { signals, skipped } = mapGdeltArticles(opts.replayArticles.slice(0, MAX_RECORDS), "CACHED", clock);
    return {
      signals,
      status: "CACHED",
      servedFromCache: true,
      ageMs: 0,
      skipped,
      note: `replay: ${signals.length} recorded signal(s)`
    };
  }

  const cacheKey = `${query}|${timespan}|${maxRecords}`;
  const cached = state.cache.get(cacheKey);
  const cacheAge = cached ? Math.max(0, clock() - cached.at) : Infinity;

  // Fresh cache within TTL -> serve it.
  if (cached && cacheAge < CACHE_TTL_MS) {
    return cacheResult(cached.signals, cacheAge, `served ${secs(cacheAge)}s-old cache`);
  }

  // Coalesce a concurrent identical live fetch (so the 2nd caller is not false-failed
  // on the spacing guard while the first request is still in flight).
  const pending = state.inFlight.get(cacheKey);
  if (pending) {
    return pending;
  }

  // Spacing guard: too soon since the last live call. Serve fresh-enough cache, else FAILED.
  if (clock() - state.lastCallAt < MIN_SPACING_MS) {
    return (
      serveCacheIfFresh(
        cached,
        cacheAge,
        `<${secs(MIN_SPACING_MS)}s spacing; served ${secs(cacheAge)}s-old cache`
      ) ?? failedResult(`<${secs(MIN_SPACING_MS)}s since last GDELT call; no fresh cache to serve`)
    );
  }

  state.lastCallAt = clock();
  const live = liveFetch(cacheKey, query, timespan, maxRecords, cached, cacheAge, fetchImpl, clock);
  state.inFlight.set(cacheKey, live);
  try {
    return await live;
  } finally {
    state.inFlight.delete(cacheKey);
  }
}

// One bounded live fetch, gracefully degrading on any failure (it never throws).
async function liveFetch(
  cacheKey: string,
  query: string,
  timespan: string,
  maxRecords: number,
  cached: CacheEntry | undefined,
  cacheAge: number,
  fetchImpl: typeof fetch,
  clock: () => number
): Promise<GdeltResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  let articles: GdeltArticle[];
  try {
    // Built inside the try so an encode error (e.g. a lone surrogate) degrades too.
    const url =
      `${GDELT_DOC_URL}?query=${encodeURIComponent(query)}` +
      `&mode=artlist&maxrecords=${maxRecords}&format=json&timespan=${encodeURIComponent(timespan)}`;
    const res = await fetchImpl(url, { signal: controller.signal, cache: "no-store" });
    if (res.status === 429) {
      return degradeOnFailure(cached, cacheAge, "GDELT 429 (throttled)");
    }
    if (!res.ok) {
      return degradeOnFailure(cached, cacheAge, `GDELT ${res.status} ${res.statusText}`);
    }
    const body = await safeJson(res);
    if (!body || !Array.isArray((body as { articles?: unknown }).articles)) {
      // A 200 with a malformed body / API drift is a failure -- not a cacheable empty
      // "LIVE" result that would mask the outage.
      return degradeOnFailure(cached, cacheAge, "GDELT response malformed (no articles array)");
    }
    articles = (body as { articles: GdeltArticle[] }).articles;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown fetch error";
    return degradeOnFailure(cached, cacheAge, `GDELT fetch failed: ${reason}`);
  } finally {
    clearTimeout(timer);
  }

  const { signals, skipped } = mapGdeltArticles(articles.slice(0, maxRecords), "LIVE", clock);
  setCache(cacheKey, { at: clock(), signals });
  return {
    signals,
    status: "LIVE",
    servedFromCache: false,
    ageMs: 0,
    skipped,
    note: `live: ${signals.length} signal(s)${skipped ? `, ${skipped} skipped` : ""}`
  };
}

// --- mapping ---

// Map raw GDELT artlist articles to validated PublicSignals. Exported so the
// replay fixtures (lib/signals/cached.ts) and any recorder go through the EXACT
// mapping the live path uses -- a recorded fixture can never drift from the live
// contract (the P2.6 "flow through the one core" lesson). `clock` fixes the
// fetchedAt/freshness so a CACHED fixture is deterministic.
export function mapGdeltArticles(
  articles: GdeltArticle[],
  status: "LIVE" | "CACHED",
  clock: () => number
): { signals: PublicSignal[]; skipped: number } {
  const signals: PublicSignal[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const article of articles) {
    let mapped: PublicSignal | null = null;
    try {
      mapped = mapArticle(article, status, clock);
    } catch {
      mapped = null; // a single bad article never breaks the batch
    }
    if (!mapped) {
      skipped += 1;
      continue;
    }
    if (seen.has(mapped.id)) {
      continue; // dedup by deterministic id (same url -> same id)
    }
    seen.add(mapped.id);
    signals.push(mapped);
  }
  return { signals, skipped };
}

function mapArticle(
  article: GdeltArticle,
  status: "LIVE" | "CACHED",
  clock: () => number
): PublicSignal | null {
  const url = typeof article?.url === "string" ? article.url.trim() : "";
  if (!url || !isSafeHttpUrl(url)) {
    return null; // no url / non-http(s) scheme -> not a safe, renderable sourceUrl
  }
  const country = sanitizeText(article.sourcecountry, MAX_FIELD_LEN);

  const candidate = {
    id: `SIG-GDELT-${createHash("sha256").update(url).digest("hex").slice(0, 16)}`,
    source: "GDELT DOC 2.0",
    sourceUrl: url,
    fetchedAt: new Date(clock()).toISOString(),
    eventType: "DISRUPTION_NEWS", // open string; Phase 4 Sentinel closes the vocab
    location: country ? { region: country, country } : {},
    severity: "MEDIUM" as const, // artlist has no tone; Sentinel classifies
    summary:
      sanitizeText(article.title, MAX_SUMMARY_LEN) ||
      `(untitled GDELT article from ${sanitizeText(article.domain, MAX_FIELD_LEN) || "unknown source"})`,
    freshnessMinutes: minutesSinceGdeltDate(article.seendate, clock),
    status
  };

  const parsed = PublicSignalSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

// --- helpers ---

// A clock that always yields an ISO-safe timestamp, so new Date(clock()).toISOString()
// can never throw -- a throwing OR out-of-range injected clock falls back to Date.now().
// Exported so fetchers.ts shares the same guard for its own new Date(now()) calls.
export function finiteClock(now: () => number): () => number {
  return () => {
    let t: number;
    try {
      t = now();
    } catch {
      return Date.now();
    }
    return Number.isFinite(t) && Math.abs(t) <= MAX_TIMESTAMP_MS ? t : Date.now();
  };
}

// GDELT seendate "YYYYMMDDTHHMMSSZ" -> minutes since. A missing, malformed, or
// impossible date returns "very stale" (never 0/freshest). A small future skew
// reads as just-now.
function minutesSinceGdeltDate(seendate: unknown, clock: () => number): number {
  if (typeof seendate !== "string") return STALE_UNKNOWN_MINUTES;
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(seendate);
  if (!m) return STALE_UNKNOWN_MINUTES;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  const t = Date.UTC(y, mo - 1, d, h, mi, s);
  const back = new Date(t);
  // reject impossible dates that Date.UTC silently rolls over (e.g. Feb 30)
  if (
    back.getUTCFullYear() !== y ||
    back.getUTCMonth() !== mo - 1 ||
    back.getUTCDate() !== d ||
    back.getUTCHours() !== h ||
    back.getUTCMinutes() !== mi ||
    back.getUTCSeconds() !== s
  ) {
    return STALE_UNKNOWN_MINUTES;
  }
  const diffMs = clock() - t;
  if (diffMs < -MAX_FUTURE_SKEW_MS) {
    return STALE_UNKNOWN_MINUTES; // a far-future date is bad data, not "fresh"
  }
  const diffMin = Math.round(diffMs / 60000);
  return diffMin < 0 ? 0 : diffMin; // small clock skew -> just-now
}

function normalizeQuery(query?: string): string {
  const q = (typeof query === "string" ? query : "").trim();
  if (!q) return '"supply chain" disruption';
  return Array.from(q).slice(0, MAX_QUERY_LEN).join(""); // slice by code point, never split a surrogate pair
}

function normalizeTimespan(timespan?: string): string {
  const t = (typeof timespan === "string" ? timespan : "").trim();
  return /^\d{1,3}[smhdw]$/i.test(t) ? t : "3d";
}

function clampInt(n: number, lo: number, hi: number): number {
  const v = Number.isFinite(n) ? Math.floor(n) : lo;
  return Math.min(hi, Math.max(lo, v));
}

function secs(ms: number): number {
  return Math.round(ms / 1000);
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined; // non-JSON body -> caller treats as malformed (a failure)
  }
}

function setCache(key: string, entry: CacheEntry): void {
  state.cache.set(key, entry);
  while (state.cache.size > MAX_CACHE_ENTRIES) {
    const oldest = state.cache.keys().next().value;
    if (oldest === undefined) break;
    state.cache.delete(oldest);
  }
}

// Serving cache re-stamps each signal CACHED and ages its freshness by the cache
// age, so downstream trust checks never read cached data as fresh-live.
function cacheResult(signals: PublicSignal[], ageMs: number, note: string): GdeltResult {
  const ageMin = Math.round(Math.max(0, ageMs) / 60000);
  const aged: PublicSignal[] = signals.map((s) => ({
    ...s,
    status: "CACHED",
    freshnessMinutes: s.freshnessMinutes + ageMin
  }));
  return { signals: aged, status: "CACHED", servedFromCache: true, ageMs: Math.max(0, ageMs), skipped: 0, note };
}

function failedResult(note: string): GdeltResult {
  return { signals: [], status: "FAILED", servedFromCache: false, ageMs: 0, skipped: 0, note };
}

// Serve the cache only if within the staleness bound; else null (refuse). Both the
// spacing-guard and the failure-degradation paths go through this, so the bound
// cannot drift between them.
function serveCacheIfFresh(
  cached: CacheEntry | undefined,
  cacheAge: number,
  note: string
): GdeltResult | null {
  return cached && cacheAge <= MAX_SERVE_STALE_MS ? cacheResult(cached.signals, cacheAge, note) : null;
}

function degradeOnFailure(cached: CacheEntry | undefined, cacheAge: number, reason: string): GdeltResult {
  return (
    serveCacheIfFresh(cached, cacheAge, `${reason}; served ${secs(cacheAge)}s-old cache`) ??
    failedResult(
      cached ? `${reason}; cache too stale (${secs(cacheAge)}s) to serve` : `${reason}; no cache to serve`
    )
  );
}
