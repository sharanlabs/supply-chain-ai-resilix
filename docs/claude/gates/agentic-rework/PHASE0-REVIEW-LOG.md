# Phase 0 Review Log — agentic rework (Codex cross-model design-grill)

Act 1 (owner grill) was completed during the claude-os triage that produced the LOCKED plan
(`~/.claude/plans/read-last-handoff-and-keen-globe.md`, owner-approved). This log is **Act 2** — the
cross-model adversarial review of that locked design. Review target: `PHASE0-GRILL.md`.
`MAX_ROUNDS=5`. Codex thread: `019f001e-2158-7652-a94e-77d6be40bf3d`. Read-only every round.

---

## Round 1 — Codex (VERDICT: REVISE)

Codex reviewed `PHASE0-GRILL.md`, the live repo, the installed `ai@5.0.204` source/types, plus two
focused subreviews (SDK loop semantics; backend/audit execution). 13 material findings — **all went past
the plan's own pre-listed 5 risks**, which is exactly the charge. Verbatim critique:

1. **Tool input integrity is not mechanized.** AI SDK `inputSchema` validates shape, but the model still
   chooses tool names and args; output binding does not stop wrong supplier sets, wrong threat scope, or
   illegal tool order. *Fix:* closure-bind tools to server-owned run context, accept only tiny
   selectors/enums, ignore model-supplied datasets, enforce a deterministic phase/state machine.
2. **The `$5` cap is not proven for the in-SDK loop.** `prepareStep` runs before `doGenerate` (can block
   the next billable step) but `onStepFinish` is post-call, and SDK retries can undermine accounting.
   *Fix:* enforce budget in `prepareStep`, commit usage in `onStepFinish`, `maxRetries: 0` (or pre-budget
   retries), fake-model test proving a `prepareStep` abort prevents `doGenerate`.
3. **Per-step cost estimates can drift** because `generateText` re-sends growing step history + tool
   results. *Fix:* cap/sanitize model-visible tool output, strict `maxOutputTokens`, estimate each step
   from current serialized size, fail closed when estimate is unavailable.
4. **`stopWhen` is under-specified.** Post-step, arrays are OR, `stepCountIs(n)` is exact equality, `~6`
   literally = `-7`, predicates can accidentally read model text. *Fix:* `MAX_INVESTIGATOR_STEPS = 6`;
   `corroborated`/`refuse` as pure predicates over `steps[*].toolResults.output` only; disagreement tests.
5. **Tool failures are not fail-closed by default.** SDK tool errors become `tool-error` outputs and the
   loop can continue. *Fix:* stop immediately on any `tool-error` or typed `FAIL_CLOSED` result, fail the
   packet before another model step.
6. **Phase 3's stochastic loop does not yet earn its risk.** Repo already has a validated deterministic
   waterfall, quarantined prompts, cross-family judge; the loop adds cost/stop/tool-input/leak risk before
   proving new value. *Fix:* ship deterministic domain wins, Skeptic, governed execution first; keep
   Investigator behind a flag until trajectory evals show it beats the waterfall.
7. **Skeptic quarantine can be bypassed transitively.** If findings/transcripts/tool-visible outputs carry
   raw news prose, the cross-family Skeptic inherits untrusted text. *Fix:* `SkepticInputSchema` of only
   deterministic tool outputs, IDs, numbers, URLs, sanitized digests; prohibit raw news / Sentinel
   summaries / Investigator prose / tool input strings.
8. **Cost ledger likely excludes the Skeptic/judge spend** (summed from `agentRuns`; judge tracked
   separately in evals). *Fix:* put Skeptic/judge into the same run ledger + cap, a cost event per model call.
9. **`executed_actions` is not designed deeply enough.** Approval/idempotency is packet-level; no
   action-level table/state machine; external sends can't be exactly-once in the existing approval txn.
   *Fix:* transactional outbox — immutable `action_id`, payload hash, status machine, claim/CAS worker,
   provider idempotency key, attempts, provider response, action-level audit.
