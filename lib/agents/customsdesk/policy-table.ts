// The three-layer policy table (plan §5 D1, Codex plan-gate R1 #10).
//
// Every figure the penalty calculator uses lives HERE, with its primary source and
// as-of date -- never inline in calculator code, never from model memory. Layers:
//   operative         codified/published rules in force today (ICP + eCFR, fetched)
//   directed_pending  EO 14411 directives, signed but NOT codified (~Sep-2026 window);
//                     NEVER applied by default -- scenario-labeled only
//   scenario_only     hypothetical variants for divergence/rollback tests
//
// PRIMARY SOURCES (all in data/customs/cache/, committed manifest carries as-of):
//   [ICP-1592]  CBP "Mitigation Guidelines: Fraud, Gross Negligence, Negligence (1592)",
//               Feb 2004, pp. 91-93 (dispositions F(2), prior disclosure (f), factors VII/VIII)
//               -- fetched 2026-07-03 via the `icp` door.
//   [eCFR]      19 CFR 162.78(a), 171.2(b)(2), 162.74 -- point-in-time 2026-07-01,
//               fetched 2026-07-03 via the `ecfr` door.
//   [EO-14411]  FR doc 2026-11595 §4(c) -- "minimum penalty floor of not less than 50
//               percent of the assessed penalty, absent exceptional circumstances" +
//               "eliminating mitigation for repeat offenders"; DIRECTED, NOT CODIFIED
//               (90-day revision window to ~2026-09-01). Verified in portfolio §2/§11.

export type PolicyLayer = "operative" | "directed_pending" | "scenario_only";

export interface PolicyCitation {
  sourceId: "ICP-1592" | "eCFR" | "EO-14411";
  section: string;
  asOf: string; // date the source was fetched/verified
  layer: PolicyLayer;
}

export type Culpability = "NEGLIGENCE" | "GROSS_NEGLIGENCE" | "FRAUD";
export type LossType = "DUTY_LOSS" | "NON_DUTY_LOSS";

export interface DispositionRange {
  culpability: Culpability;
  lossType: LossType;
  // DUTY_LOSS: multiplier of total loss of revenue (hundredths, 50 = 0.5x).
  // NON_DUTY_LOSS: percent of dutiable value (whole percents).
  minHundredths: number;
  maxHundredths: number;
  cappedAtDomesticValue: true;
  citation: PolicyCitation;
}

const ICP: PolicyCitation = {
  sourceId: "ICP-1592",
  section: "F(2) pp.91-92",
  asOf: "2026-07-03",
  layer: "operative",
};

// ICP-1592 F(2), verbatim ranges. DUTY_LOSS in LOR-multiplier hundredths;
// NON_DUTY_LOSS in percent-of-dutiable-value (also stored as hundredths: 50% = 5000bp
// would be ambiguous -- so NON_DUTY rows use PERCENT * 100 for uniform integer math).
export const DISPOSITION_RANGES: DispositionRange[] = [
  { culpability: "FRAUD", lossType: "DUTY_LOSS", minHundredths: 500, maxHundredths: 800, cappedAtDomesticValue: true, citation: ICP },
  { culpability: "FRAUD", lossType: "NON_DUTY_LOSS", minHundredths: 5000, maxHundredths: 8000, cappedAtDomesticValue: true, citation: ICP },
  { culpability: "GROSS_NEGLIGENCE", lossType: "DUTY_LOSS", minHundredths: 250, maxHundredths: 400, cappedAtDomesticValue: true, citation: ICP },
  { culpability: "GROSS_NEGLIGENCE", lossType: "NON_DUTY_LOSS", minHundredths: 2500, maxHundredths: 4000, cappedAtDomesticValue: true, citation: ICP },
  { culpability: "NEGLIGENCE", lossType: "DUTY_LOSS", minHundredths: 50, maxHundredths: 200, cappedAtDomesticValue: true, citation: ICP },
  { culpability: "NEGLIGENCE", lossType: "NON_DUTY_LOSS", minHundredths: 500, maxHundredths: 2000, cappedAtDomesticValue: true, citation: ICP },
];

