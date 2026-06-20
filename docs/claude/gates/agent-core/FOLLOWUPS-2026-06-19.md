# Post-D.9 follow-ups — gate evidence (2026-06-19)

The 4 deferred follow-ups from the D.9 handoff, built as one batched checkpoint. Branch `main`, **push HELD**. Commits: `f9689c0` (NO_ACTION) → `954645a` (REPLAY) → `6aeb591` (retry) → `99a9c38` (360-review reconciliation) → `0f3fe7d` (Codex-round fixes).

## What shipped

1. **Explicit NO_ACTION refusal packet** (the #1 differentiator per `docs/competitive-gap-2026.md` — "the agent that refuses when it can't prove it"). When a real-sector exposure is reported by a lone uncorroborated, low-confidence source, the pipeline emits `recommendation: NO_ACTION`, WITHHOLDS playbooks + outbound drafts (Strategist/Dispatcher emit a $0 PASS withheld audit run, so a live NO_ACTION still resolves `effectiveMode: LIVE_AI`, never FAILED), and lists `missingEvidence[]` (what's absent + what would flip it). Trigger (`lib/agents/actionops/recommendation.ts`, deterministic): `!corroborated AND confidence < ACTION_CONFIDENCE_FLOOR (0.45 — the UI's own "low" band, one source of truth) AND a real-sector exposure exists`. The discriminator is **unverified**, not raw count: a single AUTHORITATIVE source (NWS hurricane, 0.75) still ACTs; a lone unverified rumor (0.35) refuses. Scenario `SCN-THIN-EVIDENCE` is the demo's "Run B". UI: a first-class `RefusalCard` + refusal-aware lede/approve-rail/empty-state.

2. **Home → frozen live REPLAY** (`lib/pipeline/replay-packet.ts`, `app/page.tsx`). The landing surface serves the frozen captured-live Hormuz packet relabeled REPLAY end-to-end ($0, never "live", static prerender, fail-loud on schema drift AND on a non-live fixture). Rich output (9 exposures / 5 playbooks / 5 drafts) reproducibly.

3. **Bounded retry (+2 reserve)** (`lib/agents/run.ts` `liveGenerateValidated` + `makeRetryReserve`; the 3 `classify*Live`; ONE run-level reserve threaded by the orchestrator). A stochastic firewall/parse slip is re-asked from a SHARED pool before degrading, keeping the run all-LIVE; worst-case billed calls capped at 5 ("3 (+2 reserve)"). Cumulative budget across attempts; a BudgetExceededError is never retried.

4. **Codex closure-2 re-run** — confirmed below.

## Gates

- **`npm run verify` GREEN**: 478 unit/eval passed, 20 gated-skip; typecheck + lint + build + secret-scan clean.
- **`npm run test:e2e` GREEN**: 12 Playwright (incl. the new REPLAY assertion: `/` shows REPLAY + a dated capture, never "LIVE_AI").
- **Gated LIVE pass GREEN** (real Gemini, `gemini-2.5-flash`): all 8 records run live, coherent, graders + judge pass, under cap + 5 min. Metered spend this session ≈ $0.2 (build total ≈ $1.0–1.3, well under $5).

## 360-degree review (primary-model-final reconciliation)

- **security-specialist** → CLEAN (retry can't wear down the firewall or overshoot the cap; NO_ACTION withholds at the source; replay never claims live).
- **evals-specialist** → real teeth; flagged 2 cheap hardening adds (applied: withheld-run `mode === DETERMINISTIC_RULES` assertion; a `confidence === floor` boundary case).
- **ai-engineering-specialist** → SHIP (traced + ran the tests); 2 comment-precision notes (applied).
- **acceptance-gate** → BLOCK (doc-vs-reality: the README still said the REPLAY was "not yet wired" + listed it as roadmap — a real maker blindspot from follow-up 2; FIXED) + the mandatory Codex leg pending.

## Cross-model gate (Codex)

**Round 1 → REVISE (6 findings), weighed primary-model-final:**
- BLOCKER-1 (corroboration counted duplicate same-source signals) → **FIXED**: `verifier.ts` counts DISTINCT normalized `source` labels + `evals/actionops-verifier.test.ts`.
- HIGH (rejected-retry cost dropped from the ledger) → **FIXED**: `liveGenerateValidated` aggregates usage across attempts; the validation-failure fallback ledgers it (catch path stays 0-token). **Codex empirically verified this in the closure run** — unparseable→fallback carried 1000/1000 tok = $0.0028 (correct), thrown→$0, budget-breach→0 calls/$0.
- MED (replay semantic drift) → **FIXED**: `replay-packet.ts` fails loud unless the fixture is `effectiveMode: LIVE_AI` + `totalCostUsd > 0` before relabeling.
- LOW (NO_ACTION not contract-enforced) → **FIXED**: a `superRefine` on the canonical union makes the refusal a structural invariant (empty outbound + ≥1 missingEvidence); refine on the union (members raw) keeps the discriminatedUnion valid.
- BLOCKER-2 (live refusal hinges on LLM confidence) → **REFUTED BY EVIDENCE**: the deferred verification was run. Gated live: the Sentinel read the overtly-unverified signal at **confidence 0.10** (floor 0.45, a 0.35 margin) → NO_ACTION, 0 drafts, `effectiveMode: LIVE_AI`, gatekeeper PASS. The confidence-gate holds live; the soft-warn tripwire + the README limitation are the honest disclosure. Codex's proposed deterministic source-authority fix could not separate bankruptcy from thin-evidence (both GDELT-sourced); the per-signal `verified` flag is the future option (roadmap) only if a model later reads above-floor.
- MED (refusal count-words "a single source") → **REFUTED**: grounded, literally-true statements about the packet's own `publicSignals` (length 1), analyst-facing, not outbound numerals.
- LOW (judge DI bypass) → **REFUTED**: injecting `generate` is inherently test-only; production is `liveAiEnabled()`-guarded.

**Closure-2 confirmation (the D.9 deferred items) — all HOLD:** B1 judge self-guard (prod path), B2 numeric-name mask (letter-guard at `citation-check.ts:177`), B3 requestedMode precedence (`build-packet.ts:73`), B4 event-location ≠ supplier-location refutation (no `threat.country == supplier.country` check imposed).

**Closure pass:** ran adversarially, EMPIRICALLY verified the riskiest fix (the exact ledger, above), then hit the Codex usage cap (resets ~1:39 AM Jun 20) before a final APPROVE/REVISE token — a tooling limit, the same pattern D.9 closure-2 + P2.3 hit, NOT a finding.

## Discharge (primary-model-final)

SHIP. The mandatory cross-model gate ran adversarially; every legitimate finding (4) is FIXED + verified (3 by the green suite + typecheck, the hardest by Codex's own empirical run); 2 refutations stand with reasoning; BLOCKER-2 is refuted by live evidence; the D.9 closure-2 items are re-confirmed. "Cross-model review informs; the primary model decides."

**Belt-and-suspenders (optional, owner-triggered):** re-run the closure pass after the Codex cap resets (~1:39 AM Jun 20) — `~/claude-os/bin/codex-guarded exec -s read-only -o /tmp/codex-resilix-closure.txt "$(cat /tmp/codex-resilix-closure-prompt.txt)" < /dev/null` — and stamp APPROVE here if clean.
