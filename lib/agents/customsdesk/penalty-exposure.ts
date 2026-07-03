// Deterministic penalty-exposure calculator (plan §5 D1).
//
// THE contract (Codex plan-gate R1 #9): emits BOUNDED estimates + cited assumptions --
// culpability tier, prior-disclosure status, and factor posture in, a [min, max] range
// out, every branch citing the policy table. NEVER "the" penalty: false precision in a
// legal document is the failure mode this module exists to avoid. Pure integer math
// on cents; no I/O, no clock, no randomness.

import {
  AGGRAVATING_FACTORS,
  MITIGATING_FACTORS,
  PRIOR_DISCLOSURE_RULES,
  findDispositionRange,
  resolveDirectedFloorPct,
  type Culpability,
  type DirectedScenarioOverride,
  type LossType,
  type PolicyCitation,
} from "./policy-table";

export interface PenaltyExposureInput {
  culpability: Culpability;
  lossType: LossType;
  actualLossOfDutyCents: number; // realized LOR (liquidated entries)
  potentialLossOfDutyCents: number; // unliquidated / potential LOR
  dutiableValueCents: number;
  domesticValueCents: number;
  priorDisclosure: boolean;
  // For prior-disclosure GN/NEG duty-loss cases the disposition is INTEREST on the
  // actual LOR (ICP-1592 (f)(2)(a)). The rate is an operator-supplied assumption --
  // emitted as such, never silently defaulted.
  interestAssumption?: { annualRatePct: number; days: number };
  aggravating: string[];
  mitigating: string[];
}

export interface BoundedPenaltyEstimate {
  minCents: number;
  maxCents: number;
  citations: PolicyCitation[];
  assumptions: string[];
  warnings: string[];
  domesticValueCapEngaged: boolean;
  // Present ONLY when a directed_pending scenario was explicitly requested; always
  // labeled -- never merged into the operative range.
  directedScenario?: {
    label: "EO-14411-scenario (directed, not codified)";
    floorPctOfAssessed: number;
    scenarioMinCents: number;
  };
}

function assertNonNegativeInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer (cents), got ${value}`);
  }
}

export function computePenaltyExposure(
  input: PenaltyExposureInput,
  directedScenario?: DirectedScenarioOverride | null
): BoundedPenaltyEstimate {
  assertNonNegativeInt(input.actualLossOfDutyCents, "actualLossOfDutyCents");
  assertNonNegativeInt(input.potentialLossOfDutyCents, "potentialLossOfDutyCents");
  assertNonNegativeInt(input.dutiableValueCents, "dutiableValueCents");
  assertNonNegativeInt(input.domesticValueCents, "domesticValueCents");
  for (const factor of input.aggravating) {
    if (!(AGGRAVATING_FACTORS as readonly string[]).includes(factor)) {
      throw new Error(`unknown aggravating factor '${factor}' (policy-table VIII vocabulary only)`);
    }
  }
  for (const factor of input.mitigating) {
    if (!(MITIGATING_FACTORS as readonly string[]).includes(factor)) {
      throw new Error(`unknown mitigating factor '${factor}' (policy-table VII vocabulary only)`);
    }
  }

  const totalLorCents = input.actualLossOfDutyCents + input.potentialLossOfDutyCents;
  const citations: PolicyCitation[] = [];
  const assumptions: string[] = [];
  const warnings: string[] = [];
  let minCents: number;
  let maxCents: number;
  let domesticValueCapEngaged = false;

  if (input.priorDisclosure) {
    citations.push(PRIOR_DISCLOSURE_RULES.citation);
    if (input.culpability === "FRAUD") {
      if (input.lossType === "DUTY_LOSS") {
        // 100% of TOTAL loss of duty (actual + potential); no mitigation afforded.
        minCents = maxCents = Math.round((totalLorCents * PRIOR_DISCLOSURE_RULES.fraudDutyLossTotalLorHundredths) / 100);
      } else {
        // 10% of dutiable value; no mitigation afforded.
        minCents = maxCents = Math.round((input.dutiableValueCents * PRIOR_DISCLOSURE_RULES.fraudNonDutyPctOfDutiableHundredths) / 10000);
      }
      warnings.push("Prior-disclosure fraud disposition: no mitigation afforded (ICP-1592 (f)(1)).");
    } else if (input.lossType === "DUTY_LOSS") {
      // Interest on the ACTUAL loss of duty only; no penalty where loss is potential only.
      if (input.actualLossOfDutyCents === 0) {
        minCents = maxCents = 0;
        warnings.push("No monetary penalty: duty loss is potential only (ICP-1592 (f)(2)(a)).");
      } else {
        if (!input.interestAssumption) {
          throw new Error(
            "prior-disclosure GN/NEG duty-loss disposition is interest on actual LOR: an explicit interestAssumption {annualRatePct, days} is required (assumption, not policy)"
          );
        }
        const { annualRatePct, days } = input.interestAssumption;
        if (annualRatePct < 0 || annualRatePct > 100 || days < 0) {
          throw new Error("interestAssumption out of range");
        }
        minCents = maxCents = Math.round(
          (input.actualLossOfDutyCents * annualRatePct * days) / (100 * 365)
        );
        assumptions.push(
          `Interest computed at an ASSUMED simple annual rate of ${annualRatePct}% over ${days} days (liquidation->tender); the statutory rate for the actual period must be substituted before filing.`
        );
      }
      if (input.potentialLossOfDutyCents > 0 && input.actualLossOfDutyCents > 0) {
        warnings.push("Potential-LOR portion carries no penalty under prior disclosure; tender covers actual LOR only (ICP-1592 (f)(2)(a)).");
      }
    } else {
      // GN/NEG non-duty-loss under prior disclosure: no monetary penalty.
      minCents = maxCents = 0;
      warnings.push("No monetary penalty for non-duty-loss GN/negligence under valid prior disclosure; issued claims are remitted in full (ICP-1592 (f)(2)(b)).");
    }
  } else {
    const range = findDispositionRange(input.culpability, input.lossType);
    citations.push(range.citation);
    if (input.lossType === "DUTY_LOSS") {
      minCents = Math.round((totalLorCents * range.minHundredths) / 100);
      maxCents = Math.round((totalLorCents * range.maxHundredths) / 100);
    } else {
      // NON_DUTY rows store percent*100: pct/100/100 of dutiable value.
      minCents = Math.round((input.dutiableValueCents * range.minHundredths) / 10000);
      maxCents = Math.round((input.dutiableValueCents * range.maxHundredths) / 10000);
    }
    if (maxCents > input.domesticValueCents) {
      maxCents = input.domesticValueCents;
      domesticValueCapEngaged = true;
      warnings.push("Statutory cap engaged: disposition may not exceed the domestic value of the merchandise (ICP-1592 F(2)).");
    }
    if (minCents > input.domesticValueCents) {
      minCents = input.domesticValueCents;
    }
    if (input.aggravating.length > 0) {
      warnings.push(
        `Aggravating factor(s) present (${input.aggravating.join(", ")}): a disposition ABOVE the standard maximum is possible, still capped at domestic value (ICP-1592 F(2)).`
      );
    }
    if (input.mitigating.length > 0) {
      assumptions.push(
        `Mitigating factor(s) claimed (${input.mitigating.join(", ")}): positioning within [min, max] is the deciding officer's discretion; the range is not narrowed automatically (ICP-1592 VII).`
      );
    }
  }

  const estimate: BoundedPenaltyEstimate = {
    minCents,
    maxCents,
    citations,
    assumptions,
    warnings,
    domesticValueCapEngaged,
  };

  const floorPct = resolveDirectedFloorPct(directedScenario);
  if (directedScenario !== undefined && floorPct !== null) {
    estimate.directedScenario = {
      label: "EO-14411-scenario (directed, not codified)",
      floorPctOfAssessed: floorPct,
      scenarioMinCents: Math.max(minCents, Math.round((maxCents * floorPct) / 100)),
    };
  }
  return estimate;
}
