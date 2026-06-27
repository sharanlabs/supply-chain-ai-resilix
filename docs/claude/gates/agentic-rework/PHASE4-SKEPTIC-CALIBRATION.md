# Phase 4 (cross-family Skeptic) — live TPR/TNR calibration

**2026-06-26, in-session (owner provided the Groq key: "groq key is already added").** Discharges the
gate-2 residual the HANDOFF flagged as the highest open correctness risk: the loop's live smoke returned
NO_ACTION on HORMUZ, "equally consistent with the live cross-family Skeptic OVER-REJECTING a corroborated
finding." This is the key-gated calibration that measures whether the Skeptic is trustworthy as a gate input.

Run: `RUN_LIVE_AI_TESTS=true node --env-file=.env node_modules/vitest/vitest.mjs run
evals/actionops-skeptic-calibration.test.ts` — the REAL cross-family Skeptic (Groq
`meta-llama/llama-4-scout-17b-16e-instruct`) over the 12 labelled findings (6 sound / 6 unsound). $0 (Groq
free tier). The Skeptic sees ONLY the structured finding (the production quarantine view).

## RESULT — robust across 3 spaced clean runs (PASS)

| Run | TPR (rejects unsound) | TNR (accepts sound) | Sole miss |
|-----|-----------------------|---------------------|-----------|
| Clean 1 | 100.0% (6/6) | 83.3% (5/6) | S3 |
| Clean 2 | 100.0% (6/6) | 83.3% (5/6) | S3 |
| Clean 3 | 100.0% (6/6) | 83.3% (5/6) | S3 |

Bar = TPR >= 80% AND TNR >= 80%. **Both clear, on every run.** The outcome is stable despite LLM
stochasticity: S3 is rejected every run with near-identical "single, uncorroborated source -> cautious"
reasoning; every other finding is classified correctly every run.

## The headline: the original concern is REFUTED for corroborated input
**S1 — the corroborated Hormuz flagship** (`CHOKEPOINT_CLOSURE`, Strait of Hormuz, confidence 0.82,
sourceCount 3, corroborated=true) — **is ACCEPTED on every run.** The live cross-family Skeptic does NOT
over-reject a corroborated Hormuz finding. So the loop-smoke NO_ACTION on Hormuz, if the live finding was
corroborated, did NOT come from the Skeptic. (The full per-gate attribution of that smoke run remains open
— see "What this does NOT resolve" below.)

## The one genuine, reproducible gap: S3 (single-but-authoritative over-rejection)
S3 = `SUPPLIER_BANKRUPTCY`, confidence 0.80, **sourceCount 1, corroborated=false** — the deliberate
"single AUTHORITATIVE source still acts" discriminator. The deterministic gate ACTs on it correctly
(`decideRecommendation`: `!corroborated && confidence<0.45 && exposure` is false because 0.80 >= 0.45).
The **live Skeptic over-rules that correct ACT** and HOLDs it as "thin evidence — uncorroborated single
source." Every run, consistently.

- **Direction: SAFE.** The error is toward NO_ACTION (refuse outbound supplier action / defer to a human),
  never toward a wrong action. TPR is 100% — the Skeptic never waves through an unsound finding.
- **Design-intent cost: REAL.** The design's stated differentiator is "unverified, not raw source count"
  — a single AUTHORITATIVE source (an official NWS hurricane warning, a confirmed bankruptcy filing) is
  meant to ACT. With the live Skeptic active, that class is over-held. `llama-4-scout` is not weighting the
  prompt's explicit "a single AUTHORITATIVE high-confidence source is sufficient" clause.
- **Scope: only when the Skeptic is LIVE.** Default deployment (no Groq key) runs `runSkeptic`'s
  affirmative pass — no override — so `decideRecommendation` governs and ACTs on S3 correctly. The
  over-rejection manifests only key-ON, i.e. exactly when the loop is promoted.
