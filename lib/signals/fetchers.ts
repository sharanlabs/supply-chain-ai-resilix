import type { PublicSignal } from "@/lib/schemas";
import { PublicSignalSchema } from "@/lib/schemas";
import {
  cachedSignals,
  fixtureOnlySignals,
  nwsCachedFixture
} from "@/lib/signals/cached";
import { fetchGdeltSignals } from "@/lib/signals/gdelt";
import {
  MAX_FIELD_LEN,
  MAX_SUMMARY_LEN,
  sanitizeIdToken,
  sanitizeText
} from "@/lib/signals/sanitize";

const TIMEOUT_MS = 5000;
// A disclosure marker carries no fresh data, so it reads as very stale, never "now".
const SOURCE_DOWN_FRESHNESS_MIN = 7 * 24 * 60;

// The ActionOps signal layer (P3.2). Two sources are live: GDELT DOC 2.0 -- the
// primary disruption signal, resilient + self-degrading inside gdelt.ts -- and NWS.
// USGS + NASA EONET are served as dated CACHED fixtures (fixture-only); Open-Meteo
// was dropped (DNS SERVFAIL 2026-06-12). A failed live source degrades to cache,
// labeled CACHED -- never LIVE -- so a degraded read is never mistaken for fresh.
//
// fetchImpl + now are injectable so the live composition (including the NWS-fail ->
// CACHED path) is unit-testable without touching the network.
export async function fetchPublicSignals({
  useLive = true,
  fetchImpl = fetch,
  now = Date.now
}: {
  useLive?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => number;
} = {}): Promise<PublicSignal[]> {
  if (!useLive) {
    return cachedSignals;
  }

  // GDELT self-manages spacing/cache/backoff and never throws into the pipeline;
  // every signal it returns is already stamped LIVE or CACHED. A FAILED outage (no
  // signals to serve) is surfaced as one disclosure marker, so a down primary source
  // is VISIBLE -- never silently absent, which an operator could read as "all calm".
  const gdelt = await fetchGdeltSignals({ fetchImpl, now });
  const gdeltSignals =
    gdelt.status === "FAILED" ? [gdeltUnavailableMarker(gdelt.note, now)] : gdelt.signals;
  const nws = await fetchNwsOrCached(fetchImpl, now);

  const composed = [...gdeltSignals, nws, ...fixtureOnlySignals];
  return composed.map((signal) => PublicSignalSchema.parse(signal));
}

// A schema-valid disclosure signal for when the GDELT primary feed is unavailable
// (429 / outage / malformed body with no warm cache). status FAILED + stale freshness
// so the UI and gatekeeper can show "primary source down" instead of an empty, falsely
// calm board. The note is sanitized -- it can quote an upstream error string.
function gdeltUnavailableMarker(note: string, now: () => number): PublicSignal {
  return {
    id: "SIG-GDELT-UNAVAILABLE",
    source: "GDELT DOC 2.0",
    sourceUrl: "https://api.gdeltproject.org/api/v2/doc/doc",
    fetchedAt: new Date(now()).toISOString(),
    eventType: "SIGNAL_SOURCE_UNAVAILABLE",
    location: {},
    severity: "LOW",
    summary: `GDELT primary disruption feed unavailable: ${sanitizeText(
      note,
      MAX_SUMMARY_LEN
    )}. Showing cached / fixture context only.`,
    freshnessMinutes: SOURCE_DOWN_FRESHNESS_MIN,
    status: "FAILED"
  };
}

// Live NWS, degrading to the dated NWS fixture (CACHED, never LIVE) on any failure
// -- so an outage shows clearly-cached data instead of throwing or faking a live read.
async function fetchNwsOrCached(
  fetchImpl: typeof fetch,
  now: () => number
): Promise<PublicSignal> {
  try {
    return await fetchNwsSignal(fetchImpl, now);
  } catch (error) {
    const reason = sanitizeText(
      error instanceof Error ? error.message : "unknown error",
      MAX_FIELD_LEN
    );
    return {
      ...nwsCachedFixture,
      summary: `${nwsCachedFixture.summary} (live NWS fetch failed: ${reason})`
    };
  }
}

export async function fetchNwsSignal(
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now
): Promise<PublicSignal> {
  const url = "https://api.weather.gov/alerts/active?area=CA";
  const data = await fetchJson<{
    features: Array<{
      id: string;
      properties: {
        event: string;
        severity: string;
        headline?: string;
        sent: string;
        areaDesc: string;
      };
    }>;
  }>(url, fetchImpl, {
    headers: {
      "User-Agent": "resilix-actionops/0.1 portfolio-demo"
    }
  });

  const fetchedAt = new Date(now()).toISOString();
  const alert = data.features?.[0];
  if (!alert) {
    return {
      id: "SIG-NWS-CA-NONE",
      source: "National Weather Service",
      sourceUrl: url,
      fetchedAt,
      eventType: "WEATHER_ALERT",
      location: { region: "California", country: "United States" },
      severity: "LOW",
      summary: "No active California NWS alert returned for the demo query.",
      freshnessMinutes: 0,
      status: "LIVE"
    };
  }

  // Every field below is untrusted NWS response text: constrain the id token, cap +
  // control-strip the region and summary, and always leave a non-empty summary (so a
  // headline/event-less alert can't produce an invalid PublicSignal).
  const idToken = sanitizeIdToken(alert.id.split("/").pop()) || "ALERT";
  const region = sanitizeText(alert.properties.areaDesc, MAX_FIELD_LEN) || "California";
  const summary =
    sanitizeText(alert.properties.headline || alert.properties.event, MAX_SUMMARY_LEN) ||
    "Active National Weather Service alert (no headline provided).";
  return {
    id: `SIG-NWS-${idToken}`,
    source: "National Weather Service",
    sourceUrl: url,
    fetchedAt,
    eventType: "WEATHER_ALERT",
    location: { region, country: "United States" },
    severity: mapNwsSeverity(alert.properties.severity),
    summary,
    freshnessMinutes: minutesSince(Date.parse(alert.properties.sent), now),
    status: "LIVE"
  };
}

async function fetchJson<T>(
  url: string,
  fetchImpl: typeof fetch,
  init?: RequestInit
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store"
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function minutesSince(timeMs: number, now: () => number) {
  const ref = now();
  if (!Number.isFinite(timeMs) || !Number.isFinite(ref)) {
    return 0;
  }
  return Math.max(0, Math.round((ref - timeMs) / 60000));
}

function mapNwsSeverity(value: unknown): PublicSignal["severity"] {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized.includes("extreme")) return "CRITICAL";
  if (normalized.includes("severe")) return "HIGH";
  if (normalized.includes("moderate")) return "MEDIUM";
  return "LOW";
}
