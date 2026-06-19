# RESILIX — next-session handoff (post-D.9, 2026-06-19)

**D.9 is DONE + committed** (`d8d6348`, branch `main`, **push held**). The live-AI showcase runs end-to-end across all 6 scenarios; the cross-model gate is discharged (primary-model-final). Full record: `docs/claude/gates/agent-core/D9-2026-06-19.md`. This handoff is the 4 deferred follow-ups the owner wants done in a fresh session.

## The 4 tasks (in recommended order)

### 1. Explicit `NO_ACTION` refusal packet  ← highest value
The #1 differentiator per the competitive analysis (`docs/competitive-gap-2026.md` §3–4): the genre never refuses. Today refusal is PARTIAL (the zero-exposure control declines to invent matches; the mode taxonomy discloses degradation) — there is no explicit "NO_ACTION, here is exactly what evidence is missing" output.
- **Trigger:** when the Verifier's corroboration is insufficient (e.g. a single uncorroborated source, or a low source count/recency) — the Verifier already computes these signals (`lib/agents/actionops/verifier.ts`); add a refusal threshold.
- **Output:** a `NO_ACTION` decision-packet variant (or a packet-level `recommendation: NO_ACTION` + a `missingEvidence[]` list: what's absent + what would flip the decision). Render it as a first-class packet in the UI, not an error.
- **Eval:** a scenario/fixture with a thin/single-source signal → assert the pipeline emits NO_ACTION with the missing-evidence list (deterministic + a gated live leg). This is the demo's "Run B".
- Keep the contract honest: NO_ACTION must itself carry zero unsourced claims (the citation contract + numeral-free rules apply).

### 2. Home page → frozen live `REPLAY`
Today `app/page.tsx` renders the DETERMINISTIC packet (plain drafts). Serve a frozen live-quality packet so the landing demo shows the rich output reproducibly + $0.
- Source: `evals/fixtures/live/SCN-HORMUZ.json` (a real captured live packet; regenerate via `evals/record-live-packets.test.ts`).
- Wire `buildDecisionPacket` (or a small replay loader) to return the frozen packet as `effectiveMode: REPLAY`, labeled with its capture date in the UI (Success_Criteria "Replay mode rendering": renders < 15s, shows the fixture capture date, **never** labeled live). The mode taxonomy + badge already exist.
- Eval: assert the home surface renders REPLAY + the capture date (extend `evals/e2e/a11y.spec.ts`).

### 3. Bounded retry (the planned "+2 reserve")
Stochastic firewall slips (a numeral in a Strategist step, a Dispatcher unit) currently degrade that agent to FAILED_TO_FALLBACK (safe + disclosed, but not all-LIVE). Add a bounded retry (1–2 attempts) on FIREWALL_REJECT / UNPARSEABLE before falling back, so live mode is reliably all-LIVE.
- Cleanest: a shared helper in `lib/agents/run.ts` (`liveGenerateValidated({..., validate})`) the 3 agents call, OR a localized retry loop in each `classify*Live`. Thread the cumulative budget across attempts (do NOT retry a `BudgetExceededError`). Honor the "3 (+2 reserve)" count — cap attempts so worst-case billed calls stay near the criterion.
- Note the ledger undercount: a billed-but-rejected attempt's cost isn't in the final `AgentRun.costUsd` (negligible; document it).

### 4. Codex closure-2 re-run (gate belt-and-suspenders)
Codex's closure-2 hit its usage cap before a verdict (a tooling limit). Re-run after the cap resets to confirm the closure fixes (#1 judge self-guard, #2 numeric-name mask, #4 requestedMode) + the #3 refutation hold:
```
~/claude-os/bin/codex-guarded exec -s read-only -o /tmp/codex-closure2-resilix.txt "<prompt>" < /dev/null
```
The closure-2 prompt is reconstructable from `docs/claude/gates/agent-core/D9-2026-06-19.md` (the Codex section). If APPROVE, stamp it in the gate doc.

## State + how to run
- **Run live evals (BILL, gated):** `ENABLE_LIVE_AI=true GEMINI_MODEL=gemini-2.5-flash RUN_LIVE_AI_TESTS=true node --env-file=.env node_modules/vitest/vitest.mjs run evals/<file>` (key loaded from `.env`, never printed). Record fixtures: `RUN_LIVE_AI_RECORD=true ... evals/record-live-packets.test.ts`.
- **Verify:** `npm run verify` (typecheck+lint+test+build+secrets) · `npm run verify:full` (+ e2e/a11y).
- **Key code:** `lib/agents/actionops/` (6 agents: sentinel/verifier/atlas/simulator/strategist/dispatcher + index) · `lib/agents/run.ts` (liveGenerateObject + budget + preflight + provider key) · `lib/pipeline/build-packet.ts` (live/replay wiring + requestedMode) · `lib/evals/judge.ts` (+ `evals/judge-calibration.test.ts`) · `lib/data/actionops-scenarios.ts` (7 production scenarios) · `lib/pipeline/citation-check.ts` (citation contract + name-digit span-mask) · `lib/schemas.ts` (vocab).
- **Spend so far:** ≈ $0.8–1.0 of the $5 build cap. Budget is per-run; build-total held by bounding runs.

## Discipline (every increment)
maker → independent `npm run verify` → `acceptance-gate` subagent → **Codex cross-model** (`~/claude-os/bin/codex-guarded`, `< /dev/null`, weigh primary-model-final) → local commit (push HELD). Evidence to `docs/claude/gates/`. One increment per task; verify before declaring done.
