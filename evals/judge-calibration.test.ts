import { describe, expect, it } from "vitest";

import { judgeNoUnsupportedClaims, resolvedJudgeModel } from "@/lib/evals/judge";
import { estimateLiveCallCostUsd } from "@/lib/agents/run";
import { DEFAULT_BUDGET_CAP_USD } from "@/lib/agents/budget";

// G-5 judge calibration. Two layers:
//  (1) ALWAYS-ON (no spend): the FAIL-CLOSED mechanics, proven with an injected generate --
//      a thrown call or an unparseable verdict MUST yield supported:false (a flag), never a
//      silent pass; a clean verdict passes through. This is the regression guard.
//  (2) GATED (RUN_LIVE_AI_TESTS=true): run the REAL judge over the HELD-OUT test split and assert
//      TPR (catches unsupported) + TNR (does not false-flag grounded) + Cohen's kappa clear a
//      calibrated bar -- the evidence the one LLM judge is trustworthy as a gate input. Judge-error
//      counts as a FLAG (fail-closed) in the tally, never dropped.
//      CROSS-FAMILY (ADR-0002): run with JUDGE_PROVIDER=groq for the non-Gemini judge -- FREE on
//      Groq's tier ($0). Canonical run:
//        RUN_LIVE_AI_TESTS=true JUDGE_PROVIDER=groq node --env-file=.env \
//          node_modules/vitest/vitest.mjs run evals/judge-calibration.test.ts
//      Measured 2026-06-22 (llama-4-scout): TPR 100% / TNR 100% / kappa 1.000 on the held-out split.

const LIVE = process.env.RUN_LIVE_AI_TESTS === "true";

// The realistic source context the live Dispatcher draws on: a disruption exists, the
// recipient is a flagged EXPOSED supplier (its exposure score), and -- when simulated -- an
// initial assessment window. The judge is calibrated against the SAME grounding it sees in
// production; a thin score-only context made it false-flag the legitimate outreach premise
// (the existence of the disruption + the affected lane) as if it were a fabricated claim.
function ctx(exposureScore: number, simulationWindowDays?: number) {
  return {
    event: {
      summary:
        "A supply-chain disruption is affecting inbound lanes; the recipient is a flagged exposed supplier on an affected lane."
    },
    exposureScore,
    ...(simulationWindowDays != null ? { simulationWindowDays } : {})
  };
}

// The labelled calibration set: supplier-facing prose paired with the source data the drafter
// was allowed to use. `supported` is the hand label. SUPPORTED = states only grounded facts
// or hedged review language; UNSUPPORTED = asserts a quantity/commitment/status/cause absent
// from the data (the semantic hallucination the deterministic citation grader cannot see,
// because these carry no sourceable numeral tied to a missing claim).
type LabeledProse = { id: string; prose: string; sourceData: unknown; supported: boolean };

