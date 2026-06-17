// The eval-runner: run every deterministic grader over one packet and aggregate
// the verdict into a single BLOCK signal. This is the organ-8 seam -- the SAME
// entry point grades a frozen golden record now and the live pipeline's output
// once the agent core exists, so the merge gate's meaning does not change when the
// pipeline lands. `blocked` is the hard signal: any failing grader blocks.

import type { DecisionPacketV2 } from "@/lib/schemas";
import {
  gradeCitationCoverage,
  gradeEntityIds,
  gradeEvidence,
  gradeExposureControl,
  gradeInjectionQuarantine,
  gradeOffTaxonomy,
  gradeSimulatorArithmetic,
  type GraderResult,
  type ScenarioGroundTruth
} from "@/lib/evals/graders";

export type GraderReport = {
  results: GraderResult[];
  blocked: boolean;
  failureCount: number;
};

export function runGraders(
  packet: DecisionPacketV2,
  gt: ScenarioGroundTruth
): GraderReport {
  const results: GraderResult[] = [
    gradeEntityIds(packet, gt),
    gradeEvidence(packet, gt),
    gradeCitationCoverage(packet),
    gradeOffTaxonomy(packet, gt),
    gradeExposureControl(packet, gt),
    gradeSimulatorArithmetic(packet, gt),
    gradeInjectionQuarantine(packet, gt)
  ];

  const failureCount = results.reduce((n, r) => n + r.failures.length, 0);
  return { results, blocked: results.some((r) => !r.pass), failureCount };
}

// Flatten a report's failures with their grader id -- the human-readable form a
// gate artifact or CI log prints, so a BLOCK names exactly what broke.
export function describeFailures(report: GraderReport): string[] {
  return report.results
    .filter((r) => !r.pass)
    .flatMap((r) => r.failures.map((f) => `[${r.grader}] ${f}`));
}
