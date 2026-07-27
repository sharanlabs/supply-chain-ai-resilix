# RESILIX — project assessment (2026-07-27)

**Trigger:** owner, 2026-07-27 — *"Assess the project… there should be final end-to-end real time
working agentic AI product. If any rework needed, realignment enhancements lets do it."*

**Method:** claude-os front door → triage (half-done) → re-derive the CORE from the project's own
artifacts → **verify-over-memory** (every number below was measured first-hand this session, never
copied from `HANDOFF.md`) → advisor consult at the commitment boundary.

**Seat/route:** Opus 5 @ xhigh, inline sequential (no fan-out — per the recorded Law-8 lesson that a
6-agent research fan-out burned ~795K tokens and returned nothing).

---

## 1. Verdict in one paragraph

The agentic engine is **real and it works** — a tool-using Investigator loop ran 5 genuine steps live
this session on the flagship scenario for 1.4 cents in 13 seconds. But the product is **not** an
end-to-end working agentic AI product today, for two independent reasons. **(A) A live-blocking
defect:** the cross-family Skeptic's model was decommissioned by its provider, so every live run
fails closed to `NO_ACTION` and emits nothing — no playbooks, no drafts, gatekeeper `BLOCKED`. The
project's headline differentiator is down. **(B) A reachability gap:** even with the engine healthy,
no surface a person can touch runs it. `/` serves a frozen replay, `/loop` replays a recording,
`/customs` is deterministic, and the one live door (`/api/run-exception`) is bearer-token-gated with
`live` defaulting false. Nothing is deployed. The fix for (A) is small and landed this session; the
fix for (B) is the already-planned Playground, which your ask sharpens rather than changes.

---

## 2. First-hand evidence (measured 2026-07-27, not quoted)

| Check | Command | Result |
|---|---|---|
| Full verify chain | `npm run verify` | **exit 0** — 911 unit passed / 54 skipped, 34 golden, typecheck + lint + contrast + build + secret-scan clean |
| Gemini preflight | `node --env-file=.env scripts/preflight-models.mjs` | **exit 0** — `gemini-3.5-flash` present on key |
| Gated live pass (flagship) | `RUN_LIVE_AI_TESTS=true … actionops-live-real -t SCN-HORMUZ` | **pass**, 63.5s |
| **Live full-loop smoke (real Skeptic, no injection)** | purpose-built, scratchpad | **loop OK / Skeptic DOWN** — see §3 |
| Groq preflight (written this session) | candidate probe vs `api.groq.com/openai/v1/models` | **configured model absent from the key's 15 models** |

### What the live loop actually did

```
RUN-SENTINEL      Sentinel      LIVE_AI              gemini-3.5-flash
RUN-VERIFIER      Verifier      DETERMINISTIC_RULES  3 sources; corroboration met
RUN-ATLAS         Atlas         DETERMINISTIC_RULES  9 suppliers matched + scored
RUN-SIMULATOR     Simulator     DETERMINISTIC_RULES  3 revenue horizons, 1 runout
RUN-SKEPTIC       Skeptic       FAILED_TO_FALLBACK   errorClass=LIVE_CALL_THREW   ← the defect
RUN-STRATEGIST    Strategist    DETERMINISTIC_RULES  Withheld: NO_ACTION
RUN-DISPATCHER    Dispatcher    DETERMINISTIC_RULES  Withheld: NO_ACTION
RUN-INVESTIGATOR  Investigator  LIVE_AI              5 steps: checkCorroboration → assessExposure
                                                     → simulateRunway → getRecoveryOptions
                                                     → challengeFinding; finding completed
```

Cost **$0.0144**, wall clock **13.1s** (caps: $5 / 5 min). `effectiveMode=FAILED_TO_FALLBACK`,
`recommendation=NO_ACTION`, `gatekeeper=BLOCKED`, 0 playbooks, 0 drafts.

**Read this carefully:** the agentic architecture is genuinely working. The Investigator loop chose
and sequenced five tools and completed. The failure is one dead dependency, downstream of good work.

---

## 3. Finding L-1 [CRITICAL] — the cross-family Skeptic model is decommissioned

`GROQ_DEFAULT_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"` (`lib/agents/cross-family.ts:22`)
is **not served by the Groq key**. Live listing returned 15 models; it is absent.

**Blast radius** — one constant, two consumers (the single-sourcing is good; it means one fix):
- `lib/agents/actionops/skeptic.ts:78` — the Phase-4 adversarial gate → **every live run holds**
- `lib/evals/judge.ts:42` — the no-unsupported-claims judge → **the eval judge is down too**

**Behaviour is correct-by-design, and that is the trap.** The Skeptic fails *closed*: a broken critic
must not wave findings through, so it HOLDs and the packet degrades to `NO_ACTION`. The system is
being safe. But from a user's seat the product silently produces nothing, and the fail-closed design
means it will *never* raise an alarm about itself.

