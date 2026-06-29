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
over-trigger / misclassification / thin-low-confidence case.

## CODEX CROSS-MODEL CLOSURE (2026-06-27) — VERDICT REVISE → resolved; the moat HELD
Codex (read-only) reviewed the fix diff `9aabf9d`. It **explicitly cleared** the load-bearing wiring:
`ENABLE_SKEPTIC` is default-on / explicit opt-out / AND-gated with `groqAvailable()`; authoritative-binding
intact (the sanitized reason lives only in the run record; the gate is a boolean + templated missing-evidence).
Three findings on EVAL RIGOR, disposed primary-model-final (refute-with-evidence / fix-what-holds):
- **F1 [Med] gray band untested / "auto-accepts above ~0.5".** PARTLY held. A fresh boundary probe
  (single-source 0.60 / 0.68 / 0.75) shows the Skeptic ACCEPTS them (boundary ~0.55–0.60), so the premise of
  an *unsafe* auto-accept is wrong — this is exactly `decideRecommendation`'s existing 0.45-floor policy, and
  the Skeptic aligning to it (not re-litigating the confidence axis) IS the fix. Adopted the coverage point:
  added **S9** (single-source, uncorroborated, 0.70 → ACCEPT) to document + lock the gray band.
- **F2 [Med] one false-accept still passes at TPR 5/6.** HELD — valid, and the same hole the mid-build U6
  regression exposed. **Fixed:** the gate is now ASYMMETRIC — the UNSOUND side has ZERO tolerance (`fn === 0`;
  EACH unsound control must individually reject), the SOUND side keeps the aggregate `TNR >= 0.8` (a rare
  stochastic sound-reject is safe-direction).
- **F3 [Low] U4 misclassification confounded.** HELD — and a probe confirmed the Skeptic ACCEPTS a *pure*
  misclassification (incoherent type but corroborated + a real sector). That is correct **by design**: pure
  structural misclassification is caught UPSTREAM by Atlas's deterministic Sentinel→Atlas firewall, not the
  Skeptic (whose residual mandate is over-trigger / geo-disagreement / thin-low-confidence). U4 recommented to
  say what it actually tests; the upstream ownership documented.

Re-measured after the closure: **TPR 100% (6/6, each unsound individually rejected) AND TNR 100% (9/9, incl.
the gray-band S9)**; `npm run verify` GREEN. The differentiator is restored, the unsound side now has per-case
teeth, and the gray band + misclassification ownership are documented. **Fully cross-model gated.**

---

## ⚠️ 2026-06-28 — LIVE finding: the calibrated Skeptic STILL false-vetoes the REAL flagship Hormuz finding (loop-promotion BLOCKER)

Owner authorized the Gemini + Groq keys ("safe to use") and asked to complete loop promotion + live calibration. Running the live loop smoke surfaced a significant, reproducible finding — the calibration above passes but **does not generalize to the real Hormuz finding the production path feeds the Skeptic**.

**Measured, first-hand (RUN_LIVE_AI_TESTS, ~$0.02 total spend):**
- **Live loop on SCN-HORMUZ → `NO_ACTION`, 3/3 runs** (consistent, not flaky). The strengthened (G) promotion gate (`evals/actionops-investigator.test.ts`) fails live with the Skeptic on.
- **Attributed precisely** (diagnostic dump): `confidence 0.9`, `exposureCount 9`, `actionableExposure true`, `CHOKEPOINT_CLOSURE/HIGH` → `decideRecommendation` would **ACT** (it refuses only at confidence < 0.45). The NO_ACTION comes from **`applySkepticGate`**: `missingEvidence = "Independent adversarial review"` + Skeptic run summary `"Rejected: the cross-family critic could not stand behind acting on this finding -- holding."` → **the live cross-family Skeptic FALSE-VETOES a sound, corroborated, high-confidence finding.**
- **NOT loop-specific:** the live WATERFALL (loop OFF, Skeptic ON) on Hormuz ALSO returns `NO_ACTION` with the same Skeptic reject. `challengeFindingLive` is shared, so **any live run refuses the flagship.**
- **The loop itself is sound:** with `ENABLE_SKEPTIC=false` the live loop **ACTs + meets the documented promotion criterion (composite ≥ baseline, no safety regression, ≤ $5), 3/3.** Cost ≈ $0.0021/run. So the loop is promotable once the Skeptic over-veto is resolved.
- **Skeptic labelled calibration re-confirmed live (Groq): still passes** (3/3 gated tests) — which is exactly the gap: **the labelled set's "sound" cases do not reproduce the real Hormuz finding shape**, so a 100% TPR/TNR on it did NOT predict the real-finding false-veto. (Perfect-on-the-set is necessary, not sufficient — the lesson the prior caveat flagged, now demonstrated.)