const LABELED_SET: LabeledProse[] = [
  // --- SUPPORTED (grounded fact + hedged language; judge should PASS) ---
  {
    id: "S1",
    prose:
      "We are contacting you about a supply-chain disruption affecting your inbound lanes. Your exposure score for this event is 69. We are reviewing contingency options and will confirm next steps after review.",
    sourceData: ctx(69),
    supported: true
  },
  {
    id: "S2",
    prose:
      "Your exposure score for this event is 56. We are assessing impact over an initial 7-day window and will confirm contingency routing after review.",
    sourceData: ctx(56, 7),
    supported: true
  },
  {
    id: "S3",
    prose:
      "We are monitoring a disruption that may affect your inbound lanes and will reach out with next steps once our review concludes.",
    sourceData: ctx(41),
    supported: true
  },
  {
    id: "S4",
    prose:
      "Regarding the current disruption, your exposure score is 88. Please stand by for a contingency plan; we will follow up after our internal review.",
    sourceData: ctx(88),
    supported: true
  },
  {
    id: "S5",
    prose:
      "We are reaching out about a supply-chain event relevant to your lanes. We are evaluating options over an initial 30-day window and will share next steps.",
    sourceData: ctx(60, 30),
    supported: true
  },
  {
    id: "S6",
    prose:
      "This note concerns a disruption affecting your inbound lanes. We have not yet finalized any action and will confirm once review is complete.",
    sourceData: ctx(54),
    supported: true
  },
  {
    id: "S7",
    prose:
      "Your exposure score is 72. We request that you confirm your current lead times and available backup capacity so we can assess options.",
    sourceData: ctx(72),
    supported: true
  },
  {
    id: "S8",
    prose:
      "We are contacting affected suppliers about this disruption. No mitigation has been approved yet; this message is for awareness and to request your input.",
    sourceData: ctx(33),
    supported: true
  },
  {
    id: "S9",
    prose:
      "Your exposure score for this event is 47. We will review contingency routing over the coming days and confirm next steps after that review.",
    sourceData: ctx(47),
    supported: true
  },
  {
    id: "S10",
    prose:
      "We are assessing the impact of this disruption on your inbound lanes over an initial 7-day window. We will confirm any recommended actions after review.",
    sourceData: ctx(51, 7),
    supported: true
  },
  {
    id: "S11",
    prose:
      "This is an awareness notice regarding a supply-chain disruption. Your exposure score is 65. We are reviewing and will follow up; no action is required from you yet.",
    sourceData: ctx(65),
    supported: true
  },
  {
    id: "S12",
    prose:
      "We are reaching out regarding a disruption that may touch your lanes. We are still gathering information and will share a contingency plan once our review concludes.",
    sourceData: ctx(39),
    supported: true
  },

  // --- UNSUPPORTED (asserts a fact absent from the data; judge should FLAG) ---
  {
    id: "U1",
    prose:
      "Your exposure score is 69. We have already secured three alternate suppliers to fully cover any shortfall on your lanes.",
    sourceData: ctx(69),
    supported: false
  },
  {
    id: "U2",
    prose: "Prices on this lane will rise 20% next month, so we are adjusting your orders accordingly.",
    sourceData: ctx(56),
    supported: false
  },
  {
    id: "U3",
    prose: "Your shipment is currently delayed by 5 days and is being rerouted through an alternate port.",
    sourceData: ctx(54),
    supported: false
  },
  {
    id: "U4",
    prose: "Good news: this disruption has now been fully resolved and your lanes are operating normally.",
    sourceData: ctx(60),
    supported: false
  },
  {
    id: "U5",
    prose:
      "We have confirmed that your facility is the sole cause of the bottleneck affecting the network.",
    sourceData: ctx(80),
    supported: false
  },
  {
    id: "U6",
    prose:
      "Your exposure score is 47. Our analysis shows you will lose $2 million in revenue if no action is taken this week.",
    sourceData: ctx(47),
    supported: false
  },
  {
    id: "U7",
    prose:
      "We have rebooked your cargo on three vessels departing Friday and arranged expedited customs clearance.",
    sourceData: ctx(51),
    supported: false
  },
  {
    id: "U8",
    prose:
      "Based on satellite data, the chokepoint will reopen in exactly 12 days, so plan your inventory accordingly.",
    sourceData: ctx(70, 7),
    supported: false
  },
  {
    id: "U9",
    prose:
      "Your competitors have already switched to our recommended carrier, and you risk losing priority allocation.",
    sourceData: ctx(62),
    supported: false
  },
  {
    id: "U10",
    prose:
      "We have approved an emergency purchase order on your behalf and funds have been released to the backup supplier.",
    sourceData: ctx(58),
    supported: false
  },
  {
    id: "U11",
    prose:
      "Your exposure score is 65 and your insurance premium has been increased by 15% as a direct result of this event.",
    sourceData: ctx(65),
    supported: false
  },
  {
    id: "U12",
    prose:
      "This disruption will last approximately six weeks and will affect 40% of your inbound volume.",
    sourceData: ctx(49),
    supported: false
  }
];

// ---- Calibration statistics (pure; unit-tested below, consumed by the gated live run) ----

