// Ground-truth WCAG contrast for the design tokens in app/globals.css.
// OKLCH -> OKLab -> LMS -> linear sRGB (Ottosson matrices), then WCAG relative
// luminance on the linear channels. Run: node scripts/contrast-check.mjs
// Wired into `npm run verify`; exits 1 if any pair falls below its bar OR if
// this file's token table drifts from app/globals.css (the tokens are PARSED
// from the stylesheet and cross-checked, so a retune cannot silently pass).
// The e2e a11y suite measures the RENDERED page; this checks the token math
// directly so a failing pair is caught before a browser ever runs.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

function oklchToLinearSrgb(L, C, Hdeg) {
  const h = (Hdeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ].map((c) => Math.min(1, Math.max(0, c)));
}

function luminance([r, g, b]) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(fg, bg) {
  const [l1, l2] = [luminance(oklchToLinearSrgb(...fg)), luminance(oklchToLinearSrgb(...bg))];
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// Parse the @theme token values straight from the stylesheet -- the stylesheet
// IS the source of truth; this script holds only pair definitions and bars.
const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "app", "globals.css"),
  "utf8"
);
function token(name) {
  const m = css.match(
    new RegExp(`--color-${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`)
  );
  if (!m) {
    console.error(`FAIL  token --color-${name} not found as a plain oklch() in app/globals.css`);
    process.exit(1);
  }
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

const T = Object.fromEntries(
  [
    "ground", "surface", "sink", "sink-deep",
    "ink", "ink-muted", "ink-faint",
    "accent", "accent-strong", "accent-soft", "accent-ink",
    "positive", "positive-soft",
    "sev-low-ink", "sev-low-soft", "sev-medium-ink", "sev-medium-soft",
    "sev-high-ink", "sev-high-soft", "sev-critical-ink", "sev-critical-soft",
    "caution-ink", "caution-soft",
    "runway-edge"
  ].map((n) => [n, token(n)])
);

// [label, fg, bg, bar] -- 4.5 = AA small text, 3.0 = SC 1.4.11 non-text.
const PAIRS = [
  ["ink on surface", T.ink, T.surface, 4.5],
  ["ink on ground", T.ink, T.ground, 4.5],
  ["ink on sink-deep", T.ink, T["sink-deep"], 4.5],
  ["ink-muted on surface", T["ink-muted"], T.surface, 4.5],
  ["ink-muted on sink-deep", T["ink-muted"], T["sink-deep"], 4.5],
  ["ink-faint on surface", T["ink-faint"], T.surface, 4.5],
  ["ink-faint on ground", T["ink-faint"], T.ground, 4.5],
  ["ink-faint on sink-deep", T["ink-faint"], T["sink-deep"], 4.5],
  ["accent on accent-soft (chip text)", T.accent, T["accent-soft"], 4.5],
  ["accent-strong on surface (text)", T["accent-strong"], T.surface, 4.5],
  ["accent-ink on accent-strong (button text)", T["accent-ink"], T["accent-strong"], 4.5],
  ["positive on positive-soft (badge text)", T.positive, T["positive-soft"], 4.5],
  ["sev-low-ink on sev-low-soft (badge text)", T["sev-low-ink"], T["sev-low-soft"], 4.5],
  ["sev-medium-ink on sev-medium-soft (badge text)", T["sev-medium-ink"], T["sev-medium-soft"], 4.5],
  ["sev-high-ink on sev-high-soft (badge text)", T["sev-high-ink"], T["sev-high-soft"], 4.5],
  ["sev-critical-ink on sev-critical-soft (badge text)", T["sev-critical-ink"], T["sev-critical-soft"], 4.5],
  ["caution-ink on caution-soft (badge text)", T["caution-ink"], T["caution-soft"], 4.5],
  ["accent on surface (focus ring, non-text)", T.accent, T.surface, 3.0],
  ["runway-edge vs sink (bar boundary, non-text)", T["runway-edge"], T.sink, 3.0]
];

let failed = 0;
for (const [label, fg, bg, bar] of PAIRS) {
  const r = ratio(fg, bg);
  const ok = r >= bar;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${r.toFixed(2)}:1  (bar ${bar})  ${label}`);
}
if (failed) {
  console.error(`\n${failed} pair(s) below bar`);
  process.exit(1);
}
console.log(`\nAll ${PAIRS.length} token pairs clear their bars (tokens parsed live from globals.css).`);