- **Fix path (per the test's own guidance):** sharpen the Skeptic prompt to honor the single-authoritative
  rule, OR `SKEPTIC_MODEL=<a stronger Groq model>` (e.g. llama-4-maverick / a larger model) and re-measure.

## Measurement note — the rate-limit confound (why the first "pass" then "fail")
The FIRST live run reported "3 passed"; an immediate SECOND run reported **TNR 50% FAIL** with S5/S6 as
`(error)`. That was NOT genuine model variance — it was Groq free-tier **TPM rate-limiting** from running
12-call passes back-to-back (~48K tokens inside one rolling 60s window). A thrown call fails CLOSED to a
HOLD, which counts as a false-reject and depressed TNR. **Spacing the runs ~85s apart eliminated it** — all
3 spaced runs are clean and error-free. Lesson: a single live-LLM run is a good-run snapshot; at N=6 the
80% bar has zero margin (5/6 passes, 4/6 fails), so one throttled call flips the verdict.
[[verify-claims-are-good-run-snapshots]]

## What this does NOT resolve (the residual, for honesty)
The calibration isolates the **Skeptic** on hand-labelled findings. It does NOT exercise the full live loop
(live Sentinel -> Verifier -> Atlas -> Simulator -> Skeptic -> decide) end-to-end on Hormuz. The loop-smoke
NO_ACTION is still unattributed at the per-gate level — it could be `decideRecommendation` firing on a live
Sentinel finding that came back uncorroborated/low-confidence on the smoke's replay signals (a CORRECT
governed refusal), not the Skeptic. Fully closing gate-2's "confirm the loop ACTs on a corroborated
flagship" needs a **loop smoke** (`ENABLE_AGENT_LOOP=true` + `GEMINI_API_KEY`, Gemini-billable) that traces
the live confidence, corroboration, AND the Skeptic verdict. That is a separate, owner-gated diagnostic.

## FOLLOW-UP PROBE (decisive) — the 83.3% "PASS" is a test-composition artifact
The calibration's labelled set has only ONE single-authoritative case (S3) among 6 sound findings (the
other 5 are corroborated), so a single deterministic miss still reads 5/6 = 83.3% PASS. A boundary probe
(`evals/_scratch-skeptic-probe.test.ts`, since removed) ran 7 single-source/uncorroborated findings across
the confidence range through the SAME live Skeptic:

| Finding (single source, corroborated=false) | confidence | Skeptic |
|---|---|---|
| NWS hurricane (NATURAL_DISASTER) | 0.90 | **REJECT** |
| Confirmed bankruptcy | 0.85 | **REJECT** |
| Chokepoint advisory | 0.88 | **REJECT** |
| Official recall | 0.80 | **REJECT** |
| Port disruption (mid-conf) | 0.55 | **REJECT** |
| Geopolitical conflict (low-conf) | 0.40 | **REJECT** |
| Hurricane, **corroborated=true** | 0.85 | **ACCEPT** |

**The live Skeptic rejects EVERY single-source finding regardless of confidence (0.40–0.90); it accepts
only when corroborated.** Confidence is effectively IGNORED — the gate collapses to "corroborated or not."
S3 was not an isolated miss; it is the visible tip of a categorical behavior. Measured with a realistic mix
of single-authoritative cases (which the design treats as a core actionable class), TNR would crater toward
0%. The 83.3% PASS is an artifact of probing that class exactly once.

## SCOPE — this is a LIVE-WATERFALL behavior, not only a loop-promotion one
`index.ts:140`: `runSkepticLive = live || deps.skeptic?.generate != null`. The live Skeptic runs in the
waterfall whenever `live` (Gemini live-AI) is on AND a Groq key is present (`skepticEnabled = groqAvailable`).
A Groq key has been in `.env` since 2026-06-22 (the judge); Phase 4 added the Skeptic 2026-06-26. **So any
live-AI run now flips single-authoritative findings (NWS hurricane, confirmed bankruptcy, official recall)
from the waterfall's correct ACT to NO_ACTION** — directly contradicting the design's stated differentiator
("unverified, not raw source count; a single AUTHORITATIVE source acts"). Bounded but real: SAFE-direction
(TPR 100% — never a wrong action), and the default/public demo is key-OFF (deterministic affirmative pass,
unaffected). It bites only on explicit live runs with both keys — and on loop promotion.