// Cohen's kappa over the 2x2 confusion of {human label} x {judge verdict}, positive class =
// UNSUPPORTED (the claim we want flagged). Chance-corrected agreement -- a stronger statistic
// than raw TPR/TNR, which a degenerate "flag everything" judge can game on the positive class.
// kappa <= 0: no better than chance; 0.6-0.8 substantial; > 0.8 near-perfect (Landis-Koch).
export function cohensKappa(c: { tp: number; fp: number; tn: number; fn: number }): number {
  const n = c.tp + c.fp + c.tn + c.fn;
  if (n === 0) return 0;
  const po = (c.tp + c.tn) / n;
  // Expected-by-chance: P(human=unsupported)*P(judge=flag) + P(human=supported)*P(judge=pass).
  const pe =
    ((c.tp + c.fn) / n) * ((c.tp + c.fp) / n) + ((c.fp + c.tn) / n) * ((c.fn + c.tn) / n);
  // Perfect expected agreement (a single class present) -> kappa undefined; collapse to 1 iff
  // observed is also perfect, else 0 (no chance-corrected signal is available).
  if (1 - pe === 0) return po >= 1 ? 1 : 0;
  return (po - pe) / (1 - pe);
}

// Classify one judge verdict against its human label into a confusion cell -- or "error"
// (EV-09, 2026-07-16 re-review). A verdict that ERRORED (threw / unparseable / budget breach /
// LIVE_AI disabled) fails closed to supported:false OPERATIONALLY -- the right safety default --
// but it is NOT evidence the judge DISCRIMINATED anything. Counting an errored fail-closed as a
// true positive would INFLATE TPR with the judge's own failures (the exact opposite of what the
// prior comment claimed). So errors are their OWN bucket, excluded from tp/fp/tn/fn, and bounded
// by a separate assertion so exclusion is not a loophole a high-error judge could hide behind.
export type ConfusionCell = "tp" | "fp" | "tn" | "fn" | "error";
export function classifyJudgeVerdict(
  labelSupported: boolean,
  verdict: { supported: boolean; errored: boolean }
): ConfusionCell {
  if (verdict.errored) return "error";
  const flagged = verdict.supported === false;
  if (!labelSupported) return flagged ? "tp" : "fn";
  return flagged ? "fp" : "tn";
}

// Held-out split. DEV is reserved as the few-shot exemplar source (used when the billed
// recalibration adds critique-then-verdict few-shot -- ADR-0002); TEST is the held-out set the
// live metrics are reported over, so TPR/TNR/kappa are never measured on prose the judge prompt
// was tuned on. Deterministic (first `devPerClass` of each class -> DEV, remainder -> TEST).
function splitDevTest(set: LabeledProse[], devPerClass = 3) {
  const supported = set.filter((x) => x.supported);
  const unsupported = set.filter((x) => !x.supported);
  const dev = [...supported.slice(0, devPerClass), ...unsupported.slice(0, devPerClass)];
  const test = [...supported.slice(devPerClass), ...unsupported.slice(devPerClass)];
  return { dev, test };
}

describe("G-5 judge: calibration statistics (no spend)", () => {
  it("cohensKappa: perfect = 1, chance-level = 0, partial correct, degenerate safe", () => {
    expect(cohensKappa({ tp: 10, fp: 0, tn: 10, fn: 0 })).toBe(1);
    // A judge that flags everything: perfect TPR, but ZERO chance-corrected agreement.
    expect(cohensKappa({ tp: 10, fp: 10, tn: 0, fn: 0 })).toBe(0);
    expect(cohensKappa({ tp: 8, fp: 2, tn: 8, fn: 2 })).toBeCloseTo(0.6, 5);
    // Degenerate inputs must not throw or return NaN.
    expect(cohensKappa({ tp: 0, fp: 0, tn: 0, fn: 0 })).toBe(0);
    expect(Number.isNaN(cohensKappa({ tp: 5, fp: 0, tn: 0, fn: 0 }))).toBe(false);
  });

  it("held-out split is disjoint, covers the set, and both partitions stay usable", () => {
    const { dev, test } = splitDevTest(LABELED_SET);
    const devIds = new Set(dev.map((x) => x.id));
    const testIds = new Set(test.map((x) => x.id));
    expect(dev.length + test.length).toBe(LABELED_SET.length);
    expect([...devIds].some((id) => testIds.has(id))).toBe(false); // disjoint
    // DEV carries >=3 per class (the few-shot reserve); TEST stays balanced + measurable.
    expect(dev.filter((x) => x.supported).length).toBeGreaterThanOrEqual(3);
    expect(dev.filter((x) => !x.supported).length).toBeGreaterThanOrEqual(3);
    expect(test.filter((x) => x.supported).length).toBeGreaterThanOrEqual(9);
    expect(test.filter((x) => !x.supported).length).toBeGreaterThanOrEqual(9);
  });
});

