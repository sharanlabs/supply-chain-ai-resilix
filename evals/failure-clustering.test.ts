import { describe, expect, it } from "vitest";

import type { GraderResult } from "@/lib/evals/graders";
import {
  aggregateClusters,
  clusterFailures,
  describeClusters,
  GRADER_ATTRIBUTION
} from "@/lib/evals/failure-clustering";

const pass = (grader: GraderResult["grader"]): GraderResult => ({
  grader,
  kind: "teeth-now",
  pass: true,
  failures: []
});
const failWith = (grader: GraderResult["grader"], failures: string[]): GraderResult => ({
  grader,
  kind: "teeth-now",
  pass: false,
  failures
});

describe("failure clustering / step attribution", () => {
  it("attributes every grader id to a pipeline step (no unmapped graders)", () => {
    for (const id of Object.keys(GRADER_ATTRIBUTION) as Array<keyof typeof GRADER_ATTRIBUTION>) {
      expect(GRADER_ATTRIBUTION[id].step).toBeTruthy();
      expect(GRADER_ATTRIBUTION[id].failureClass).toBeTruthy();
    }
  });

  it("buckets failures by step and class, heaviest first", () => {
    const results: GraderResult[] = [
      pass("evidence"),
      failWith("injection-quarantine", ["raw article text reached the draft", "url off allowlist"]),
      failWith("simulator-arithmetic", ["runout drift"])
    ];
    const c = clusterFailures(results);
    expect(c.total).toBe(3);
    expect(c.byStep.Dispatcher).toBe(2);
    expect(c.byStep.Simulator).toBe(1);
    expect(c.byClass["quarantine-breach"]).toBe(2);
    expect(c.clusters[0].step).toBe("Dispatcher"); // heaviest organ first
  });

  it("ignores passing graders", () => {
    expect(clusterFailures([pass("entity-ids"), pass("evidence")]).total).toBe(0);
  });

  it("aggregates across reports (whole-suite concentration)", () => {
    const mk = (results: GraderResult[]): { results: GraderResult[]; blocked: boolean; failureCount: number } => ({
      results,
      blocked: results.some((r) => !r.pass),
      failureCount: results.reduce((n, r) => n + r.failures.length, 0)
    });
    const agg = aggregateClusters([
      mk([failWith("exposure-control", ["supplier off exposure list"])]),
      mk([failWith("exposure-control", ["revenue mismatch"]), failWith("citation-coverage", ["claim uncited"])])
    ]);
    expect(agg.byStep.Atlas).toBe(2);
    expect(agg.byClass["grounding-gap"]).toBe(1);
  });

  it("describes clusters in a gate-readable form", () => {
    const c = clusterFailures([failWith("citation-coverage", ["claim 2 uncited"])]);
    expect(describeClusters(c)[0]).toBe("[Strategist / grounding-gap] 1: claim 2 uncited");
  });
});