**Impact:** the live cross-family Skeptic breaks the flagship's ACT on every live run — the "war-room refuses a confirmed chokepoint closure" failure mode, now confirmed with the ACTUAL finding (not a boundary probe). **Loop promotion is BLOCKED** by the comparator's own rule (ACT must produce; a NO_ACTION on the flagship is a safety regression). Promotion HELD; `ENABLE_AGENT_LOOP` NOT flipped.

**OWNER DECISION OWED (the same 6/26 A/B/C/D, now with hard evidence; the chosen "scope the gate + ENABLE_SKEPTIC flag" did NOT hold on the real finding):**
- **(C) RECOMMENDED — scope the Skeptic gate** so it ANNOTATES/flags but cannot HARD-veto a finding that is corroborated AND high-confidence (≥ floor) AND has real-sector exposure; reserve the hard NO_ACTION veto for genuine over-trigger / thin-low-confidence / geo-disagreement. Preserves the critic, fixes the flagship, matches the 6/26 lean. **Needs its own gated build + live re-calibration against the real finding (not just the labelled set)** — a safety-component semantic change, maker≠judge, not a session-end bolt-on.
- **(B) stopgap — `ENABLE_SKEPTIC=false`** ships the loop visibly ACTing today but DROPS the live adversarial critic (a deliberate rework feature). Reversible flag.
- (D) accept the refusal + soften the "single authoritative source acts" claim (degrades the war-room value).

No production logic changed this session (maker≠judge + an owner-gated design call). Working-tree change = the strengthened (G) live promotion gate (RUN_LIVE-gated, so `verify` is unaffected; it correctly FAILS live with the Skeptic on, encoding the blocker) + this finding.

---

## ✅ 2026-06-28 (later) — (C) RESOLUTION: scope-the-gate BUILT + LIVE-CONFIRMED across spaced runs

Owner picked **(C)** (via AskUserQuestion). Built in PURE CODE and live-confirmed; the flagship false-veto is fixed on the production-active path.

