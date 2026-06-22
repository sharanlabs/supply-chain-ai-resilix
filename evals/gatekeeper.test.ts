import { describe, expect, it } from "vitest";
import { validateDecisionInputs } from "@/lib/agents/gatekeeper";
import { buildExceptionEvent, buildRecoveryOptions, calculateImpact } from "@/lib/legacy/impact";
import { cachedSignals } from "@/lib/signals/cached";

describe("decision gatekeeper", () => {
  it("warns on cached signals but allows human review", () => {
    const exception = buildExceptionEvent({
      scenarioId: "SCN-LAUNCH-001",
      publicSignals: cachedSignals
    });
    const impact = calculateImpact(exception);
    const options = buildRecoveryOptions(impact);
    const report = validateDecisionInputs({
      publicSignals: cachedSignals,
      impactReport: impact,
      options,
      recommendedOptionId: options[0].id
    });

    expect(report.status).toBe("WARN");
    expect(report.failures).toEqual([]);
    expect(report.approvedForHumanReview).toBe(true);
  });

  it("blocks hallucinated evidence ids", () => {
    const exception = buildExceptionEvent({
      scenarioId: "SCN-LAUNCH-001",
      publicSignals: cachedSignals
    });
    const impact = calculateImpact(exception);
    const options = buildRecoveryOptions(impact);
    options[0] = {
      ...options[0],
      evidenceIds: [...options[0].evidenceIds, "SUP-FAKE-999"]
    };

    const report = validateDecisionInputs({
      publicSignals: cachedSignals,
      impactReport: impact,
      options,
      recommendedOptionId: options[0].id
    });

    expect(report.status).toBe("BLOCKED");
    expect(report.failures.join(" ")).toContain("SUP-FAKE-999");
  });
});
