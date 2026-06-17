# ANTI-AI-CRAFT — the dedicated mechanism for human-grade work, not AI churn

> **Owner-directed 2026-06-17.** A dedicated, standing mechanism — separate from the correctness and security gates (so neither blocks the other) — whose single job is to ensure every artifact reads and holds together like **well-made work by a senior practitioner**, not generic AI output. It governs prose (docs, copy, comments) AND code.
>
> **The thesis.** The difference between human craft and AI slop is **not surface polish** — it's whether the work was *thought* or merely *generated*. A model can produce clean, fluent, em-dash-free text that is still slop, because it has no thesis, no altitude, and no stake in being right. This mechanism catches both layers: the cheap surface tells (deterministically) and the deep tells (by judgment).

## Why dedicated (not folded into the other gates)

Correctness asks "is it true?"; security asks "is it safe?"; this asks **"was it actually crafted, or churned?"** They are different failure modes and must not mask each other — a correct, secure artifact can still be slop, and a beautifully-written one can still be wrong. So this runs as its own pass, with its own verdict, in parallel. (It is the project-level instance of the claude-os anti-AI check-and-balance, `NORTH-STAR.md` §4e.)

## Layer 1 — surface tells (deterministic, cheap, loop-able — catch these for free)

Run the zero-dep detector (`de-slop` / avoid-ai-writing patterns) over changed prose and code. The catalogue:
- **Prose:** em-dashes where a comma/period serves; curly quotes; the filler vocabulary (*comprehensive, robust, seamless, leverage, delve, intricate, crucial, pivotal, realm, tapestry, testament, navigate the landscape*); "It's worth noting / Importantly / In conclusion"; "not only … but also"; rule-of-three everywhere; decorative emoji; sycophancy ("Great question!"); hedge-stacking ("might potentially perhaps").
- **Code:** narrating comments that restate the line (`// increment i`); dead `try/catch` that swallows; defensive overkill (validating the already-validated); `console.log` debris; speculative abstraction; AI signature lines.

In code, the house rule is absolute: **ASCII `--`, never em-dashes**; **WHY-not-WHAT comments**; match the surrounding file's idiom.

## Layer 2 — the deep tells (judgment — this is the part the owner means by "deepest nuances")

Surface-clean text can still be unmistakably AI. The deep tells, each with its human-craft counterpart:

| Deep AI tell | What it looks like | The human-craft counterpart |
|---|---|---|
| **Hollow comprehensiveness** | covers everything at the same shallow depth; lists every option | **altitude variation** — goes deep on the hard/load-bearing part, waves past the obvious in a clause |
| **False symmetry** | every section equal length, every list exactly 3, perfect parallelism | **asymmetry** — the important thing gets three paragraphs, the trivial gets a phrase |
| **Narrating the obvious** | "Now I will implement X. This implements X." | says only what the reader can't infer; the rest is shown, not narrated |
| **No load-bearing specificity** | "ensure robust error handling," "follow best practices" | names *this* file, *this* failure, *this* number, *this* line |
| **Hand-waving the gap** | smooths confidently over what it doesn't know | flags the uncertainty explicitly ("unverified — checked at Phase 4") |
| **Listing, not deciding** | surveys options, recommends none | commits to one with a reason; survivable disagreement |
| **Defensive over-engineering** | abstractions/guards for cases that can't occur | surgical, minimal-diff (Law 9/10); builds for the real case |
| **Voiceless prose** | no point of view; everything equally weighted | a thesis; opinionated where the evidence earns it |
| **Coherence-faking** | fluent and subtly wrong (length/fluency bias) | verified against the source, not the model's own fluency |
| **Citation theater** | name-drops sources without the claim | the specific quote + date + what it supports |

The test for Layer 2 is a single question asked of the whole artifact: **could a senior practitioner who cares about this have written it, and would they put their name on it?** If it reads as "technically fine but no one in particular wrote it," it fails.

## The mechanism (how it runs, every artifact)

1. **Detect (Layer 1)** — run the deterministic detector on the diff. High-severity tells → fix before proceeding (cheap, no judgment).
2. **Rewrite (voice)** — where prose was generated, run the `humanizer` pass to match a real voice (and, for code, match the surrounding file).
3. **Craft review (Layer 2)** — an independent read against the deep-tells table. **BLOCK** on slop that hides risk, misstates evidence, or reads as un-authored; **advisory** on pure style. This is a *different reader* from the maker (maker ≠ judge applies here too).
4. **Record** — the craft verdict joins the artifact's gate evidence (`docs/claude/gates/<artifact>/`), separate from the correctness/security verdicts.

## The done-test (how we know it landed)

Not "no em-dashes." The discriminating test: **a skeptical senior reviewer, told nothing about how it was produced, reads it as deliberate human work** — it has a thesis, it goes deep where depth is earned and is terse where it isn't, every claim is specific and either verified or flagged, and the code reads like the rest of the codebase. If they'd say "this was clearly generated," it failed, regardless of how clean the surface is.

## Scope note

This document is itself held to its own standard. If a line here reads as slop, it is a defect in the mechanism — fix it. Floor, not ceiling: new tells found in real work are added to Layer 1 (the detector) or Layer 2 (the table) as they're caught — the same compounding-lessons loop as everything else.