**THE FIX (pure code, not an LLM-emitted category — advisor-reconciled):** `applySkepticGate(base, verdict, strength)` now takes a deterministic `findingStrength(verifierChecks, confidence, exposureResults) = {corroborated, confidence, hasActionableExposure}`. A live REJECT is **DOWNGRADED to `ANNOTATED`** (the ACT stands, NO `SKEPTIC_HOLD_EVIDENCE`) when the finding `isStrong` (`corroborated && confidence >= ACTION_CONFIDENCE_FLOOR && hasActionableExposure` — EXACTLY `decideRecommendation`'s ACT-worthy shape); otherwise (non-strong over-trigger/thin, OR a BROKEN/errored critic) it **hard-`VETOED`s** (NO_ACTION). `ACCEPT` → `ACCEPTED` (decision untouched). The gate keys ONLY off booleans/numbers (authoritative-binding); the critic's prose lives only in the RUN-SKEPTIC audit run, never bound.
- **Why pure code, not the critic's stated category** (supersedes the earlier turnkey "emit a reason CATEGORY" plan): routing the veto through an LLM-emitted category puts model judgment back in the EXACT path that false-vetoed the flagship — a model that mislabels a sound finding "misclassification" would re-break it. Keying off deterministic strength makes the downgrade independent of HOW the critic phrased its objection; the atomic human approval is the backstop for a genuinely incoherent strong finding.
- **A SECOND bug caught by the live re-cal** ([[calibration-set-vs-real-finding]]): an initial draft also hard-vetoed when `geoAgrees === false`. But the Verifier's `geoAgrees = location.country != null && some(source.country === threatCountry)` is **STRUCTURALLY false for a CHOKEPOINT event** (Hormuz has no country — only region + chokepoint), i.e. "geo UNCONFIRMED", not "disagrees". That clause re-broke the exact flagship (live waterfall returned NO_ACTION / `VETOED`). **FIX (advisor-reconciled, Option 1): geo dropped ENTIRELY from `FindingStrength` + the gate** — it vetoed ZERO unsound cases (all are already non-strong via corroboration/exposure), so it was pure downside. A regression-guard test asserts geo is not a strength field and a strong finding ANNOTATES even when geo is "unconfirmed".
- **New `skepticGateOutcome` enum** (`ACCEPTED|ANNOTATED|VETOED`) on `DecisionPacketV2Schema` (additive-optional, back-compat). Set in CODE at BOTH call sites (`index.ts` waterfall + `investigator.ts` loop) and ONLY when a genuine cross-family Skeptic ran (`model` present and `!== "deterministic-rules"`) → a key-OFF deterministic packet is byte-identical to before (flag-off no-op + parity moat hold; full suite confirms). Threaded `ActionOpsResult` → `build-packet.ts` → packet.
- **UI** (`action-packet-view.tsx`): a 4th `"annotated"` trust-line state with honest caution copy ("raised a caution… action proceeds on its independent corroboration and confidence… requires your approval") — NEVER the positive "and it held" seal (which would overclaim the critic endorsed it).

**DURABLE coverage (no spend, every `verify`):**
- `actionops-skeptic.test.ts` — the gate unit (ACCEPT→ACCEPTED; REJECT on strong→ANNOTATED/ACT + drafts; REJECT on non-strong/thin→VETOED/NO_ACTION; broken critic→always VETOED; geo-not-a-strength regression guard) + the end-to-end WATERFALL test (`buildDecisionPacket` + injected live REJECT on Hormuz → ANNOTATED/ACT, drafts produced, no hold-evidence, Skeptic run LIVE_AI).
- `actionops-skeptic-calibration.test.ts` — the (C) regression TEETH: for every labelled shape, a forced REJECT yields ANNOTATED iff strong else VETOED; **S10** = the EXACT no-country flagship shape the live Skeptic false-vetoed → ANNOTATED/ACT.
- `actionops-investigator.test.ts` (B2) — the loop completion-run REJECT on strong Hormuz → ANNOTATED/ACT.
- `actionops-packet-view.test.tsx` — the ANNOTATED trust line renders as a CAUTION, never the "it held" clear.

**LIVE RE-CALIBRATION (this session, multi-run spaced, ~$0.05 total, keys owner-authorized in `.env`):**
- **Raw cross-family Skeptic** (`actionops-skeptic-calibration.test.ts`, Groq free tier, 3 runs incl. S10): **TPR 100% (6/6 — every unsound rejected), TNR 90% (9/10 — one stochastic sound-reject, safe-direction), `fn === 0`.** Clears the asymmetric bar across all runs.
- **Production-active WATERFALL** (new durable gate in `actionops-live-real.test.ts`, loop-OFF, REAL cross-family Skeptic, 3 spaced runs): every run **`recommendation=ACT`, `skepticGateOutcome=ANNOTATED`, Skeptic `LIVE_AI`, never VETOED**, strong finding each (confidence 0.90–1.00, 9 exposures). The live critic REJECTED each time (geoAgrees=false misleads it) and the strength-aware gate correctly downgraded — the (C) fix working on the path users hit today (loop ships dark, so the waterfall is the active path).
- **Loop (G) promotion gate** (`actionops-investigator.test.ts`, ENABLE_AGENT_LOOP + ENABLE_LIVE_AI), **3 spaced runs:** every run **`recommendation=ACT`, `skepticGateOutcome !== VETOED`, composite 1.000, `promote=true`, `safetyRegressions=[]`,** cost $0.0073–0.0087 (≤ $5 cap). The loop is now promotable (the prior blocker is resolved).
- Over-trigger (`SCN-ZERO-EXPOSURE`) + thin (`SCN-THIN-EVIDENCE`) → NO_ACTION remain covered DETERMINISTICALLY key-off (refusal-regression + the gate units); no live spend needed.

**STATE:** typecheck clean · `npm run verify:full` GREEN first-hand (**711 passed / 27 skipped** unit + 21 e2e + build + secrets, exit 0; the +1 skip vs prior is the new gated live-waterfall test).

**OWNER FLAG (in-scope-as-designed):** the flagship shows a PERMANENT "reviewer raised a caution" annotation, because the live Skeptic is itself misled by the same `geoAgrees=false` and keeps REJECTING. (C) explicitly accepts the annotate outcome (ACT + human approval). A future "cleared/ACCEPTED" read needs the geo signal FED TO the Skeptic improved (distinguish "unconfirmed" from a real geo conflict) — a separate, evidenced verifier change.

**PROMOTION (separate, OWNER-GATED):** flipping `ENABLE_AGENT_LOOP` default-on is a default-behavior change reserved for the owner. The (C) pick unblocked it (loop now ACTs + promotes live); the flip itself is held for an explicit owner go — a reversible one-liner once approved.

## CODEX CROSS-MODEL CLOSURE (2026-06-28, on the (C) diff) — VERDICT REVISE → 3 ADOPTED + 1 DEFERRED; the moat HELD
Codex (gpt-5.5, high reasoning, read-only) reviewed the (C) working-tree diff. (It first hit its usage cap mid-session; re-run after the reset.) 4 findings, disposed primary-model-final (refute/defer what's grounded, fix what holds):
- **[P1] #1 `applySkepticGate` checked `accepted` before `errored`** — a contradictory `{accepted:true, errored:true}` would pass as ACCEPTED, violating fail-closed. **ADOPTED.** Unreachable in production (an errored HOLD is always `accepted:false`), but a SAFETY gate's fail-closed invariant must be structural, not incidental → reordered (`errored` first) + a regression test (`actionops-skeptic.test.ts`: the contradictory shape on a strong finding → VETOED).
- **[P1] #2 geo dropped entirely removes the veto for a true geo CONFLICT** (corroborated + high-conf + actionable + all sources in a different country would now ANNOTATE a reject instead of hard-vetoing). **DEFERRED with reason (primary-model-final).** Real precision gap, but: (a) ANNOTATED still requires human approval and surfaces the recorded critic objection — no auto-send (the outbox moat keeps outward actions human-gated); (b) the pre-(C) "veto" of this shape was a SYMPTOM of the over-broad veto (C) exists to remove; (c) the CORRECT fix is a Verifier `UNCONFIRMED`-vs-`CONFLICT` split (a deterministic-agent semantic change needing its own tests + live re-cal), and a gate-only approximation (`country != null && !geoAgrees`) would over-veto the "country named but sources carry no geo data" shape, untested — re-risking the exact area that bit twice. Tracked as the named follow-up (see FindingStrength comment + the OWNER FLAG above). The atomic human approval is the backstop until then.
- **[P2] #3 build-packet stamped `skepticGateOutcome: undefined` as an own key key-off** — survives Zod parse and would break strict round-trip / `Object.hasOwn` parity with pre-Skeptic fixtures. **ADOPTED.** Conditional spread → the field is truly ABSENT key-off (`Object.hasOwn` test added).
- **[P2] #4 UI/schema didn't enforce ANNOTATED⟺ACT consistency** — a malformed `NO_ACTION + ANNOTATED` packet would render "action proceeds". **ADOPTED.** A schema `superRefine` now REJECTS `ANNOTATED + !ACT` and `VETOED + !NO_ACTION` (ACCEPTED unconstrained), and the UI requires `recommendation === "ACT"` for the annotated caution (+ 2 schema-rejection tests).

Codex explicitly engaged the load-bearing invariants and did NOT break them: authoritative-binding (gate keys off booleans/numbers, never the critic's prose), the parity moat (#3 hardened it further), and fail-closed (#1 hardened it).

**CLOSURE PASS (Codex, gpt-5.5, on the FIXED diff): NO [P1] findings** — the three fixes confirmed functionally sound (errored-before-accepted at skeptic.ts; conditional spread at build-packet; schema reject + UI guard for the ANNOTATED/VETOED consistency), and the **#2 deferral confirmed "acceptable, not a ship blocker"** (ANNOTATED keeps human approval required + records the objection; a gate-only `geoAgrees=false` veto would over-veto the Hormuz "geo unconfirmed" shape; the right fix is the deferred Verifier UNCONFIRMED-vs-CONFLICT split). One new **[P2]: stale contract comments** (skeptic.ts + schemas.ts still described geo-coherence as a gate input) → **FIXED** (comments now state geo is not a strength/veto input).

Re-verified after all fixes: `npm run verify:full` GREEN first-hand (**715 passed / 27 skipped** unit + 21 e2e + build + secrets, exit 0). **The cross-model gate is DISCHARGED** (3 code fixes + 1 doc fix + 1 evidenced deferral, closure clean); the deferred geo-CONFLICT precision is a tracked, human-backstopped follow-up, not a ship blocker.

---

## ✅ 2026-06-29 — (A) VERIFIER `UNCONFIRMED`-vs-`CONFLICT` GEO SPLIT: closes Codex [P1] #2 + clears the flagship annotation

Owner picked "complete all other steps except design." (A) was the recommended next move: it closes the deferred [P1] #2 AND resolves the flagship's permanent "reviewer raised a caution" annotation — **one evidenced verifier change resolves both**, exactly as the prior OWNER FLAG predicted.

**THE FIX (a deterministic-agent semantic change):** the binary `geoAgrees: boolean` is replaced by a three-state `geo: GeoStatus` (`AGREES | UNCONFIRMED | CONFLICT`) computed in `verifier.ts`. The distinction the deferral named is now precise:
- **AGREES** — finding names a country AND ≥1 corroborating source is in it.
- **UNCONFIRMED** — no single country to match: the finding carries no country (a CHOKEPOINT spanning several states — the Hormuz flagship), OR the sources carry no geography. NEUTRAL, not a disagreement.
- **CONFLICT** — finding names a country, the sources DO carry geography, and NONE is that country: a real contradiction (likely misclassification). This is the ONLY adverse state.

A gate-only `country != null && !geoAgrees` approximation (the thing the deferral warned would over-veto) is avoided: CONFLICT requires the sources to actually carry a DIFFERENT country, never mere absence of a match.

**Two consumers fed the richer signal:**
1. **The Skeptic prompt** (`buildSkepticPrompt`) now names all three states explicitly: CONFLICT is an over-trigger/misclassification reject signal; **UNCONFIRMED is explicitly NEUTRAL** ("a chokepoint closure legitimately has no single country and is fully actionable — do NOT reject on UNCONFIRMED"). This is what stops the live critic being structurally misled by the chokepoint's empty geo.
2. **The gate** (`findingStrength`/`applySkepticGate`) regains a PRECISE geo veto: `FindingStrength.geoConflict = (geo === "CONFLICT")`, and `isStrong` now requires `!geoConflict`. So a critic REJECT on a genuine CONFLICT finding HARD-VETOES again (closing [P1] #2), while an UNCONFIRMED strong finding still ANNOTATES (the flagship is NOT re-broken). UNCONFIRMED plays no part in the veto — the precise distinction that bit twice is now structural.

**DURABLE coverage (no spend, every `verify`):**
- `actionops-skeptic.test.ts` — the old "geo is NOT a veto input" regression guard is **deliberately inverted** into TWO named guards (comment explains why the precise veto is safe where the broad one wasn't): "UNCONFIRMED is NOT a conflict → strong finding ANNOTATES" (the false-veto guard) + "CONFLICT IS a veto input → REJECT on otherwise-strong finding HARD-VETOES". `GEO_CONFLICT` fixture is identical to `STRONG` except `geoConflict` — the exact discriminator.
- `actionops-skeptic-calibration.test.ts` — `FindingSpec.geo` three-state; **new U7** = the genuine geo-CONFLICT unsound label (corroborated + high-conf + real exposure but wrong country); `isStrongSpec` carries `&& geo !== "CONFLICT"` in lockstep with `applySkepticGate`; S10 flagship relabeled `geo: "UNCONFIRMED"`. The deterministic teeth prove a forced REJECT on U7 VETOES while the same on S10 ANNOTATES.
- `actionops-verifier.test.ts`, `actionops-investigator.test.ts` (loop parity) — green under the new shape.

**LIVE RE-CALIBRATION (2026-06-29, keys owner-authorized in `.env`, ~$0.02 real Gemini; Groq Skeptic free):**
- **Raw cross-family Skeptic** (`actionops-skeptic-calibration.test.ts`, Groq free tier, incl. S10 + the new U7): **TPR 100% (7/7 — every unsound rejected, INCLUDING the genuine geo-CONFLICT U7), TNR 100% (10/10 — every sound accepted, INCLUDING the S10 flagship), `fn === 0`, zero misses.** TNR rose from 90%→100% and — the decisive datum — the flagship S10 is now ACCEPTED, not the tolerated sound-reject it was before.
- **Production-active WATERFALL** (`actionops-live-real.test.ts`, loop-OFF, REAL cross-family Skeptic, 3 spaced runs): every run **`recommendation=ACT`, `skepticGateOutcome=ACCEPTED`, Skeptic `LIVE_AI`**, confidence 0.90, 9 exposures, $0.0062–0.0077/run. **The real Hormuz packet now reads "cleared" (ACCEPTED), not ANNOTATED** — last session this same path was ANNOTATED every run because the live critic kept rejecting on the structurally-false geo. The flagship's permanent "caution" annotation is RESOLVED on the path users hit. (The durable test assertion stays robust — `ACT` + `!== VETOED` — because the critic is stochastic; ACCEPTED is the observed-and-recorded outcome, not a flaky hard-assert.)

**RESOLVES the prior OWNER FLAG:** the flagship no longer shows a permanent "reviewer raised a caution" — the live Skeptic, no longer misled by the chokepoint's empty geo, ACCEPTS the strong finding. **CLOSES Codex deferred [P1] #2:** a true geo CONFLICT can again hard-veto (proven by U7 TPR + the deterministic CONFLICT-vetoes teeth).

### CODEX CROSS-MODEL GATE on the (A) diff (gpt-5.5, read-only) — VERDICT REVISE → 2 ADOPTED + 1 PARTIAL; the moat HELD
(Codex hit its usage cap on the first attempt; re-run cleanly after the reset.) 3 findings, disposed primary-model-final:
- **[P1] #1 `CONFLICT` was not precise — source-country normalization.** The threat country is ISO (Sentinel validates via `CountryCodeSchema`), but a SOURCE signal's `location.country` is a LOOSE string (`PublicSignalSchema` = `z.string().optional()`; GDELT/NWS emit `"United States"` / `"Japan"`). The raw-string compare made a real US finding with US sources read as `CONFLICT` → a false-veto on a critic reject (the exact "re-broke a real finding" class, for country events). **ADOPTED.** New shared `lib/data/country-iso.ts` (`normalizeCountryToIso` + the `COUNTRY_NAME_TO_ISO` map, extracted from supplier-csv so ingest + the Verifier share ONE table). The Verifier now normalizes BOTH sides to ISO; only a source that resolves to a real ISO code counts as geography — a blank/unknown one is UNCONFIRMED, never a phantom CONFLICT. **+5 deterministic verifier geo tests** (full-name AGREES, real CONFLICT, AGREES-wins-on-any-match, blank/unknown→UNCONFIRMED, chokepoint→UNCONFIRMED). supplier-csv refactor verified behavior-identical (71 ingest/upload/injection tests green).
- **[P1] #2 a critic-ACCEPTED geo CONFLICT can still ACT** (`applySkepticGate` returns ACCEPTED before checking `geoConflict`; `decideRecommendation` ignores geo). Codex: either make CONFLICT a critic-INDEPENDENT deterministic veto, OR stop the docs/tests claiming U7 "must not act". **PARTIALLY ADOPTED (primary-model-final).** The scope (C)+(A) close is the DOWNGRADE gap — a critic REJECT on a CONFLICT now HARD-VETOES instead of annotating (that is precisely what [P1] #2 asked for, and the deterministic teeth prove it). A critic-INDEPENDENT deterministic veto is a real POLICY EXPANSION (it overrides both a critic ACCEPT and `decideRecommendation`) and is riskier the less precise CONFLICT is — so it is NOT flipped unilaterally; it is surfaced as an owner-gated hardening. The INCONSISTENCY Codex correctly flagged is FIXED: the U7 comment no longer claims "the system must NOT act on" — it states the honest boundary (CONFLICT vetoes a critic reject; a critic accept relies on the mandatory human approval, like any ACCEPTED finding; the live critic empirically REJECTS this shape — U7 is in the 100% TPR).
- **[P2] stale schema contract comment** (`schemas.ts` still said "geo is NOT a veto input — it was dropped from strength") — false + dangerous around a safety invariant. **ADOPTED** (now: geo IS a veto input, but ONLY a real CONFLICT; UNCONFIRMED never vetoes).

Codex confirmed the invariants held: fail-closed ordering (`errored` before `accepted`) correct; `ANNOTATED ⇒ ACT` still holds (`isStrong` implies `corroborated && confidence ≥ floor`); the gate does not bind `verdict.reason`.

**OWNER-GATED follow-up surfaced (Codex [P1] #2 residual):** make a precise geo CONFLICT a critic-INDEPENDENT deterministic veto (NO_ACTION regardless of the critic's accept), so a likely-misclassification never acts even if the critic and a human would. Defensible now that CONFLICT is normalized/precise; held as the owner's call (it overrides a critic accept + the deterministic ACT decision). Until then, the human-approval backstop + the empirically-rejecting live critic cover the rare critic-accepts-a-conflict path.

**CLOSURE PASS (Codex, gpt-5.5, resumed thread, on the FIXED diff): `VERDICT: APPROVED` — NO material findings.** Confirmed: the normalization is "sound for the scoped contract" (`normalizeCountryToIso` trims/ISO-validates/name-maps/`null`s blank+unknown; the Verifier normalizes both sides and only emits CONFLICT when both have a comparable country with no match; the +5 verifier tests cover the false-veto shape, true conflict, AGREES-precedence, blank/unknown→UNCONFIRMED, country-less chokepoint); the [P1] #2 inconsistency is "resolved as a policy boundary, not silently claimed as fixed" (U7 + the forced-accept test now aligned); and the invariants hold (errored-before-accepted, ANNOTATED⇒ACT via the unchanged-direction `isStrong`, schema comment correct). Re-verified after the fixes: **`npm run verify:full` GREEN first-hand — 723 passed / 27 skipped unit + 21 e2e + build + secrets, exit 0**, and the production-active waterfall re-confirmed **2/2 `ACT`+`ACCEPTED`+`LIVE_AI`** post-fix. **The (A) cross-model gate is DISCHARGED** (2 fixes adopted + 1 honest-boundary fix + a tracked owner-gated follow-up).

---

## (B) LOOP PROMOTION — `ENABLE_AGENT_LOOP` flipped default-ON (2026-06-29)

Owner-greenlit ("complete all other steps except design"). The (A) geo split satisfied the
precondition the handoff worried about (resolve the flagship caution BEFORE making the loop the
default — (A) *is* that Verifier UNCONFIRMED-vs-CONFLICT split, done), so the flip is authorized.

**The change (minimal):**
- `lib/server/env-flags.ts` — `agentLoopEnabled()` now mirrors `skepticGateEnabled()`'s **opt-out**:
  default-ON, `ENABLE_AGENT_LOOP=false` to run the deterministic waterfall. The waterfall stays the
  **byte-for-byte opt-out path** — the authoritative-binding/parity MOAT is unchanged (same moat,
  opposite default).
- `evals/actionops-live-pipeline.test.ts` — the D.9 WATERFALL wiring suite (exactly-3-Gemini-calls +
  cumulative-budget guard) now pins `ENABLE_AGENT_LOOP=false` in `beforeEach`, so it keeps exercising
  the waterfall path it was written for now that the loop is the default.
- Docs reconciled (no longer "ships dark / default-off"): `trajectory.ts`, `PHASE0-GRILL` (R6 condition
  met), `PHASE3-GATE` (dated status banner), `README` (live-orchestration bullet), `Success_Criteria`
  (per-run call count is now variable, bounded by the $5 cap), `actionops-live-real.test.ts` ((C) gate
  reworded as the waterfall opt-out coverage).

**BLAST RADIUS (empirically found, not just reasoned):** `verify:full` went RED on the first run after
the flip — the D.9 live-wiring suite routed to the loop under the new default (`tool()` unmocked). That
is the direct proof the default genuinely flipped to ON. Both consumers AND-gate on `&& live`
(`index.ts:87`, `investigator.ts:180`), so non-live runs stay waterfall; the fix was to pin the
waterfall-specific suite to the opt-out. No other test was affected (only one mocked-ai + live suite exists).

**VERIFICATION:**
- `npm run verify:full` GREEN first-hand after the flip+fix — typecheck + lint + **723 unit / 27
  skipped** + build (compiled) + secrets (clean) + **21 e2e** (e2e re-run standalone to clear a
  back-to-back webServer-boot timeout flake; 21/21).
- **Live (G) promotion gate, loop default-on, 2 spaced runs** (`RUN_LIVE_AI_TESTS=true ENABLE_LIVE_AI=true
  ENABLE_AGENT_LOOP=true … evals/actionops-investigator.test.ts`): **22/22 passed, 0 skipped** both runs
  — the RUN_LIVE-gated (G) test asserts, on a live loop packet: `recommendation=ACT`,
  `skepticGateOutcome !== VETOED`, an Investigator agent ran (the loop genuinely fired live),
  `safetyRegressions=[]`, `withinBudget=true`, `promote=true`. The geo fix (proven live only on the
  waterfall in (A)) is path-agnostic and now confirmed on the loop too. (vitest suppresses passing-test
  `console.log`, so the greppable `[loop-promotion-evidence]` line wasn't captured this run; the gate
  assertions above are the binding evidence. ACCEPTED-vs-ANNOTATED is an observation, not a gate.)

**CODEX CROSS-MODEL GATE on the (B) promotion diff — VERDICT PASS (no P1/P2 findings).** gpt-5-codex,
high effort, read-only, over `git diff HEAD`, aimed at the blast-radius (not the one-liner). Codex
independently confirmed the flip introduces no unsafe route: the loop branch still AND-gates on
`agentLoopEnabled() && live` (`index.ts:87`); the exported entry guard rejects non-orchestrated
production calls (`investigator.ts:180`); live AI configuration requires secure-mode auth on mutation
routes (`security.ts:46`); per-step budget hard-stops hold; a Gemini-only live deploy does NOT
accidentally call Groq (`skeptic.ts:326` short-circuits to the deterministic Skeptic with no key);
**non-live / key-off parity is preserved** (a `live:false` or no-key run makes `live` false, so
default-on alone can never enter the loop; `ENABLE_AGENT_LOOP=false` routes live runs back to the
unchanged waterfall); and the D.9 test pin preserves the exactly-3-Gemini-call waterfall coverage.
The intended change — a live deploy with a Gemini key now routes into the loop by default — is exactly
the promotion, with no fail-open. (Codex's read-only sandbox blocked vitest; the live execution was
run first-hand here: verify:full GREEN + the (G) gate 22/22 across 2 live runs.) **The (B) cross-model
gate is DISCHARGED.**
