// D1 oracle suite -- deterministic domain core (penalty exposure, policy layers,
// deadline clocks, entry scoper). Every expected figure is HAND-DERIVED from the
// primary sources cited in policy-table.ts; derivations are shown inline (the P1
// two-derivations discipline: arithmetic derived two independent ways in comments).
import { describe, expect, it } from "vitest";

import { computePenaltyExposure } from "@/lib/agents/customsdesk/penalty-exposure";
import { computeDeadlines, daysUntil } from "@/lib/agents/customsdesk/deadline-clocks";
import { scopeEntryPopulation } from "@/lib/agents/customsdesk/entry-scoper";
import { generateCase } from "@/lib/agents/customsdesk/synthetic-entries";
import { MATRIX_CELLS } from "@/lib/agents/customsdesk/edge-case-matrix";
import { EO_14411_DIRECTED, resolveDirectedFloorPct } from "@/lib/agents/customsdesk/policy-table";

const BASE = {
  actualLossOfDutyCents: 0,
  potentialLossOfDutyCents: 0,
  dutiableValueCents: 0,
  domesticValueCents: 0,
  aggravating: [] as string[],
  mitigating: [] as string[],
};

describe("penalty exposure -- disposition ranges (ICP-1592 F(2))", () => {
  it("negligence / duty loss: 0.5x-2x LOR, capped at domestic value", () => {
    // LOR $100,000; domestic value $150,000.
    // Derivation A: 0.5*100000=$50,000 ; 2*100000=$200,000 -> cap $150,000.
    // Derivation B (cents*hundredths/100): 10_000_000*50/100=500_000_00;
    //   10_000_000*200/100=20_000_000_00 > 15_000_000_00 -> capped.
    const est = computePenaltyExposure({
      ...BASE,
      culpability: "NEGLIGENCE",
      lossType: "DUTY_LOSS",
      actualLossOfDutyCents: 6_000_000,
      potentialLossOfDutyCents: 4_000_000, // total LOR $100k
      domesticValueCents: 15_000_000,
      dutiableValueCents: 40_000_000,
      priorDisclosure: false,
    });
    expect(est.minCents).toBe(5_000_000);
    expect(est.maxCents).toBe(15_000_000);
    expect(est.domesticValueCapEngaged).toBe(true);
    expect(est.citations[0].sourceId).toBe("ICP-1592");
  });

  it("fraud / duty loss: 5x-8x LOR", () => {
    // LOR $40,000; domestic $1,000,000. A: 5*40k=200k; 8*40k=320k (no cap).
    // B: 4_000_000*500/100=20_000_000; 4_000_000*800/100=32_000_000.
    const est = computePenaltyExposure({
      ...BASE,
      culpability: "FRAUD",
      lossType: "DUTY_LOSS",
      actualLossOfDutyCents: 4_000_000,
      domesticValueCents: 100_000_000,
      dutiableValueCents: 50_000_000,
      priorDisclosure: false,
    });
    expect(est.minCents).toBe(20_000_000);
    expect(est.maxCents).toBe(32_000_000);
    expect(est.domesticValueCapEngaged).toBe(false);
  });

  it("gross negligence / non-duty loss: 25%-40% of dutiable value", () => {
    // Dutiable $500,000. A: 125k-200k. B: 50_000_000*2500/10000=12_500_000;
    //   50_000_000*4000/10000=20_000_000.
    const est = computePenaltyExposure({
      ...BASE,
      culpability: "GROSS_NEGLIGENCE",
      lossType: "NON_DUTY_LOSS",
      dutiableValueCents: 50_000_000,
      domesticValueCents: 80_000_000,
      priorDisclosure: false,
    });
    expect(est.minCents).toBe(12_500_000);
    expect(est.maxCents).toBe(20_000_000);
  });

  it("aggravating factors warn (above-max possible) but never break the domestic cap", () => {
    const est = computePenaltyExposure({
      ...BASE,
      culpability: "NEGLIGENCE",
      lossType: "DUTY_LOSS",
      actualLossOfDutyCents: 10_000_000,
      domesticValueCents: 12_000_000,
      dutiableValueCents: 30_000_000,
      priorDisclosure: false,
      aggravating: ["WITHHOLDING_EVIDENCE"],
    });
    expect(est.maxCents).toBe(12_000_000); // 2x=20M capped at 12M
    expect(est.warnings.some((w) => w.includes("Aggravating"))).toBe(true);
    expect(est.warnings.some((w) => w.includes("cap"))).toBe(true);
  });

  it("rejects factor names outside the policy-table vocabulary", () => {
    expect(() =>
      computePenaltyExposure({
        ...BASE,
        culpability: "NEGLIGENCE",
        lossType: "DUTY_LOSS",
        actualLossOfDutyCents: 100,
        domesticValueCents: 1_000,
        dutiableValueCents: 1_000,
        priorDisclosure: false,
        aggravating: ["BEING_SHADY"],
      })
    ).toThrow(/unknown aggravating factor/);
  });
});

