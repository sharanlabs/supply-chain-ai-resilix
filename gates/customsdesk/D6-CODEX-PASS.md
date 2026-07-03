# D6 — the ONE batched Codex pass over customsdesk D1–D5 (2026-07-03)

Cross-model gate (Codex CLI 0.136.0, read-only, via the shared `codex-guarded` queue) over the
entire customsdesk increment: engine (D1–D4), golden + e2e suites, surface (D5), explainer, README.
Prompt focus: penalty-math correctness vs primary sources · fail-closed guarantees · quarantine
boundary · counsel-gate bypass · determinism · test teeth · honesty of published claims.

**R1 verdict: REVISE — 3 HIGH, 3 MED.** Dispositions (primary-model-final, per EVAL-RUBRIC):

| # | Sev | Finding | Disposition |
|---|-----|---------|-------------|
| 1 | HIGH | Skeptic re-derived only entry-scope figures; a tampered culpability tier / inflated exposure with self-consistent citedFigures would pass | **ACCEPTED — fixed.** `skeptic-check.ts` now re-derives the FULL figure set from raw inputs under the packet's declared demo model (LOR, both penalty branches via `computePenaltyExposure`, interest assumptions, quarantine count, seed) and compares every cited ref; deadline clocks re-derived and compared field-by-field (kind/mailedOn/dueOn/windowDays). Teeth: new tamper tests (inflated `caught.max`, tampered `dueOn`) fail without the fix. |
| 2 | HIGH | `exportPacket` trusted a hand-forged `{state:"APPROVED_FOR_EXPORT"}` object → export with undefined reviewer | **PARTIALLY ACCEPTED — fixed the material half.** Runtime validation added: an approved state is honored only with a non-empty reviewer + ISO date (what `approve()` would set); forged minimal objects throw. The proposed opaque-token/immutable rearchitecture is REJECTED: the gate is an in-process pure state machine — any caller with module access can already read `packet.sections`/`renderPacketText` directly, so token opacity buys no real boundary; the gate's contract is the honest workflow surface, now shape-validated. |
| 3 | HIGH | Produce-time citation guard graded only `sections`; rendered header/provenance (seed digits) and the appended approval line escaped it | **ACCEPTED — fixed at both doors.** `failClosedOnUncitedNumerals` now grades the exact `renderPacketText` output (seed cited as a first-class figure, `case-generator#seed`, both PROCEED and REFUSE paths); `exportPacket` grades the final artifact including the approval line — a digit-bearing reviewer ("Counsel 999") now throws at the outward door. The Skeptic grades the full `packetText` too. UI island renders an approved-but-door-blocked state honestly. Teeth: new export-door tests. |
| 4 | MED | Minus-signed figures parsed positive; dates masked from citation coverage | **PARTIALLY ACCEPTED.** Minus leg fixed fail-closed in the shared extractor (`MINUS_FIGURE`: sign position start/whitespace/bracket → unparseable; ranges/in-word hyphens untouched; unit tests added). Date leg: date-masking KEPT as the documented shared-extractor design (dates are addressing, not quantities — changing it would ripple into ActionOps graders); the customs risk is closed instead by finding #1's deadline re-derivation — a wrong `dueOn` is now a Skeptic objection. |
| 5 | MED | Explainer/README overgeneralized prior disclosure to "roughly interest" — fraud-tier disclosure is 100% of total LOR / 10% dutiable value (19 USC 1592(c)(4)), which the code models | **ACCEPTED — fixed.** Both docs now scope the interest claim to negligence-tier duty-loss cases and name the stiffer fraud formula. |
| 6 | MED | The 24-case golden pipeline leg ran only under `RUN_CUSTOMS_GOLDEN=true`, outside default verification | **ACCEPTED — fixed.** `npm run verify` now includes `customs:golden` (CI runs verify), so the ship suite is part of the standard gate. |

**Verification after fixes:** unit suite 825 passed (+6 new teeth tests) · customs:golden 34/34 ·
`verify:full` re-run first-hand (result recorded in the R2 section below).

## R2 — re-review of the fixes

**R2 verdict: REVISE — 2 HIGH, 1 MED**, all escalations on the R1 seams; all three held up
under first-hand reading. Dispositions:

