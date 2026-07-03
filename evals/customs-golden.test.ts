// Customs golden suite (D0.4/D0.5).
//
// TWO legs, deliberately different colors:
//  - STRUCTURAL leg (always on, GREEN): the golden set itself is well-formed --
//    >=20 cases, class minimums, provenance tag on every case, every case maps to a
//    declared matrix cell, oracles consistent with what the generator actually built.
//  - PIPELINE leg (RUN_CUSTOMS_GOLDEN=true, RED by design): every case runs against
//    the declared seam and fails NOT_IMPLEMENTED until D1-D3 exist. Runnable-red is
//    the D0 exit bar (plan §5 D0) -- run it via `npm run customs:golden`.
import { describe, expect, it } from "vitest";

import { CUSTOMS_GOLDEN_CASES } from "@/evals/golden/customs/cases";
import { findCell } from "@/lib/agents/customsdesk/edge-case-matrix";
import { validateEntrySummary } from "@/lib/agents/customsdesk/catair";
import { generateCase } from "@/lib/agents/customsdesk/synthetic-entries";
import { runCustomsDefenseCase } from "@/lib/agents/customsdesk/pipeline";
import { gradeCustomsCitationCoverage } from "@/lib/agents/customsdesk/packet-graders";

const PIPELINE_LEG = process.env.RUN_CUSTOMS_GOLDEN === "true";

describe("golden set structure (D0 bar)", () => {
  it("has >=20 cases with unique ids", () => {
    expect(CUSTOMS_GOLDEN_CASES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(CUSTOMS_GOLDEN_CASES.map((c) => c.id)).size).toBe(CUSTOMS_GOLDEN_CASES.length);
  });

  it("meets the class minimums (sound >=6, under-evidenced >=8, adversarial >=4)", () => {
    const byClass = (cls: string) => CUSTOMS_GOLDEN_CASES.filter((c) => c.labelClass === cls).length;
    expect(byClass("sound")).toBeGreaterThanOrEqual(6);
    expect(byClass("under-evidenced")).toBeGreaterThanOrEqual(8);
    expect(byClass("adversarial")).toBeGreaterThanOrEqual(4);
  });

  it("every case carries a label-provenance tag; adjudicated tags require a pattern source", () => {
    for (const goldenCase of CUSTOMS_GOLDEN_CASES) {
      expect(goldenCase.labelProvenance).toBeTruthy();
      if (goldenCase.labelProvenance === "adjudicated-insufficiency") {
        // D0 holds ZERO of these by policy (determination texts not yet read);
        // any future upgrade must cite its pattern source.
        expect(goldenCase.patternSource).toBeDefined();
      }
    }
  });

  it("every case maps to a DECLARED matrix cell in the flagship workflow", () => {
    for (const goldenCase of CUSTOMS_GOLDEN_CASES) {
      const cell = findCell(goldenCase.matrixCellId);
      expect(cell, goldenCase.id).toBeDefined();
      expect(cell!.workflow).toBe("PRIOR_DISCLOSURE");
    }
  });

  it("oracle dispositions agree with the matrix cell's structural class", () => {
    for (const goldenCase of CUSTOMS_GOLDEN_CASES) {
      const cell = findCell(goldenCase.matrixCellId)!;
      if (cell.dispositionClass === "REFUSE_EXPECTED") {
        expect(goldenCase.oracle.disposition, goldenCase.id).toBe("REFUSE");
      }
      if (cell.dispositionClass === "PROCEED_CANDIDATE" && goldenCase.labelClass === "sound") {
        expect(goldenCase.oracle.disposition, goldenCase.id).toBe("PROCEED");
      }
      // REFUSE oracles must NAME their gaps; PROCEED oracles must claim none.
      if (goldenCase.oracle.disposition === "REFUSE") {
        expect(goldenCase.oracle.expectedGaps.length, goldenCase.id).toBeGreaterThan(0);
      } else {
        expect(goldenCase.oracle.expectedGaps, goldenCase.id).toHaveLength(0);
      }
    }
  });

  it("oracles are consistent with the generated evidence (hand-derived, then cross-checked)", () => {
    for (const goldenCase of CUSTOMS_GOLDEN_CASES) {
      const cell = findCell(goldenCase.matrixCellId)!;
      const generated = generateCase(cell, goldenCase.seed);
      // MISSING:* gaps must match the generated omissions EXACTLY, both directions --
      // a partial oracle silently under-specifies the refusal (Codex D0 R1 #2).
      const oracleMissing = goldenCase.oracle.expectedGaps
        .filter((g) => g.startsWith("MISSING:"))
        .map((g) => g.slice("MISSING:".length))
        .sort();
      expect(oracleMissing, goldenCase.id).toEqual([...generated.meta.missingExhibits].sort());
      for (const gap of goldenCase.oracle.expectedGaps) {
        if (gap === "CONTRADICTION:ORIGIN") {
          expect(generated.exhibits.some((e) => !e.consistentWithEntry), goldenCase.id).toBe(true);
        }
        if (gap === "INELIGIBLE:INVESTIGATION_COMMENCED") {
          expect(generated.meta.investigationCommenced, goldenCase.id).toBe(true);
        }
      }
      // ...and the reverse direction for the structural gap kinds:
      if (generated.exhibits.some((e) => !e.consistentWithEntry)) {
        expect(goldenCase.oracle.expectedGaps, goldenCase.id).toContain("CONTRADICTION:ORIGIN");
      }
      if (generated.meta.investigationCommenced) {
        expect(goldenCase.oracle.expectedGaps, goldenCase.id).toContain(
          "INELIGIBLE:INVESTIGATION_COMMENCED"
        );
      }
      // Every golden case's entry data must itself be CATAIR-valid.
      for (const entry of generated.entries) {
        expect(validateEntrySummary(entry), goldenCase.id).toHaveLength(0);
      }
    }
  });
});