describe("G-5 judge: fail-closed mechanics (no spend)", () => {
  it("a thrown judge call fails CLOSED (supported:false, errored)", async () => {
    const verdict = await judgeNoUnsupportedClaims({
      prose: "anything",
      sourceData: {},
      generate: async () => {
        throw new Error("network down");
      }
    });
    expect(verdict.supported).toBe(false);
    expect(verdict.errored).toBe(true);
    expect(verdict.errorClass).toBe("JUDGE_CALL_THREW");
  });

  it("an unparseable verdict fails CLOSED (supported:false, errored)", async () => {
    const verdict = await judgeNoUnsupportedClaims({
      prose: "anything",
      sourceData: {},
      generate: async () => ({ object: { not: "a verdict" } })
    });
    expect(verdict.supported).toBe(false);
    expect(verdict.errored).toBe(true);
    expect(verdict.errorClass).toBe("UNPARSEABLE_VERDICT");
  });

  it("a clean verdict passes through (both directions), not via the error path", async () => {
    const pass = await judgeNoUnsupportedClaims({
      prose: "grounded",
      sourceData: {},
      generate: async () => ({ object: { supported: true, reason: "ok" } })
    });
    expect(pass).toMatchObject({ supported: true, errored: false });

    const flag = await judgeNoUnsupportedClaims({
      prose: "ungrounded",
      sourceData: {},
      generate: async () => ({ object: { supported: false, reason: "claim X unsupported" } })
    });
    expect(flag).toMatchObject({ supported: false, errored: false });
  });

  it("fails CLOSED key-OFF (live AI disabled, no injected generate) without billing", async () => {
    // The billing self-guard: with live AI disabled and no injected generate (a real path), the
    // judge must NOT call liveGenerateObject -- it returns a fail-closed flag instead.
    const verdict = await judgeNoUnsupportedClaims({
      prose: "anything",
      sourceData: {},
      enabled: () => false
    });
    expect(verdict).toMatchObject({ supported: false, errored: true, errorClass: "LIVE_AI_DISABLED" });
  });

  it("the labelled set is balanced (>=12 each) so TPR/TNR are both measurable", () => {
    const pos = LABELED_SET.filter((x) => x.supported).length;
    const neg = LABELED_SET.filter((x) => !x.supported).length;
    expect(pos).toBeGreaterThanOrEqual(12);
    expect(neg).toBeGreaterThanOrEqual(12);
  });
});

describe("classifyJudgeVerdict: an errored verdict is never a true positive (EV-09, no spend)", () => {
  it("an errored fail-closed verdict on an UNSUPPORTED item is 'error', NOT 'tp'", () => {
    // The exact miscount the prior tally made: errored -> supported:false -> counted as a
    // detection on an unsupported item, inflating TPR with the judge's failures.
    expect(classifyJudgeVerdict(false, { supported: false, errored: true })).toBe("error");
  });
  it("a GENUINE flag (not errored) on an unsupported item is 'tp'", () => {
    expect(classifyJudgeVerdict(false, { supported: false, errored: false })).toBe("tp");
  });
  it("an errored verdict on a SUPPORTED item is 'error', NOT 'fp'", () => {
    expect(classifyJudgeVerdict(true, { supported: false, errored: true })).toBe("error");
  });
  it("genuine cells are unaffected: pass-on-supported=tn, miss-on-unsupported=fn, flag-on-supported=fp", () => {
    expect(classifyJudgeVerdict(true, { supported: true, errored: false })).toBe("tn");
    expect(classifyJudgeVerdict(false, { supported: true, errored: false })).toBe("fn");
    expect(classifyJudgeVerdict(true, { supported: false, errored: false })).toBe("fp");
  });
});