**Why nothing caught it (the structural gap, not the model id):**
1. `scripts/preflight-models.mjs` validates **Gemini only** — a half-preflight. Nothing validated the
   cross-family provider.
2. `evals/actionops-live-real.test.ts` **injects a stub ACCEPT Skeptic** (deliberately, to stop the
   stochastic verdict flaking the Gemini assertions) — so the green gated live suite never exercises
   the real critic.
3. `grep` confirms **zero tests** reference `GROQ_DEFAULT_MODEL` or `groqAvailable`.
4. The calibration suite that *would* have caught it is gated behind `RUN_LIVE_AI_TESTS` and is run
   by hand.

This is lesson **R-8 recurring on the other provider** — a duplicated/unguarded model default drifting
out from under a validator. And it is exactly what `calibration-set-vs-real-finding` warns about:
a perfect labelled score (TPR 100% / TNR 100%, measured 2026-06-22 on llama-4-scout) is not evidence
the real artifact works today.

**Replacement, verified live through the real `makeGroqGenerate` → `generateObject` path:**

| Candidate | structured output | priced | latency |
|---|---|---|---|
| **`openai/gpt-oss-120b`** | **✅ works** | ✅ already in `GROQ_PRICING` | 893 ms |
| `openai/gpt-oss-20b` | ✅ works | ✅ already in `GROQ_PRICING` | 514 ms |
| `llama-3.3-70b-versatile` | ❌ `does not support response format json_schema` | ✗ | — |
| `qwen/qwen3.6-27b` | ❌ `does not support response format json_schema` | ✗ | — |

`gpt-oss-120b` is the pick: the strongest working candidate, genuinely cross-family from Gemini,
and already priced so the cost ledger stays honest. Note only two of four models on the key support
structured output at all — the schema constraint, not raw quality, is what narrows the field.

---

## 3b. Finding L-2 [HIGH] — the token budget was a THROUGHPUT knob, not a safety ceiling

Repointing the model was not sufficient, and the way it failed is worth recording. After the swap
the flagship smoke was perfect (ACT, gatekeeper PASS) — but the labelled calibration read
**TPR 100% / TNR 40%**, with all six misses tagged `(error)`. The raw provider error:

```
429 Rate limit reached for `openai/gpt-oss-120b` ... tokens per minute (TPM):
    Limit 8000, Used 5630, Requested 5421
```

**Groq reserves `input + max_completion_tokens` against the per-minute window, regardless of what
the model actually emits.** The inherited `maxOutputTokens: 4_000` therefore reserved
1,421 + 4,000 = 5,421 tokens for a call whose real output is ~370 (reasoning included) — about 11×
over — so the second call in any minute was throttled. And because the Skeptic fails *closed*,
every throttle became a HOLD that the harness scored as a false REJECT.

Two counter-intuitive points:

- **Raising the budget made it strictly worse.** At 16,000 the API returns `413 Request too large` —
  a single call exceeding the entire minute's allowance. The fix was sizing *down* to 1,200
  (>3× the measured need; reservation ~2,621; ~3 calls/min).
- **The eval instrument carried the same stale assumption.** The harness's 4s inter-call spacing was
  calibrated for llama-4-scout's ~30K TPM. Against an 8K ceiling it was measuring its own
  throttling. TNR moved 40% → 80% → **100%** as the budget was right-sized and spacing went to 20s.

Both gpt-oss sizes share the 8,000 ceiling, so switching model size buys no headroom. (The ceiling
is readable off a deliberate `413`, which is rejected pre-inference and so costs nothing.)

**Final calibration on the new model: TPR 100% (7/7) / TNR 100% (10/10)** — matching the historic
llama-4-scout figures.

### The judge — CLOSED by measurement (round 2, after the acceptance-gate BLOCK)

The first pass disclosed only the *token-budget* consequence for `lib/evals/judge.ts`. The
acceptance-gate correctly called that incomplete: the shared constant moved the **judge's model**
too, and ADR-0002 had explicitly chosen llama-4-scout **over** gpt-oss-120b on the judge's own
split (100%/1.000 vs 88.9%/0.889) — so the judge silently inherited the previously-*rejected*
candidate.

Rather than write a caveat, it was **measured**. Doing so exposed a second live defect the gate had
not seen: the judge harness fires all 18 held-out items **back-to-back with no spacing**, and
`judge.ts` used the same unmeasured 4,000 budget (779 + 4,000 = 4,779 of an 8,000 window ≈ one call
per minute). **L-2 applied to the judge as well.** Fixed: `JUDGE_MAX_OUTPUT_TOKENS = 1_200`
(measured in=779, out=165–252) plus 15s TPM-derived spacing.

**Re-calibrated live, exit 0:** TPR 100% (9/9) · TNR 88.9% (8/9) · kappa 0.889 · errors 0/18 —
above the enforced 0.83/0.83/0.60 bars, and an exact reproduction of the ADR's five-week-old figure.
**Said plainly: measurably weaker than the retired model.** Forced by the provider, not chosen —
only gpt-oss supports Groq `json_schema` on this key. Now recorded in ADR-0002 (as an amendment to
the record it deviates from), `Success_Criteria.md`, `architecture.md`, the code, and lessons L-3.

