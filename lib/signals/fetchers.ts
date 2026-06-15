import type { PublicSignal } from "@/lib/schemas";
import { PublicSignalSchema } from "@/lib/schemas";
import { cachedSignals } from "@/lib/signals/cached";

const TIMEOUT_MS = 5000;

export async function fetchPublicSignals({
  useLive = true
}: {
  useLive?: boolean;
} = {}): Promise<PublicSignal[]> {
  if (!useLive) {
    return cachedSignals;
  }

  const fetchers = [
    fetchUsgsEarthquakeSignal,
    fetchOpenMeteoSignal,
    fetchNwsSignal,
    fetchNasaEonetSignal
  ];

  const settled = await Promise.allSettled(fetchers.map((fetcher) => fetcher()));
  const liveSignals = settled.flatMap((result, index) => {
    if (result.status === "fulfilled") {
      return [result.value];
    }
    return [
      {
        ...cachedSignals[index % cachedSignals.length],
        id: `${cachedSignals[index % cachedSignals.length].id}-FALLBACK`,
        fetchedAt: new Date().toISOString(),
        status: "FAILED" as const,
        summary: `${cachedSignals[index % cachedSignals.length].summary} Live fetch failed: ${
          result.reason instanceof Error ? result.reason.message : "unknown error"
        }`
      }
    ];
  });

  return liveSignals.map((signal) => PublicSignalSchema.parse(signal));
}

export async function fetchUsgsEarthquakeSignal(): Promise<PublicSignal> {
  const url =
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson";
  const data = await fetchJson<{
    features: Array<{
      id: string;
      properties: { mag: number; place: string; time: number; url: string };
      geometry: { coordinates: [number, number, number] };
    }>;
  }>(url);
  const strongest = [...(data.features ?? [])].sort(
    (a, b) => (b.properties.mag ?? 0) - (a.properties.mag ?? 0)
  )[0];

  if (!strongest) {
    throw new Error("USGS returned no earthquake features");
  }

  const magnitude = strongest.properties.mag ?? 0;
  const fetchedAt = new Date().toISOString();
  return {
    id: `SIG-USGS-${strongest.id}`,
    source: "USGS Earthquake Feed",
    sourceUrl: strongest.properties.url || url,
    fetchedAt,
    eventType: "EARTHQUAKE_PROXIMITY",
    location: {
      lat: strongest.geometry.coordinates[1],
      lon: strongest.geometry.coordinates[0],
      region: strongest.properties.place
    },
    severity: magnitude >= 6.5 ? "HIGH" : magnitude >= 5.5 ? "MEDIUM" : "LOW",
    summary: `Largest recent M${magnitude} earthquake reported at ${strongest.properties.place}.`,
    freshnessMinutes: minutesSince(strongest.properties.time),
    status: "LIVE"
  };
}

export async function fetchOpenMeteoSignal(): Promise<PublicSignal> {
  const url =
    "https://api.open-meteo.com/v1/forecast?latitude=37.3382&longitude=-121.8863&current=temperature_2m,wind_speed_10m&forecast_days=1";
  const data = await fetchJson<{
    current: { time: string; temperature_2m: number; wind_speed_10m: number };
  }>(url);
  const wind = data.current.wind_speed_10m;
  return {
    id: "SIG-OPENMETEO-SJC",
    source: "Open-Meteo Forecast",
    sourceUrl: url,
    fetchedAt: new Date().toISOString(),
    eventType: "WEATHER_LOGISTICS",
    location: {
      lat: 37.3382,
      lon: -121.8863,
      region: "San Jose launch build center",
      country: "United States"
    },
    severity: wind >= 55 ? "HIGH" : wind >= 35 ? "MEDIUM" : "LOW",
    summary: `San Jose current weather: ${data.current.temperature_2m}C and ${wind} km/h wind.`,
    freshnessMinutes: minutesSince(Date.parse(data.current.time)),
    status: "LIVE"
  };
}

export async function fetchNwsSignal(): Promise<PublicSignal> {
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
  }>(url, {
    headers: {
      "User-Agent": "resilix-launchops-ai/0.1 portfolio-demo"
    }
  });

  const alert = data.features?.[0];
  if (!alert) {
    return {
      id: "SIG-NWS-CA-NONE",
      source: "National Weather Service",
      sourceUrl: url,
      fetchedAt: new Date().toISOString(),
      eventType: "WEATHER_ALERT",
      location: { region: "California", country: "United States" },
      severity: "LOW",
      summary: "No active California NWS alert returned for the demo query.",
      freshnessMinutes: 0,
      status: "LIVE"
    };
  }

  return {
    id: `SIG-NWS-${alert.id.split("/").pop() ?? "ALERT"}`,
    source: "National Weather Service",
    sourceUrl: url,
    fetchedAt: new Date().toISOString(),
    eventType: "WEATHER_ALERT",
    location: { region: alert.properties.areaDesc, country: "United States" },
    severity: mapNwsSeverity(alert.properties.severity),
    summary: alert.properties.headline || alert.properties.event,
    freshnessMinutes: minutesSince(Date.parse(alert.properties.sent)),
    status: "LIVE"
  };
}

export async function fetchNasaEonetSignal(): Promise<PublicSignal> {
  const url = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=5";
  const data = await fetchJson<{
    events: Array<{
      id: string;
      title: string;
      link: string;
      categories: Array<{ title: string }>;
      geometry: Array<{ date: string; coordinates: [number, number] }>;
    }>;
  }>(url);

  const event = data.events?.[0];
  if (!event) {
    throw new Error("NASA EONET returned no open events");
  }
  const geometry = event.geometry?.[0];

  return {
    id: `SIG-EONET-${event.id}`,
    source: "NASA EONET",
    sourceUrl: event.link || url,
    fetchedAt: new Date().toISOString(),
    eventType: event.categories?.[0]?.title ?? "NATURAL_EVENT",
    location: {
      lat: geometry?.coordinates?.[1],
      lon: geometry?.coordinates?.[0],
      region: event.title
    },
    severity: "LOW",
    summary: `Open EONET event monitored: ${event.title}.`,
    freshnessMinutes: geometry?.date ? minutesSince(Date.parse(geometry.date)) : 0,
    status: "LIVE"
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
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

function minutesSince(timeMs: number) {
  if (!Number.isFinite(timeMs)) {
    return 0;
  }
  return Math.max(0, Math.round((Date.now() - timeMs) / 60000));
}

function mapNwsSeverity(value: string): PublicSignal["severity"] {
  const normalized = value.toLowerCase();
  if (normalized.includes("extreme")) return "CRITICAL";
  if (normalized.includes("severe")) return "HIGH";
  if (normalized.includes("moderate")) return "MEDIUM";
  return "LOW";
}