| # | Sev | Finding | Disposition |
|---|-----|---------|-------------|
| R2-1 | HIGH | Skeptic verified expected refs but never REJECTED unexpected ones — an injected `made-up#figure` cited entry could launder a prose number past both the grader and the ref checks | **ACCEPTED — fixed.** The expected set is now an allowlist for BOTH dispositions (REFUSE included, which previously had no figure checks at all): every cited figure must carry a re-derivable sourceRef AND the re-derived value, checked per entry (not via a map) so duplicate-ref shadowing can't hide either. Teeth: injected-ref tamper test. |
| R2-2 | HIGH | Prose date could contradict a CORRECT structured clock ("response due 2099-01-01" in a section; grader masks dates, structured comparison passes) | **ACCEPTED — fixed.** Skeptic now requires every ISO date in the rendered packet text to belong to a re-derived clock, and every re-derived due date to appear in the text. Teeth: prose-date tamper test asserts both objections. |
| R2-3 | MED | Unicode minus/dash sign forms (`−5%`, U+2212 etc.) still parsed positive past the new ASCII `MINUS_FIGURE` | **ACCEPTED — fixed.** The sign class now covers the Unicode look-alikes (minus sign, en/em dash, hyphen variants, fullwidth) at the same sign-only positions; ranges with any dash stay untouched. Teeth: U+2212 and en-dash unit tests. |

Codex validation note: it ran `tsc --noEmit` itself (passed); vitest could not run in its
read-only sandbox (EPERM on temp files) — all suites run first-hand on our side instead.

## R3 — REVISE (1 HIGH), accepted and fixed

**Finding:** the Skeptic scanned the STORED `outcome.packetText`, but export renders fresh from
`outcome.packet` — a tampered section over a stale-but-clean packetText would export text no
check ever scanned. **ACCEPTED — fixed:** `skepticReview` now renders fresh
(`renderPacketText(outcome.packet)`), objects on `packetText !== rendered`, and runs citation
coverage, the prose-date checks, and the quarantine scan against the fresh render (breach scan
covers both strings). Teeth: tampered-section/stale-text test; the prose-date tamper test
re-pointed at the SECTION (what export actually emits).

## R4 — REVISE (1 HIGH), accepted and fixed

**Finding:** numeric value-collision — tampered prose "an additional penalty is $365" riding on
the legitimately-cited 365-day figure passes citation coverage (by value) and the allowlist (the
ref is re-derivable). Per-value checks cannot bind a numeral OCCURRENCE to its meaning.
**ACCEPTED — fixed with the completeness backstop:** the pipeline is pure and deterministic, so
the Skeptic ends with a FULL re-run (`runCustomsDefenseCase(input)`) and objects unless the
re-derived packet is byte-identical (JSON equality). Any deviation — prose, figures, order, gaps
— is caught regardless of value collisions; the named per-category checks stay for legible
objections. Teeth: consistent value-collision tamper test (passes every per-value check, caught
only by the re-derivation).

## R5 — REVISE (1, mechanical completion of R4), accepted and fixed

**Finding:** the backstop compared only `rerun.packet` vs `outcome.packet`; the surface reads
TOP-LEVEL `outcome.namedGaps`/`disposition`, tamperable independently. **ACCEPTED — fixed:** the
comparison is now the whole outcome (`JSON.stringify(rerun) !== JSON.stringify(outcome)`).
Teeth: tampered top-level namedGaps over an untouched packet.

## R6 — VERDICT: APPROVED

> "Step 5 now compares the full deterministic rerun against the full supplied outcome, so
> tampering in `disposition`, `namedGaps`, `packetText`, or `packet` is covered. I don't see a
> remaining concrete in-process outcome-tamper path within this increment's stated threat model."

**Gate closed clean.** Rounds: 6 (R5 cap stretched by one deliberate round — R5's finding was a
one-line mechanical completion of the already-accepted R4 fix, not a new disagreement; recorded
per the Rule-0 exception convention). Final state: unit suite green (853 incl. 12 new teeth
tests across the argument), customs:golden 34/34, `npm run verify` green first-hand after every
round (golden suite now part of the default verify chain), `verify:full` 41/41 e2e.

**The argument's net yield:** the Skeptic went from scope-figures-only to full re-derivation
with an allowlist, prose-date/clock agreement, fresh-render equality, and a whole-outcome
deterministic backstop; the citation guard now covers the exact rendered/exported text at both
doors; the export door validates approval shape and grades the final artifact; the shared
numeral extractor fails closed on ASCII and Unicode minus signs; the golden suite runs in every
verify; and the two published docs no longer overstate the prior-disclosure benefit.
