// Extract the "sourceable numerals" from a drafted message body.
//
// The hallucination contract (Success_Criteria) is: every numeral a draft
// ASSERTS must trace to a `claims[]` entry. The hard part is that "numeral" must
// mean an asserted QUANTITY -- a dollar amount, a count, a percentage, a day
// count -- and NOT every run of digits in the prose. Two kinds of digits are
// addressing/labels, not claims, and flagging them would make the citation grader
// a false-failure machine that rejects correct drafts:
//   - identifiers: SUP-100, THREAT-001, EXP-001 (the digits name a record)
//   - dates: 2026-07-01 (a calendar point, sourced via the simulation/threat card,
//     not a free-standing figure)
// So the extractor MASKS those two classes first, then pulls the remaining
// numeric tokens. The masks and the extraction are both tested in each direction
// (a real figure is caught; an id digit / date digit is not) -- the narrowness is
// the point, and it is pinned by tests so it cannot silently loosen.

// ISO-8601 date (and optional time) -- masked so 2026-07-01 contributes no "2026".
const ISO_DATE = /\d{4}-\d{2}-\d{2}(?:T[\d:.+Z-]*)?/g;

// Identifier token: an uppercase-prefixed, hyphenated handle (SUP-100, THREAT-001,
// DP-v2-fixture, AI-001). The uppercase prefix is what distinguishes an id from a
// hyphenated figure like "7-day" (which we WANT to read as the quantity 7).
const ID_TOKEN = /\b[A-Z][A-Z0-9]*-[A-Za-z0-9][A-Za-z0-9-]*\b/g;

// A numeric figure: optional leading `$`, digits with optional thousands commas,
// optional decimal, optional trailing `%`. The leading lookbehind rejects a digit
// glued to a letter/underscore (a leftover id fragment) so we only read free
// figures. Runs AFTER masking, so dates/ids are already gone.
const FIGURE = /(?<![A-Za-z0-9_])\$?\d[\d,]*(?:\.\d+)?%?/g;

// Normalize a raw figure or a claim's `value` to a comparable number. Strips the
// presentation affixes ($ , %) so "$50,000", "50000", and the numeric 50000 all
// compare equal. Returns null for anything non-numeric (so a non-numeric claim
// value -- a label string -- is simply not number-compared).
export function normalizeNumeral(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const stripped = raw.replace(/[$,%\s]/g, "");
  if (stripped.length === 0) return null;
  const n = Number(stripped);
  return Number.isFinite(n) ? n : null;
}

export function extractSourceableNumerals(text: string): number[] {
  if (typeof text !== "string" || text.length === 0) return [];

  const masked = text.replace(ISO_DATE, " ").replace(ID_TOKEN, " ");

  const figures: number[] = [];
  for (const token of masked.match(FIGURE) ?? []) {
    const value = normalizeNumeral(token);
    if (value !== null) figures.push(value);
  }
  return figures;
}

// Two normalized numbers are "the same figure" within a cent of float slack --
// our figures are integer dollars/days/counts or exact cents, so this is exact in
// practice and only guards against IEEE representation noise.
export function sameFigure(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}
