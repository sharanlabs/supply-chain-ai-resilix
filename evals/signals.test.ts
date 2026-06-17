import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fetchPublicSignals } from "@/lib/signals/fetchers";
import { __resetGdeltStateForTest } from "@/lib/signals/gdelt";

// Deterministic: a URL-dispatching fake fetch (DI) + a fixed clock, no network. The
// dispatcher THROWS on any url other than GDELT or NWS, so a regression that
// re-introduces a live Open-Meteo / USGS / EONET fetch fails this suite structurally.
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 429 ? "Too Many Requests" : status >= 500 ? "Server Error" : "",
    json: async () => body
  } as unknown as Response;
}

interface MockRoutes {
  gdelt?: unknown;
  gdeltStatus?: number;
  nws?: unknown;
  nwsStatus?: number;
}

function mockFetch(routes: MockRoutes): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    if (url.includes("gdeltproject.org")) {
      return jsonResponse(routes.gdelt ?? { articles: [] }, routes.gdeltStatus ?? 200);
    }
    if (url.includes("api.weather.gov")) {
      return jsonResponse(routes.nws ?? { features: [] }, routes.nwsStatus ?? 200);
    }
    throw new Error(`unexpected live fetch to ${url}`);
  }) as unknown as typeof fetch;
}

const GDELT_ARTICLE = {
  url: "https://news.example.com/port-strike",
  title: "Port strike disrupts container flow",
  seendate: "20260617T080000Z",
  domain: "news.example.com",
  language: "English",
  sourcecountry: "United States"
};

const NWS_ALERT = {
  features: [
    {
      id: "https://api.weather.gov/alerts/urn:oid:ABC123",
      properties: {
        event: "Wind Advisory",
        severity: "Moderate",
        headline: "Wind Advisory for the San Francisco Bay Area",
        sent: "2026-06-17T07:00:00-07:00",
        areaDesc: "San Francisco Bay Area"
      }
    }
  ]
};

// Matches C0 (0x00-0x1f), DEL + C1 (0x7f-0x9f) control chars.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

const FIXED_NOW = 1_792_000_000_000; // fixed epoch ms (~2026-10), after the fixtures' source dates
const now = () => FIXED_NOW;

beforeEach(() => __resetGdeltStateForTest());
afterEach(() => __resetGdeltStateForTest());

