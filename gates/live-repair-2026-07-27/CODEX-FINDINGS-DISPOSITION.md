# Codex cross-model gate — findings disposition (2026-07-27)

**Gate:** `codex exec --sandbox read-only -c model_reasoning_effort=high`, adversarial devil's-advocate
brief over `git diff bad802e..HEAD`. **Verdict: REVISE — 12 findings (6 High, 5 Med, 1 Low).**
Raw transcript: `13-codex-cross-model-REVISE.log`.

Disposed **primary-model-final** per estate doctrine: refute what can be disproved, fix what holds,
escalate the genuinely owner-level. Codex was right on the two that mattered most, and one of its
findings invalidated a number this session had been repeating everywhere.

**Headline:** Codex found that the Skeptic calibration counted a critic **error** as a **true
positive** — so the "TPR 100%" this session cited in the assessment, HANDOFF, the ADR and two commit
messages was produced by an instrument that could report 100% for a critic that never worked.

---

## Disposition table

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 6 | High | Calibration counts an ERROR on an unsound item as a TP; the "errors never inflate TPR" comment is mathematically false | **FIXED + RE-MEASURED** |
| 1 | High | `SKEPTIC_MAX_OUTPUT_TOKENS=1_200` not a defensible worst-case bound (3.3× over 2 samples); no `reasoningEffort`; unbounded `reason`; no strict schema | **FIXED — by cutting consumption, not arguing the margin** |
| 10 | Med | Failed-but-billed completions ledgered as zero usage; truncation mode hidden under `LIVE_CALL_THREW` | **FIXED (partial) + limitation disclosed** |
| 11 | Med | `makeGroqGenerate` still defaults to the proven-unsafe `4_000`; comment stale | **FIXED** |
| 12 | Low | Committed logs expose the Groq org id + local scratch paths | **FIXED** |
| 5 | Med | Guard test narrow; `JUDGE_PROVIDER` not validated as a closed enum | **PARTIALLY ACCEPTED → recorded** |
| 3 | Med | Split the shared judge/Skeptic model constant | **ESCALATED — owner architecture call** |
| 2 | High | API limiter (30/min) misaligned with Groq capacity (~3/min); burst → fail-closed HOLD | **ACCEPTED → Playground scope** |
| 4 | High | `preflight:groq` is a catalog check, not a liveness probe; nothing invokes it automatically | **ACCEPTED → owner action (CI secret)** |
| 7 | High | NWS payloads are compile-time casts; an HTTP-200 `{}` reads as "no alerts / LIVE" = false calm | **CONFIRMED — new pre-existing defect, recorded** |
| 8 | High | GDELT all-articles-invalid → cached empty + `status:"LIVE"`; primary feed can vanish while reporting healthy | **CONFIRMED — new pre-existing defect, recorded** |
| 9 | Med | Noop transport returns `delivered:false` but the executor terminalizes `EXECUTED` | **CONFIRMED — new pre-existing defect, recorded** |

---

## The fixes, with evidence

### #6 — the metric could not be trusted (the most important finding)

`const flagged = verdict.accepted === false; // includes fail-closed errors` → then
`if (!spec.accepted) { if (flagged) tp++ }`. A fail-closed **error** sets `accepted=false`, so it was
counted as a **detection**. A critic throwing on all seven unsound controls would report **TPR 100%
with zero genuine detections**, and `fn === 0` (the zero-tolerance gate) would also pass, because an
error is not an ACCEPT. The judge harness already had the correct shape (a separate `errors` bucket,
EV-09); this one did not.

**Fixed:** errors bucketed separately and excluded from all rates; `NaN` guarded (a `NaN >=` assertion
passes silently in JS — another way a broken critic could clear the bar); **every unsound control must
now earn a non-errored rejection**; explicit ≤10% error-rate ceiling.

**Re-measured with the corrected math** (`14-skeptic-calibration-CORRECTED-error-bucket.log`, exit 0):

```
TPR (rejects unsound):  100.0%  (7/7)   [non-errored only]
TNR (accepts sound):    100.0%  (10/10) [non-errored only]
errors (excluded):      0/17
```

**Stated precisely:** the *values* were right, but only because zero errors happened to occur. The
*instrument* was not trustworthy until now. Codex's finding stands even though the number survived it.

### #1 — headroom, answered by reducing consumption rather than defending the margin

Codex was right that 3.3× over two samples is not a worst-case bound. Instead of arguing the margin,
the consumption was cut: `reasoningEffort: "low"` + strict `structuredOutputs: true`
(both verified present in the installed `@ai-sdk/groq` provider options, not assumed) dropped real
output from **357–368 → 91–144 tokens**. 1,200 is now ~**8–13×** the measured need, with the TPM
reservation unchanged at ~2,621 of 8,000.

**Positive-controlled** (`15-truncation-positive-control.log`, `16-starved-call-error-taxonomy.log`):
a starved 16-token budget fails as expected; 120 and 400 both complete with `finishReason: "stop"`.
So the operating point is far from the edge, measured rather than asserted.

### #10 / #1 — and what the positive control overturned

