import type { PublicSignal } from "@/lib/schemas";

export const cachedSignals: PublicSignal[] = [
  {
    id: "SIG-CACHED-USGS-JP",
    source: "USGS Earthquake Feed",
    sourceUrl: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson",
    fetchedAt: "2026-05-05T12:00:00.000Z",
    eventType: "EARTHQUAKE_PROXIMITY",
    location: {
      lat: 35.6,
      lon: 140.1,
      region: "Japan supplier corridor",
      country: "Japan"
    },
    severity: "MEDIUM",
    summary:
      "Cached earthquake-proximity fixture near the Japan supplier corridor for demo reliability.",
    freshnessMinutes: 0,
    status: "CACHED"
  },
  {
    id: "SIG-CACHED-WEATHER-SJC",
    source: "Open-Meteo Forecast",
    sourceUrl:
      "https://api.open-meteo.com/v1/forecast?latitude=37.3382&longitude=-121.8863&current=temperature_2m,wind_speed_10m",
    fetchedAt: "2026-05-05T12:00:00.000Z",
    eventType: "WEATHER_LOGISTICS",
    location: {
      lat: 37.3382,
      lon: -121.8863,
      region: "San Jose launch build center",
      country: "United States"
    },
    severity: "LOW",
    summary:
      "Cached weather fixture for San Jose launch build center; no material weather delay indicated.",
    freshnessMinutes: 0,
    status: "CACHED"
  },
  {
    id: "SIG-CACHED-EONET-WILDFIRE",
    source: "NASA EONET",
    sourceUrl: "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=5",
    fetchedAt: "2026-05-05T12:00:00.000Z",
    eventType: "NATURAL_EVENT_MONITOR",
    location: {
      region: "Global natural event monitor"
    },
    severity: "LOW",
    summary:
      "Cached NASA EONET fixture included to demonstrate external natural-event monitoring.",
    freshnessMinutes: 0,
    status: "CACHED"
  }
];
