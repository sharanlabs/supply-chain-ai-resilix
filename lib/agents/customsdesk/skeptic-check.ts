// The Skeptic, deterministic leg (plan §5 D4) -- an INDEPENDENT re-verification of a
// finished outcome against the RAW case inputs. Maker != judge: this module imports
// the same primitives but re-derives every conclusion itself and compares; it never
// trusts a field because the pipeline wrote it. The cross-family LLM leg (narrative
// challenge) attaches at this same seam when keys are present -- it can only ADD
// objections, never clear them.

import type { SyntheticCase } from "./synthetic-entries";
import type { CustomsDefenseOutcome } from "./pipeline";
import { findCell } from "./edge-case-matrix";
import { quarantineAll } from "./exhibit-quarantine";
import { assessSufficiency } from "./evidence-sufficiency";
import { scopeEntryPopulation } from "./entry-scoper";
import { gradeCustomsCitationCoverage } from "./packet-graders";

export interface SkepticVerdict {
  accepted: boolean;
  objections: string[];
}

export function skepticReview(input: SyntheticCase, outcome: CustomsDefenseOutcome): SkepticVerdict {
  const objections: string[] = [];

  // 1. Re-derive the disposition from raw inputs; it must match.
  const cell = findCell(input.cellId);
  if (!cell) {
    if (outcome.disposition !== "REFUSE") {
      objections.push("case is outside declared coverage but the outcome is not a refusal");
    }
  } else {
    const verdict = assessSufficiency(cell.workflow, quarantineAll(input.exhibits), input.meta);
    const expected = verdict.sufficient ? "PROCEED" : "REFUSE";
    if (outcome.disposition !== expected) {
      objections.push(`disposition ${outcome.disposition} contradicts re-derived ${expected}`);
    }
    if (!verdict.sufficient) {
      const missing = verdict.gaps.filter((g) => !outcome.namedGaps.includes(g));
      if (missing.length > 0) objections.push(`refusal omits re-derived gap(s): ${missing.join(", ")}`);
    }
  }

  // 2. Re-run citation coverage on the finished packet (never trust the producer ran it).
  const grade = gradeCustomsCitationCoverage({
    sections: outcome.packet.sections,
    citedFigures: outcome.packet.citedFigures,
  });
  if (grade.blocked) objections.push(...grade.violations.map((v) => `citation: ${v}`));

  // 3. Cross-check the scope figures the packet cites against a fresh scoper run.
  if (outcome.disposition === "PROCEED") {
    const scope = scopeEntryPopulation(input.entries, {});
    const cited = new Map(outcome.packet.citedFigures.map((c) => [c.sourceRef, c.value]));
    const checks: Array<[string, number]> = [
      ["entry-scoper#entryCount", scope.entryCount],
      ["entry-scoper#lineCount", scope.lineCount],
      ["entry-scoper#totalEnteredValue", scope.totalEnteredValueCents / 100],
      ["entry-scoper#totalDeclaredDuty", scope.totalDeclaredDutyCents / 100],
    ];
    for (const [ref, expected] of checks) {
      const value = cited.get(ref);
      if (value === undefined) objections.push(`packet cites no figure for ${ref}`);
      else if (value !== expected) objections.push(`${ref} cited as ${value}, re-derived ${expected}`);
    }
  }

  // 4. Exhibit bodies must not have crossed into prose (structural spot-check).
  for (const exhibit of input.exhibits) {
    if (outcome.packetText.includes(exhibit.body)) {
      objections.push(`quarantine breach: exhibit ${exhibit.kind} body appears in the packet`);
    }
  }

  return { accepted: objections.length === 0, objections };
}
