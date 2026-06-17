import { describe, expect, it } from "vitest";
import { fetchPublicSignals } from "@/lib/signals/fetchers";
import { __resetGdeltStateForTest, fetchGdeltSignals } from "@/lib/signals/gdelt";
import { PublicSignalSchema } from "@/lib/schemas";

// verify:live -- the ONLY network-touching suite. Gated behind RUN_LIVE_SIGNAL_TESTS
// so the default `verify` stays offline-deterministic (a flaky network must never
// poison the gate evidence). Run on demand via `npm run verify:live`. It shape-diffs
// the LIVE fetchers against the PublicSignal contract + the layer invariants,
// tolerant of a throttled GDELT or a down NWS -- those degrade to CACHED/FAILED,
// never an exception and never a mislabel.
const shouldRun = process.env.RUN_LIVE_SIGNAL_TESTS === "true";
const describeLive = shouldRun ? describe : describe.skip;

describeLive("live signal smoke (verify:live)", () => {
  it("fetchGdeltSignals returns a well-formed, schema-valid result (never throws)", async () => {
    __resetGdeltStateForTest();
    const result = await fetchGdeltSignals();
    expect(["LIVE", "CACHED", "FAILED"]).toContain(result.status);
    for (const signal of result.signals) {
      expect(() => PublicSignalSchema.parse(signal)).not.toThrow();
      expect(/^https?:\/\//.test(signal.sourceUrl)).toBe(true);
      expect(["LIVE", "CACHED"]).toContain(signal.status);
    }
    console.log(
      `[verify:live] GDELT status=${result.status} signals=${result.signals.length} ` +
        `skipped=${result.skipped} note="${result.note}"`
    );
  }, 40_000);

  it("fetchPublicSignals composes live sources + fixtures, all schema-valid, none mislabeled", async () => {
    // No reset: reuse the warm GDELT cache from the previous test (same default key)
    // so this exercises a real live/cached compose without a second hit on GDELT.
    const signals = await fetchPublicSignals({ useLive: true });

    expect(signals.length).toBeGreaterThanOrEqual(2); // at minimum the fixture-only USGS + EONET
    for (const signal of signals) {
      expect(() => PublicSignalSchema.parse(signal)).not.toThrow();
      expect(/^https?:\/\//.test(signal.sourceUrl)).toBe(true);
    }

    // The fixture-only sources are always present and always CACHED (never live-fetched).
    const usgs = signals.find((signal) => signal.source === "USGS Earthquake Feed");
    const eonet = signals.find((signal) => signal.source === "NASA EONET");
    expect(usgs?.status).toBe("CACHED");
    expect(eonet?.status).toBe("CACHED");
    // No dropped source ever returns.
    expect(signals.some((signal) => signal.source.includes("Open-Meteo"))).toBe(false);

    // NWS is the required-live anchor: a stable US-gov API with no throttle, LIVE
    // whether or not an alert is active -- so verify:live cannot pass with ZERO working
    // live sources. GDELT is tolerated-degraded (documented 5s throttle); requiring it
    // LIVE would make this smoke flaky for a non-bug, and its degrade paths are covered
    // by the deterministic DI tests instead.
    const nws = signals.find((signal) => signal.source === "National Weather Service");
    expect(nws?.status).toBe("LIVE");
    expect(signals.some((signal) => signal.status === "LIVE")).toBe(true);

    const breakdown = signals.reduce<Record<string, number>>((acc, signal) => {
      const key = `${signal.source}:${signal.status}`;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    console.log(`[verify:live] composed ${signals.length} signals: ${JSON.stringify(breakdown)}`);
  }, 40_000);
});
