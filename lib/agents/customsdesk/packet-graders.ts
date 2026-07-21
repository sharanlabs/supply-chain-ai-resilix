// D0.5 -- citation-coverage grader over customs defense-packet drafts.
//
// The SC1 bar (plan §1): 100% of numerals in any emitted packet bind to deterministic
// tool returns or named source documents. This grader enforces it the same way the
// ActionOps graders do: extract every sourceable numeral from the prose, fail any
// figure with no backing citation, and fail CLOSED on forms the extractor refuses to
// parse. Reuses lib/evals/numerals.ts so the two domains cannot drift on what counts
// as a numeral.

import { extractSourceableNumerals, normalizeNumeral, sameFigure } from "@/lib/evals/numerals";

export interface CitedFigure {
  value: number;
  // Honest provenance vocabulary (2026-07-16 re-review, C-05): TOOL_RETURN = a value a
  // deterministic tool computed and returned; SOURCE_DOCUMENT = a value read from a named
  // source document (statute section numbers); RAW_INPUT = a case input passed through
  // (the generator seed); DECLARED_ASSUMPTION = a disclosed demo-model constant (the
  // interest-rate assumption). Labeling an input or an assumption as TOOL_RETURN was the
  // exact declarative-provenance drift this enum closes.
  sourceKind: "TOOL_RETURN" | "SOURCE_DOCUMENT" | "RAW_INPUT" | "DECLARED_ASSUMPTION";
  sourceRef: string; // tool call id or exhibit/document identifier
}

export interface CustomsPacketDraft {
  sections: Array<{ heading: string; text: string }>;
  citedFigures: CitedFigure[];
}

export interface CustomsGradeResult {
  blocked: boolean;
  violations: string[];
}

export function gradeCustomsCitationCoverage(packet: CustomsPacketDraft): CustomsGradeResult {
  const violations: string[] = [];
  const cited = packet.citedFigures
    .map((c) => normalizeNumeral(c.value))
    .filter((n): n is number => n !== null);

  for (const section of packet.sections) {
    // Headings are packet-visible prose too -- a numeral there must be cited the
    // same as body text (Codex D0 R1 #5: "14 entries / $0 exposure" as a heading).
    const { figures, unparseable } = extractSourceableNumerals(
      `${section.heading}\n${section.text}`
    );
    for (const raw of unparseable) {
      violations.push(`[${section.heading}] unparseable figure form '${raw}' (fail-closed)`);
    }
    for (const figure of figures) {
      if (!cited.some((c) => sameFigure(c, figure))) {
        violations.push(`[${section.heading}] numeral ${figure} has no backing citation`);
      }
    }
  }

  for (const citation of packet.citedFigures) {
    if (citation.sourceRef.trim().length === 0) {
      violations.push(`cited figure ${citation.value} has an empty sourceRef`);
    }
  }

  return { blocked: violations.length > 0, violations };
}
