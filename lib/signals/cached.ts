import type { PublicSignal } from "@/lib/schemas";
import { mapGdeltArticles, type GdeltArticle } from "@/lib/signals/gdelt";
import gdeltArtlist from "@/data/signals/gdelt-artlist-sample-20260617.json";

// Replay-first fixtures for the ActionOps signal layer. GDELT DOC 2.0 + NWS stay
// live; USGS + NASA EONET are demoted to the dated fixtures below; Open-Meteo was
// dropped (DNS SERVFAIL 2026-06-12). Everything here is CACHED -- never served as
// LIVE -- and carries a fixed capture date so the UI can render replay honestly.
//
// The GDELT replay set is MAPPED from a real dated artlist capture through the SAME
// mapGdeltArticles the live path uses, so a recorded fixture can never drift from
// the live contract (the P2.6 "flow through the one core" lesson). The equality is
// pinned by cached-signals.test.ts.

// Capture instant of the bundled fixtures (the artlist filename date). Fixing the
// clock makes freshnessMinutes deterministic: each signal's age is measured from
// its own source timestamp to this instant, not to a moving wall-clock now.
const CAPTURE_AT_MS = Date.parse("2026-06-17T12:00:00.000Z");
const CAPTURE_AT_ISO = new Date(CAPTURE_AT_MS).toISOString();

const gdeltReplay: PublicSignal[] = mapGdeltArticles(
  gdeltArtlist.articles as GdeltArticle[],
  "CACHED",
  () => CAPTURE_AT_MS
).signals;

// Fixture-only sources (no live fetch): a supply-corridor earthquake (USGS) and a
// global natural-event monitor (NASA EONET). Hand-authored, dated to the capture
// instant, CACHED, MEDIUM/LOW only (no HIGH/CRITICAL -- the deterministic exception
// engine keys its severity off the strongest signal).
const usgsFixture: PublicSignal = {
  id: "SIG-CACHED-USGS-JP",
  source: "USGS Earthquake Feed",
  sourceUrl:
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson",
  fetchedAt: CAPTURE_AT_ISO,
  eventType: "EARTHQUAKE_PROXIMITY",
  location: {
    lat: 35.6,
    lon: 140.1,
    region: "Japan electronics supplier corridor",
    country: "Japan"
  },
  severity: "MEDIUM",
  summary:
    "Cached earthquake-proximity fixture near the Japan electronics supplier corridor (fixture-only source).",
  freshnessMinutes: 0,
  status: "CACHED"
};

const eonetFixture: PublicSignal = {
  id: "SIG-CACHED-EONET-MONITOR",
  source: "NASA EONET",
  sourceUrl: "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=5",
  fetchedAt: CAPTURE_AT_ISO,
  eventType: "NATURAL_EVENT_MONITOR",
  location: { region: "Global natural-event monitor" },
  severity: "LOW",
  summary:
    "Cached NASA EONET fixture demonstrating external natural-event monitoring (fixture-only source).",
  freshnessMinutes: 0,
  status: "CACHED"
};

// The NWS fallback fixture, surfaced by name so the live fetcher can serve it -- as
// CACHED, never LIVE -- when the live NWS call is unavailable.
export const nwsCachedFixture: PublicSignal = {
  id: "SIG-CACHED-NWS-CA",
  source: "National Weather Service",
  sourceUrl: "https://api.weather.gov/alerts/active?area=CA",
  fetchedAt: CAPTURE_AT_ISO,
  eventType: "WEATHER_ALERT",
  location: { region: "California", country: "United States" },
  severity: "LOW",
  summary:
    "Cached NWS California alert fixture, served when the live NWS fetch is unavailable.",
  freshnessMinutes: 0,
  status: "CACHED"
};

// The demoted live sources, surfaced alongside the live GDELT + NWS results so the
// signal board still shows earthquake + natural-event context (always CACHED).
export const fixtureOnlySignals: PublicSignal[] = [usgsFixture, eonetFixture];

// Replay order: the live-primary source (GDELT) first, then the fixture-only
// sources, then the NWS fallback. Consumed by fetchPublicSignals({ useLive: false }).
export const cachedSignals: PublicSignal[] = [
  ...gdeltReplay,
  ...fixtureOnlySignals,
  nwsCachedFixture
];
