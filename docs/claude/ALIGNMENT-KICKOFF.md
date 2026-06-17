# REWORK-KICKOFF — RESILIX enterprise-grade rework FROM SCRATCH, from Stage 0

> **Fresh-session brief (owner directive, 2026-06-17).** Rework RESILIX **from scratch, starting at Stage 0**, to professional **enterprise grade**, evaluated through **BOTH** the full claude-os doctrine AND the industry lens, with **deep internal + external sourcing**, **all-blindspot checks (pre + post)**, the **Fable Mindset**, and **full capabilities**. The named sources / practices / lenses are a **FLOOR, not a ceiling.** Read this + `HANDOFF.md` + `tasks/todo.md`, then run the program. This is the standing NEXT for RESILIX (supersedes the earlier "gap-fill built parts" scope).

## Core intent (owner, verbatim-derived)
- **From STAGE 0**, re-run the FULL pipeline (brainstorm/idea → research → plan → resources → execution → deployment → retrospective). **Rework from scratch** to the enterprise + doctrine bar. The existing build (Phases 1–3, P3.1, Phase 8 UI `c1c7ea5`) is **salvage-reference to re-derive + re-gate, NOT assumed correct.**
- **Two lenses, both deep:** (A) the full claude-os doctrine + all instructions — 12 Laws (`~/claude-os/docs/NORTH-STAR.md`), PIPELINE, EVAL-RUBRIC, standing instructions (expansion-path · Pillar-2 legibility · failure-knowledge · Multi-Source · recency · anti-slop · cost/simplicity/anti-bloat · tech-stack · provenance/taste). (B) the enterprise/industry canon, per domain.
- **Sourcing — DEEP, floor-not-ceiling:** internal (KBs, `~/claude-os/knowledge/source-registry/`, doctrine, lessons) AND external (Anthropic/Google/MS/OpenAI/LangChain/awesome-genai-guide/OWASP/Willison/Meta/WCAG… AND beyond), live-verified, Multi-Source ≥3/≥2 platforms, an explicit **unknown-unknowns sweep**, never from memory.
- **Blindspots:** check ALL — **proactively before each stage AND post-build** — pair every failure mode with its proven fix (failure-knowledge doctrine).
- **Mindset:** **Fable Mindset** every step (GROUND→REASON→ACT→OBSERVE→RE-EVALUATE→VERIFY→NARRATE).
- **Capabilities:** **full** — Ultracode multi-agent orchestration, the council (re-evaluate the idea/approach where warranted), the specialist brigade, the gate stack (verify → acceptance-gate → cross-model Codex, maker≠judge).
- **Legible:** every substantive turn leads with a `Stage:` line + the **named** methodology · framework · principle · gate (`~/claude-os/docs/STAGE-NARRATION.md`); goal · roadmap · plan up front; canon front-loaded BEFORE building (gate confirms, not retrofits).
- **Bar:** "would a top enterprise team ship this," from the ground up.

## The program (the claude-os pipeline, from Stage 0)
0. **Ground + re-frame** — re-establish the idea (crisis-to-action war room, US mid-market manufacturers); council re-evaluation if the approach warrants it.
1. **Research (deep, internal + external + unknown-unknowns)** — re-validate problem/market + the agentic/security/data/frontend/eval/deploy canon; pair failure-modes with fixes.
2. **Plan (canon front-loaded)** — re-derive spec + architecture + per-phase frameworks NAMED up front (gsd-core spec-discipline · gstack · superpowers · Kashef); a from-scratch gap register (`docs/claude/ALIGNMENT-AUDIT.md`): rebuild-vs-salvage per component, biased to from-scratch rigor.
3. **Resources** — `project-advisor`: toolset + methodology + sources.
4. **Execution** — rebuild each phase to the bar; **blindspots checked pre + post**; each gated (verify → acceptance-gate → Codex `~/claude-os/bin/codex-guarded`, `-resilix`-namespaced).
5. **Deployment + retrospective** — enterprise readiness (observability · CI · docs · expansion-path); lessons compounded.

## Inputs (salvage-reference — re-derive + re-gate, do not blindly preserve)
Existing build + ledgers (PLAN.md, HANDOFF, todo `G3/G4` + the must-fix list), the 2026-06-17 `project-advisor` report (per-phase canon + D1–D6 doctrine gaps), Phase-8 UI (gated `c1c7ea5`), claude-os Stream A do-no-harm fix.

## Known process issues (carry forward)
- **`guidelines-monitor` AGENT stream-idle-timed-out 5–6× on 2026-06-17 (infra), even web-forbidden.** Run its FUNCTION inline / via background **Bash** (Codex CLI stayed stable), or retry when infra recovers. Long background subagents were unstable — prefer inline + background Bash for critical verify/Codex; a dead subagent's edits still land in the working tree (assess the tree, don't retry blind). Full-capability orchestration is fine; just recover from the tree on a timeout.

## Owner gates (open)
- **Push** — RESILIX 36 ahead of origin, claude-os 2 ahead — ALL HELD (owner-ordered push).
- **GEMINI_API_KEY** in `.env` for Phases 4–7 (LLM).
- Target = US mid-market manufacturers (locked); stack = widely-used + free, Gemini the one paid item (≤$5).

## THE HOOK (paste into the fresh session)
```
/autopilot — RESILIX enterprise-grade REWORK FROM SCRATCH, from Stage 0.
Read docs/claude/ALIGNMENT-KICKOFF.md + HANDOFF.md + tasks/todo.md first, then run the program.
Re-run RESILIX through the FULL claude-os pipeline from Stage 0 (idea→research→plan→resources→execution→deployment→retrospective), reworking from scratch to professional ENTERPRISE GRADE, evaluated through BOTH lenses: (A) full claude-os doctrine + all instructions; (B) the enterprise/industry canon per domain. Existing build = salvage-reference to re-derive + re-gate, not assumed correct.
Mandatory: Fable Mindset every step; DEEP internal + external sourcing (floor not ceiling, Multi-Source >=3/>=2, unknown-unknowns); check ALL blindspots proactively AND post-build (pair each with its fix); FULL capabilities (Ultracode multi-agent, council/specialists, gate stack verify→acceptance-gate→cross-model Codex, maker!=judge); every stage labelled + methodology/framework/principle named up front (STAGE-NARRATION.md); canon front-loaded before building.
Gates: push HELD (owner-ordered); Phases 4-7 (LLM) need GEMINI_API_KEY (owner). Produce docs/claude/ALIGNMENT-AUDIT.md (gap register) as you go.
```