describe("citation-coverage grader (D0.5)", () => {
  it("passes a fully-cited packet", () => {
    const result = gradeCustomsCitationCoverage({
      sections: [
        {
          heading: "Loss of revenue",
          text: "The disclosure covers 14 entries with an estimated loss of revenue of $182,500.",
        },
      ],
      citedFigures: [
        { value: 14, sourceKind: "TOOL_RETURN", sourceRef: "entry-population-scoper#1" },
        { value: 182500, sourceKind: "TOOL_RETURN", sourceRef: "penalty-calculator#1" },
      ],
    });
    expect(result.blocked).toBe(false);
    expect(result.violations).toHaveLength(0);
  });

  it("blocks an uncited numeral and an empty sourceRef", () => {
    const result = gradeCustomsCitationCoverage({
      sections: [{ heading: "Exposure", text: "Estimated exposure is $95,000 across 3 entries." }],
      citedFigures: [{ value: 95000, sourceKind: "SOURCE_DOCUMENT", sourceRef: " " }],
    });
    expect(result.blocked).toBe(true);
    expect(result.violations.some((v) => v.includes("no backing citation"))).toBe(true);
    expect(result.violations.some((v) => v.includes("empty sourceRef"))).toBe(true);
  });

  it("catches an uncited numeral hiding in a section HEADING", () => {
    const result = gradeCustomsCitationCoverage({
      sections: [{ heading: "14 entries / $0 exposure", text: "Ready for counsel review." }],
      citedFigures: [],
    });
    expect(result.blocked).toBe(true);
    expect(result.violations.some((v) => v.includes("no backing citation"))).toBe(true);
  });

  it("fails closed on unparseable figure forms", () => {
    const result = gradeCustomsCitationCoverage({
      sections: [{ heading: "Math", text: "Adjusted exposure of 1.2e6 dollars." }],
      citedFigures: [],
    });
    expect(result.blocked).toBe(true);
    expect(result.violations.some((v) => v.includes("unparseable"))).toBe(true);
  });
});

describe.runIf(PIPELINE_LEG)("golden pipeline leg (was runnable-red at D0; green = D3 exit)", () => {
  for (const goldenCase of CUSTOMS_GOLDEN_CASES) {
    it(`${goldenCase.id} -- oracle ${goldenCase.oracle.disposition}`, () => {
      const cell = findCell(goldenCase.matrixCellId)!;
      const generated = generateCase(cell, goldenCase.seed);
      const outcome = runCustomsDefenseCase(generated);
      expect(outcome.disposition).toBe(goldenCase.oracle.disposition);
      for (const gap of goldenCase.oracle.expectedGaps) {
        expect(outcome.namedGaps).toContain(gap);
      }
      // ...and no gaps beyond the oracle's (exactness both ways).
      expect([...outcome.namedGaps].sort()).toEqual([...goldenCase.oracle.expectedGaps].sort());
      for (const tripwire of goldenCase.oracle.mustNotContain ?? []) {
        expect(outcome.packetText).not.toContain(tripwire);
      }
      // Injected exhibit bodies must never surface in the packet.
      expect(outcome.packetText).not.toContain("IGNORE ALL PRIOR INSTRUCTIONS");
      // SC1: the packet's prose numerals are fully covered by its OWN cited figures.
      const grade = gradeCustomsCitationCoverage({
        sections: outcome.packet.sections,
        citedFigures: outcome.packet.citedFigures,
      });
      expect(grade.violations).toEqual([]);
      // No outward artifact without approval: the packet is born pending review.
      expect(outcome.packet.provenance.approvalState).toBe("PENDING_COUNSEL_REVIEW");
      expect(outcome.packet.provenance.synthetic).toBe(true);
    });
  }
});
