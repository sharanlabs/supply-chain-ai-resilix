# ADR-0002 — Same-family LLM judge (Gemini-judges-Gemini): accepted as a secondary check; cross-family deferred

- **Status:** Accepted (decision recorded 2026-06-22)
- **Decision owner:** sharan_98
- **Scope:** RESILIX ActionOps. Companion to `docs/Success_Criteria.md` (the no-unsupported-claims judge) and the G-5 calibration (`evals/judge-calibration.test.ts`).

## Plain English
The app has one AI "grader" — the judge — that reads each drafted supplier email and flags any sentence asserting something the source data does not support (the one check too fuzzy for plain code). Today that judge is the **same AI family as the writer** (Gemini grading Gemini). Research shows a model tends to rate its own family's output a little more leniently — "self-preference" bias. The owner reviewed whether to switch the judge to a different AI family (e.g. Anthropic / OpenAI). **Decision: keep it same-family for now, but treat it as a SECONDARY check, say so plainly, and strengthen how we measure it.** Switching to a different family is a clean, recorded change gated on a paid recalibration — captured here so the current state is a deliberate choice, not an oversight.

## Context (alignment pass, 2026-06-21)
- The judge (`lib/evals/judge.ts`) is the project's single LLM-as-judge. It decides the one thing code cannot: whether prose makes a **semantic** unsupported claim that carries no numeral (e.g. "we have secured backup suppliers", "prices will rise") and so slips the deterministic citation grader. It is **fail-closed** (a thrown call / unparseable / uncertain verdict → `supported:false`, a flag) and **off by default** (the live-AI path only).
- The **hard gates are deterministic** — numeral↔`claims[].sourcePath` citation, entity/URL existence, injection quarantine — plus **atomic human approval**. The judge sits *on top* of these, never under them.
- **Best practice:** an LLM judge should be a **different model family** than the system under test; self-preference is the most research-validated judge bias. Source: claude-os `knowledge/evals_kb/Wiki/llm-as-judge.md`; Panickssery et al., *LLM Evaluators Recognize and Favor Their Own Generations* (NeurIPS 2024); reflected in claude-os Law 9.
- **Current state:** only `@ai-sdk/google` is installed and only `GEMINI_API_KEY` is configured; `resolvedJudgeModel()` falls through to `resolvedGeminiModel()`. The judge is architecturally Gemini-only — `JUDGE_MODEL` selects *another Gemini id*, not another family.
- The build-time cross-model gate (Codex — a different family) reviews the **code**; it is **not** the runtime product judge. Conflating the two was the precise gap the alignment pass surfaced: "cross-model Codex above the judge" closes a *review* concern, not the *runtime self-preference* one.

## Decision
1. **Keep the same-family judge for the MVP — but framed correctly: a SECONDARY semantic check.** The PRIMARY integrity gates are the deterministic graders + atomic human approval. The judge is off by default and fail-closed. A same-family judge that is secondary + fail-closed + human-backstopped is an **acceptable residual at the portfolio-MVP tier**. It would **not** be acceptable as a sole or primary gate.
2. **Do NOT add a paid non-Gemini provider now** (free-first; a cost/external-key decision is owner-gated). The cross-family switch is the path that removes the residual entirely (→ best practice FOLLOWED) and is gated on (a) a non-Gemini API key the owner controls and (b) a billed recalibration run.
3. **Make the cross-family switch a small, recorded change when authorized:** add a `JUDGE_PROVIDER` seam + the provider SDK, route `judgeNoUnsupportedClaims` through it, and re-run G-5 calibration on the new judge. The seam is **intentionally not added now** — a key-less, never-exercised provider path is gold-plating per the project's own no-untested-code discipline.
4. **Strengthen the calibration METHOD now, at no cost.** Add **Cohen's kappa** (chance-corrected agreement — stronger than raw TPR/TNR) and a **held-out dev/test split** (metrics reported only over prose the judge prompt was not tuned on) to `evals/judge-calibration.test.ts`. The **few-shot critique-then-verdict** prompt upgrade and **calibrating against real Dispatcher drafts** (vs synthetic prose) further strengthen it but **change judge behavior** → both are gated on the **same billed recalibration** as the cross-family switch. We do not silently change the live judge prompt, because that would break the calibration↔prompt coupling the G-5 evidence rests on.

## Consequences
- **No MVP behavior change.** No new dependency, cost, or attack surface. The judge stays Gemini, fail-closed, secondary, off-by-default.
- **Honesty captured.** `README.md` (Limitations) and `docs/Success_Criteria.md` now disclose the same-family residual; `lib/evals/judge.ts` carries the rationale inline.
- **Measurement strengthened now.** Cohen's kappa + the held-out split land as **testable code** — the kappa math and split-validity run inside `npm run verify` (always-on); the billed live calibration applies them on its next run.
- **Bounded residual.** A leniency bias in a *secondary, human-backstopped* check cannot, on its own, send an unsupported claim to a customer: a human approves every send, and the deterministic graders catch every sourceable-numeral claim regardless of the judge.

## Revisit triggers
Re-open when **any** holds: (a) a non-Gemini API key + budget for a recalibration run is available; (b) the judge is ever promoted from secondary to a primary or sole gate — then cross-family becomes **required**, not optional; (c) a live G-5 run shows the same-family judge missing the TPR / TNR / kappa bar.

## References
- claude-os `knowledge/evals_kb/Wiki/llm-as-judge.md` — cross-family requirement; self-preference as the primary judge bias.
- Panickssery, Bowman, Feng — *LLM Evaluators Recognize and Favor Their Own Generations*, NeurIPS 2024.
- guidelines-monitor alignment pass (2026-06-21) — finding: same-family judge **VIOLATED** (bounded; the judge is a secondary check).
- `lib/evals/judge.ts`; `evals/judge-calibration.test.ts`.