### Open follow-ons — recorded, deliberately NOT silently changed
- **`npm run preflight:groq` is manual-only.** It is not in `verify` and not in CI. Since "run by
  hand" was contributing cause #4 of L-1, the fix **half-closes its own root cause**. Wiring it into
  `verify` would break the project's own P3.2 rule (no network smoke in the deterministic gate
  chain), and CI needs a `GROQ_API_KEY` secret — an **owner action**. Stated rather than left silent.
- **Judge/Skeptic model coupling** stays single-sourced (drift is the worse failure), but the cost is
  now explicit in `judge.ts`: one repoint invalidates two calibrations. Splitting them is an
  **owner-level architecture call**.
- `maxRetries: 0` is deliberate (a Codex [High] finding: no un-ledgered retry may bill past the cap).
  But a 429 is rejected pre-inference and costs nothing, so it currently degrades where it could
  safely retry. **A `Retry-After`-aware single retry is the recommended hardening before the public
  playground door opens** — under concurrent visitors an 8K TPM ceiling will throttle regularly.

### Throughput reality for the Playground (new constraint, surfaced early)
One Skeptic call per packet run reserves ~2,621 tokens of an 8,000/min budget → **~3 concurrent
live runs per minute** before the cross-family critic starts degrading to HOLD. The planned per-IP
limits and daily cap must be sized against *this*, not just against cost. Options: the retry above,
a paid Groq tier, or an explicit queue.

---

## 4. Finding L-2 [HIGH] — no live surface anyone can reach

The engine is unreachable as a product:

| Surface | What it runs today | Live agent? |
|---|---|---|
| `/` | frozen replay packet, $0/keyless, no network | no |
| `/loop` | recorded agent-run trajectory replay | no |
| `/customs` | deterministic engine, flag-gated OFF by default | no |
| `/api/mcp/mcp` | read-only MCP tools, bearer-gated | no |
| `/api/run-exception` | **the only live door** — bearer token + `live:true` opt-in (default false) | yes, but gated |

Plus: **never deployed.** There is no URL. "Deploy LAST" was fixed on 2026-07-06 under the *showcase*
goal, whose public posture was deliberately replay-only/$0.

This is precisely the gap `PLAN-PLAYGROUND-2026-07-22.md` was written to close ("a real product
anyone can test"). Your 2026-07-27 ask **sharpens the same goal** — it does not replace it, so no
re-brainstorm is warranted.

---

## 5. Finding L-3 [MEDIUM] — Gemini default is one generation behind, again

The key now serves `gemini-3.6-flash`; the configured default is `gemini-3.5-flash` (set 2026-07-22).
3.5-flash is present and working, so this is **not** blocking. But it is the same recency drift that
produced Batch 7 five days ago, which suggests the cadence — not the value — is the problem.
Bumping needs a pricing row + re-verification, so it is a recorded decision, not a silent change.

---

## 6. Where the project actually stands

**Genuinely strong, and worth saying plainly.** Phase 1 closed 60 review findings with a Codex
cross-model gate. Phase 2 shipped the deck register double-gated. The trust spine (deterministic
calculates → AI reasons → gatekeeper validates → human approves → audit records) is real and
enforced in code, not prose. The moat invariant holds: numbers bind from tool return values, and
`capUncorroboratedLiveConfidence` is shared by both routes. Fail-closed behaviour is pervasive and
correct — L-1 is *evidence* of that discipline working, not evidence against it.

**Open items:** 3 unpushed commits (`c14bd3c`, `686251a`, `bad802e`) — push is owner-gated.
Phase-2 deck design review is still an open owner gate.

---

## 7. Recommended sequence

1. **L-1 fix** — repoint `GROQ_DEFAULT_MODEL`, add a cross-family preflight, add a guard test.
   *(Bug fix, not a design decision — done this session.)*
2. **Owner decisions** — §8 below.
3. **Playground** per the existing plan (budget store + limits → Try-it surface → live toggle →
   security pass → gates).
4. **Deploy + smoke**, then walkthrough.

## 8. Decisions only the owner can make

- **D1 — does "real time" include live *signals*, or only live AI?** `useLiveSignals` defaults false
  (B-05), so a live run today reasons over *recorded* signals while `AGENTS.md` promises "a live
  disruption signal". The capability exists; the delta is a labelled toggle with honest freshness
  copy, not new plumbing.
- **D2 — move deploy earlier?** The daily cap, the per-IP limiter and the Vercel gateway-IP caveat
  (playground SC4) can only be *proven* on the real host. A cap tested only locally is not tested.
- **D3 — Phase-2 deck design review** — still open; blocks the Try-it surface (SC1 renders into the
  deck register), not the budget/limiter work.
- **D4 — push** the 3 local commits.
