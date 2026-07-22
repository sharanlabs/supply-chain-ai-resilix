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

// A true MINUS-SIGNED figure ("-5%", "loss of -$300"): the sign position (start of
// text, after whitespace, or after an opening bracket) is where a hyphen can only
// mean negation. Parsing it with FIGURE would silently validate "-5%" against a
// cited positive 5 -- a sign-flipped claim passing the grader. Fail-closed instead:
// signed quantities are surfaced as unparseable and must be rewritten with the
// direction in words ("a decrease of 5%") backed by a claim. In-word hyphens and
// ranges ("5-10 days", "top-5") are untouched -- their hyphen follows a word char.
// The sign class covers the Unicode look-alikes too (minus sign U+2212, en/em dash,
// hyphen variants, fullwidth/small hyphen-minus): "−5%" must not read as 5 (Codex
// D6 R2 #3 -- same digit-script-bypass stance the non-ASCII digit check takes).
const MINUS_FIGURE = /(?<=^|[\s([{])[-−–—‐‑﹣－]\$?\d[\d,]*(?:\.\d+)?[KMBkmb]?%?(?![A-Za-z0-9_$])/g;

const MAGNITUDE: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };

// Non-ASCII decimal digits: any Unicode "decimal number" (\p{Nd}) that is NOT an
// ASCII 0-9. This catches the digit-script bypass -- Arabic-Indic (U+0660-0669),
// fullwidth (U+FF10-FF19), Devanagari, etc. -- that the ASCII-only FIGURE regex
// never sees. WHY surfaced as unparseable, not parsed: feeding "٧" to Number()
// yields NaN, so a parsed path would SILENTLY DROP it (the worst case -- an
// unsourced figure that no claim has to back). Reporting it as unparseable makes the
// citation grader fail it ("cannot verify"), the same fail-closed stance scientific
// notation gets. A draft must write figures in plain ASCII with a backing claim.
// A maximal run of Unicode decimal digits (\p{Nd}) plus the thousands/decimal
// separators a number carries (ASCII , . and the Arabic ٬ ٫). Each run is then
// tested for a NON-ASCII digit in code (hasNonAsciiDigit) -- a run that is all ASCII
// is a normal figure the FIGURE regex already handles, so only the mixed/non-ASCII
// runs are surfaced as unparseable.
const DIGIT_RUN = /[\p{Nd}][\p{Nd},.٫٬]*/gu;
function hasNonAsciiDigit(token: string): boolean {
  for (const ch of token) {
    const code = ch.codePointAt(0) ?? 0;
    // A \p{Nd} codepoint outside ASCII 0-9 is a non-ASCII digit.
    if (/\p{Nd}/u.test(ch) && (code < 0x30 || code > 0x39)) return true;
  }
  return false;
}

// Spelled-out quantity bypass: "within seven days", "five thousand units". A bare
// number-WORD with no unit is prose, not a figure (e.g. "one of the lanes"), so the
// check is CONSERVATIVE -- it fires ONLY when a number-word is immediately adjacent
// to a UNIT word, which is the form a smuggled unsourced quantity takes. \b-anchored
// on both the number-word and the unit-word so "components" (contains "one"),
// "tenant", "billboard" do NOT match. Reported as unparseable: a quantity a draft
// asserts must be a plain figure with a backing claim, never spelled out.
const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty", "fifty",
  "sixty", "seventy", "eighty", "ninety", "hundred", "thousand", "million", "billion"
];
const UNIT_WORDS = [
  "day", "days", "week", "weeks", "month", "months", "year", "years", "hour", "hours",
  "unit", "units", "supplier", "suppliers", "lane", "lanes", "shipment", "shipments",
  "container", "containers", "percent", "dollar", "dollars", "usd", "score"
];
// number-word(s) immediately followed (one optional connector word like "hundred"
// allowed via the {1,3} repeat) by a unit word. The repeat lets "five thousand
// units" match across the "five"+"thousand" compound; the trailing unit is required.
const SPELLED_OUT_QUANTITY = new RegExp(
  `\\b(?:${NUMBER_WORDS.join("|")})(?:\\s+(?:${NUMBER_WORDS.join("|")})){0,3}\\s+(?:${UNIT_WORDS.join("|")})\\b`,
  "gi"
);

// Spelled-out LARGE MAGNITUDES with NO trailing unit ("roughly five million in exposure",
// "eight billion"): a magnitude word (thousand/million/billion) preceded by a number word is an
// asserted FIGURE even without a unit, and SPELLED_OUT_QUANTITY (which REQUIRES a trailing unit)
// misses it -- so "five million in exposure" used to pass with figures:[] AND unparseable:[], a
// silent fail-OPEN (EV-05 Gap A). "hundred" is deliberately excluded from the magnitude tail: it
// reads idiomatically often enough ("a hundred reasons") that requiring the unit is the right bar.
const SPELLED_OUT_MAGNITUDE = new RegExp(
  `\\b(?:${NUMBER_WORDS.join("|")})(?:\\s+(?:${NUMBER_WORDS.join("|")})){0,3}\\s+(?:thousand|million|billion)\\b`,
  "gi"
);

// Accounting-style PARENTHESIZED NEGATIVE of a $-figure ("($300)", "( $1.2M )"): in financial
// prose the parentheses denote a NEGATIVE, so reading the inner 300 as +300 validates a
// sign-flipped claim -- the exact trap MINUS_FIGURE guards, on a different notation (EV-05 Gap B).
// Restricted to the $-form so a legitimate positive parenthetical ("exposure score (72)") is
// untouched. Flagged unparseable AND masked so FIGURE cannot re-read the digits as positive.
const PAREN_NEGATIVE = /\(\s*\$\d[\d,]*(?:\.\d+)?[KMBkmb]?\s*\)/g;

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

  const unparseable = [...(text.match(SCIENTIFIC) ?? [])];

  // Non-ASCII-digit runs: a quantity written in a non-Latin digit script (Arabic-Indic
  // "٧", fullwidth "７") never reaches the ASCII FIGURE regex, so flag any digit run
  // that carries a non-ASCII digit as unparseable (fail-closed -- it must be rewritten
  // in plain ASCII with a backing claim). Strip the ISO_DATE first so a non-ASCII date
  // is not double-handled; dates are not figures anyway.
  for (const run of text.match(DIGIT_RUN) ?? []) {
    // Trim trailing separators a greedy match may absorb from sentence punctuation
    // (e.g. "٨٨." -> "٨٨") so the reported token is just the quantity.
    const trimmed = run.replace(/[,.٫٬]+$/u, "");
    if (hasNonAsciiDigit(trimmed)) unparseable.push(trimmed);
  }

  // Spelled-out quantities adjacent to a unit ("within seven days", "five thousand
  // units"): a smuggled figure the ASCII regex cannot see. Flag the phrase as
  // unparseable so the citation grader fails it -- a draft asserts quantities as plain
  // figures with a backing claim, never spelled out.
  for (const phrase of text.match(SPELLED_OUT_QUANTITY) ?? []) {
    unparseable.push(phrase);
  }

  // Spelled-out large magnitudes with no unit (EV-05 Gap A) -- e.g. "five million in exposure".
  for (const phrase of text.match(SPELLED_OUT_MAGNITUDE) ?? []) {
    unparseable.push(phrase);
  }

  // Minus-signed figures: flagged unparseable (fail-closed -- a "-5%" parsed as 5
  // would validate a sign-flipped claim), then masked so FIGURE cannot re-read the
  // digits as a positive quantity. Runs after SCIENTIFIC so "-1e6" is already gone.
  const preMasked = text.replace(ISO_DATE, " ").replace(SCIENTIFIC, " ");
  for (const signed of preMasked.match(MINUS_FIGURE) ?? []) {
    unparseable.push(signed);
  }

  // Parenthesized $-negatives (EV-05 Gap B) -- e.g. "a revenue impact of ($300)".
  for (const paren of preMasked.match(PAREN_NEGATIVE) ?? []) {
    unparseable.push(paren);
  }

  const masked = preMasked
    .replace(MINUS_FIGURE, " ")
    .replace(PAREN_NEGATIVE, " ")
    .replace(SLASH_RATIO, " ")
    .replace(ID_TOKEN, " ");

  const figures: number[] = [];
  for (const token of masked.match(FIGURE) ?? []) {
    const value = normalizeNumeral(token);
    if (value !== null) figures.push(value);
  }
  return { figures, unparseable };
}

// Two normalized numbers are "the same figure" within a cent of float slack -- our
// figures are integer dollars/days/counts or exact cents, so this is exact in
// practice and only guards against IEEE representation noise.
export function sameFigure(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}