describe("penalty exposure -- prior disclosure (ICP-1592 (f))", () => {
  it("fraud / duty loss: exactly 100% of TOTAL LOR (actual + potential)", () => {
    // actual $25k + potential $15k = $40k -> disposition exactly $40k.
    const est = computePenaltyExposure({
      ...BASE,
      culpability: "FRAUD",
      lossType: "DUTY_LOSS",
      actualLossOfDutyCents: 2_500_000,
      potentialLossOfDutyCents: 1_500_000,
      domesticValueCents: 100_000_000,
      dutiableValueCents: 50_000_000,
      priorDisclosure: true,
    });
    expect(est.minCents).toBe(4_000_000);
    expect(est.maxCents).toBe(4_000_000);
  });

  it("negligence / duty loss: interest on ACTUAL LOR only, explicit rate assumption required", () => {
    // Actual $30,000 at 6% simple for 365 days.
    // A: 30000*0.06 = $1,800. B: 3_000_000*6*365/(100*365) = 180_000 cents.
    const est = computePenaltyExposure({
      ...BASE,
      culpability: "NEGLIGENCE",
      lossType: "DUTY_LOSS",
      actualLossOfDutyCents: 3_000_000,
      potentialLossOfDutyCents: 2_000_000,
      domesticValueCents: 100_000_000,
      dutiableValueCents: 50_000_000,
      priorDisclosure: true,
      interestAssumption: { annualRatePct: 6, days: 365 },
    });
    expect(est.minCents).toBe(180_000);
    expect(est.maxCents).toBe(180_000);
    expect(est.assumptions.some((a) => a.includes("ASSUMED"))).toBe(true);

    // Without the explicit assumption the calculator refuses -- never a silent default.
    expect(() =>
      computePenaltyExposure({
        ...BASE,
        culpability: "NEGLIGENCE",
        lossType: "DUTY_LOSS",
        actualLossOfDutyCents: 3_000_000,
        domesticValueCents: 100_000_000,
        dutiableValueCents: 50_000_000,
        priorDisclosure: true,
      })
    ).toThrow(/interestAssumption/);
  });

  it("negligence / potential-only duty loss: NO monetary penalty", () => {
    const est = computePenaltyExposure({
      ...BASE,
      culpability: "NEGLIGENCE",
      lossType: "DUTY_LOSS",
      potentialLossOfDutyCents: 5_000_000,
      domesticValueCents: 100_000_000,
      dutiableValueCents: 50_000_000,
      priorDisclosure: true,
    });
    expect(est.minCents).toBe(0);
    expect(est.maxCents).toBe(0);
    expect(est.warnings.some((w) => w.includes("potential only"))).toBe(true);
  });

  it("gross negligence / non-duty loss: no penalty, claims remitted", () => {
    const est = computePenaltyExposure({
      ...BASE,
      culpability: "GROSS_NEGLIGENCE",
      lossType: "NON_DUTY_LOSS",
      dutiableValueCents: 50_000_000,
      domesticValueCents: 80_000_000,
      priorDisclosure: true,
    });
    expect(est.maxCents).toBe(0);
    expect(est.warnings.some((w) => w.includes("remitted"))).toBe(true);
  });

  it("THE demo delta: same facts, disclosure vs caught -- negligence $100k LOR", () => {
    // Caught: 0.5x-2x LOR = $50k-$200k. Disclosed: interest only ~ $1.8k-$6k range
    // depending on period -- here 6%/365d on actual $100k = $6,000.
    const caught = computePenaltyExposure({
      ...BASE,
      culpability: "NEGLIGENCE",
      lossType: "DUTY_LOSS",
      actualLossOfDutyCents: 10_000_000,
      domesticValueCents: 100_000_000,
      dutiableValueCents: 50_000_000,
      priorDisclosure: false,
    });
    const disclosed = computePenaltyExposure({
      ...BASE,
      culpability: "NEGLIGENCE",
      lossType: "DUTY_LOSS",
      actualLossOfDutyCents: 10_000_000,
      domesticValueCents: 100_000_000,
      dutiableValueCents: 50_000_000,
      priorDisclosure: true,
      interestAssumption: { annualRatePct: 6, days: 365 },
    });
    expect(caught.minCents).toBe(5_000_000);
    expect(caught.maxCents).toBe(20_000_000);
    expect(disclosed.maxCents).toBe(600_000); // $6,000 -- 8x-33x smaller
  });
});

