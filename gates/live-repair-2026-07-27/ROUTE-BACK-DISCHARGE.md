# Route-back discharge — acceptance-gate BLOCK on `6104159` (2026-07-27)

The gate returned **BLOCK** with two route-backs at stage = execution, plus advisories. Both are
discharged below. The gate's finding was correct and material — it caught **R-8 recurring inside
the very commit that cites R-8** (class-grep run, but not acted on to completion).

---

## Route-back 1 — three stale documents of record

**Gate's finding:** the deviation was disclosed in four places, none of which was the decision
record it deviates from; and the document that defines this gate's bar still described a
decommissioned model.

| Document | State | Action |
|---|---|---|
| `docs/adr/0002-same-family-llm-judge.md` | named llama-4-scout as default + claimed "maximum independence" from the GPT/Codex gate | **AMENDED** — new `## Amendment (2026-07-27)` section: forced model change, re-calibration, and the family-overlap deviation written into the ADR itself |
| `docs/Success_Criteria.md:3` | cited llama-4-scout @ TPR 100% / TNR 100% / kappa 1.000 | **AMENDED** — superseded with the re-measured figures + an explicit "this is measurably weaker" sentence |
| `docs/architecture.md:77` | same stale judge claim | **AMENDED** |

**Beyond what the gate named** (completing the sweep this time):

| Hit | Verdict |
|---|---|
| `docs/architecture.md:81` — "default `gemini-2.5-flash` (GA)" | **FIXED** → `gemini-3.5-flash` + both preflights documented. *The gate did not catch this one; it is the same staleness class, found by widening the grep.* |
| `evals/judge-calibration.test.ts:19` — comment stating the 2026-06-22 llama-4-scout numbers as current | **FIXED** — superseded in place. *This is precisely R-8's "I skipped it as just a comment" trap.* |

### Full R-8 triage — every remaining grep hit, explicitly dispositioned

`grep -rn "llama-4-scout"` + `grep -rn "gemini-2\.5-flash"` across all tracked `.md`/`.ts`/`.tsx`/`.mjs`:

| Location | Disposition |
|---|---|
| `lib/agents/pricing.ts:53` | **N-A, deliberate** — the price row is retained so historical recorded runs still price correctly (same convention as the retained gemini-2.5 rows). `costUsd()` throws on unknown ids, so removing it would break replay of past ledgers. |
| `lib/agents/cross-family.ts:22`, `lib/agents/actionops/skeptic.ts:95`, `lib/evals/judge.ts:59-60`, `scripts/preflight-groq.mjs:6,50`, `evals/cross-family-preflight.test.ts:86,89`, `evals/*-calibration.test.ts` (spacing comments) | **N-A, intentional** — these deliberately *name the retired model to explain the change*. `cross-family-preflight.test.ts:89` asserts the retired id is NOT the default, so the reference is load-bearing. |
| `PLAN-REVIEW-LOG.md:140`, `tasks/todo.md:224/292-296/329`, `docs/claude/PLAN-SHOWCASE-2026-07-06.md:392` | **N-A, historical record** — dated audit-trail entries describing what was true then. Editing them would falsify the history. `PLAN-SHOWCASE:392` describes a *recorded fixture* genuinely produced by llama-4-scout — still true. |
| `docs/claude/ASSESSMENT-2026-07-27.md`, `tasks/lessons.md:54` | **N-A** — correctly describe the retirement / are the R-8 lesson itself. |
| `README.md:98` | **N-A — already correct** (`gemini-3.5-flash` default, with the 2.5 deprecation note). |

---

## Route-back 2 — the judge disclosure gap

**Gate's finding:** the shared constant moved `lib/evals/judge.ts` to `openai/gpt-oss-120b` too;
only the token-budget consequence was disclosed, not the model change or the now-stale calibration.
ADR-0002 records gpt-oss-120b as the **weaker, previously-rejected** judge candidate.

