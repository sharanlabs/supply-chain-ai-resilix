import { describe, expect, it } from "vitest";
import { buildExceptionEvent, calculateImpact, buildRecoveryOptions } from "@/lib/legacy/impact";
import { cachedSignals } from "@/lib/signals/cached";

describe("deterministic impact engine", () => {
  it("calculates launch impact without model-generated math", () => {
    const exception = buildExceptionEvent({
      scenarioId: "SCN-LAUNCH-001",
      publicSignals: cachedSignals
    });
    const impact = calculateImpact(exception);

    expect(impact.inventoryDaysRemaining).toBe(4.4);
    expect(impact.shipmentDelayDays).toBe(11);
    expect(impact.revenueAtRisk).toBe(52771300);
    expect(impact.launchRiskScore).toBeGreaterThanOrEqual(70);
    expect(impact.calculations.map((calc) => calc.id)).toContain(
      "CALC-REVENUE-RISK"
    );
  });

  it("returns exactly three ranked recovery options", () => {
    const exception = buildExceptionEvent({
      scenarioId: "SCN-LAUNCH-001",
      publicSignals: cachedSignals
    });
    const impact = calculateImpact(exception);
    const options = buildRecoveryOptions(impact);

    expect(options).toHaveLength(3);
    expect(options[0].score).toBeGreaterThanOrEqual(options[1].score);
    expect(options.some((option) => option.approvalRequired)).toBe(true);
  });
});