// ICP-1592 (f) "Prior Disclosure Dispositions", pp.92-93, verbatim:
//   fraud/duty:      100% of TOTAL loss of duty (actual + potential); no mitigation
//   fraud/non-duty:  10% of dutiable value; no mitigation
//   GN+NEG/duty:     interest on the ACTUAL loss of duty (liquidation -> tender);
//                    NO monetary penalty where the duty loss is potential only
//   GN+NEG/non-duty: no monetary penalty (issued claims remitted in full)
export const PRIOR_DISCLOSURE_RULES = {
  citation: { sourceId: "ICP-1592", section: "(f) pp.92-93", asOf: "2026-07-03", layer: "operative" } as PolicyCitation,
  fraudDutyLossTotalLorHundredths: 100,
  fraudNonDutyPctOfDutiableHundredths: 1000, // 10% * 100
} as const;

// ICP-1592 VII/VIII (non-exhaustive by the ICP's own statement).
export const MITIGATING_FACTORS = [
  "CONTRIBUTORY_CUSTOMS_ERROR",
  "COOPERATION_WITH_INVESTIGATION",
  "IMMEDIATE_REMEDIAL_ACTION",
  "INEXPERIENCE_IN_IMPORTING",
  "PRIOR_GOOD_RECORD",
  "INABILITY_TO_PAY",
  "CUSTOMS_KNOWLEDGE",
] as const;

export const AGGRAVATING_FACTORS = [
  "OBSTRUCTING_INVESTIGATION",
  "WITHHOLDING_EVIDENCE",
  "MISLEADING_INFORMATION",
  "ILLEGAL_TRANSSHIPMENT_TEXTILES",
] as const;

// Deadline windows, each with its own citation and honesty status.
export interface DeadlineRule {
  kind: "PREPENALTY_RESPONSE" | "PENALTY_PETITION" | "CF28_RESPONSE";
  windowDays: number;
  citation: PolicyCitation | null;
  sourceStatus: "primary-verified" | "assumption-pending-verification";
  note: string;
}

export const DEADLINE_RULES: DeadlineRule[] = [
  {
    kind: "PREPENALTY_RESPONSE",
    windowDays: 30,
    citation: { sourceId: "eCFR", section: "19 CFR 162.78(a)", asOf: "2026-07-03", layer: "operative" },
    sourceStatus: "primary-verified",
    note: "30 days from mailing of the prepenalty notice (may be shortened to >=7 days near the SoL).",
  },
  {
    kind: "PENALTY_PETITION",
    windowDays: 60,
    citation: { sourceId: "eCFR", section: "19 CFR 171.2(b)(2)", asOf: "2026-07-03", layer: "operative" },
    sourceStatus: "primary-verified",
    note: "Petitions for relief from penalties: 60 days from mailing of the penalty notice.",
  },
  {
    kind: "CF28_RESPONSE",
    windowDays: 30,
    citation: null,
    sourceStatus: "assumption-pending-verification",
    note: "The CF-28 form conventionally allows 30 days; not yet grounded in a fetched primary source -- displayed as an assumption.",
  },
];

// EO 14411 directives -- the directed_pending layer. NEVER active by default.
export interface DirectedPendingPolicy {
  citation: PolicyCitation;
  status: "directed-not-codified";
  codificationWindowEnds: string;
  minFloorPctOfAssessed: number; // ">= 50 percent of the assessed penalty"
  eliminatesMitigationForRepeatOffenders: true;
}

export const EO_14411_DIRECTED: DirectedPendingPolicy = {
  citation: { sourceId: "EO-14411", section: "§4(c) (FR 2026-11595)", asOf: "2026-07-02", layer: "directed_pending" },
  status: "directed-not-codified",
  codificationWindowEnds: "2026-09-01",
  minFloorPctOfAssessed: 50,
  eliminatesMitigationForRepeatOffenders: true,
};

// Divergence handling (Codex plan-gate R1 #10): the final rule may be softened,
// delayed, enjoined, or materially different. Scenario math therefore takes the
// directive as an OVERRIDABLE parameter; passing `null` (enjoined/rolled back)
// must reproduce the operative-only result byte-for-byte.
export interface DirectedScenarioOverride {
  minFloorPctOfAssessed?: number; // softened/raised final rule
  enjoined?: boolean; // court-blocked -> directive contributes nothing
}

export function resolveDirectedFloorPct(override?: DirectedScenarioOverride | null): number | null {
  if (override === null) return null;
  if (override?.enjoined) return null;
  return override?.minFloorPctOfAssessed ?? EO_14411_DIRECTED.minFloorPctOfAssessed;
}

export function findDispositionRange(culpability: Culpability, lossType: LossType): DispositionRange {
  const row = DISPOSITION_RANGES.find((r) => r.culpability === culpability && r.lossType === lossType);
  if (!row) throw new Error(`no disposition range for ${culpability}/${lossType}`);
  return row;
}