The first version of this fix classified truncation via `NoObjectGeneratedError.finishReason === "length"`.
**The positive control proved it inert.** Under strict `json_schema`, Groq does not return a truncated
completion — it rejects with `400 "Failed to generate JSON"` (`AI_APICallError`), so that branch never
fires on this provider. Re-keyed onto the real error and re-controlled: the starved call now yields
**`SCHEMA_GENERATION_FAILED`** with an actionable reason pointing at the output budget.

Both branches are kept: `NoObjectGeneratedError` is the contract-level path (and fires when strict
structured output is unavailable); the 400 is what this provider actually does today.

Deliberately **not** called "truncated": a 400 cannot be distinguished from a genuine prompt/schema
problem without the `failed_generation` body. Honest name over a confident one.

**Disclosed limitation on #10:** on the Groq-400 path the provider returns **no usage**, so a
failed-but-possibly-billed call still ledgers zeros. The `NoObjectGeneratedError` path preserves real
usage. Recorded rather than papered over — a `usageUnknown` flag would touch the persisted schema and
is deferred deliberately.

### #11, #12 — small and unambiguous

`maxOutputTokens` is now **required** (no default), so a new caller cannot silently inherit the value
measured to self-throttle this provider; both production call sites already pass measured budgets, and
the stale "kept for the unmeasured judge" comment is gone (the judge *was* measured in round 2).
Committed logs are redacted: Groq org id → `org_<REDACTED>`, local scratch paths → `<SCRATCHPAD>`
(40 occurrences, 0 residual; load-bearing figures such as `Limit 8000, Requested 5421` intact; secret
scan clean).

---

## Not fixed — recorded honestly

### Escalated to the owner

- **#3 split the judge/Skeptic constant.** Codex argues the coupling is the wrong safety trade:
  no behavioural invariant requires one model, each has its own calibration, and the coupling already
  propagated a model ADR-0002 had rejected. That is a strong argument and it may well be right. It is
  an **architecture decision**, and the cost is now explicit in `judge.ts` (`⚠ CALIBRATION COUPLING`).
  Kept for now because drift is the worse failure mode; **owner's call.**
- **#4 preflight is not liveness.** Correct. It checks catalog membership + a handwritten price set;
  a listed model can still reject the schema or throttle. Nothing invokes it automatically, so the
  same decommission stays silent until a human runs it. A scheduled workflow doing a **real
  structured-output call** is the right answer and needs a `GROQ_API_KEY` CI secret — **owner action.**
- **#2 throughput.** The live route allows 30 req/min per caller; Groq sustains ~3 Skeptic calls/min.
  The hard outage became a burst-dependent one. Mitigation (shared token bucket / queue / paid tier)
  belongs to the **Playground** increment, which is where concurrent public traffic first exists.

### New pre-existing defects Codex found outside this diff — CONFIRMED, not fixed here

These answer the "find other fail-closed blind spots" brief and are the same class as L-1: a
dependency failing *silently* rather than loudly.

- **#7 NWS false calm** (`lib/signals/fetchers.ts:107`) — payloads are compile-time casts. An
  HTTP-200 `{}` or drifted contract makes `features?.[0]` undefined and reports
  `status:"LIVE"`, freshness 0 — *false calm* rather than dependency failure.
- **#8 GDELT silent disappearance** (`lib/signals/gdelt.ts:183`) — if every article fails item-level
  validation the code caches `[]` and still reports `LIVE`; the outage marker only fires on `FAILED`,
  so the **primary disruption feed can vanish while reporting healthy.**
- **#9 Noop transport** (`lib/server/action-transport.ts:103`) — missing/partial config resolves to
  Noop, which returns `delivered:false`, yet the executor terminalizes it `EXECUTED` and the route
  reports success. A broken owner-alert config can suppress the alert while status says it ran.

**Why not fixed in this commit:** all three are pre-existing, outside the diff under review, and each
needs its own runtime-validation design plus negative tests. Bundling them would make an already-large
safety commit unreviewable. They are **logged here, in `tasks/todo.md`, and in the HANDOFF** so they
are tracked, not lost. #7 and #8 are the highest-value follow-ups in the repo right now — they are the
L-1 pattern in the signal layer, and the signal layer feeds every packet.

### #5 guard-test breadth — partially accepted

Fair. The lockstep test pins the model id but not the script's exit-code logic, endpoint, role
coverage, or `JUDGE_PROVIDER` resolution; the pricing comparison is one-way. The narrow tooth it does
have is real and negative-controlled (`09-negative-control-and-preflight-exits.log`). Broadening it
means extracting an importable preflight core — recorded, not done here.

---

## What Codex could not refute

Stated because a gate that only accuses is not calibrated:

- The four-candidate structured-output result (only gpt-oss supports `json_schema` on this key) —
  independently confirmed against Groq's current support table.
- Runtime pricing coverage: `gpt-oss-120b`/`20b` priced correctly; unpriced overrides throw *before*
  the call.

Codex also noted its own limitation: the read-only sandbox blocked Vitest's temp-dir creation
(`EPERM`), so it reviewed by reading, not by executing. Recorded so its passes are weighted accordingly.

---

## Verify after all round-3 changes

`17-verify-ROUND3-exit0.log` — **exit 0, 916 unit / 34 golden**, lint, contrast, build, secret-scan.
