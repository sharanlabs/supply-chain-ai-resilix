// D0 exit gate: matrix integrity + the generator emits CATAIR-Rev-108-valid records
// for EVERY declared cell (plan §5 D0 VERIFY). Runs inside `npm test` -- these are
// green-by-construction validation tooling tests, not the (red) golden pipeline suite.
import { describe, expect, it } from "vitest";

import {
  DEADLINE_STATES,
  EVIDENCE_POSTURES,
  MATRIX_CELLS,
  ORIGIN_COMPLEXITIES,
  isDeclaredCoverage,
} from "@/lib/agents/customsdesk/edge-case-matrix";
import {
  entryNumberCheckDigit,
  validate10Record,
  validateEntrySummary,
} from "@/lib/agents/customsdesk/catair";
import { generateCase } from "@/lib/agents/customsdesk/synthetic-entries";

describe("edge-case matrix v1 (declared coverage)", () => {
  it("cell ids are unique", () => {
    const ids = MATRIX_CELLS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("flagship coverage is the FULL prior-disclosure cross product", () => {
    const expected = EVIDENCE_POSTURES.length * ORIGIN_COMPLEXITIES.length * DEADLINE_STATES.length;
    const flagship = MATRIX_CELLS.filter((c) => c.workflow === "PRIOR_DISCLOSURE");
    expect(flagship).toHaveLength(expected);
    expect(flagship.every((c) => c.coverageClaim === "flagship")).toBe(true);
  });

  it("CF-28 cells claim spine-transfer proof only, never flagship coverage", () => {
    const cf28 = MATRIX_CELLS.filter((c) => c.workflow === "CF28_RESPONSE");
    expect(cf28.length).toBeGreaterThan(0);
    expect(cf28.every((c) => c.coverageClaim === "spine-transfer-proof")).toBe(true);
  });

  it("structural dispositions hold: LAPSED or missing/contradictory evidence => refusal class", () => {
    for (const cell of MATRIX_CELLS) {
      if (cell.posture === "ADVERSARIAL_INJECTED") {
        expect(cell.dispositionClass).toBe("QUARANTINE_TEST");
      } else if (cell.deadline === "LAPSED" || cell.posture !== "COMPLETE") {
        expect(cell.dispositionClass).toBe("REFUSE_EXPECTED");
      } else {
        expect(cell.dispositionClass).toBe("PROCEED_CANDIDATE");
      }
    }
  });

  it("undeclared combinations are outside coverage (the refusal guard)", () => {
    expect(isDeclaredCoverage("PRIOR_DISCLOSURE", "COMPLETE", "SINGLE_COUNTRY", "AMPLE")).toBe(true);
    expect(isDeclaredCoverage("EAPA_DEFENSE", "COMPLETE", "SINGLE_COUNTRY", "AMPLE")).toBe(false);
    expect(isDeclaredCoverage("PRIOR_DISCLOSURE", "COMPLETE", "SINGLE_COUNTRY", "TOMORROW")).toBe(false);
  });
});

describe("check digit (CATAIR AE Table 1)", () => {
  it("matches hand-derived AE Table 1 oracle values (independent of the implementation)", () => {
    // Derived by hand from the Rev-108 six-step procedure (Codex D0 R1 #4: a wrong
    // but self-consistent algorithm must not be able to bless itself):
    //   RSX(9,2,7)+1234567: even ones 4+2+6+1+5=18, odd 9+7+2+4+6=28, 46 -> 4
    //   ABC(1,2,3)+9999999: even ones 4+9+9+9+9=40, odd 1+3+9+9+9=31, 71 -> 9
    //   XYZ(7,8,9)+0000000: even ones 7+0+0+0+0=7,  odd 7+9+0+0+0=16, 23 -> 7
    expect(entryNumberCheckDigit("RSX", "1234567")).toBe(4);
    expect(entryNumberCheckDigit("ABC", "9999999")).toBe(9);
    expect(entryNumberCheckDigit("XYZ", "0000000")).toBe(7);
  });

  it("is stable and sensitive to any sequence change", () => {
    const d = entryNumberCheckDigit("RSX", "1234567");
    expect(entryNumberCheckDigit("RSX", "1234567")).toBe(d);
    expect(entryNumberCheckDigit("RSX", "1234568")).not.toBe(d);
  });

  it("rejects malformed filer codes and sequences", () => {
    expect(() => entryNumberCheckDigit("RS", "1234567")).toThrow();
    expect(() => entryNumberCheckDigit("RSX", "123456")).toThrow();
    expect(() => entryNumberCheckDigit("RSX", "12345678")).toThrow();
  });

  it("a corrupted check digit is caught by the 10-record validator", () => {
    const good = generateCase(MATRIX_CELLS[0], 42).entries[0].header;
    const badDigit = (Number(good[15]) + 1) % 10;
    const corrupted = good.slice(0, 15) + String(badDigit) + good.slice(16);
    const violations = validate10Record(corrupted);
    expect(violations.some((v) => v.field === "entryNumber" && v.problem.includes("check digit"))).toBe(
      true
    );
  });
});

describe("synthetic-entry generator (D0 exit VERIFY)", () => {
  it("every declared cell generates entries that validate against the Rev-108 layout", () => {
    for (const cell of MATRIX_CELLS) {
      const testCase = generateCase(cell, 7);
      expect(testCase.entries.length).toBeGreaterThan(0);
      for (const entry of testCase.entries) {
        const violations = validateEntrySummary(entry);
        expect(violations, `${cell.id}: ${JSON.stringify(violations)}`).toHaveLength(0);
      }
    }
  });

  it("is deterministic: same (cell, seed) => byte-identical case", () => {
    const a = generateCase(MATRIX_CELLS[3], 99);
    const b = generateCase(MATRIX_CELLS[3], 99);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = generateCase(MATRIX_CELLS[3], 100);
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));
  });

  it("posture drives the evidence inventory, not the entry validity", () => {
    const partial = generateCase(MATRIX_CELLS.find((c) => c.posture === "PARTIAL")!, 5);
    expect(partial.meta.missingExhibits.length).toBeGreaterThan(0);

    const contradictory = generateCase(MATRIX_CELLS.find((c) => c.posture === "CONTRADICTORY")!, 5);
    expect(contradictory.exhibits.some((e) => !e.consistentWithEntry)).toBe(true);

    const adversarial = generateCase(
      MATRIX_CELLS.find((c) => c.posture === "ADVERSARIAL_INJECTED")!,
      5
    );
    expect(adversarial.exhibits.some((e) => e.body.includes("IGNORE ALL PRIOR INSTRUCTIONS"))).toBe(true);

    const complete = generateCase(
      MATRIX_CELLS.find((c) => c.posture === "COMPLETE" && c.deadline === "AMPLE")!,
      5
    );
    expect(complete.meta.missingExhibits).toHaveLength(0);
    expect(complete.exhibits.every((e) => e.consistentWithEntry)).toBe(true);
  });

  it("transshipment cells carry the declared-vs-questioned origin tension explicitly", () => {
    const cell = MATRIX_CELLS.find(
      (c) => c.origin === "TRANSSHIPMENT_PATTERN" && c.posture === "COMPLETE" && c.deadline === "AMPLE"
    )!;
    const testCase = generateCase(cell, 11);
    // The entry declares the transshipment country (consistently, as a real filer
    // would); the case META carries the questioned actual origin. The tension must
    // be explicit and non-degenerate (Codex D0 R1 #1).
    expect(testCase.meta.questionedOrigin).toBe("CN");
    expect(testCase.meta.declaredOrigin).not.toBe(testCase.meta.questionedOrigin);
    for (const entry of testCase.entries) {
      for (const line of entry.lines) {
        expect(line.lineItem.slice(8, 10)).toBe(testCase.meta.declaredOrigin);
      }
    }
  });

  it("non-transshipment cells carry no origin allegation (declared == questioned)", () => {
    const cell = MATRIX_CELLS.find(
      (c) => c.origin === "SINGLE_COUNTRY" && c.posture === "COMPLETE" && c.deadline === "AMPLE"
    )!;
    const testCase = generateCase(cell, 11);
    expect(testCase.meta.declaredOrigin).toBe(testCase.meta.questionedOrigin);
  });
});
