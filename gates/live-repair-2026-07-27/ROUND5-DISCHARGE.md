# Round-5 discharge — the regression guard was itself f(x)===f(x) (2026-07-28)

The targeted re-gate on `65ebc9a` returned **BLOCK** with one blocking reason plus a secondary
list. It passed grill and inherited the Codex cross-model pass (round 5 touched comments, docs and
one test only, so no fresh cross-model round is owed), and it discharged route-backs 2, 3 and 4 as
verified. It blocked on route-back 1 — correctly.

---

## The blocking finding: the guard did not guard the thing it named

Round 4 added a deterministic test to prove the L-4 calibration fix. The gate found that the test
**re-implemented** the classification inline instead of calling it. Three consequences, all correct:

1. The live loop's classifier sat inside `describe.skipIf(!LIVE)`, so **`npm run verify` never
   executed it** — there was no deterministic guard on the classification at all.
2. Reverting the live loop's branch left the new test **green**. Its assertions followed
   tautologically from its own eight lines.
3. The reported negative control (`AssertionError: expected +0 to be 1`) could only have come from
   mutating the test's **own copy**. The gate reasoned this out from the failure message itself:
   `errors` is local to the test and increments off `verdict.errored`, which comes from production,
   so reverting the live loop cannot drive it to 0. The RED therefore proved the copy discriminated
   — and was *structurally incapable* of testing the live loop.

That is the repo's own `f(x)===f(x)` class, and the same file already modelled the correct pattern
20 lines away (`isStrongSpec` is an independent restatement, but it is cross-checked against the
real `applySkepticGate`).

**Stated plainly: round 4's discharge claim — "It now fails if anyone reinstates the old
classification" — was false for the live loop.** The correction to a claim-wider-than-its-evidence
was itself stated wider than its evidence, one level up.

## Discharge — one classifier, called by both paths

Extracted `classifyCalibrationVerdict(spec, verdict, tally)` + `emptyTally()` as the **single**
implementation. It now has exactly two callers:

- the gated live pass (`describe.skipIf(!LIVE)`), which no longer carries its own branch, and
- the deterministic regression test, which calls the same function rather than a copy.

The extraction includes the `misses.push(...)` strings, as the gate specified — the live loop builds
those inside the same branches, so lifting the branch without them would not have been a clean swap.

Added a **complement test** the gate did not ask for: a genuine (non-errored) REJECT on an unsound
control must still score as a true positive. Without it, "bucket the errors" could be satisfied by a
classifier that scores nothing at all — the mirror of the bug being fixed.

### Mutation control — now on the shared classifier, transcript committed

`21-mutation-control-shared-classifier.log`:

```
(1) BASELINE                                   Tests 39 passed | 1 skipped    EXIT_BASELINE=0
(2) MUTATE classifyCalibrationVerdict to the   Tests  1 failed | 38 passed
    PRE-FIX form (drop the errored branch)     AssertionError: expected +0 to be 1
                                               EXIT_MUTATED=1        <-- RED
(3) RESTORE                                    Tests 39 passed | 1 skipped    EXIT_RESTORED=0
```

The mutation now targets the function the **live pass** calls. Exit codes captured directly, not
read off a pipe (R-4).

---

## Secondary — documents of record this round edited and left stale (the L-3 class)

The gate listed four; all fixed, plus one it did not name.

| Item | Was | Now |
|---|---|---|
| `HANDOFF.md` STATE-AT-WRAP | "916 unit" | **918 unit**, with the delta explained (+2 regression guards) |
| `HANDOFF.md` unpushed | "+ this session's commit" (singular) | **seven** commits, enumerated |
| `HANDOFF.md` / `todo.md` | "BLOCKed twice" / "BLOCK ×2" | **four times**, each round named |
| `HANDOFF.md` gate records | no reference to round 4/5 | `ROUND4-DISCHARGE.md`, `ROUND5-DISCHARGE.md`, logs 19–21 |
| `HANDOFF.md` live figures | round-1 ($0.0221 / 38.1s) | log 18's post-round-3 ($0.0226 / 38.4s) |

**Plus the gate's advisory, class-checked rather than spot-fixed** (the discipline that kept failing
in earlier rounds): the TPM reservation was quoted as ~2,621 from an `in=1,421` sample, while log 19
measures `in=1,373` → **~2,573**. Six occurrences found. Live claims corrected (`ASSESSMENT` ×2 —
including the one that sizes the Playground per-IP limits — and `CODEX-FINDINGS-DISPOSITION`);
dated records left intact and explicitly marked as the state at their time (`skeptic.ts:94`
paragraph, the calibration spacing derivation, lesson L-2, `GATE-CONTEXT`).

**The conclusion is unchanged either way** — 8000/2621 = 3.05 vs 8000/2573 = 3.11, both ~3 calls per
minute — so this is precision in the record, not a changed result. Saying so explicitly is the point.

---

## Accepted, not fixed

- **Log 19's harness lives in the scratchpad**, so a third party cannot confirm the printed `1200`
  was read from `SKEPTIC_MAX_OUTPUT_TOKENS` rather than hardcoded. Standing limitation across logs
  14–19, already recorded. Committing the smokes as gated tests remains the real fix.
- **Code-slop score (gate 5)** not run — advisory-only; recorded as not run rather than implied.

## The pattern, now five rounds deep

Every round, the same class: **a claim broader than its evidence.**

| Round | The claim | What was actually true |
|---|---|---|
| 1 | model-id grep swept the class | the family-name/figures claim was invisible to it |
| 2 | "judge disclosed" | its model had changed and its calibration was stale |
| 3 | "re-measured with corrected math" | the run could not discriminate fixed from broken |
| 4 | "8–13× headroom" | extrapolated from the wrong budget |
| 5 | "it now fails if anyone reinstates the old logic" | it tested a copy of itself |

Each correction was right. Each was stated wider than what had been observed. What caught it every
time was an **independent reader with no stake in the claim** — which is the argument for the gate
chain, not against it. The durable rule is recorded as lesson L-6.

## State

`npm run verify` after all round-5 changes: `22-verify-ROUND5-exit0.log`.
