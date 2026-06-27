# e2e a11y flake — diagnosis + fix direction (2026-06-26)

**Status: ✅ FIXED 2026-06-26 (fresh re-eval session). Test-side fix applied to
`evals/e2e/a11y.spec.ts` (Option B — see "Resolution" below). Proven by a red baseline
(reproduced) → deterministic guard test → robust green-under-load. Cross-model checkpoint +
local commit pending.**

> ## Resolution (2026-06-26) — Option B, advisor-gated
>
> **Fix (the minimal-diff "second known background", chosen over the general DOM-walk):**
> `assertAxeClean` now classifies each `color-contrast` incomplete node by which KNOWN
> uncompositable background it sits on — the approve-rail gradient (`.bg-gradient-to-b`) OR
> the translucent masthead (`.backdrop-blur-xl`) — measures its REAL WCAG ratio against that
> ground-truth background, and still **fails loud** for a node on neither (no blanket pass).
> The masthead bg = `var(--color-ground)` (the band's 80% tint over the page-top ground; none
> of the 3 layer-1 scans scroll, so the composite is exactly ground). The masthead span then
> measures 5.39:1 ≥ 4.5:1 and passes deterministically. The rationale comment was corrected to
> describe both backgrounds.
>
> **Why Option B not the general walk (advisor):** the rail gradient is a `background-image`,
> so a `backgroundColor` DOM-walk reads it as transparent and would silently measure rail text
> against `surface` — a false-pass regression in the one case already handled. B leaves that
> path untouched.
>
> **Proof (all three, per the advisor's done-criteria):**
> 1. **Red baseline reproduced** — calibrated CPU-saturated stress (4 burners + 120 masthead
>    scans, 30s timeout) produced the genuine signature `masthead-incomplete-RED=2`,
>    `axe-violations=0` (confirms the failure is ALWAYS the incomplete blanket-fail path, never
>    a `violations` entry — so the fix targets the real failure).
> 2. **Deterministic guard test** (new, timing-independent) — injects the exact axe verdict the
>    flake produces (masthead `.hidden` as a color-contrast incomplete) and asserts it is
>    measured-and-PASSED, plus a negative control (a node on neither known bg) that still fails
>    loud. Proven every run, not only under load.
> 3. **Robust green-under-load** — 6/6 full `test:e2e` runs under mild added load:
>    `suite-failures=0/6  masthead-RED=0  timeouts=0` (0 timeouts ⇒ tests reached their
>    assertions ⇒ the zero reds are real, not timeout-masked). e2e count 20 → **21** (the guard).
>
> **Process note now closed:** the original "verify:full GREEN · 20 e2e" was a good-run
> snapshot. The new deterministic guard converts the previously load-only-checked masthead
> contrast into a path verified on EVERY run, so this class of flake can't silently return.

----- original diagnosis (2026-06-26, pre-fix) below — retained as the record -----

## Symptom

`npm run test:e2e` (full parallel Playwright run) intermittently fails:

```
evals/e2e/a11y.spec.ts:287 › a11y / layer 1 — axe WCAG 2.2 AA
  › "no axe violations after the packet is approved"
  → [approved state] color-contrast incomplete ".hidden" is NOT inside the
    known rail gradient — it needs a real fix or its own dedicated coverage
```

Observed rate this session: full parallel suite **failed 1 of 2 runs**; the same test passed
**4/4 in isolation** (`--repeat-each=4 --workers=1`). So: **flaky under parallel CPU load, not
deterministic.** It surfaced in the "approved" scan this run, but the culprit node is in the
masthead (present in ALL three layer-1 scans: default / expanded / approved) — so it can flake
in any of them, not just approved.

## Root cause (grounded, not guessed)

- The flagged node `.hidden` is **unique** in the tree: `components/actionops-dashboard.tsx:56`
  — the masthead span `"Disruption response"`. It's `class="hidden … sm:inline"`: the `hidden`
  **class token stays on the element** even though `sm:inline` makes it `display:inline` at the
  test viewport (Desktop Chrome, ≥ `sm`). So axe sees a **visible** element whose unique selector
  is `.hidden`.
- It is `text-ink-faint` (`oklch(0.515 0.03 258)`), 10px, mono, uppercase, sitting in the
  **sticky masthead** `bg-ground/80` + `backdrop-blur-xl` — a **translucent, blurred** background.
- axe's `color-contrast` rule **cannot reliably composite** faint OKLCH text over a semi-transparent
  blurred band, so it intermittently returns **`incomplete`** (not a violation — "couldn't decide").
  The intermittency tracks what's painted behind the sticky band + OKLCH-serialization timing under
  load.
- `assertAxeClean` (a11y.spec.ts:104-171) forgives a `color-contrast` `incomplete` **only** if the
  node is inside the rail gradient (`.bg-gradient-to-b`) — otherwise it **blanket-fails** (line
  157-160) to avoid silently passing uncovered nodes. The masthead span is a *second* legitimately
  uncompositable background that the guard doesn't know about → false failure.

## This is a TEST bug, not a product a11y bug — proven

Exact WCAG contrast (OKLCH → linear-sRGB → relative luminance, computed 2026-06-26):

| foreground | background | ratio | small-text need | verdict |
|---|---|---|---|---|
| `ink-faint` 0.515/0.03/258 | `ground` 0.985/0.004/255 | **5.39:1** | 4.5:1 | **PASS** |
| `ink-faint` | `surface` (white) | 5.62:1 | 4.5:1 | PASS |

The masthead text is genuinely accessible (5.39:1 ≥ 4.5:1). **No component change is needed.**
The settle()/animation-race hypothesis is WRONG — there is no animation on this static span;
hardening `settle()` would not fix it.

## Fix direction (test-side, more rigorous — not a blanket pass)

Generalize `assertAxeClean`'s `color-contrast` `incomplete` handling: for **any** incomplete node
(not just rail-gradient ones), measure its **true** contrast via the existing in-browser canvas
resolver (`resolveSrgb`) against the node's **real effective background** (walk up to the first
non-transparent background; composite alpha-over for the translucent masthead, analogous to how the
rail-gradient branch composites the darkest stop), then assert the real WCAG ratio. The masthead
span then measures 5.39:1 and passes **deterministically**; the test still never blanket-passes an
uncovered node (it measures every incomplete, by ground truth). Keep the non-`color-contrast`
incomplete → fail-loud branch unchanged.

