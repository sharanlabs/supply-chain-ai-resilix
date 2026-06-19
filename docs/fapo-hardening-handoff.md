# FAPO-hardening handoff — branch `fapo-hardening` (2026-06-19)

Additive hardening from the Cisco-FAPO + vendor-sweep recheck of RESILIX against the
sharper eval/governance checklist. **RESILIX was found ahead on almost everything**
(scope-cut, exfil defense, fail-closed firewalls, proven grader teeth, citation
contract, cost cap) — these are the only genuine gaps. Landed on an **isolated
branch** (a live session was editing `main`), **additive new files only**, **no hot
file touched, nothing pushed.**

## What's in this branch (all NEW files)
1. `lib/evals/deobfuscate.ts` + `evals/deobfuscate.test.ts` — **de-obfuscation pre-pass** for the injection leak scan. Closes an empirically-proven gap: homoglyph (Cyrillic/Greek), zero-width-split, and base64 instruction payloads all evade `graders.ts:normalizeForLeak` today (3/3 missed; control caught). The pre-pass folds them to ASCII so the existing deterministic scan keeps its teeth. **Core logic standalone-verified 2026-06-19** (without pre-pass: missed; with: caught; benign ASCII untouched).
2. `lib/evals/failure-clustering.ts` + `evals/failure-clustering.test.ts` — **step-attribution / failure-clustering** (the FAPO pattern). Maps each grader → the pipeline organ it guards + failure class, aggregates a report (or the whole golden suite) into per-step / per-class buckets. Read-only over existing `GraderResult[]`; adds no grading, changes no verdict.
3. `docs/reliability_positioning.md` — honest "why the human stays in the loop" positioning vs the documented reliability frontier (CRMArena `<65%`, Int'l AI Safety Report 2026). **Two figures marked ⚠ VERIFY-LIVE** — confirm at primary before any credibility-facing use.

## The ONE wiring step (deferred — `graders.ts` was hot)
The de-obfuscation defense is only *active* once wired into the scan. In `lib/evals/graders.ts`:
```ts
import { deobfuscate } from "./deobfuscate";
// in gradeInjectionQuarantine's normalized no-raw-text scan, apply the pre-pass to
// BOTH the scanned draft text and the untrusted strings before normalizeForLeak:
//   normalizeForLeak(deobfuscate(text))   // instead of normalizeForLeak(text)
```
Then optionally add an `OBFUSCATED_PAYLOADS` set to `evals/golden/injection-payloads.ts` and assert them in `evals/injection.test.ts` (the unit `evals/deobfuscate.test.ts` already proves the function; this adds end-to-end coverage through the real grader).

## Verify before merge
```bash
npm run verify        # typecheck + lint + unit/eval tests + build + secret scan
# or just the new suites:
npx vitest run evals/deobfuscate.test.ts evals/failure-clustering.test.ts
```
The two new test files compile against the real `GraderResult` / `GraderId` types (confirmed) but were **not run through the project harness from this branch** (no node_modules in the worktree). Run `npm run verify` before merging.

## Provenance / safety
- Recheck source: Cisco FAPO deep-mine + discovery-scout vendor sweep (2026-06-18/19), digested in claude-os `knowledge/evals_kb/RAW/2026-06-18_cisco-fapo.md`.
- All payloads handled as DATA (Law 11); nothing executed. No `main` files touched; branch not pushed (pushes are owner-ordered).
- Fold this note into `decision_log.md` at your discretion (kept as a separate file to avoid a merge conflict with the live session).
