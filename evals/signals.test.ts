import { describe, expect, it } from "vitest";
import { fetchPublicSignals } from "@/lib/signals/fetchers";

describe("public signal layer", () => {
  it("uses cached signals when live mode is disabled", async () => {
    const signals = await fetchPublicSignals({ useLive: false });

    expect(signals.length).toBeGreaterThanOrEqual(3);
    expect(signals.every((signal) => signal.status === "CACHED")).toBe(true);
    expect(signals.every((signal) => signal.sourceUrl.startsWith("https://"))).toBe(true);
  });
});