describe("public signal layer", () => {
  it("serves the dated CACHED replay set when live mode is disabled", async () => {
    const signals = await fetchPublicSignals({ useLive: false });

    expect(signals.length).toBeGreaterThanOrEqual(3);
    expect(signals.every((signal) => signal.status === "CACHED")).toBe(true);
    // HttpUrlSchema (and the live GDELT data) allow http(s) -- assert the real
    // contract, not the stricter https-only the hand-authored fixtures used to meet.
    expect(signals.every((signal) => /^https?:\/\//.test(signal.sourceUrl))).toBe(true);
    // Open-Meteo was dropped from the layer (DNS SERVFAIL); no fixture references it.
    expect(signals.some((signal) => signal.source.includes("Open-Meteo"))).toBe(false);
  });

  it("composes live GDELT (primary) + live NWS + fixture-only USGS/EONET", async () => {
    const signals = await fetchPublicSignals({
      useLive: true,
      fetchImpl: mockFetch({ gdelt: { articles: [GDELT_ARTICLE] }, nws: NWS_ALERT }),
      now
    });

    const gdelt = signals.filter((signal) => signal.source === "GDELT DOC 2.0");
    const nws = signals.filter((signal) => signal.source === "National Weather Service");
    const usgs = signals.filter((signal) => signal.source === "USGS Earthquake Feed");
    const eonet = signals.filter((signal) => signal.source === "NASA EONET");

    expect(gdelt.length).toBeGreaterThanOrEqual(1);
    expect(gdelt.every((signal) => signal.status === "LIVE")).toBe(true);
    expect(nws).toHaveLength(1);
    expect(nws[0].status).toBe("LIVE");
    // USGS + EONET are fixture-only: always present, always CACHED, never live-fetched.
    expect(usgs).toHaveLength(1);
    expect(eonet).toHaveLength(1);
    expect([...usgs, ...eonet].every((signal) => signal.status === "CACHED")).toBe(true);
    expect(signals.some((signal) => signal.source.includes("Open-Meteo"))).toBe(false);
  });

  it("labels a live NWS query with no active alert as LIVE", async () => {
    const signals = await fetchPublicSignals({
      useLive: true,
      fetchImpl: mockFetch({ gdelt: { articles: [GDELT_ARTICLE] }, nws: { features: [] } }),
      now
    });

    const nws = signals.find((signal) => signal.id === "SIG-NWS-CA-NONE");
    expect(nws?.status).toBe("LIVE");
    expect(nws?.severity).toBe("LOW");
  });

  it("serves the NWS fixture as CACHED -- never LIVE -- when the live NWS fetch fails", async () => {
    const signals = await fetchPublicSignals({
      useLive: true,
      fetchImpl: mockFetch({ gdelt: { articles: [GDELT_ARTICLE] }, nwsStatus: 503 }),
      now
    });

    const nws = signals.filter((signal) => signal.source === "National Weather Service");
    expect(nws).toHaveLength(1);
    expect(nws[0].status).toBe("CACHED");
    expect(nws[0].id).toBe("SIG-CACHED-NWS-CA");
    expect(nws[0].summary).toContain("live NWS fetch failed");
    // The invariant: a failed live source is NEVER labeled LIVE.
    expect(
      signals.some((signal) => signal.source === "National Weather Service" && signal.status === "LIVE")
    ).toBe(false);
  });

  it("surfaces a FAILED GDELT marker (never silent) when GDELT is throttled with no cache", async () => {
    const signals = await fetchPublicSignals({
      useLive: true,
      fetchImpl: mockFetch({ gdeltStatus: 429, nws: NWS_ALERT }),
      now
    });

    // The down primary source is DISCLOSED as a FAILED marker, not silently dropped
    // (a missing GDELT could read as "no disruptions" -- a dangerous false calm).
    const gdelt = signals.filter((signal) => signal.source === "GDELT DOC 2.0");
    expect(gdelt).toHaveLength(1);
    expect(gdelt[0].status).toBe("FAILED");
    expect(gdelt[0].id).toBe("SIG-GDELT-UNAVAILABLE");
    expect(gdelt[0].summary.toLowerCase()).toContain("unavailable");
    // The rest of the board still composes (never throws).
    expect(
      signals.some((signal) => signal.source === "National Weather Service" && signal.status === "LIVE")
    ).toBe(true);
    expect(signals.some((signal) => signal.source === "USGS Earthquake Feed")).toBe(true);
    expect(signals.every((signal) => /^https?:\/\//.test(signal.sourceUrl))).toBe(true);
  });

  it("sanitizes untrusted NWS alert text (control chars, length caps, id token)", async () => {
    const ctrl = String.fromCharCode(1, 2, 7, 31); // C0 control chars in untrusted text
    const dirtyNws = {
      features: [
        {
          id: `https://api.weather.gov/alerts/urn:oid:../../etc/passwd${ctrl}<script>`,
          properties: {
            event: "Flood",
            severity: "Severe",
            headline: `Flood${ctrl} warning ${"x".repeat(2000)}`,
            sent: "2026-06-17T07:00:00-07:00",
            areaDesc: `Bay${ctrl} Area ${"y".repeat(500)}`
          }
        }
      ]
    };
    const signals = await fetchPublicSignals({
      useLive: true,
      fetchImpl: mockFetch({ gdelt: { articles: [GDELT_ARTICLE] }, nws: dirtyNws }),
      now
    });

    const nws = signals.find((signal) => signal.source === "National Weather Service");
    expect(nws).toBeDefined();
    expect(nws?.status).toBe("LIVE");
    // No control chars survive; summary + region are length-capped; id is a safe token.
    expect(CONTROL_CHARS.test(nws?.summary ?? "")).toBe(false);
    expect(CONTROL_CHARS.test(nws?.location.region ?? "")).toBe(false);
    expect((nws?.summary ?? "").length).toBeLessThanOrEqual(500);
    expect((nws?.location.region ?? "").length).toBeLessThanOrEqual(120);
    expect(nws?.id).toMatch(/^SIG-NWS-[A-Za-z0-9._:-]*$/);
    expect(nws?.id).not.toContain("<");
    expect(nws?.id).not.toContain("/");
  });
});