10. **Approval granularity is ambiguous.** Packet-level approval can't represent selected-message approval,
    partial execution, failed actions, reversible internal actions. *Fix:* approval by explicit action
    IDs/version hashes; per-action `PENDING/APPROVED/REJECTED/CLAIMED/EXECUTED/FAILED`.
11. **The n8n boundary conflicts with the live legacy route.** `/api/n8n/approval-callback` authorizes
    approval today (tests assert it), but the design says n8n is downstream-only. *Fix:* quarantine/flag
    the legacy callback; separate downstream executor that can only update already-approved rows.
12. **Audit/observability too thin for execution** (small stable-hash audit IDs; mostly logs). *Fix:*
    UUID/ULID or SHA-256 execution audit IDs; redacted trajectory/execution events; metrics/alerts for
    stuck/retried/failed/partial.
13. **Immutable source versioning is missing from the trust story.** Binding to tool results is weaker if
    supplier CSV / signal enrichment / scenarios / pricing can change between tool call, approval, and
    execution. *Fix:* capture dataset/signal/scenario/pricing snapshot IDs + content hashes at run start;
    every tool/action/audit record references those immutable snapshots.

### Claude's response — Round 1 (primary-model-final)

**All 13 accepted.** Every finding is valid and material; none is a refutable nit. They cluster into five
workstreams and are resolved in `PHASE0-GRILL.md → "Revision 1"` with mechanized design changes:
- **Investigator-loop hardening (1–5):** closure-bound tools + selectors-only + phase state-machine;
  budget in `prepareStep`/`onStepFinish` + `maxRetries:0` + abort test; per-step size-based estimate +
  fail-closed; `MAX_INVESTIGATOR_STEPS=6` + pure tool-result predicates; halt on `tool-error`/`FAIL_CLOSED`.
- **Skeptic (7,8):** `SkepticInputSchema` (structured-only, no prose); Skeptic spend enters the run ledger+cap.
- **Governed execution (9–12):** action-level transactional outbox + state machine; per-action approval by
  ID+content-hash; legacy n8n callback quarantined, new executor is downstream-only; ULID/SHA-256 audit +
  execution observability.
- **Provenance (13):** run-start snapshot IDs + content hashes referenced by every tool/action/audit record.
- **Sequencing (6) — substance accepted, reorder SURFACED to owner:** P3 is made non-load-bearing — it
  stays `ENABLE_AGENT_LOOP=false` and is promoted only when trajectory evals prove it beats the waterfall,
  so all shippable value (P1 domain + P4 Skeptic + P5 execution) runs on the deterministic waterfall
  independent of the loop. The literal phase **reorder** (build P4/P5 before P3) is an owner-locked-plan
  decision → recorded as the headline Phase-0 recommendation for owner sign-off, not applied unilaterally.

Revised `PHASE0-GRILL.md` and re-submitted to the same Codex thread for re-review.

---

## Round 2 — Codex (VERDICT: REVISE — strong convergence)

