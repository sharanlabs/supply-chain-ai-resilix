// Extract the "sourceable numerals" from a drafted message body.
//
// The hallucination contract (Success_Criteria) is: every numeral a draft
// ASSERTS must trace to a `claims[]` entry. "Numeral" must mean an asserted
// QUANTITY -- a dollar amount, a count, a percentage, a day count -- and NOT every
// run of digits in the prose. Two kinds of digits are addressing/labels, not
// claims, and flagging them would make the citation grader a false-failure machine
// that rejects correct drafts:
//   - identifiers: SUP-100, THREAT-001, EXP-001 (the digits name a record)
//   - dates / ratios: 2026-07-01, 24/7 (a calendar point or an idiom, not a figure)
//
// The other failure mode (the one a cross-model review caught) is SILENT MISREAD:
// "$1.2M" read as 1.2, "1e6" read as 1. A misread figure is worse than an
// unflagged one because the citation grader would then validate the WRONG number.
// So the extractor is FAIL-CLOSED: it handles the forms a draft should use
// (commas, decimals, $/%, K/M/B magnitudes), and any form it cannot read
// unambiguously (scientific notation) is returned as `unparseable` -- the citation
// grader treats an unparseable prose figure as a failure ("cannot verify"), never
// as a silently-misread pass.

const ISO_DATE = /\d{4}-\d{2}-\d{2}(?:T[\d:.+Z-]*)?/g;

// Slash forms: 24/7, 6/30, simple fractions. Idioms/dates, never asserted figures.
const SLASH_RATIO = /\b\d+\/\d+\b/g;

// Scientific notation: the silent-misread trap. Captured BEFORE the figure regex so
// "1e6" cannot be read as a bare 1; surfaced as unparseable instead.
const SCIENTIFIC = /\b\d+(?:\.\d+)?[eE][+-]?\d+\b/g;

// Identifier token: an uppercase-prefixed, hyphenated handle (SUP-100, THREAT-001,
// DP-v2-fixture). Uppercase-ONLY is deliberate, not a gap: every canonical id in
// this system is uppercase-prefixed (canonicalSupplierId -> "SUP-", threat/exposure
// ids -> "THR-"/"EXP-"), so this masks real ids while leaving a lowercase
// word-hyphen-count like "top-5" (a real count to cite) extractable.
const ID_TOKEN = /\b[A-Z][A-Z0-9]*-[A-Za-z0-9][A-Za-z0-9-]*\b/g;

// A figure: optional `$`, digits with optional thousands commas, optional decimal,
// optional K/M/B magnitude suffix, optional `%`. The LEFT lookbehind rejects a digit
// glued to a letter/underscore/`$`/`.`/`/` (a version like v2.1, a leftover fragment);
// the RIGHT lookahead rejects a figure glued to letters (a SKU like 123ABC, or 50USD
// -- the convention is to write a unit WORD with a space, "50 USD", or use $/%).
// Runs AFTER masking, so dates/ratios/sci/ids are already gone.
const FIGURE = /(?<![A-Za-z0-9_$./])\$?\d[\d,]*(?:\.\d+)?[KMBkmb]?%?(?![A-Za-z0-9_$])/g;

const MAGNITUDE: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };

// Normalize a raw figure or a claim's `value` to a comparable number. Strips
// presentation affixes ($ , %), applies a trailing K/M/B magnitude, so "$1,200,000",
// "1.2M", and the numeric 1_200_000 all compare equal. Returns null for anything
// non-numeric (a non-numeric claim value -- a label string -- is simply not
// number-compared).
export function normalizeNumeral(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;

  const trimmed = raw.trim();
  const suffix = trimmed.slice(-1).toLowerCase();
  const magnitude = MAGNITUDE[suffix];
  const core = magnitude ? trimmed.slice(0, -1) : trimmed;

  const stripped = core.replace(/[$,%\s]/g, "");
  if (stripped.length === 0) return null;
  const n = Number(stripped);
  if (!Number.isFinite(n)) return null;
  return magnitude ? n * magnitude : n;
}

export type ExtractedNumerals = {
  // Figures parsed with confidence.
  figures: number[];
  // Forms the extractor refuses to guess at (scientific notation). The citation
  // grader fails on these rather than risk a silent misread.
  unparseable: string[];
};

export function extractSourceableNumerals(text: string): ExtractedNumerals {
  if (typeof text !== "string" || text.length === 0) {
    return { figures: [], unparseable: [] };
  }

  const unparseable = text.match(SCIENTIFIC) ?? [];

  const masked = text
    .replace(ISO_DATE, " ")
    .replace(SCIENTIFIC, " ")
    .replace(SLASH_RATIO, " ")
    .replace(ID_TOKEN, " ");

  const figures: number[] = [];
  for (const token of masked.match(FIGURE) ?? []) {
    const value = normalizeNumeral(token);
    if (value !== null) figures.push(value);
  }
  return { figures, unparseable: [...unparseable] };
}

// Two normalized numbers are "the same figure" within a cent of float slack -- our
// figures are integer dollars/days/counts or exact cents, so this is exact in
// practice and only guards against IEEE representation noise.
export function sameFigure(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}
