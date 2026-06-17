import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  cachedSignals,
  fixtureOnlySignals,
  nwsCachedFixture
} from "@/lib/signals/cached";
import { mapGdeltArticles, type GdeltArticle } from "@/lib/signals/gdelt";
import { PublicSignalSchema } from "@/lib/schemas";

// The GDELT replay fixtures must be EXACTLY what the live mapper produces from the
// recorded artlist, so a recorded fixture can never silently drift from the live
// contract (the P2.6 "flow through the one core" lesson). This independently
// recomputes the mapping from the raw capture and compares -- hand-editing a GDELT
// fixture in cached.ts (instead of re-recording) fails here.
const CAPTURE_AT_MS = Date.parse("2026-06-17T12:00:00.000Z");
const artlist = JSON.parse(
  readFileSync("data/signals/gdelt-artlist-sample-20260617.json", "utf8")
) as { articles: GdeltArticle[] };

describe("cached signal fixtures", () => {
  it("the GDELT replay set meets the mapper output contract independently (real teeth)", () => {
    const gdeltReplay = cachedSignals.filter((signal) => signal.source === "GDELT DOC 2.0");
    // The recorded artlist has 5 distinct-url articles -> 5 deduped signals. A raw
    // fixture edit (add/remove/change a url) trips this independently of the mapper.
    expect(gdeltReplay).toHaveLength(5);
    for (const signal of gdeltReplay) {
      expect(signal.id).toMatch(/^SIG-GDELT-[0-9a-f]{16}$/); // sha256(url)[:16]
      expect(signal.fetchedAt).toBe("2026-06-17T12:00:00.000Z"); // the fixed capture clock
      expect(signal.eventType).toBe("DISRUPTION_NEWS");
      expect(signal.severity).toBe("MEDIUM");
      expect(signal.status).toBe("CACHED");
      expect(/^https?:\/\//.test(signal.sourceUrl)).toBe(true);
      expect(signal.summary.length).toBeLessThanOrEqual(500);
      expect(signal.freshnessMinutes).toBeGreaterThanOrEqual(0);
    }
    // dedup held: ids are unique.
    expect(new Set(gdeltReplay.map((signal) => signal.id)).size).toBe(gdeltReplay.length);
  });

  it("derives the GDELT replay set through the live mapper (regression lock)", () => {
    // Complements the contract test: proves cached.ts still DERIVES through the shared
    // mapper rather than hand-authored literals -- an edit that stops using the mapper
    // (or changes the capture clock / source file) diverges here.
    const expected = mapGdeltArticles(artlist.articles, "CACHED", () => CAPTURE_AT_MS).signals;
    const gdeltReplay = cachedSignals.filter((signal) => signal.source === "GDELT DOC 2.0");
    expect(gdeltReplay).toEqual(expected);
  });

  it("labels every cached signal CACHED with a schema-valid shape", () => {
    expect(cachedSignals.length).toBeGreaterThanOrEqual(3);
    for (const signal of cachedSignals) {
      expect(() => PublicSignalSchema.parse(signal)).not.toThrow();
      expect(signal.status).toBe("CACHED");
    }
    // No HIGH/CRITICAL cached signal: the deterministic exception engine keys its
    // severity off the strongest signal, so cached context must not escalate it.
    expect(
      cachedSignals.some((signal) => signal.severity === "HIGH" || signal.severity === "CRITICAL")
    ).toBe(false);
  });

  it("includes the fixture-only sources and the named NWS fallback", () => {
    expect(fixtureOnlySignals.map((signal) => signal.source).sort()).toEqual([
      "NASA EONET",
      "USGS Earthquake Feed"
    ]);
    expect(fixtureOnlySignals.every((signal) => signal.status === "CACHED")).toBe(true);
    expect(nwsCachedFixture.source).toBe("National Weather Service");
    expect(nwsCachedFixture.status).toBe("CACHED");
    expect(cachedSignals).toContain(nwsCachedFixture);
  });
});