Minimal-diff alternative (acceptable, slightly less general): treat the sticky masthead
(`bg-ground/80 backdrop-blur-xl`) as a SECOND "known background axe can't composite," parallel to
the rail-gradient case, and measure `ink-faint` over the composited `ground/80`-over-`ground`
effective solid. Prefer the general version if it isn't much more code.

## Verification recipe (the fix is "done" when this is clean)

The flake needs parallel load to reproduce (isolated repeats hide it). Stress it:

```bash
# run the full parallel suite several times; expect 0 failures across all
for i in 1 2 3 4 5 6 7 8; do npm run test:e2e || echo "FAILED on run $i"; done
# and/or hammer just the a11y file under default (parallel) workers + repeats
npx playwright test evals/e2e/a11y.spec.ts --repeat-each=12
```

Then the usual gate: `npm run verify` GREEN + (test-only change) a light cross-model look per the
project's discipline. The change touches `evals/e2e/a11y.spec.ts` only.

## Process note (why this matters for the re-eval)

The records claimed `verify:full GREEN · 20 e2e` — TRUE on a good run, but **not robust**: `verify`
(the key-OFF chain) does NOT include `test:e2e`, and the e2e suite harbored this flake. Re-running
e2e **under parallel load** is what surfaced it. Treat recorded "GREEN" as a good-run snapshot, not
a guarantee — re-run first-hand in the fresh eval.