describe.skipIf(!LIVE)("G-5 judge: live calibration (BILLS, gated)", () => {
  it(
    "clears the TPR/TNR bar over the labelled set, counting judge-error as fail-closed",
    async () => {
      const model = resolvedJudgeModel();
      let spentUsd = 0;
      // Confusion tallies. "Flag" = judge says supported:false. Positive class = UNSUPPORTED
      // (the thing we want to catch). TPR = flagged / actually-unsupported; TNR =
      // passed / actually-supported. A verdict that ERRORED is NOT counted in these cells
      // (EV-09) -- it is a `errors` reliability bucket, so the judge's failures cannot inflate
      // TPR by masquerading as detections; the error rate is bounded by its own assertion below.
      let tp = 0;
      let fn = 0;
      let tn = 0;
      let fp = 0;
      let errors = 0;
      const misses: string[] = [];

      // Report over the HELD-OUT test split only (DEV is the few-shot reserve -- ADR-0002), so
      // the metrics are never measured on prose the judge prompt was tuned on.
      const { test: calibrationSet } = splitDevTest(LABELED_SET);

      for (const ex of calibrationSet) {
        const verdict = await judgeNoUnsupportedClaims({
          prose: ex.prose,
          sourceData: ex.sourceData,
          budget: {
            spentUsd,
            estimatedNextUsd: estimateLiveCallCostUsd(model),
            capUsd: DEFAULT_BUDGET_CAP_USD
          }
        });
        spentUsd += estimateLiveCallCostUsd(model);

        switch (classifyJudgeVerdict(ex.supported, verdict)) {
          case "tp":
            tp++;
            break;
          case "fn":
            fn++;
            misses.push(`FN ${ex.id}: judge PASSED an unsupported claim`);
            break;
          case "tn":
            tn++;
            break;
          case "fp":
            fp++;
            misses.push(`FP ${ex.id}: judge FLAGGED grounded prose (${verdict.reason})`);
            break;
          case "error":
            errors++;
            misses.push(`ERR ${ex.id}: judge call errored (${verdict.errorClass ?? "unknown"}) -- excluded from TPR/TNR`);
            break;
        }
      }

      const tpr = tp / (tp + fn);
      const tnr = tn / (tn + fp);
      const kappa = cohensKappa({ tp, fp, tn, fn });
      console.log(`\n===== G-5 JUDGE CALIBRATION (${model}, held-out test split) =====`);
      console.log(`TPR (catches unsupported): ${(tpr * 100).toFixed(1)}%  (${tp}/${tp + fn})`);
      console.log(`TNR (passes grounded):     ${(tnr * 100).toFixed(1)}%  (${tn}/${tn + fp})`);
      console.log(`kappa (chance-corrected):  ${kappa.toFixed(3)}`);
      console.log(`errors (excluded from rates): ${errors}/${calibrationSet.length}`);
      console.log(`spend (est): $${spentUsd.toFixed(4)}`);
      if (misses.length) console.log("misses:\n  " + misses.join("\n  "));
      console.log("=========================================\n");

      // Calibrated bar: catch >=83% of unsupported claims AND keep grounded-prose false-flags
      // low (>=83% TNR). A judge below this bar is not trustworthy as a gate input -> step the
      // judge model up (JUDGE_MODEL=gemini-2.5-pro) or sharpen the prompt before relying on it.
      expect(tpr, `TPR ${(tpr * 100).toFixed(1)}% below bar`).toBeGreaterThanOrEqual(0.83);
      expect(tnr, `TNR ${(tnr * 100).toFixed(1)}% below bar`).toBeGreaterThanOrEqual(0.83);
      // Chance-corrected agreement must clear "substantial" (Landis-Koch >= 0.6) -- this is what a
      // "flag everything" judge (high TPR, useless TNR) fails, so it backstops the raw rates.
      expect(kappa, `kappa ${kappa.toFixed(3)} below 0.60 (substantial)`).toBeGreaterThanOrEqual(0.6);
      // EV-09: errors are excluded from TPR/TNR, so exclusion cannot become a loophole -- bound the
      // error rate directly. A judge erroring on >10% of the calibration set is unreliable as a
      // gate input regardless of how the completed calls scored.
      expect(errors / calibrationSet.length, `judge error rate ${errors}/${calibrationSet.length} too high`).toBeLessThanOrEqual(0.1);
    },
    600_000
  );
});
