import { describe, expect, it } from "vitest";

import { resolveSourcePath } from "@/lib/evals/source-path";
import {
  extractSourceableNumerals,
  normalizeNumeral,
  sameFigure
} from "@/lib/evals/numerals";
import {
  gradeCitationCoverage,
  gradeEvidence,
  gradeExposureControl,
  gradeOffTaxonomy,
  gradeSimulatorArithmetic,
  recomputeSimulation,
  type ScenarioGroundTruth,
  type SimInputs
} from "@/lib/evals/graders";
import { describeFailures, runGraders } from "@/lib/evals/run-graders";
import { makeV2Packet } from "@/evals/fixtures/decision-packet-v2";

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
  const figures = (text: string) => extractSourceableNumerals(text).figures;

  it("catches asserted figures: currency, counts, percents, day counts", () => {
    expect(figures("revenue at risk is $50,000 over the window")).toEqual([50_000]);
    expect(figures("a 7-day exposure window")).toEqual([7]);
    expect(figures("a 40% surcharge applies")).toEqual([40]);
    expect(figures("9 suppliers are exposed")).toEqual([9]);
    expect(figures("we see $50,000 at 7 days and $200,000 at 30 days")).toEqual([
      50_000, 7, 200_000, 30
    ]);
  });

  it("reads K/M/B magnitude suffixes (no silent misread of $1.2M as 1.2)", () => {
    expect(figures("exposure of $1.2M this quarter")).toEqual([1_200_000]);
    expect(figures("3k units affected")).toEqual([3_000]);
    expect(figures("$2.5B at risk")).toEqual([2_500_000_000]);
  });

  it("does NOT flag id-internal digits (SUP-100, THREAT-001, EXP-001)", () => {
    expect(figures("supplier SUP-100 via THREAT-001 and EXP-001")).toEqual([]);
    expect(figures("see packet DP-v2-fixture line AI-001")).toEqual([]);
  });

  it("rejects a number glued to letters (a SKU or version), keeps a real hyphen-count", () => {
    expect(figures("SKU 123ABC shipped")).toEqual([]);
    expect(figures("see release v2.1 notes")).toEqual([]);
    expect(figures("50USD has no space")).toEqual([]); // convention: write "50 USD" or "$50"
    expect(figures("we will contact the top-5 exposed suppliers")).toEqual([5]); // real count
  });

  it("does NOT flag calendar dates or slash ratios", () => {
    expect(figures("projected runout 2026-07-01")).toEqual([]);
    expect(figures("captured at 2026-06-13T12:00:00.000Z by Sentinel")).toEqual([]);
    expect(figures("operating 24/7 since 6/30")).toEqual([]);
  });

  it("fails CLOSED on scientific notation rather than misreading it", () => {
    const out = extractSourceableNumerals("risk is 1e6 dollars");
    expect(out.figures).toEqual([]);
    expect(out.unparseable).toEqual(["1e6"]);
  });

  // Codex D6 #4: a minus-signed figure parsed as positive would validate a
  // sign-flipped claim ("-5%" backed by cited 5). Fail closed on true minus signs;
  // in-word hyphens and ranges keep working.
  it("fails CLOSED on minus-signed figures rather than reading them positive", () => {
    const out = extractSourceableNumerals("margin moved -5% on a -$300 adjustment");
    expect(out.figures).toEqual([]);
    expect(out.unparseable).toContain("-5%");
    expect(out.unparseable).toContain("-$300");
  });

  it("does NOT flag range/in-word hyphens as minus signs", () => {
    const out = extractSourceableNumerals("expect 5-10 days for the top-5 suppliers");
    expect(out.unparseable).toEqual([]);
    expect(out.figures).toContain(10);
    expect(out.figures).toContain(5);
  });

  // Codex D6 R2 #3: the Unicode minus sign (U+2212) and dash look-alikes must get
  // the same fail-closed treatment as the ASCII hyphen-minus.
  it("fails CLOSED on Unicode minus/dash sign forms before digits", () => {
    const minus = extractSourceableNumerals("margin moved −5% this quarter");
    expect(minus.figures).toEqual([]);
    expect(minus.unparseable).toContain("−5%");

    const enDash = extractSourceableNumerals("adjustment of –$300 was recorded");
    expect(enDash.figures).toEqual([]);
    expect(enDash.unparseable).toContain("–$300");
  });

  // Fix #3: a quantity written as a NUMBER-WORD next to a unit ("within seven days",
  // "five thousand units") bypasses the ASCII FIGURE regex. It must be flagged as
  // unparseable (fail-closed -- a draft asserts figures in plain ASCII with a backing
  // claim), and it BITES: the citation grader fails on an unparseable form.
  it("flags spelled-out quantities adjacent to a unit (the word-number bypass)", () => {
    const a = extractSourceableNumerals("We will confirm within seven days of review.");
    expect(a.figures).toEqual([]);
    expect(a.unparseable).toContain("seven days");

    const b = extractSourceableNumerals("We are reserving five thousand units for you.");
    expect(b.figures).toEqual([]);
    expect(b.unparseable).toContain("five thousand units");
  });

  // Fix #3: a bare number-WORD with no unit is ordinary prose, not a figure -- and a
  // word that merely CONTAINS a number-word ("components" has "one") must NOT fire.
  it("does NOT flag a bare number-word or a word that merely contains one", () => {
    expect(extractSourceableNumerals("one of the affected lanes").unparseable).toEqual([]);
    expect(extractSourceableNumerals("Secure alternate routing for Gulf-exposed components.").unparseable).toEqual([]);
    expect(extractSourceableNumerals("the tenant and the billboard").unparseable).toEqual([]);
  });

  // Fix #3: a quantity written in a NON-ASCII digit script (Arabic-Indic, fullwidth)
  // never reaches the ASCII FIGURE regex, so it is flagged unparseable rather than
  // silently dropped (Number("٨") is NaN -> would vanish without a backing claim).
  it("flags non-ASCII digits rather than silently dropping them", () => {
    const arabicIndic = extractSourceableNumerals("Your exposure score is ٨٨."); // ٨٨
    expect(arabicIndic.figures).toEqual([]);
    expect(arabicIndic.unparseable).toContain("٨٨");

    const fullwidth = extractSourceableNumerals("Reserve ５０００ units now."); // ５０００
    expect(fullwidth.figures).toEqual([]);
    expect(fullwidth.unparseable.length).toBeGreaterThan(0);
  });

  it("reads a figure that sits next to an id or a date without bleeding into them", () => {
    expect(figures("SUP-100 carries $50,000 of risk as of 2026-07-01")).toEqual([50_000]);
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

  it("guards non-string / empty input rather than throwing", () => {
    expect(extractSourceableNumerals("")).toEqual({ figures: [], unparseable: [] });
    expect(extractSourceableNumerals(null as unknown as string)).toEqual({
      figures: [],
      unparseable: []
    });
    expect(normalizeNumeral(null)).toBeNull();
    expect(normalizeNumeral({} as unknown)).toBeNull();
    expect(normalizeNumeral("1.2M")).toBe(1_200_000);
  });
});

