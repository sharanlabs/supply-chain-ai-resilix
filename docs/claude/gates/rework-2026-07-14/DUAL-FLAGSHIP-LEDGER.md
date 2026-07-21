# Dual-flagship re-review — RESILIX rework pass (2026-07-14)

> Run ledger per `skills/dual-flagship` (calibrated 2026-07-10, gate-adjacent weight). Orchestrator: Fable 5 (session seat).
> Reviewer: Codex seat `gpt-5.6-sol` @ effort `high` (explicit per call). Evaluator: `flagship-evaluator` (fresh-context, read-only).
> Purpose: the owner's 2026-07-09 rework directive — re-review the complete showcase ladder under updated doctrine + new models, review-first (owner-selected 2026-07-14), design build follows separately.

## Header
- **Frozen target:** HEAD `8048d0d3f12e4f7d2086ebe4b25268a27224f01d`, tree clean, 0 untracked, 369 tracked files.
- **Seat probe (2026-07-14):** Sol LIVE — `turn.completed`, clean response, 5 output tokens (probe.jsonl in run dir). The 2026-07-09 400-block is cleared. Non-fatal warnings observed: malformed `~/.codex/hooks.json` (`unknown field SessionStart`) + skills-context-budget notice — flagged, not blocking.
- **Config drift flag:** `~/.codex/config.toml` default effort reads `xhigh`; owner doctrine default (2026-07-10) is `high`. Run unaffected (effort passed explicitly per call). Owner to reconcile.
- **Sections (window-fit chunking):** A engine/moat 84 files (lib/** minus lib/evals, prompts, workflows) · B surfaces/data/build 85 (app, components, design, db, data, scripts, root configs) · C evals/teeth 112 (evals/**, lib/evals — RECORDED DEVIATION from the 50–80 heuristic: 26+ files are low-token fixture data, sampling instructed; saves a fifth window run) · D docs/claims 79 (docs minus _archive, gates, tasks, evaluation, root prose).
- **Caps:** seat calls ≤ 4 R0 + 3 reconcile = 7 · findings global cap 60 (~15/section asked) · ≤2 evaluator dispatches/round · wall-clock deadline **2026-07-14 +6h from R0-A dispatch** (incl. mutex queue).
- **Run-state exclusions (never reviewed):** `docs/claude/gates/rework-2026-07-14/**`. Other exclusions: `docs/_archive/**`, `samples/` (gitignored), `package-lock.json`, generated dirs.
- **Preflights:** secret scan clean (key/token patterns, whole scope). Packets carry instruction-as-data rule + engagement-receipt requirement + out-of-repo context block.
- **Harness note (recorded deviation):** section runs dispatched via background Bash with active monitoring — the harness's 10-min foreground timeout would kill a high-effort run mid-window; attended-ness preserved by monitoring, never fire-and-forget.

## Round log
_(written incrementally per round)_

- **R0-A (engine/moat):** dispatched — awaiting events.

## SUPERSEDED (2026-07-16)
The R0-A dispatch above never returned — the session died before any events landed; no findings were produced by this run. Owner decision 2026-07-16 (recorded in the session plan `review-the-project-once-wobbly-lake.md`): the rework re-review proceeds as a **right-sized single pass** — same frozen target `8048d0d`, same section chunking (A/B/C/D, stragglers folded in: prompts/→A, CI+workflows/→B, root claims files→D), Codex Sol @ high per section, findings disposed primary-model-final by the session seat, NO evaluator dispatches, NO reconcile rounds. Run record: `RIGHT-SIZED-PASS-2026-07-16.md` (this dir).
