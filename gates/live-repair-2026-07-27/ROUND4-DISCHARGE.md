# Round-4 discharge — final acceptance-gate BLOCK (2026-07-28)

The final gate over the completed chain (`6104159` + `ce2d0ca` + `777674c` + `310d669` + `ffe56d0`)
returned **BLOCK** with four route-backs at stage = execution. All four are discharged below.

The gate passed gates 1 (grill) and 2 (codex cross-model, now RUN) and confirmed every number in
logs 14/15/16/17/18 reconciles. It blocked on **proof discipline**, not on correctness — which is
the right thing to block on here, because the strongest finding is that this session's headline fix
had no discriminating evidence behind it.

---

## Route-back 1 [the serious one] — the headline fix had no discriminating evidence

**Gate's finding, and it is exactly right.** With `errors === 0`, the OLD (broken) tally and the NEW
(bucketed) tally produce **identical numbers**: tp=7, tn=10, fn=0, fp=0. Only the labels differ. So
"re-measured with the corrected math" (log 14) was **not evidence that the math was corrected** — it
is equally consistent with the bug still being present. Worse, the two new teeth
(`expect(erroredUnsound).toEqual([])`, `errorRate <= 0.1`) are **vacuously satisfied** on any
error-free run.

**This is a violation of lesson L-5, written by this same session hours earlier:** *"a defensive
branch that has never been OBSERVED firing is untested code on the exact path you claim to have
secured — force the failure and watch the classification, or do not claim it."* I applied that rule
to the truncation classifier and then failed to apply it to the calibration fix in the next commit.

**Discharge — a deterministic, $0, sub-second discriminating control** added at
`evals/actionops-skeptic-calibration.test.ts` ("an ERRORED verdict is bucketed as an error — NOT
counted as a detection"). It drives a real error through the DI seam and asserts the three
properties that separate the fixed tally from the broken one:

| Assertion | Fixed tally | Broken tally |
|---|---|---|
| `errors === 1` | ✅ | ✗ (0) |
| `tp === 0` | ✅ | ✗ (1) — *the bug itself* |
| `erroredUnsound === [id]` | ✅ | ✗ (empty) |

**Negative-controlled** (the control is itself controlled):

```
1. baseline                       -> 38 passed, EXIT 0            (GREEN)
2. revert to the broken tally     -> 1 failed | 37 passed
                                     AssertionError: expected +0 to be 1   (RED)
3. restore                        -> 38 passed                    (GREEN)
```

It now fails if anyone reinstates the old classification. The live pass alone never could.

## Route-back 2 — the disproven assertion survived 90 lines above

`evals/actionops-skeptic-calibration.test.ts:165-166` still asserted *"a broken critic can only hurt
TNR, never inflate TPR"* — the exact proposition Codex proved false and lesson L-4 retires. Doubly
wrong by then, since it also mis-described the current code.

**Correctly characterised by the gate:** Codex cited lines 251/285, not 166, so this was not a named
finding skipped. It is the **R-8 / L-3 pattern**: `grep "never inflate TPR"` returns **two** hits in
this file; one was rewritten, the other never triaged. L-3's own rule is that an untriaged hit is an
open finding. **Third recurrence of this class in the session.**

**Discharge:** rewritten to describe production behaviour (a broken critic must HOLD) and to record
the retired falsehood explicitly. The test's *name* and assertions were already correct and are
unchanged.

## Route-back 3 — dead evidence citations

`lib/agents/actionops/skeptic.ts:107` pointed at `14-truncation-positive-control.log` (log 14 is the
*calibration* log — a reader lands on the wrong evidence) and `15-trunc-diag.log` (never existed).
Caused by renumbering the logs after writing the comment. Lesson S2: *a narrative that cites a source
must survive the reader following the link.*

**Discharge:** corrected to `15-truncation-positive-control.log`, `16-starved-call-error-taxonomy.log`,
`19-production-budget-usage.log` — and, per L-3, a **class-check** rather than a spot-fix: every
`gates/live-repair-2026-07-27/NN-*.log` citation across `lib/`, `evals/`, `docs/` was resolved
against the filesystem. All 4 now resolve.

## Route-back 4 — "8-13× headroom" was an extrapolation

Both data points (out=91 @ budget 120, out=144 @ budget 400) came from budgets **below** production
(1,200), and output is visibly budget-sensitive across them. The one production-budget run (log 15)
did not capture usage. So the headroom was **inferred, not measured** — in four places.

**Discharge — measured at the operating point** (`19-production-budget-usage.log`):

```
sample 0: budget=1200 in=1373 out=89 finish=stop
sample 1: budget=1200 in=1373 out=85 finish=stop
sample 2: budget=1200 in=1373 out=94 finish=stop
worst observed 94 -> ~12.8x headroom
```

**And the extrapolation could have gone the wrong way:** output is *not* monotonic in the budget
(144 at a 400-budget vs 94 at 1,200). Corrected in all four places (`skeptic.ts`, `HANDOFF.md`,
`CODEX-FINDINGS-DISPOSITION.md`, lesson L-5, which now carries the self-correction as its third beat).

---

## Advisories — accepted, not separately fixed

- **`usage: undefined` in log 15** is a harness artifact: the smoke printed `SkepticVerdict`, which
  carries no usage field (usage lives on `agentRun.usage`). Corroborated by log 16 showing usage
  flowing and log 18 showing non-zero cost. Log 19 now captures usage directly, which settles it.
- **Log 18 provenance** — the gate correctly noted that postdating the round-3 changes is
  *consistent with* timestamps but not proven by content. Recorded as such rather than asserted.
- **Harnesses live in the scratchpad**, so the positive controls are not re-runnable by others.
  Committing them as gated tests is a genuine improvement; recorded, not done here.
- **Log 13 exposes local `~/.codex/skills/` paths** — pre-push privacy tidy, noted.
- **Code-slop score (gate 5)** not run — advisory-only by definition; recorded as not run rather
  than implied.

## The pattern worth naming

Four gate rounds, and the same class recurred every time: **a claim broader than its evidence.**
Model-id grep → missed the family-name claim. Fixed the tally → measured on a run that could not
discriminate. Cut the token consumption → quoted headroom from the wrong budget. Each correction was
right; each was stated wider than what had actually been observed. The instrument that caught it
every time was an **independent reader with no stake in the claim** — which is the argument for the
gate chain, not against it.

## State

`npm run verify` after all round-4 changes: see `20-verify-ROUND4-exit0.log`.