describe("directed_pending layer (EO 14411) -- scenario-only, divergence-tested", () => {
  const input = {
    ...BASE,
    culpability: "NEGLIGENCE" as const,
    lossType: "DUTY_LOSS" as const,
    actualLossOfDutyCents: 10_000_000,
    domesticValueCents: 100_000_000,
    dutiableValueCents: 50_000_000,
    priorDisclosure: false,
  };

  it("NOT applied by default -- operative output carries no scenario", () => {
    const est = computePenaltyExposure(input);
    expect(est.directedScenario).toBeUndefined();
  });

  it("explicit scenario: 50% floor of assessed max, clearly labeled", () => {
    // max $200k -> floor $100k; operative min $50k -> scenario min $100k.
    const est = computePenaltyExposure(input, {});
    expect(est.directedScenario?.floorPctOfAssessed).toBe(50);
    expect(est.directedScenario?.scenarioMinCents).toBe(10_000_000);
    expect(est.directedScenario?.label).toContain("not codified");
    // Operative range itself is UNCHANGED by the scenario.
    expect(est.minCents).toBe(5_000_000);
  });

  it("divergence: softened final rule (25%) lowers the scenario floor", () => {
    const est = computePenaltyExposure(input, { minFloorPctOfAssessed: 25 });
    expect(est.directedScenario?.scenarioMinCents).toBe(5_000_000); // max(50k, 25% of 200k)
  });

  it("divergence: enjoined/rolled-back directive reproduces the operative-only result exactly", () => {
    const operative = computePenaltyExposure(input);
    const enjoined = computePenaltyExposure(input, { enjoined: true });
    const rolledBack = computePenaltyExposure(input, null);
    expect(JSON.stringify(enjoined)).toBe(JSON.stringify(operative));
    expect(JSON.stringify(rolledBack)).toBe(JSON.stringify(operative));
  });

  it("resolveDirectedFloorPct honors the directive default", () => {
    expect(resolveDirectedFloorPct(undefined)).toBe(EO_14411_DIRECTED.minFloorPctOfAssessed);
    expect(resolveDirectedFloorPct(null)).toBeNull();
  });
});

describe("deadline clocks (eCFR-cited)", () => {
  it("prepenalty 30d (162.78(a)) and petition 60d (171.2(b)(2)) from mailing", () => {
    const clocks = computeDeadlines([
      { kind: "PREPENALTY_RESPONSE", mailedOn: "2026-07-01" },
      { kind: "PENALTY_PETITION", mailedOn: "2026-07-01" },
    ]);
    // A: July has 31 days -> 07-01+30 = 07-31. B: day-of-year 182+30=212 -> 07-31.
    expect(clocks[0].dueOn).toBe("2026-07-31");
    expect(clocks[0].sourceStatus).toBe("primary-verified");
    // A: 07-01+60 = 08-30. B: 182+60=242 -> 08-30.
    expect(clocks[1].dueOn).toBe("2026-08-30");
    expect(clocks[1].citation).toContain("171.2");
  });

  it("CF-28 window is honestly labeled an assumption", () => {
    const [clock] = computeDeadlines([{ kind: "CF28_RESPONSE", mailedOn: "2026-07-01" }]);
    expect(clock.sourceStatus).toBe("assumption-pending-verification");
  });

  it("daysUntil is pure and sign-correct", () => {
    expect(daysUntil("2026-07-31", "2026-07-01")).toBe(30);
    expect(daysUntil("2026-07-01", "2026-07-31")).toBe(-30);
    expect(() => daysUntil("July 1", "2026-07-01")).toThrow();
  });
});

describe("entry-population scoper", () => {
  it("aggregates the generated population and matches a hand-parse of the same records", () => {
    const cell = MATRIX_CELLS.find((c) => c.id === "PD-COMPLETE-SINGLE_COUNTRY-AMPLE")!;
    const testCase = generateCase(cell, 101);
    const all = scopeEntryPopulation(testCase.entries, {});
    expect(all.entryCount).toBe(testCase.entries.length);
    const handLineCount = testCase.entries.reduce((n, e) => n + e.lines.length, 0);
    expect(all.lineCount).toBe(handLineCount);
    const handDuty = testCase.entries
      .flatMap((e) => e.lines)
      .reduce((sum, l) => sum + Number(l.tariff.slice(13, 23)), 0);
    expect(all.totalDeclaredDutyCents).toBe(handDuty);
    expect(Object.values(all.byCountryOfOrigin).reduce((a, b) => a + b, 0)).toBe(handLineCount);
  });

  it("criteria narrow the population (origin filter excludes everything else)", () => {
    const cell = MATRIX_CELLS.find((c) => c.id === "PD-COMPLETE-SINGLE_COUNTRY-AMPLE")!;
    const testCase = generateCase(cell, 101);
    const origin = testCase.meta.declaredOrigin;
    const scoped = scopeEntryPopulation(testCase.entries, { countryOfOrigin: origin });
    expect(scoped.lineCount).toBeGreaterThan(0);
    const none = scopeEntryPopulation(testCase.entries, { countryOfOrigin: "ZZ" });
    expect(none.lineCount).toBe(0);
    expect(none.entryCount).toBe(0);
  });
});