// ---------------------------------------------------------------------------
// Grader edge branches the golden corruptions do not exercise -- the failure
// modes a future live packet can hit (a Tier-1/sim mismatch, an unresolvable
// citation, a dangling evidence id, an unexplained OTHER_UNMAPPED, a bad score).
// Each is asserted directly so the grader's contract is legible, not implied.
// ---------------------------------------------------------------------------
const BASE_DATE = "2026-06-17T00:00:00.000Z";

function groundTruth(overrides: Partial<ScenarioGroundTruth> = {}): ScenarioGroundTruth {
  return {
    knownSupplierIds: new Set(["SUP-100"]),
    knownProductIds: new Set(["PROD-1"]),
    expectedAffectedSupplierIds: new Set(["SUP-100"]),
    evidenceAllowlist: new Set(["https://example.com/evidence-1"]),
    untrustedRawStrings: [],
    ...overrides
  };
}

const SIM_INPUTS: SimInputs = {
  baseDateIso: BASE_DATE,
  durationDays: 30,
  affected: [{ supplierId: "SUP-100", dailyRevenueUsd: 1_000 }],
  horizonDays: [7],
  inventory: [{ productId: "PROD-1", onHandUnits: 100, dailyUseUnits: 10 }]
};

describe("gradeSimulatorArithmetic edge branches", () => {
  it("passes a Tier-1 record (no inputs, no simulation section)", () => {
    const packet = makeV2Packet({ simulation: undefined });
    expect(gradeSimulatorArithmetic(packet, groundTruth()).pass).toBe(true);
  });

  it("fails a Tier-1 record that nonetheless carries a simulation section", () => {
    const packet = makeV2Packet(); // fixture includes a simulation
    const result = gradeSimulatorArithmetic(packet, groundTruth());
    expect(result.pass).toBe(false);
    expect(result.failures.some((f) => /Tier-1 record carries a simulation/.test(f))).toBe(true);
  });

  it("fails when inputs exist but the packet has no simulation", () => {
    const packet = makeV2Packet({ simulation: undefined });
    const result = gradeSimulatorArithmetic(packet, groundTruth({ simInputs: SIM_INPUTS }));
    expect(result.failures.some((f) => /no simulation section/.test(f))).toBe(true);
  });

  it("passes when the simulation exactly matches the recompute", () => {
    const packet = makeV2Packet({
      simulation: { ...recomputeSimulation(SIM_INPUTS), generatedAt: BASE_DATE }
    });
    expect(gradeSimulatorArithmetic(packet, groundTruth({ simInputs: SIM_INPUTS })).pass).toBe(true);
  });

  it("flags a horizon count mismatch and a missing horizon", () => {
    const packet = makeV2Packet({
      simulation: {
        horizons: [
          { days: 30, revenueAtRiskUsd: 1 },
          { days: 90, revenueAtRiskUsd: 2 }
        ],
        productRunouts: [{ productId: "PROD-1", runoutDate: "2026-06-27" }],
        generatedAt: BASE_DATE
      }
    });
    const result = gradeSimulatorArithmetic(packet, groundTruth({ simInputs: SIM_INPUTS }));
    expect(result.failures.some((f) => /horizon count 2 != expected 1/.test(f))).toBe(true);
    expect(result.failures.some((f) => /missing 7-day horizon/.test(f))).toBe(true);
  });

  it("flags a missing product runout", () => {
    const packet = makeV2Packet({
      simulation: {
        horizons: [{ days: 7, revenueAtRiskUsd: 7_000 }],
        productRunouts: [],
        generatedAt: BASE_DATE
      }
    });
    const result = gradeSimulatorArithmetic(packet, groundTruth({ simInputs: SIM_INPUTS }));
    expect(result.failures.some((f) => /missing runout for PROD-1/.test(f))).toBe(true);
  });

  // P1 margin/TTS teeth. The margin check only ENGAGES when the graded inputs carry a
  // marginPct, so it needs a margin-bearing fixture + negative cases or it stays dormant.
  // survivalDays = floor(100/10) = 10; @30d revenue = 1000 x (30-10) = 20_000; margin =
  // round(20_000 x 0.4) = 8_000.
  const SIM_INPUTS_MARGIN: SimInputs = {
    baseDateIso: BASE_DATE,
    durationDays: 30,
    affected: [{ supplierId: "SUP-100", dailyRevenueUsd: 1_000 }],
    horizonDays: [30],
    inventory: [{ productId: "PROD-1", onHandUnits: 100, dailyUseUnits: 10 }],
    marginPct: 0.4
  };

  it("passes a margin-bearing simulation that matches the recompute (engages the branch)", () => {
    const packet = makeV2Packet({
      simulation: { ...recomputeSimulation(SIM_INPUTS_MARGIN), generatedAt: BASE_DATE }
    });
    expect(gradeSimulatorArithmetic(packet, groundTruth({ simInputs: SIM_INPUTS_MARGIN })).pass).toBe(
      true
    );
  });

  it("flags a wrong margin-at-risk (the margin branch, with teeth)", () => {
    const sim = { ...recomputeSimulation(SIM_INPUTS_MARGIN), generatedAt: BASE_DATE };
    sim.horizons[0].marginAtRiskUsd = (sim.horizons[0].marginAtRiskUsd ?? 0) + 1; // off by a dollar
    const result = gradeSimulatorArithmetic(
      makeV2Packet({ simulation: sim }),
      groundTruth({ simInputs: SIM_INPUTS_MARGIN })
    );
    expect(result.pass).toBe(false);
    expect(result.failures.some((f) => /margin-at-risk/.test(f))).toBe(true);
  });

  it("flags a wrong survivalDays / TTS", () => {
    const sim = { ...recomputeSimulation(SIM_INPUTS_MARGIN), generatedAt: BASE_DATE };
    sim.survivalDays = (sim.survivalDays ?? 0) + 5; // wrong TTS
    const result = gradeSimulatorArithmetic(
      makeV2Packet({ simulation: sim }),
      groundTruth({ simInputs: SIM_INPUTS_MARGIN })
    );
    expect(result.pass).toBe(false);
    expect(result.failures.some((f) => /survivalDays/.test(f))).toBe(true);
  });
});

