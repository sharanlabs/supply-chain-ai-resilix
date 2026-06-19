// Failure clustering / step-attribution over a GraderReport.
//
// run-graders.ts answers "did anything block?" and lists flat "[grader] reason"
// lines. This adds the step-attribution lens (the pattern Cisco FAPO uses): map
// each grader to the pipeline ORGAN it guards and the CLASS of failure, then
// aggregate one report -- or the whole golden suite -- into per-step / per-class
// buckets. So a BLOCK reads "Dispatcher / quarantine-breach (2)" not just
// "7 failures". Read-only over existing GraderResult[]; adds no grading, changes
// no verdict (the gate signal still comes from run-graders).

import type { GraderId, GraderResult } from "@/lib/evals/graders";
import type { GraderReport } from "@/lib/evals/run-graders";

export type PipelineStep =
  | "Sentinel"
  | "Atlas"
  | "Simulator"
  | "Strategist"
  | "Dispatcher";

export type FailureClass =
  | "hallucinated-entity"
  | "evidence-gap"
  | "grounding-gap"
  | "taxonomy-drift"
  | "exposure-error"
  | "calc-drift"
  | "quarantine-breach";

type Attribution = { step: PipelineStep; failureClass: FailureClass };

// Each deterministic grader -> the organ whose output it proves + the nature of the
// failure it detects. Keyed by the full GraderId union, so a newly added grader is
// a compile error here until it is attributed (that is the point -- no silent
// "unmapped" failure slipping through aggregation).
export const GRADER_ATTRIBUTION: Record<GraderId, Attribution> = {
  "entity-ids": { step: "Atlas", failureClass: "hallucinated-entity" },
  evidence: { step: "Sentinel", failureClass: "evidence-gap" },
  "citation-coverage": { step: "Strategist", failureClass: "grounding-gap" },
  "off-taxonomy": { step: "Sentinel", failureClass: "taxonomy-drift" },
  "exposure-control": { step: "Atlas", failureClass: "exposure-error" },
  "simulator-arithmetic": { step: "Simulator", failureClass: "calc-drift" },
  "injection-quarantine": { step: "Dispatcher", failureClass: "quarantine-breach" }
};

export type ClusteredFailure = {
  grader: GraderId;
  step: PipelineStep;
  failureClass: FailureClass;
  failures: string[];
};

export type FailureClusters = {
  byStep: Partial<Record<PipelineStep, number>>;
  byClass: Partial<Record<FailureClass, number>>;
  clusters: ClusteredFailure[]; // heaviest first
  total: number;
};

// Cluster one report's failing graders by pipeline step + failure class.
export function clusterFailures(results: GraderResult[]): FailureClusters {
  const clusters: ClusteredFailure[] = [];
  const byStep: Partial<Record<PipelineStep, number>> = {};
  const byClass: Partial<Record<FailureClass, number>> = {};
  let total = 0;

  for (const r of results) {
    if (r.pass || r.failures.length === 0) continue;
    const attr = GRADER_ATTRIBUTION[r.grader];
    if (!attr) continue; // defensive: unknown id -> skip rather than mis-attribute
    const n = r.failures.length;
    total += n;
    byStep[attr.step] = (byStep[attr.step] ?? 0) + n;
    byClass[attr.failureClass] = (byClass[attr.failureClass] ?? 0) + n;
    clusters.push({ grader: r.grader, step: attr.step, failureClass: attr.failureClass, failures: r.failures });
  }

  clusters.sort((a, b) => b.failures.length - a.failures.length); // organ to fix at top
  return { byStep, byClass, clusters, total };
}

// Aggregate clusters across many reports (e.g. the whole golden suite) so a run
// summary reads "where do failures concentrate across scenarios".
export function aggregateClusters(reports: GraderReport[]): FailureClusters {
  return clusterFailures(reports.flatMap((rep) => rep.results));
}

// One-line-per-cluster human form for a gate artifact / CI log.
export function describeClusters(clusters: FailureClusters): string[] {
  return clusters.clusters.map(
    (c) => `[${c.step} / ${c.failureClass}] ${c.failures.length}: ${c.failures.join("; ")}`
  );
}
