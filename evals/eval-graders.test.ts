import { describe, expect, it } from "vitest";

import { resolveSourcePath } from "@/lib/evals/source-path";
import {
  extractSourceableNumerals,
  normalizeNumeral,
  sameFigure
} from "@/lib/evals/numerals";

// ---------------------------------------------------------------------------
// sourcePath resolver -- the load-bearing parser under the citation grader. A
// bug here makes every citation verdict unsound, so it is tested directly, not
// only through the grader.
// ---------------------------------------------------------------------------
describe("resolveSourcePath", () => {
  const packet = {
    simulation: {
      horizons: [
        { days: 7, revenueAtRiskUsd: 50_000 },
        { days: 30, revenueAtRiskUsd: 200_000 }
      ]
    },
    exposureResults: [{ exposureScore: 72 }],
    threatCard: { confidence: 0.8 }
  };

  it("resolves a dotted + indexed path to the leaf value", () => {
    expect(resolveSourcePath(packet, "simulation.horizons[0].revenueAtRiskUsd")).toEqual({
      resolved: true,
      value: 50_000
    });
    expect(resolveSourcePath(packet, "simulation.horizons[1].days")).toEqual({
      resolved: true,
      value: 30
    });
    expect(resolveSourcePath(packet, "exposureResults[0].exposureScore")).toEqual({
      resolved: true,
      value: 72
    });
  });

  it("returns unresolved (never throws) for a dangling or out-of-range path", () => {
    expect(resolveSourcePath(packet, "simulation.horizons[9].days").resolved).toBe(false);
    expect(resolveSourcePath(packet, "simulation.missing").resolved).toBe(false);
    expect(resolveSourcePath(packet, "exposureResults.exposureScore").resolved).toBe(false);
    expect(resolveSourcePath(packet, "").resolved).toBe(false);
  });

  it("rejects a malformed path rather than half-walking it", () => {
    expect(resolveSourcePath(packet, "simulation..horizons").resolved).toBe(false);
    expect(resolveSourcePath(packet, "simulation.horizons[x]").resolved).toBe(false);
    expect(resolveSourcePath(packet, "simulation.horizons[-1]").resolved).toBe(false);
    expect(resolveSourcePath(packet, "simulation horizons").resolved).toBe(false);
  });

  it("refuses to traverse prototype keys", () => {
    expect(resolveSourcePath(packet, "__proto__.polluted").resolved).toBe(false);
    expect(resolveSourcePath(packet, "constructor.name").resolved).toBe(false);
  });

  it("indexing into a non-array, or keying into a non-object, is unresolved", () => {
    expect(resolveSourcePath(packet, "threatCard.confidence[0]").resolved).toBe(false);
    expect(resolveSourcePath(packet, "threatCard.confidence.x").resolved).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sourceable-numeral extraction -- the other false-failure risk. Tested in BOTH
// directions: a real asserted figure IS caught; an id digit or a date digit is
// NOT (so the citation grader does not reject a correct draft over "THREAT-001").
// ---------------------------------------------------------------------------
describe("extractSourceableNumerals", () => {
  it("catches asserted figures: currency, counts, percents, day counts", () => {
    expect(extractSourceableNumerals("revenue at risk is $50,000 over the window")).toEqual([
      50_000
    ]);
    expect(extractSourceableNumerals("a 7-day exposure window")).toEqual([7]);
    expect(extractSourceableNumerals("a 40% surcharge applies")).toEqual([40]);
    expect(extractSourceableNumerals("9 suppliers are exposed")).toEqual([9]);
    expect(
      extractSourceableNumerals("we see $50,000 at 7 days and $200,000 at 30 days")
    ).toEqual([50_000, 7, 200_000, 30]);
  });

  it("does NOT flag id-internal digits (SUP-100, THREAT-001, EXP-001)", () => {
    expect(extractSourceableNumerals("supplier SUP-100 via THREAT-001 and EXP-001")).toEqual(
      []
    );
    expect(extractSourceableNumerals("see packet DP-v2-fixture line AI-001")).toEqual([]);
  });

  it("does NOT flag calendar dates", () => {
    expect(extractSourceableNumerals("projected runout 2026-07-01")).toEqual([]);
    expect(
      extractSourceableNumerals("captured at 2026-06-13T12:00:00.000Z by Sentinel")
    ).toEqual([]);
  });

  it("reads a figure that sits next to an id or a date without bleeding into them", () => {
    expect(
      extractSourceableNumerals("SUP-100 carries $50,000 of risk as of 2026-07-01")
    ).toEqual([50_000]);
  });
});

describe("normalizeNumeral / sameFigure", () => {
  it("normalizes presentation affixes to one comparable number", () => {
    expect(normalizeNumeral("$50,000")).toBe(50_000);
    expect(normalizeNumeral("40%")).toBe(40);
    expect(normalizeNumeral(50_000)).toBe(50_000);
    expect(normalizeNumeral("not-a-number")).toBeNull();
    expect(normalizeNumeral(Infinity)).toBeNull();
  });

  it("treats equal figures as the same within float slack", () => {
    expect(sameFigure(50_000, 50_000)).toBe(true);
    expect(sameFigure(50_000, 50_001)).toBe(false);
  });
});