describe("other grader edge branches", () => {
  it("gradeEvidence flags an exposure citing an unknown evidence id", () => {
    const packet = makeV2Packet();
    packet.exposureResults[0].evidenceIds = ["NOPE"];
    const result = gradeEvidence(packet, groundTruth());
    expect(result.failures.some((f) => /cites unknown evidence NOPE/.test(f))).toBe(true);
  });

  it("gradeCitationCoverage flags a claim whose sourcePath does not resolve", () => {
    const packet = makeV2Packet();
    // A valid INPUT root (simulation) but an out-of-range index -> resolution fails
    // (a non-input root would trip the earlier "cites non-input" check instead).
    packet.supplierMessages[0].claims[0].sourcePath = "simulation.horizons[9].days";
    const result = gradeCitationCoverage(packet);
    expect(result.failures.some((f) => /does not resolve/.test(f))).toBe(true);
  });

  it("gradeCitationCoverage rejects a self-citation into the Dispatcher's own output", () => {
    const packet = makeV2Packet();
    packet.supplierMessages[0].claims[0].sourcePath = "supplierMessages[0].claims[0].value";
    const result = gradeCitationCoverage(packet);
    expect(result.failures.some((f) => /cites non-input "supplierMessages"/.test(f))).toBe(true);
  });

  // Fix #2: a supplier-message claim citing exposureResults[n].exposureScore must cite
  // THIS message's supplier's row. With two suppliers sharing an EQUAL score, a message
  // to supplier B citing A's index value-matches + unit-matches (the old checks pass),
  // so only the new supplier-binding check catches it. The grade-time side shares the
  // SAME collectCitationFailures the gatekeeper + firewall run, so this proves the gate.
  it("gradeCitationCoverage binds an exposure-score claim to the message's supplier", () => {
    const packet = makeV2Packet();
    // A second exposure with the SAME score as the first (SUP-100, score 72).
    packet.exposureResults.push({
      id: "EXP-002",
      supplierId: "SUP-200",
      supplierName: "Delta Co",
      country: "SA",
      sector: "ENERGY",
      exposureScore: 72, // equal to exposureResults[0].exposureScore
      rationale: "Inbound lanes transit the affected route.",
      evidenceIds: ["THREAT-001"]
    });
    // The message to SUP-200 cites SUP-100's score path (index 0) -- equal value (72),
    // matching unit ("score"), but the WRONG supplier's row.
    packet.supplierMessages[0].supplierId = "SUP-200";
    packet.supplierMessages[0].body = "Your exposure score for this event is 72.";
    packet.supplierMessages[0].claims = [
      { value: 72, unit: "score", sourcePath: "exposureResults[0].exposureScore" }
    ];
    const result = gradeCitationCoverage(packet);
    expect(result.failures.some((f) => /is not this message's supplier SUP-200/.test(f))).toBe(true);

    // CONTROL: point the same equal-value claim at the CORRECT index (1 -> SUP-200) and
    // it passes -- the reject is the wrong supplier, not the equal value.
    packet.supplierMessages[0].claims = [
      { value: 72, unit: "score", sourcePath: "exposureResults[1].exposureScore" }
    ];
    const control = gradeCitationCoverage(packet);
    expect(control.failures.some((f) => /is not this message's supplier/.test(f))).toBe(false);
  });

  it("gradeOffTaxonomy flags OTHER_UNMAPPED with no stated reason", () => {
    const packet = makeV2Packet();
    packet.exposureResults[0].sector = "OTHER_UNMAPPED";
    packet.exposureResults[0].rationale = "   ";
    const result = gradeOffTaxonomy(packet, groundTruth());
    expect(result.failures.some((f) => /OTHER_UNMAPPED without a stated reason/.test(f))).toBe(true);
  });

  it("gradeExposureControl flags a non-finite / negative score", () => {
    const packet = makeV2Packet();
    packet.exposureResults[0].exposureScore = -5;
    const result = gradeExposureControl(packet, groundTruth());
    expect(result.failures.some((f) => /not a finite, non-negative magnitude/.test(f))).toBe(true);
  });

  it("describeFailures prefixes each failure with its grader id", () => {
    const packet = makeV2Packet();
    packet.exposureResults[0].supplierId = "SUP-UNKNOWN";
    const lines = describeFailures(runGraders(packet, groundTruth()));
    expect(lines.some((l) => /^\[entity-ids\]/.test(l))).toBe(true);
  });
});
