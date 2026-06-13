# HANDOFF — resume pointer (updated 2026-06-13)

## Relay status (two-account back-and-forth — read/update this FIRST)
**BATON: free** · **NEXT increment: P2.2 (mode-taxonomy split, R4-8)** · last released: — (initial)
**WIP: none** (P2.1 fully committed; clean boundary — start P2.2 fresh)
> **Mutex:** one account works the folder at a time. Claim before any work (set `BATON: claimed by <account> since <local time>`, commit that line); on handoff set `BATON: free`, commit.
> **Lossless mid-increment resume (the WIP line):** while working, after each meaningful sub-step, (a) `git commit` it as `wip(P2.x): <what>` so partial code is durable, and (b) rewrite this WIP line as `WIP: P2.x — done: <…>; NEXT micro-step: <exact next action>`. Read it on pickup:
>   - `BATON: free` + `WIP: none` → start the NEXT increment fresh.
>   - `BATON: free` + `WIP: P2.x …` → RESUME P2.x from "NEXT micro-step" (also check `git status` for uncommitted WIP + `git log` for `wip(` commits); do NOT restart the increment.
>   - `BATON: claimed by <other>` → an account may be live; STOP and ask the owner. If the owner confirms it stopped, take over: resume from the WIP line + `git status`/`git log`, re-claim the baton noting the takeover.
> On a forced stop (cap/interrupt): commit the last sub-step as `wip(...)`, set the WIP line's exact NEXT micro-step, set `BATON: free`, commit — so the other account resumes losslessly.

**Idea:** RESILIX ActionOps — crisis-to-action war room: live disruption signal + supplier CSV → evidence-cited, human-approved action packet in under 5 minutes

**Goal status:** REASSESSED & VALIDATED 2026-06-11 — direction owner-fixed (complete reorientation, not incremental absorption of LaunchOps). Owner's "autonomous supply-chain optimisation" use-case note checked for alignment: same problem space, but its prediction + unsupervised-execution mechanics stay rejected (crowded/risky/unprovable); absorbed instead — (1) supplier financial distress as a Sentinel event type (news-derived), (2) "packet ready at 2am, human approves at 6am" positioning, (3) graduated autonomy (pre-authorized low-stakes rules) as roadmap-only. Full direction: project memory `resilix-actionops-direction.md`.

**Where:** stage = brainstorm DONE (owner-fixed); resources DONE (project-advisor working set selected 2026-06-11, recorded in tasks/todo.md); research partial (codebase inventory done; GDELT API specifics pending); plan/execution/deployment pending.

**Hard rules (invariants):** every claim evidence-linked · deterministic code calculates, LLM explains · nothing sends without human approval · anti-scope: no digital twin, no autonomous execution, no fine-tuning, no dashboard-first. Stack stays Next.js/TS + Drizzle/Neon (LaunchOps approval flow, gatekeeper, audit trail = salvage).

**Next:**
1. ~~Codex review of PLAN.md~~ — **DISCHARGED 2026-06-12 (owner reset the limit): true cross-model round ran → REVISE (12 findings, all arbitrated into PLAN.md rev 3) → closure round on same thread (`019ebd51-b71b-7530-9cfc-2e20a9eeefc9`) → APPROVED. Phases ≥2 unblocked. Full record: PLAN-REVIEW-LOG.md Round 4.**

   **CODEX INVOCATION GOTCHA (2026-06-12 PM): `codex` is NOT on the background-shell PATH** (it's an npm-global install at `/Users/sharan_98/.npm-global/bin/codex`, v0.136.0; foreground login shells find it via .zshrc, background `Bash` tool shells do not — exit 127 "command not found"). **Always invoke Codex by absolute path:** `/Users/sharan_98/.npm-global/bin/codex exec -s read-only --json -o /tmp/out.txt "$(cat prompt)" < /dev/null`.
2. ~~Owner sign-off on PLAN.md rev 3~~ — **GRANTED 2026-06-12 in-session (scope 6/4/2, ~22 dev-days, expansion deliverable). All plan gates cleared.**
3. **Phase 1 (identity/spec rewrite) COMPLETE 2026-06-12 — exit gate fully discharged.** README.md + docs/Success_Criteria.md rewritten to the ActionOps identity. Acceptance-gate → BLOCK (5 fixes applied) → Codex cross-model (thread `019ebef1-813d-7061-a65f-c3b3d73d7594`): REVISE 7 findings → all arbitrated/fixed → 2 closure rounds → **APPROVED**. Repo-wide identity reconciliation done via the `phase1-identity-audit` workflow (26 docs): 2 fixed inline (AGENTS.md, docs/resume_positioning.md), 22 status banners, 2 left as-is. Full record: PLAN-REVIEW-LOG.md "Phase 1 review"; per-doc rewrite-phase queue: **docs/claude/PHASE1-doc-reconciliation.md**. (Scheduled task `resilix-phase1-codex-doc-review` is now moot — done live; safe to ignore/delete.)

**Phase 2 — data model at scale (~2.5d) IN PROGRESS (autopilot-driven 2026-06-13).** Increment breakdown + the logged single-instance idempotency limitation live in tasks/todo.md.
- **P2.1 — data-layer integrity (R4-1/2/3) DONE 2026-06-13, gated, committed.** node-postgres driver swap (off Neon); atomic approval transition (pg: `db.transaction` + `SELECT…FOR UPDATE` + conditional `UPDATE…WHERE approval_status='PENDING' RETURNING` + eventId reserved via unique-constraint guard so one event can't commit two packets; memory: synchronous CAS); in-process keyed-mutex idempotency (single-instance MVP; cross-instance DB reservation = logged post-MVP item). Gate: independent `npm run verify` green (24 passed/3 skipped) + Codex cross-model (thread `019ebf68-fdf8-77e2-bf57-9ad21c742e2b`) REVISE(6)→fix→REVISE(2 consistency)→**APPROVED**. Files: lib/server/{db,store,decision-packet-service}.ts, lib/pipeline/run-exception.ts, evals/{concurrency-integrity,db-concurrency-integrity}.test.ts, package.json. pg paths verified by-construction + gated tests (run `npm run test:db` with RUN_DB_INTEGRATION_TESTS=true + DATABASE_URL on a live Postgres to execute them).
- **→ NEXT increment: P2.2 — mode taxonomy split (R4-8)** (agent_mode enum → LIVE_AI/DETERMINISTIC_RULES/REPLAY/FAILED_TO_FALLBACK + requested-vs-effective per packet). Then P2.3–P2.7 per tasks/todo.md. Each increment: maker (backend-specialist) → independent verify → Codex cross-model (ABSOLUTE PATH `/Users/sharan_98/.npm-global/bin/codex`, `< /dev/null`) → local commit. Then Phase 9 eval criteria in docs/Success_Criteria.md bind the build.
Also pending: Gemini API key in .env by phase 4. Gate every artifact exit (acceptance-gate). Constraints: claude-os docs/PROJECT-CONSTRAINTS.md binds resourcing + ship deliverable. Stack rule (owner): widely-used + free only; Gemini the sole paid item.

**Resume rule:** a fresh session reads this file + `tasks/todo.md` and continues here.
