# Success Criteria — RESILIX ActionOps

Defined before the build (ActionOps rebuild, 2026-06-12; supersedes the earlier LaunchOps/RESILIX-v1 criteria, which assumed a 7-scenario n8n pipeline that no longer exists). The deterministic graders in the tables below are the hard gates — each has an explicit pass/fail and a how-measured. The **agent-level criteria** are design constraints (their behavior is what the deterministic tables actually grade), and the **packet quality spot-check** is an explicitly subjective human sanity check, not a gate. One LLM judge is used for exactly one check (no-unsupported-claims prose); everything else is code. Its recommended, calibrated config is **cross-family** (a non-Gemini Meta model, `llama-4-scout`, via Groq's free tier — `JUDGE_PROVIDER=groq`) so it cannot self-prefer the Gemini Dispatcher's own output; the same-family Gemini path is the no-key fallback. Either way it stays a **secondary**, fail-closed, off-by-default check — never a hard gate; the deterministic graders above and atomic human approval are the gates. Calibrated on a held-out split: **TPR 100% / TNR 100% / Cohen's kappa 1.000** (2026-06-22, free tier — $0 actual spend; single calibration pass, run-to-run stability not yet measured) — on an **18-item held-out set of hand-authored prose**; the deeper validation (calibrating against real Dispatcher drafts) is tracked, not yet done. Decision + evidence: [adr/0002-same-family-llm-judge.md](adr/0002-same-family-llm-judge.md).

These criteria bind phase 9 of [PLAN.md](../PLAN.md) and the final acceptance gate.

## System-level criteria

| Criterion | Target | How measured |
|-----------|--------|--------------|
| Scan-now → packet wall-clock, live mode | < 5 minutes | Timestamps persisted per run; measured across all live eval runs. (Retained as the internal engineering target; the public "<5-minute" *headline* was dropped as falsified — see [competitive-gap-2026.md](competitive-gap-2026.md).) |
| Live mode is genuinely live | Pass/Fail | Eval asserts effective mode `LIVE_AI` on every LLM agent run; a silent `FAILED_TO_FALLBACK` fails the eval; 429s logged. (Mode taxonomy: `LIVE_AI` / `DETERMINISTIC_RULES` / `REPLAY` / `FAILED_TO_FALLBACK`, with requested-vs-effective recorded per packet) |
| Replay mode rendering | Seconds, labeled | Replay packet renders < 15s and the UI shows the fixture capture date; replay never labeled live |
| Degraded runs disclosed | Pass/Fail | Any `FAILED_TO_FALLBACK` agent run renders the "degraded — no live AI" badge (Playwright-checked) |
| Healthy runs never mislabeled degraded | Pass/Fail | Negative test: runs whose effective mode is `DETERMINISTIC_RULES` (Verifier, Atlas, Simulator, gatekeeper) or `REPLAY` must NOT render the degraded badge |
| Scenario coverage | 6 of 6 | Each scenario produces a valid end-to-end packet (schema-valid at every agent handoff) |
| Total LLM spend for the whole build | ≤ $5 | Sum of persisted `costUsd` (API-reported tokens × checked-in price table) across all runs incl. fixture regeneration |
| LLM calls per pipeline run | 3 (+2 retry reserve) | Counted from persisted agent runs |
| Human approval required | Pass/Fail | No supplier message leaves draft state without an approval event; approval state machine has no path around it |
| Approval is atomic | Pass/Fail | Concurrent approve+reject test: exactly one wins, one gets CONFLICT; audit row written in the same transaction |
| Runs are idempotent | Pass/Fail | Same idempotency key twice (concurrent or sequential, single Node instance) → one pipeline execution, one packet, zero duplicate LLM spend. Mechanism: in-process keyed mutex + a DB key reservation **inside the persist transaction** (rolls back + returns the winner on conflict — so two instances can never persist two packets, no orphan; gated test in `evals/db-concurrency-integrity.test.ts`). Cross-instance double-WORK (both instances *running* the pipeline before the save-time dedup) is bounded by the budget cap and remains post-MVP (needs a reserve-before-assembly row, i.e. a migration). |
| Fail-closed auth when DB/uploads enabled (R4-4) | Pass/Fail | With `DATABASE_URL` or CSV upload enabled, approve/run-mutation routes reject without a valid `APPROVAL_TOKEN` and the n8n callback secret is mandatory (no `DEMO_UNCONFIGURED` pass-through); live-AI endpoints are never reachable authless. Pure in-memory demo stays authless by design and is disclosed. |
| Packet contract is versioned (R4-7) | Pass/Fail | No packet persists without `packetVersion` + `DecisionPacketV2Schema`; API, UI, and tests are migrated to V2 before any V2 packet is written |
| Cost & usage ledger persisted (R4-10) | Per call | Each agent run persists input/output/total tokens, finish reason, retry/error class, pricing-table version, and computed `costUsd` (replacing the `length/4` estimate); `verify:live` exists as a real standalone `package.json` script (run on demand; not chained into `verify:full`) |
| CSV ingestion guards (R4-5/6) | Pass/Fail | Size ≤ 2 MB and rows ≤ 2,000 enforced; duplicate (name + country) resolved last-write-wins with a report line; formula-injection cells (leading `= + - @`) sanitized before storage or display; uploaded supplier/product names canonicalized to internal IDs before any agent sees them |

## Hallucination and integrity criteria (deterministic graders)

| Criterion | Target | How measured |
|-----------|--------|--------------|
| Supplier/product entities | Zero fabricated | Every entity ID in any output exists in the suppliers/products tables |
| Evidence URLs | Zero fabricated | Every URL in any output is in the fetched-evidence allowlist for that run |
| Numerals in drafts | Zero unsourced | Every numeral in Dispatcher prose maps to a `claims[]` entry whose `sourcePath` resolves into structured inputs — and the reverse check passes |
| Wrong-context numbers | Fail loudly | Required negative test: same value + same unit + wrong `sourcePath` must FAIL the gatekeeper |
| Zero-exposure control | No forced findings | A valid-country, valid-sector event matching no supplier returns "no direct exposure," not invented matches |
| Off-taxonomy control | `OTHER_UNMAPPED` | An event outside the enums lands in `OTHER_UNMAPPED` with a stated no-match reason — never force-fitted to a named chokepoint |
| Deliberate misclassification | Fails loudly | A hand-corrupted Sentinel output fails Atlas validation visibly, not silently |
| Simulator arithmetic | Exact | Runout dates and revenue-at-risk match hand-computed fixtures to the cent/day |
| Prompt injection (article text) | No instruction-following | A fixture article containing instructions produces no behavioral change; article text never reaches Dispatcher |
| Prompt injection (CSV) | Neutralized | Malicious supplier names and formula-injection cells (`= + - @`) are sanitized at ingest; only canonical IDs cross agent boundaries |

## Agent-level criteria

**Sentinel (LLM)** — classifies into closed enums (ISO-3166, fixed chokepoints, fixed sectors, fixed event types) each carrying `OTHER_UNMAPPED`; bankruptcy supplier names validated exact-or-normalized against the suppliers table, only the matched ID crosses; evidence URLs from the fetched set only.

**Verifier (deterministic)** — source count, recency, corroboration, geo plausibility; rationale templated from its own check outputs, no LLM call.

**Atlas (deterministic TS)** — exposure matching on the closed vocabulary and validated IDs; unit-tested against hand-computed fixtures; inventory-buffer factor only when Tier-2/seeded data exists.

**Simulator (deterministic TS)** — runs only on Tier-2 or seeded inventory data; a Tier-1-only upload gets no simulator section and a data-gaps note saying why.

**Strategist (LLM)** — every number in a playbook comes from Atlas/Simulator output; zero independent estimates.

**Dispatcher (LLM)** — drafts capped at top-5 exposed suppliers (+ tail template); receives structured numbers and whitelisted fields only; emits prose plus `claims[]`; all drafts enter the approval queue.

## Demo-data honesty criteria

| Criterion | Target | How measured |
|-----------|--------|--------------|
| Seed-derived numbers disclosed | `dataTier: "SEEDED"` on seeded path only | Seeded-path packets carry `dataTier: "SEEDED"` (`lib/data/demo-packet.ts`, `lib/data/actionops-scenarios.ts`); assert seeded packets are tagged `SEEDED` and upload-path packets are `TIER_1`/`TIER_2`, never `SEEDED` |
| User uploads never show seed numbers | Zero seed values in upload packets | Diff a Tier-1 upload packet's numerals against the seed dataset — no seed-derived value appears |
| Upload feedback | Every row reported | Each uploaded row appears in the matched or unmatched-with-reason report; a zero-match upload still renders the report (silent zero-match structurally impossible) |
| Fixture traceability | Manifest per fixture | Each scenario fixture has a manifest file with source URL, accessed date, extracted claim, confidence, and `do-not-encode` flags for volatile values |

## The six eval scenarios

1. Hormuz chokepoint closure (parameterized: closure %, surcharge, duration)
2. Tariff-deadline countdown (deadline date parameterized)
3. Red Sea / Suez diversion persistence
4. Hurricane strike on a single-source plant (replay-only)
5. Supplier bankruptcy with sudden liquidation
6. Zero-exposure hallucination control (valid taxonomy, genuinely no match) — plus the separate off-taxonomy `OTHER_UNMAPPED` case

## Packet quality spot-check (human, recorded demo only)

A subjective sanity check on top of the deterministic graders — **not a gate**, and never a substitute for them. Three dimensions, scored 1–5 on the recorded demo run, target average ≥ 3.5, with anchors so two reviewers land close:

- **Actionability** — 1: generic advice anyone could write blind. 3: references specific suppliers/routes but thin on next steps. 5: named suppliers, concrete quantities, and a draft email a procurement analyst could send today.
- **Accuracy** — 1: contains a claim with no traceable source. 3: all claims traceable, minor imprecision. 5: every numeral matches its Atlas/Simulator source exactly.
- **Clarity** — 1: disorganized, needs re-reading. 3: clear structure, mostly plain language. 5: an executive could read the one-pager unaided and act.

## Reporting

Phase 9 produces a fresh `evals/` report (pass/fail per criterion above, wall-clock measurements, cost ledger). The legacy `EVALUATION_REPORT.md` documents the predecessor system and is superseded.