**Closed by MEASUREMENT** (the gate's preferred option), not by disclosure alone.

Measuring first surfaced a **second live defect the gate had not seen**: the judge harness fires all
18 held-out items **back-to-back with no spacing at all**, and `judge.ts` used the same unmeasured
4,000 default. Reservation would have been 779 + 4,000 = 4,779 of an 8,000 TPM window — roughly one
call per minute — so the run would have drowned in 429s and tripped the EV-09 error-rate bar. **L-2
applied to the judge as well as the Skeptic.**

Fixes: `JUDGE_MAX_OUTPUT_TOKENS = 1_200` (measured: input 779, output 165-252 — log 10), and
TPM-derived 15s spacing in the harness.

**Result — `08-judge-calibration-AFTER-gpt-oss-120b.log`, exit 0:**

```
G-5 JUDGE CALIBRATION (openai/gpt-oss-120b, held-out test split)
TPR (catches unsupported): 100.0%  (9/9)
TNR (passes grounded):      88.9%  (8/9)
kappa (chance-corrected):   0.889
errors (excluded from rates): 0/18
misses: FP S8 — judge FLAGGED grounded prose
```

Above all enforced bars (0.83 / 0.83 / 0.60) and `errors 0/18` confirms the spacing fix. This is an
**exact reproduction** of the gpt-oss-120b figures ADR-0002 recorded five weeks earlier — independent
corroboration of both measurements.

**Stated without softening:** the judge is measurably weaker than the retired llama-4-scout
(100% / 1.000). The regression is **forced by the provider**, not chosen — only gpt-oss models
support Groq `json_schema` on this key, which the judge requires. It is now recorded in the ADR,
Success_Criteria, architecture.md, the code, and the lessons.

**On decoupling** (gate suggestion): NOT done, deliberately. Single-sourcing prevents judge/Skeptic
*drift*, which is the worse failure mode; the real defect was that the coupling was undocumented.
It is now an explicit `⚠ CALIBRATION COUPLING` block in `judge.ts` naming the cost — one repoint
invalidates two calibrations, so both must be re-measured. `JUDGE_MODEL` pins the judge
independently if they ever need to diverge. **Flagged as an owner-level architecture call.**

---

## Advisories

| Advisory | Response |
|---|---|
| Negative control missing for the 5 new guard tests | **DONE** — `09-negative-control-and-preflight-exits.log`: mutate script default → `EXIT_MUTATED=1` (1 failed/4 passed); revert → `EXIT_REVERTED=0` (5 passed). Exit codes captured directly, per R-4. |
| `preflight:groq` exit code uncovered by any log; "15 models" claim unevidenced | **DONE** — same log: `EXIT_PREFLIGHT_GROQ=0`, `EXIT_PREFLIGHT_MODELS=0`, with the model listing. |
| `Requested 1752/1760` anomaly vs the stated reservation model | **HEDGED, not hand-waved** — `skeptic.ts` now scopes the claim: exact on the responses reporting the large figure, underived on the smaller ones, and the fix *direction* rests on the behavioural red→green, not on the mechanism. |
| `preflight:groq` is manual-only — half-closes its own root cause (L-1 contributing cause #4) | **DISCLOSED, not fixed.** Correct catch. Wiring it into `verify` would violate the project's own P3.2 rule (no network smoke in the deterministic gate chain); CI needs a `GROQ_API_KEY` secret, which is an **owner action**. Recorded in the known-open list + owner queue. |

---

## Evidence added this round

| File | Claim |
|---|---|
| `08-judge-calibration-AFTER-gpt-oss-120b.log` | judge TPR 100% / TNR 88.9% / kappa 0.889 / errors 0/18, exit 0 |
| `09-negative-control-and-preflight-exits.log` | guard tests RED when mutated, GREEN when reverted; both preflights exit 0 |
| `10-judge-token-sizing.log` | judge usage in=779, out=165-252 → the basis for 1,200 |

## Still owed (unchanged)

**Codex cross-model gate** — an owner action, recorded as owed, not skipped. The gate wrote a
verbatim handoff prompt; it now additionally needs to cover the judge changes in this round.
