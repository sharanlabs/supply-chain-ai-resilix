import { describe, expect, it } from "vitest";

import { retrievePolicy } from "@/lib/agents/customsdesk/retrieval";
import { POLICY_CORPUS, everyChunkIsCited } from "@/lib/agents/customsdesk/policy-corpus";

// S4 retrieval GOLDEN suite -- the recall@k + MRR bar the plan requires GREEN
// BEFORE any consumer (customs-desk lookup + the MCP tool). Hand-labeled
// question -> gold-chunk-id pairs: a practitioner's plain-language question and
// the ONE chunk that best answers it. The corpus is small (14 chunks), so the
// labelled set is proportionally sized and honest (each label is a real Q a
// customs-desk user or an agent would ask). recall@k on hand-labeled pairs is the
// 2026 practitioner floor (live-verified 2026-07-08); MRR reported alongside.

interface LabeledQuery {
  q: string;
  goldId: string;
}

// Every goldId must exist in the corpus (guards a typo'd label).
const GOLDEN: LabeledQuery[] = [
  { q: "what is the penalty for a negligent duty-loss violation", goldId: "disposition-negligence-duty_loss" },
  { q: "gross negligence non duty loss penalty range", goldId: "disposition-gross_negligence-non_duty_loss" },
  { q: "fraud duty loss penalty multiplier", goldId: "disposition-fraud-duty_loss" },
  { q: "how much penalty if I file a prior disclosure for a negligent error", goldId: "prior-disclosure-negligence" },
  { q: "prior disclosure fraud duty loss 100 percent", goldId: "prior-disclosure-fraud-duty" },
  { q: "how many days to respond to a prepenalty notice", goldId: "deadline-prepenalty_response" },
  { q: "deadline to petition for relief from a penalty notice", goldId: "deadline-penalty_petition" },
  { q: "what mitigating factors reduce a 1592 penalty", goldId: "mitigating-factors" },
  { q: "aggravating factors obstructing the investigation", goldId: "aggravating-factors" },
  { q: "executive order 14411 minimum penalty floor repeat offenders", goldId: "eo-14411-directed" },
  { q: "cooperation and immediate remedial action after discovering a filing error", goldId: "mitigating-factors" },
  { q: "interest on the actual loss of duty no monetary penalty", goldId: "prior-disclosure-negligence" }
];

function recallAtK(k: number): number {
  let hits = 0;
  for (const { q, goldId } of GOLDEN) {
    const ids = retrievePolicy(q, k).map((r) => r.chunk.id);
    if (ids.includes(goldId)) hits++;
  }
  return hits / GOLDEN.length;
}

function mrr(): number {
  let sum = 0;
  for (const { q, goldId } of GOLDEN) {
    const ids = retrievePolicy(q, 10).map((r) => r.chunk.id);
    const rank = ids.indexOf(goldId);
    if (rank >= 0) sum += 1 / (rank + 1);
  }
  return sum / GOLDEN.length;
}

describe("S4 customs policy retrieval -- golden suite (before any consumer)", () => {
  it("every labelled goldId exists in the corpus (no dangling labels)", () => {
    const ids = new Set(POLICY_CORPUS.map((c) => c.id));
    for (const { goldId } of GOLDEN) {
      expect(ids.has(goldId), `gold id '${goldId}' not in corpus`).toBe(true);
    }
  });

  it("recall@1 clears the bar (>= 0.75)", () => {
    const r1 = recallAtK(1);
    // Report for the record; the bar is the practitioner floor for a small corpus.
    expect(r1, `recall@1 was ${r1.toFixed(3)}`).toBeGreaterThanOrEqual(0.75);
  });

  it("recall@3 clears the bar (>= 0.9)", () => {
    const r3 = recallAtK(3);
    expect(r3, `recall@3 was ${r3.toFixed(3)}`).toBeGreaterThanOrEqual(0.9);
  });

  it("MRR clears the bar (>= 0.8)", () => {
    const score = mrr();
    expect(score, `MRR was ${score.toFixed(3)}`).toBeGreaterThanOrEqual(0.8);
  });

  it("a zero-signal query returns NOTHING (retrieval never fabricates relevance)", () => {
    expect(retrievePolicy("xyzzy quux blorptastic", 3)).toEqual([]);
    expect(retrievePolicy("", 3)).toEqual([]);
  });

  it("every retrievable chunk carries a real citation (the citation bar holds by construction)", () => {
    expect(everyChunkIsCited()).toBe(true);
    // And a retrieved result always exposes that citation.
    const top = retrievePolicy("negligence duty loss penalty", 1)[0];
    expect(top.chunk.citation.sourceId.length).toBeGreaterThan(0);
    expect(top.chunk.citation.section.length).toBeGreaterThan(0);
  });
});
