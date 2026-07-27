# Gate context — live-product repair (2026-07-27), commit `6104159`

**Artifact under judgement:** the diff in commit `6104159` on `main` (local, unpushed).
**Maker:** Opus 5 @ xhigh, main session. **Judge:** must NOT be the maker (maker ≠ judge).
**Assessment that motivated it:** `docs/claude/ASSESSMENT-2026-07-27.md`.

## What was broken

The live agentic product produced NOTHING. First-hand full-loop smoke on the REAL production
path (no injected Skeptic): `effectiveMode=FAILED_TO_FALLBACK`, `recommendation=NO_ACTION`,
gatekeeper `BLOCKED`, 0 playbooks, 0 drafts. Evidence: `02-live-fullloop-BEFORE-broken.log`.

**L-1 [CRITICAL]** — `meta-llama/llama-4-scout-17b-16e-instruct` was DECOMMISSIONED by Groq
(absent from the key's ListModels). The Skeptic fails CLOSED, so the outage presented as silence
and by construction could never alarm on itself. The same shared constant also took down
`lib/evals/judge.ts`. Nothing caught it: the preflight covered Gemini only; the gated live suite
injects a stub ACCEPT Skeptic; zero tests referenced the model id.

**L-2 [HIGH]** — repointing alone was insufficient. Groq reserves `input + max_completion_tokens`
against an 8,000 TPM free-tier window, so `maxOutputTokens: 4_000` reserved ~5,421 tokens for a
call that really emits ~370 → 429 → HOLD. Raising it is strictly worse (16k → HTTP 413). Fix was
sizing DOWN to 1,200. Evidence: `06-groq-429-413-root-cause.log`.

## What changed

| File | Change |
|---|---|
| `lib/agents/cross-family.ts` | `GROQ_DEFAULT_MODEL` → `openai/gpt-oss-120b`; TPM/throughput warning on `makeGroqGenerate` |
| `lib/agents/actionops/skeptic.ts` | new `SKEPTIC_MAX_OUTPUT_TOKENS = 1_200`, passed at the call site |
| `lib/evals/judge.ts` | comment only (shares the constant) |
| `scripts/preflight-groq.mjs` | NEW — cross-family preflight (the Gemini-only one was a half preflight) |
| `package.json` | `preflight`, `preflight:models`, `preflight:groq` (the Gemini script was never wired) |
| `evals/cross-family-preflight.test.ts` | NEW, 5 tests — script↔code lockstep + pricing |
| `evals/actionops-skeptic.test.ts` | `/llama-4/i` (a BRAND pin) → durable invariants |
| `evals/actionops-skeptic-calibration.test.ts` | inter-call spacing 4s → 20s, TPM-derived |
| `eslint.config.mjs`, `.prettierignore` | ignore `.remember/**` (tooling scratch was turning `verify` RED) |

## Model choice — verified live, not from memory

Probed through the REAL `makeGroqGenerate` → `generateObject` path with the REAL verdict schema
(`07-candidate-probe-json-schema.log`):

| Candidate | json_schema | priced | verdict |
|---|---|---|---|
| `openai/gpt-oss-120b` | ✅ | ✅ | **selected** |
| `openai/gpt-oss-20b` | ✅ | ✅ | viable (same 8K TPM, no headroom gain) |
| `llama-3.3-70b-versatile` | ❌ hard fail | ✗ | rejected |
| `qwen/qwen3.6-27b` | ❌ hard fail | ✗ | rejected |

**DISCLOSED ADR-0002 deviation (please scrutinise):** gpt-oss is an OpenAI-family model, so the
critic now shares a family with the GPT/Codex BUILD-TIME gate. The load-bearing property — critic
≠ system-under-test (Gemini) — still holds, and the build-time gate judges source code at a
different time, not these runtime findings. Recorded rather than silently reinterpreted: only
gpt-oss offers structured output on this key, so three-family separation is not purchasable today.

## Evidence (all first-hand, this session, in this directory)

| File | Claim it supports |
|---|---|
| `01-verify-FINAL-exit0.log` | `npm run verify` **exit 0** — 916 unit / 34 golden / lint / contrast / build / secret-scan |
| `02-live-fullloop-BEFORE-broken.log` | the defect: FAILED_TO_FALLBACK / NO_ACTION / BLOCKED / 0 / 0 |
| `03-live-fullloop-AFTER-fixed.log` | the repair: **LIVE_AI / ACT / gatekeeper PASS / 2 playbooks / 5 drafts / $0.0221 / 38.1s** |
| `04-calibration-BEFORE-tnr40.log` | TPR 100% / **TNR 40%**, all six misses tagged `(error)` |
| `05-calibration-AFTER-tpr100-tnr100.log` | **TPR 100% (7/7) / TNR 100% (10/10)**, zero misses, 38/38 |
| `06-groq-429-413-root-cause.log` | raw `429 ... Limit 8000, Requested 5421` and `413 Request too large` |
| `07-candidate-probe-json-schema.log` | the structured-output probe above |

## Scope claim — deliberately narrow

This repairs the **engine** so the live agentic loop runs end-to-end. It does **NOT** make RESILIX
a reachable product: no surface a visitor can touch runs the live loop, and nothing is deployed
(assessment §4, L-2 finding). Do not read the green evidence as "the product works".

## Known-open, recorded rather than silently fixed

- `lib/evals/judge.ts` still uses the shared 4,000 default, **not re-measured** against the 8,000
  ceiling. Secondary + fail-closed, so a hardening item, not a live defect.
- `maxRetries: 0` is deliberate (Codex [High]: no un-ledgered retry may bill past the cap). But a
  429 is rejected pre-inference and costs nothing, so it currently degrades where a `Retry-After`
  aware single retry would be safe. Recommended BEFORE the public playground door opens.
- Throughput: one Skeptic call reserves ~2,621 of 8,000 TPM → **~3 concurrent live runs/minute**.
- `gemini-3.6-flash` is now on the key while the app runs `gemini-3.5-flash` (works; a decision).
- `npm run test:e2e` NOT run: no UI/API/routing change in this diff and the e2e surfaces are
  keyless (they never reach the Skeptic's live path). Stated rather than left silent.
