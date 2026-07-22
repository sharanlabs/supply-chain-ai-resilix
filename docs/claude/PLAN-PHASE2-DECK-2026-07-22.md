# Phase 2 — build `samples/2026/arc/08-deck.html` into the app (2026-07-22)

FRAMEWORKS USED: declarative spec (success criteria + acceptance tests + named risks, per
`docs/PLANNING-FRAMEWORKS.md`) over a fixed owner-picked design spec — no PRD/ADR escalation
because the architecture is unchanged (a presentation-layer register swap on one route; every
behavioral invariant is a PORT, not a design decision).

Owner-picked direction (2026-07-21): the 08-deck synthesis register — six premium cards on pure
white that PIN and STACK on scroll, count-ups, the day scale, hover-lift cards, and the cobalt
wet-stamp HELD→RELEASED gate — becomes the SHIPPED `/` surface. Owner-satisfaction-gated on
completion. Sample: `samples/2026/arc/08-deck.src.html` (authored source, the spec of record).

## What DONE looks like (success criteria)

- SC1 **The `/` route renders the deck register** — hero (headline + four stat cards + scroll
  cue), six pinned/stacking cards (What we saw → What it means → Who it touches → Time we have →
  What we recommend → Your call), coda trust chips — all data-driven from the SAME packet the
  route already serves (`loadReplayPacket()` → `makeDemoPacket()` fallback). No number on the
  glass that does not come from the packet; headline figures (survival days, confidence, $ at
  risk, exposed/no-backup counts) derived, never hardcoded.
- SC2 **Every shipped behavioral invariant survives**: approve/reject stays a labeled simulation
  bound to the gatekeeper (`approvedForHumanReview` gates the control — P8); drafts render with
  their claims provenance; "Recorded signals + date" and "Synthetic data — demonstration" stay on
  the glass; masthead keeps the /loop + /customs (flag-gated) links; the raw-signal disclosure
  (old Events content) stays reachable; NO_ACTION honest-refusal note preserved (card 5's "For
  the record").
- SC3 **AA is designed-in, not patched**: the deck palette lands as a RE-POINT of the existing
  token system (accent hue 148 green → cobalt ~264; risk red kept semantic-only), every pair
  passing `scripts/contrast-check.mjs` (updated pins, same ≥4.5:1 / ≥3:1 bars). The sample's
  sub-AA caption gray (#979CA6 ≈2.5:1) is NOT shipped — captions map to AA-tuned ink tokens.
  All motion honors `prefers-reduced-motion` (sample already does; keep at parity).
- SC4 **Suites green first-hand**: `npm run verify` (incl. updated contrast pins) + full e2e.
  a11y.spec.ts realigned to the new DOM with the SAME per-node incomplete-triage discipline
  (lesson G: measure, never allow-list); pin-and-stack dimming (`animation-timeline: view()`)
  proven not to poison axe scans (scan at settled scroll positions; settle animations first).
- SC5 **Frozen posture untouched**: `evals/fixtures/live/` and `lib/data/demo-packet.ts`
  byte-identical; $0/keyless/no-network on `/` unchanged; engine/eval code untouched.

## Deliberate scope cuts (recorded, not silent)

- `/loop` and `/customs` KEEP the shipped Apple-white/Forest register this increment. One mixed
  register ships to owner review; extending the deck register estate-wide is an owner call at
  the Phase-2 review (cheap follow-on: the token re-point already reaches them — only their
  accent hue shifts, which the owner sees at review).
- The sample's fixed right-edge dot rail and top progress bar: keep only if they land cleanly
  with keyboard/AA semantics (the sample's dots are links with aria-labels — port as-is);
  drop-with-note is acceptable.
- The `min-width:1280` desktop-only posture matches [[resilix-web-desktop-only]] — no
  responsive work.

## Acceptance tests

- AT1 e2e: `/` renders hero + all six cards + coda from the replay packet (assert real fixture
  figures appear: confidence %, survival days, day-30 $); approve simulation flips the stamp
  HELD→RELEASED, audit line appears, control disabled on a blocked/settled state.
- AT2 e2e a11y: axe WCAG 2.2 AA clean (violations empty; incomplete per-node-triaged) at top,
  each card scrolled-to, and the released state; focus-visible ring present; reduced-motion
  serves final values (count-ups render end state).
- AT3 `npm run verify` exit 0 with the updated contrast pins; unit suite untouched-green
  (the packet-view unit tests updated only where the DOM contract moved).
- AT4 diff footprint: no file under `evals/fixtures/live/`, no `lib/data/demo-packet.ts`, no
  `lib/agents/**` engine change.

## Build order

1. **D1 — the deck view**: token re-point in `app/globals.css` + `components/deck/` (deck view +
   section components), swapped into `ActionOpsDashboard` for the packet-view briefing; port the
   sample's motion (reveal IO, count-ups, stack CSS, stamp) into React with reduced-motion
   parity; reuse the existing approve-simulation logic + claims rendering from
   `action-packet-view.tsx` (invariants move, never get re-invented).
2. **D2 — realign the instruments**: contrast-check pins; a11y/e2e specs to the new DOM (same
   measurement discipline); update packet-view unit tests where the DOM contract moved.
3. **D3 — gate + ship**: verify + e2e first-hand → acceptance-gate → commit → owner review
   (satisfaction gate) → push on owner word.

## Risks (named)

- R1 The stack's settled-card dimming (opacity .55 + blur) could read as sub-AA to axe if a
  scan catches a mid-exit state → scans run at settled positions with animations awaited
  (lesson G); the dimmed state only applies to cards already scrolled past.
- R2 The e2e a11y suite's measured checks reference current DOM anchors (approve-rail gradient,
  masthead) — realignment is careful, per-node, never a rule-id allow-list.
- R3 The 2,195-line packet view carries invariant bindings easy to lose in a rewrite → the deck
  view REUSES its behavioral blocks; a grep-audit of `approvedForHumanReview`, "Simulated",
  synthetic-chip, and claims rendering closes D1.