## Why the "fix" is a DESIGN decision, not a prompt tweak
`buildSkepticFinding` gives the model NO "authoritative" field — only `confidence` and `corroborated`.
"Authoritative" is proxied by `confidence`, and the probe shows the model ignores it. So "accept
single-authoritative" = "accept single-source-high-confidence," which risks also accepting
single-source-thin-evidence (a TPR regression — trading away the Skeptic's best property). And the Skeptic's
stance is defensible: requiring corroboration for irreversible outbound action is a coherent safety policy.
The real question is a design reconciliation, owner's call:
- **(A) Scope the gate** so the Skeptic does NOT re-litigate corroboration (that is `decideRecommendation`'s
  job, which already discriminates single-authoritative via the 0.45 confidence floor); keep the Skeptic for
  over-trigger / misclassification / multi-source-thin. Preserves the differentiator AND the Skeptic's value.
- **(B) Decouple Skeptic activation from the judge key** (explicit `ENABLE_SKEPTIC`, default OFF) so a live
  run does not silently over-reject just because a judge Groq key exists — restores correct-by-default.
- **(C) Accept corroboration-required** and soften/drop the "single-authoritative acts" claim (safe, but the
  war-room "feels useless when it refuses a confirmed NWS warning" failure mode — the advisor's caution).
- **(D) Step up `SKEPTIC_MODEL`** and re-measure (uncertain — the corroboration prior looked strong).

## Verdict (sharpened)
NOT "Skeptic passed, safe to promote." The honest read: **the Skeptic is SAFE (TPR 100% — never a wrong
action) but categorically over-refuses single-source findings, breaking the design's act-fast
differentiator whenever it is live.** The corroborated Hormuz flagship is accepted (the original narrow fear
is refuted), but the broader finding supersedes it. **Promotion (gate 3) is NOT justified until the
single-authoritative policy (A–D) is resolved**, and the live-waterfall coupling (B) is worth addressing
regardless of the loop. All are owner-gated design/code changes. Recommendation detail in the session HANDOFF.

## ✅ RESOLUTION (2026-06-27, owner granted FULL PERMISSION to complete end-to-end)
Implemented **A1 (prompt) + B (flag)** — the least-invasive fix that works; A2 (architectural drop of
corroboration from `SkepticFinding`) was NOT needed (it carried a calibration-relabel trap, and A1 cleared
the bar). Changes:
- **A1 — `skeptic.ts buildSkepticPrompt` rewrite:** explicitly reframe `confidence` as the AUTHORITATIVENESS
  signal (an official advisory / NWS warning / confirmed filing scores high); state "do NOT reject solely
  because `corroborated` is false; source COUNT is not the bar"; redefine THIN EVIDENCE to require ALL THREE
  (single AND uncorroborated AND confidence < ~0.5); make OVER-TRIGGER key decisively on an EMPTY
  `exposure.topSectors` REGARDLESS of corroboration (so a corroborated finding whose only exposure is
  off-taxonomy is still rejected); + a worked single-authoritative ACCEPT example.
- **B — `ENABLE_SKEPTIC` flag** (`env-flags.ts skepticGateEnabled`, default ON, explicit opt-OUT;
  `skepticEnabled = groqAvailable() && skepticGateEnabled()`): decouples gate activation from the shared
  judge Groq key, so configuring the judge does not silently add an outbound-action gate.
- **Test strengthened:** calibration `LABELED` += S7 (NWS hurricane) + S8 (confirmed recall) single-
  authoritative SOUND cases → THREE now (S3/S7/S8), fixing the "probed once" composition artifact; + 4s
  inter-call spacing to kill the Groq free-tier TPM rate-limit artifact.

**Re-measurement (the proof the fix works, not a claim):**
| Single-source finding | confidence | BEFORE | AFTER A1 |
|---|---|---|---|
| NWS hurricane / bankruptcy / chokepoint advisory / recall | 0.80–0.90 | REJECT | **ACCEPT** |
| Single source, low confidence | 0.40 | REJECT | **REJECT** (thin evidence preserved) |
| Corroborated | 0.85 | ACCEPT | **ACCEPT** |

Calibration on the strengthened 14-case set: **TPR 100% (6/6) AND TNR 100% (8/8)** — robust across repeat
spaced runs. The mid-iteration regression (U6 off-taxonomy over-trigger briefly accepted) was caught by
re-measuring and fixed by the EMPTY-`topSectors` clarification — both properties now hold. `npm run verify`
GREEN (662/26). The single-authoritative differentiator is restored AND the Skeptic still catches every
over-trigger / misclassification / thin-low-confidence case. **Now cross-model gated + committed (see git
log + the batched Codex closure for this diff).**