Codex re-read the revised `PHASE0-GRILL.md`, re-checked `ai@5.0.204` source/types, and re-checked the
live packet approval / cost / judge / schema / n8n / audit code. **9 of 13 prior findings CLOSED** (R1,
R2, R4, R5, R7, R8, R10, R11, R12), **R13 CLOSED-with-caveat**, **R3/R6/R9 PARTIAL**, plus **4 NEW
material issues**. Codex confirmed the mechanisms are real (e.g. "`prepareStep` is pre-`doGenerate` in
`ai@5.0.204`"; "`StepResult.content` really can contain `tool-result`/`tool-error`").

PARTIAL + NEW (verbatim essence):
- **R3 (cost drift):** transcript-sized estimate is the right mechanism, but "size" must be a conservative
  token/cost UPPER BOUND, not a heuristic; specify the bound + max output cost; fail closed if usage can't
  be bounded.
- **R6 (sequencing):** flag-off/non-load-bearing is good, but the roadmap still says numbering is unchanged
  pending owner sign-off — amend the roadmap so P3 is an optional experiment after P1/P4/P5, OR record an
  explicit owner decision to keep the order. **(Owner-gated — see below.)**
- **R9 (outbox):** "provider idempotency key = exactly-once external send" OVERCLAIMS; model ambiguous send
  outcomes, claim leases/timeouts, reconciliation, provider-specific guarantees — promise exactly-once
  INTENT, not exactly-once DELIVERY.
- **NEW-1:** AI SDK telemetry records prompt/tool attributes; Langfuse "dev tracing" could leak raw prose —
  default raw telemetry OFF, emit only the redacted trajectory schema, local-only, test no raw prose leaks.
- **NEW-2:** Slack interactive approvals are a new authorization surface — require signing-secret
  verification, replay window, user→approver mapping, and action-id/payload-hash lookup before any approval
  mutation (Slack must not become an approval authority).
- **NEW-3:** snapshot provenance can re-open quarantine if raw signal snapshots are dereferenceable —
  split raw server-only snapshots from sanitized model-visible evidence snapshots.
- **NEW-4:** execution state machine lacks REJECTED/CANCELLED/EXPIRED + crash-recovery — add those states,
  claim-lease expiry, retry deadline, manual reconcile.

### Claude's response — Round 2 (primary-model-final)

All technical items **accepted** and mechanized in `PHASE0-GRILL.md → "Revision 2"`: R3 (conservative
upper-bound estimate + fail-closed), R9 (exactly-once INTENT + leases + reconciliation), NEW-1 (telemetry
redaction off-by-default + test), NEW-2 (server-side Slack signature/replay/approver-mapping gate), NEW-3
(two-tier raw/sanitized snapshots), NEW-4 (fuller state machine). **R6 is the one genuine owner decision**
the grill surfaced — it changes the owner-locked phase order, so it is escalated to the owner this session
(AskUserQuestion: reorder P3-after-P1/P4/P5 vs keep order vs drop P3). The roadmap is amended per the
owner's answer, then a final Codex round confirms before any code.

**Owner decisions (2026-06-25):** (1) Sequencing = **REORDER** ("value first, loop last & gated"); (2)
Run mode = **`/autopilot`** (engaged only after final APPROVE). R6 resolved in the doc; execution order
amended to `P1-domain → P2-quarantine → P4-Skeptic → P5-execution → P6-war-room-UI → P7-evals → P3-loop
(optional, gated last)`.

---

## Round 3 — Codex (VERDICT: APPROVED) ✅ GATE DISCHARGED

Codex re-read the revised `PHASE0-GRILL.md` + local SDK/repo evidence: "I found no remaining material
blocker before code begins." All Round-2 open items + new issues CLOSED:
- **R3** CLOSED — conservative worst-case bound, pinned price row required, fail-closed if unbounded.
- **R6** CLOSED — now an explicit owner decision (not a recommendation); execution order amended in the doc.
- **R9** CLOSED — promise downgraded to "exactly-once intent + at-least-once delivery with dedupe +
  reconciliation," with claim leases, provider idempotency, and `NEEDS_RECONCILE`.
- **NEW-1** CLOSED — Codex verified the SDK supports it (`isEnabled` gate; `recordInputs/recordOutputs:false`).
- **NEW-2** CLOSED — Slack is transport only; server verifies signature/replay/actor/`action_id`/`payload_hash`.
- **NEW-3** CLOSED — raw snapshots server-only; only sanitized snapshots are model/UI-visible.
- **NEW-4** CLOSED — `REJECTED/CANCELLED/EXPIRED/NEEDS_RECONCILE`, lease expiry, retry deadline, reconcile.

**Non-blocking carry-forward → Phase 5 (governed execution):** when a `CLAIMED` lease expires after a
*possible* external send, reclaim may auto-replay ONLY if provider idempotency makes it safe; otherwise
route to `NEEDS_RECONCILE`. R9′ already states this model — it is an implementation constraint, not a
design blocker.

### Gate result
**PHASE 0 — DISCHARGED.** Documented cross-model APPROVE over 3 rounds (REVISE-13 → REVISE-3+4 → APPROVED),
**zero code written** (the plan's hard rule satisfied). First code touch — **Phase 1 (P1 domain wins)** —
is unblocked. Codex thread `019f001e-2158-7652-a94e-77d6be40bf3d`. Artifacts: `PHASE0-GRILL.md` (design +
Revisions 1–2), this log.

