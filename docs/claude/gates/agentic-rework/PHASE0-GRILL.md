# Phase 0 — Codex Design-Grill (agentic rework)

**This is the adversarial-review target.** It is the LOCKED, owner-approved design to turn RESILIX
from a deterministic decision pipeline (with an LLM prose layer) into a **governed multi-agent
"crisis-to-action" system**. No code is written in Phase 0. The gate exits on a documented Codex
`VERDICT: APPROVED`. Canonical plan lives at `~/.claude/plans/read-last-handoff-and-keen-globe.md`
(outside the repo / unreadable in the sandbox — reproduced in full below).

---

## ⚔️ YOUR CHARGE, REVIEWER — read this first

The design **already enumerates its own 5 hardest risks + a moat-killer list** (see §Risks at the
bottom). **Re-confirming those is a rubber stamp, not a review.** Your job is to find what the design
*did not list*: the unstated assumptions, the second-order failure, the simpler alternative, the place
where a claim is asserted but not mechanized. Be skeptical and specific. For each finding give a
one-line fix. You are read-only — do not modify files.

Probe at least these (the maker has pre-loaded verified facts so you argue from code, not from the
plan's self-claims — see §Verified grounding):

1. **Input-side integrity (not just output binding).** The design's "authoritative binding" invariant
   protects tool *outputs* from being laundered through LLM prose. But a tool loop hands the model
   control of tool *inputs* — which tool it calls and **with what args**. The deterministic guarantee
   is only "correct inputs → correct math"; "every number traces to a source" can hold even when the
   model fed the exposure tool the **wrong supplier set**. Today inputs are code-wired (waterfall);
   the loop is a NEW error/attack surface. Does the design actually close it, or only the output side?

2. **Does the `$5` hard-stop survive the tool loop?** Today `assertWithinBudget` throws *before*
   `generateObject` bills — a clean pre-call guard (verified, see §Verified grounding). But
   `generateText({tools, stopWhen})` runs N model calls *inside* the SDK loop; that guard sits
   *outside* it. AI SDK 5.x exposes `prepareStep` (pre-step), `stopWhen` predicates, and
   `onStepFinish` (post-step). Is "cap as a guard, not a hope" still true once N internal billable
   steps run? What is the exact abort semantics — does a throw in `prepareStep` prevent that step's
   billable call, or only the *next* one (overshoot by one step)? Name the mechanism the design must use.

3. **Phase necessity / sequencing (highest altitude — you are licensed to challenge it).** The existing
   system works, is gated, shipped, and validated live (8/8 scenarios, $0.0284 total). The rework's
   highest-value parts may be domain credibility (P1), the cross-family Skeptic (P4), and governed
   action execution (P5). The stochastic **Investigator loop (P3)** adds the cost, the input-integrity
   surface (#1), and the budget complexity (#2). Does P3 earn its place, or does most of the value land
   by keeping the deterministic waterfall and bolting on the Skeptic + execution? Challenge the locked
   sequencing if the evidence supports it.

4. **`stopWhen` predicate derivability.** The design wants `stopWhen: [stepCountIs(~6), corroborated,
   refuse]`. Are "corroborated" and "refuse" expressible as pure functions of accumulated tool results
   (the only authoritative source), or do they smuggle in a read of the model's prose?

5. **Skeptic quarantine inheritance.** The Dual-LLM quarantine stops raw GDELT news at Sentinel. The
   cross-family Skeptic critiques the Investigator's finding. Does the Skeptic's input transitively
   inherit any news-derived raw text the Investigator chain carried — i.e. can untrusted prose reach
   the Skeptic through the back door?

6. **Anything else that breaks.** Race conditions, schema conflicts, idempotency/audit holes in the new
   `executed_actions` path, the n8n "downstream-only, never authorizes" boundary, observability gaps,
   a wrong assumption about the installed `ai@5.x` API, or a materially simpler architecture.

End your reply with EXACTLY one line: `VERDICT: APPROVED` if the design is sound enough to implement
(Phase 1 may begin), or `VERDICT: REVISE` if it still has material problems.

---

## ✅ Verified grounding (facts the maker confirmed in the live repo + node_modules, 2026-06-25)

- `lib/agents/actionops/index.ts` is a **fixed deterministic waterfall** (Sentinel → Verifier → Atlas →
  Simulator → `decideRecommendation` → Strategist/Dispatcher → gatekeeper). Not a tool loop today.
- `lib/agents/run.ts` calls `generateObject({ model, schema, prompt, maxOutputTokens })` — **no `tools`
  parameter**. So today's system is genuinely not an agent; this is the gap the rework closes.
- `assertWithinBudget(spentUsd, estimatedNextUsd, capUsd)` is called **before** `generateObject`, so a
  breach throws and the billable call is never made (the current "cap as guard, not hope").
- Installed: **`ai@5.0.204`** (range `^5.0.98`), `@ai-sdk/google@^2.0.11`, `@ai-sdk/groq@^2.0.42`.
  `node_modules/ai` exports `prepareStep?: PrepareStepFunction`, `onStepFinish`, `stopWhen`,
  `stepCountIs`, `hasToolCall` on `generateText`. So a tool loop + a pre-step hook are real, installed
  capabilities — no new dependency needed.
- The repo already has: the Dual-LLM quarantine (`sentinel.ts`), the deterministic fns
  (`verifier`/`atlas`/`simulator`/`recommendation`), the server-side approval/idempotency/audit spine
  (`runActionOpsGatekeeper`, `transitionApproval`), a per-run `$5` budget ledger, mode taxonomy
  (LIVE_AI / DETERMINISTIC_RULES / REPLAY / FAILED_TO_FALLBACK), Vitest+Playwright gates, and a
  cost ledger. Live AI was validated 8/8 scenarios at **$0.0284 total**.

---

## 📋 THE LOCKED DESIGN (verbatim)

### Context — why this work
RESILIX today is a deliberately well-built deterministic decision pipeline with an LLM prose layer —
not a true agent (verified above). The owner wants a genuinely agentic, multi-agent product — the
*right* kind for the problem, on a free/free-tier industry stack, with real SCRM domain credibility,
without losing the injection-hardening/audit moat. Two parallel expert passes (architecture + SCRM
domain) confirmed the direction and sharpened it.

### Problem statement
A US mid-market manufacturer (50–499 employees) with no dedicated SCRM team and no control-tower
software learns of a supply-chain disruption from a news headline (chokepoint closure, tariff deadline,
supplier bankruptcy, hurricane). Today a procurement lead manually scrambles to answer four questions,
slowly and often too late: (1) Is it real? (2) Who of MINE is hit, and is there a backup? (3) How fast
does it bite — when do I stock out, how much revenue/margin at risk? (4) What do I DO, and who do I tell?

### End-goal / what DONE looks like
RESILIX is a governed multi-agent "crisis-to-action" system that does what that procurement lead does —
in minutes, with evidence and governance. Given a live disruption signal + supplier data:
- an autonomous **Investigator** agent uses **tools** to corroborate the threat, map exposure (TTR/TTS-
  based, single-source-aware), and simulate runway + margin-at-risk;
- an independent **Skeptic** agent (cross-family) challenges the finding before it's accepted;
- only if it clears a confidence + corroboration gate, it produces scored mitigation options (expedite /
  reallocate / substitute, with cost/speed/risk) and drafts impact-assessment outreach;
- after a human approves, it CLOSES THE LOOP — executing governed actions: auto-firing reversible/
  internal ones (Slack/Teams alert, log, ticket), human-gating irreversible/outward ones (supplier
  email, RFQ to a qualified alternate, n8n→ERP case).

**Invariants (the moat, preserved as architecture):** every number traces to a source; deterministic
tool results bind the packet — never the LLM's prose; raw news never drives an action (Dual-LLM
quarantine; Rule-of-Two satisfied); nothing irreversible happens without a human, enforced server-side.
Free/free-tier industry stack; demonstrably a true agentic system (visible tool-using loop + multi-agent
cross-check).

**Verify DONE by:** the agentic loop runs end-to-end on all scenarios within step + $5 caps; trajectory
evals + adaptive injection red-team + NO_ACTION regression are green; a human-gated outward action
executes exactly once with an immutable audit record; an SCRM professional finds the exposure/runway/
playbook/email content credible.

### What kind of product, and why
A governed multi-agent system (single tool-using Investigator + one independent Skeptic critic +
governed action execution) — NOT a swarm, NOT a workflow, NOT RAG. Why this exact shape: the
investigation/corroboration step is genuinely open-ended → an agent earns its keep there; the math must
be exact → stays deterministic tools; the chain shares context → a parallel swarm hurts (Anthropic/
Cognition), so exactly one critic, not many; actions are high-stakes → governed execution, autonomy in
investigation, governance on action.

### Architecture (additive, codebase-grounded — not a rewrite)
The one load-bearing rule — Authoritative binding: `exposureResults`, `simulation`, `verifierChecks`,
`recommendation` are bound from deterministic tool RETURN VALUES, never the Investigator's narration.
After the loop, `decideRecommendation` is re-called in code as the final authority.

Flow: `signal → [Dual-LLM QUARANTINE: Sentinel emits a typed ThreatCard; raw news stops here] →
[INVESTIGATOR loop: generateText({tools, stopWhen:[stepCountIs(~6), corroborated, refuse]}); binds
slices from tool results] → [SKEPTIC: cross-family, fail-closed boolean that gates] →
decideRecommendation (code-authoritative) → Strategist/Dispatcher (drafts) → Gatekeeper (citation,
fail-closed) → human approval → [GOVERNED EXECUTION: classify reversible vs irreversible → executor
(Slack/email/n8n), idempotent + audited]`.

Key reuse (by path): `lib/agents/actionops/index.ts` (extended, branch on an `ENABLE_AGENT_LOOP` flag —
flag-off keeps the exact tested waterfall green), `lib/agents/run.ts` (add `liveRunAgentLoop` beside the
existing call boundary; same budget hard-stop + retry reserve), the deterministic fns in
`verifier/atlas/simulator/recommendation.ts` (wrapped as typed tools in a new `tools.ts`, fail-closed
logic stays inside), `sentinel.ts` (already the quarantine), the firewalls + `runActionOpsGatekeeper` +
`transitionApproval` (the server-side approval/audit spine, extended per-message).

### Tech stack (free/free-tier, industry-standard + enterprise path)
- **KEEP:** Next.js 16 + TS; AI SDK `ai@5.x` as the agent runtime (`tool()`+`stopWhen`); `@ai-sdk/google`
  Gemini 2.5 Flash; `@ai-sdk/groq` Llama-4 (cross-family Skeptic); Drizzle+Postgres; Zod; Vitest+
  Playwright; pino. No LangGraph (would fork the stack, duplicate the budget/firewall boundary). Gemini
  the only paid item (≤$5 cap, measured $0.0284/8 scenarios).
- **ADD:** Action executors — Slack Web API (free; interactive-approval buttons for the HITL gate) +
  email (Resend free 3k/mo or SMTP) + n8n (OSS self-host, the iPaaS glue to ERP); Langfuse (OSS, dev
  tracing only); promptfoo + garak/PyRIT (OSS injection red-team).
- **DEFER:** pgvector (only if the Investigator ever needs retrieval memory — not MVP).
- **REMOVE:** nothing of substance (n8n moves from "legacy" to optional downstream executor; legacy V1
  path stays as the oracle-fixture builder).
- Expert call: lead the demo with Slack + email (free, best bot/approval-button UX); name Teams as the
  segment-fit enterprise path. n8n returns as the action-execution backbone but stays DOWNSTREAM of the
  in-app gate — it executes only already-approved, authorized actions, never authorizes.

### Domain bar-raisers (fold in — make the content credible to an SCRM pro)
1. TTR/TTS spine (Simchi-Levi/MIT REI; HBR 2014): single-source penalty in Atlas using the
   `backupSupplierId` already in the schema; start the revenue-loss clock at runout (TTS), not day 0.
2. Rewrite supplier emails as impact-assessment requests (confirm ship dates/on-hand/recovery/force-
   majeure/sub-tier) — fix the current bug that sends suppliers their own internal exposure score.
3. Resurrect the V1 `RecoveryOptionSchema` (scored EXPEDITE/REALLOCATE/SUBSTITUTE/SPLIT/ESCALATE with
   cost/speed/risk/reversibility) — `reversibility` becomes the governance dial.
4. Margin-at-risk alongside revenue-at-risk — add `marginPct` to the data model.
5. Add threat types: `MATERIAL_SHORTAGE_ALLOCATION`, `EXPORT_CONTROL`, `QUALITY_RECALL`.
6. Map actions to real artifacts — RFQ to a qualified alternate, PO-change/expedite request, ERP
   exception case, role-owner alert.
7. Frame governance in the field's vocabulary: three-tier HITL (RESILIX is tier-2 "recommend-with-
   approval"), maker-checker, EU AI Act Art. 14 / NIST AI RMF as oversight anchors. Ship the
   deterministic Ops + Finance playbooks too (README promises all three roles; only Procurement ships).

### Roadmap (each phase ships behind a gate; flag-off waterfall stays green throughout)

> ⚠️ **SUPERSEDED by R6 (Revision 2, below):** execution order amended to `P1-domain → P2-quarantine →
> P4-Skeptic → P5-execution → P6-war-room-UI → P7-evals → P3-loop (optional, gated last)`, and **P1 is
> domain-wins ONLY** (the tool-layer wrapping moves to the P3 cluster). The per-phase lines below predate
> the owner's 2026-06-25 reorder — read them for phase *identity*, not order/bundling.
- **Phase 0 — Codex design-grill.** This plan survives cross-model review. Gate: documented APPROVE, no code.
- **Phase 1 — Tool layer + quick domain wins.** Wrap deterministic fns as typed tools (byte-identical
  parity); land threat-type enum + supplier-email rewrite. Gate: `verify` + parity tests.
- **Phase 2 — Dual-LLM GDELT quarantine (formalize + static guard).** Prove no raw signal prose reaches
  any Investigator prompt/tool. Gate: `verify` + extended `injection.test.ts`.
- **Phase 3 — Investigator loop** (behind `ENABLE_AGENT_LOOP`, step + $5 capped, firewalled; bind from
  tool results; re-ground the "3+2" call-count contract). Gate: `verify` + `verify:live` smoke + parity.
- **Phase 4 — Skeptic critic** (cross-family, fail-closed, calibrated TPR/TNR) + TTR/TTS exposure +
  margin-at-risk + scored recovery options. Gate: `verify` + calibration test.
- **Phase 5 — Governed action execution** (Slack/email/n8n; graduated autonomy; server-side auth;
  idempotent; audited; new `executed_actions` table). Gate: `verify:full` + idempotency/auth tests.
- **Phase 6 — War-room deliberation UI** (live tool-call trajectory + Skeptic verdict, sourced from
  `packet.agentRuns` so the $0 REPLAY offline demo still works). Gate: `verify:full` + e2e + a11y.
- **Phase 7 — Agentic evals + adaptive injection red-team** (trajectory evals, GDELT-shaped adversarial
  payloads, NO_ACTION regression). Gate: `verify:full` + red-team CI.

### Verification (end-to-end)
`npm run verify` / `verify:full` green at every phase; trajectory/tool-call evals (right tools, stop on
corroboration/refusal, never retry past a fail-closed tool); adaptive indirect-injection red-team (zero
injection reaches a draft/execution, zero number-laundering); NO_ACTION/corroboration regression
(already live-validated at confidence 0.10); a human-gated outward action executes exactly once with an
immutable audit row; domain-credibility check (an SCRM-literate reviewer accepts the content).

### Risks (the plan's OWN list — DO NOT just re-confirm these; find what's missing)
1. Authoritative binding — bind from `toolResults`, re-call `decideRecommendation` in code (binding from
   prose = moat collapse).
2. Call-count/budget contract — loop+Skeptic break the "3(+2)=5" criterion; re-ground in Phase 3 (dollar
   cap unchanged; `assertWithinBudget` fires every step).
3. Fail-closed logic stays in the tools — the model must not retry past an Atlas/recommendation FAIL.
4. Server-side, unforgeable, idempotent execution — per-message projection on the existing approval/
   idempotency spine (`needsApproval` is absent in installed `ai@5.x`; the real gate is server-side).
5. A calibrated Skeptic, not ceremony — fail-closed + TPR/TNR calibrated, or it's security theater.
Moat-killers to never do: bind a number from Investigator prose; let a re-query tool surface raw GDELT
prose; fail-open the Skeptic; accept free-form/un-firewalled content at an executor; reset the budget
per-step; make the war-room feed depend on a SaaS (breaks the $0 offline demo).

---

## 🔧 REVISION 1 — resolutions to Codex Round 1 (AUTHORITATIVE for the changed decisions)

Codex Round 1 returned REVISE with 13 material findings (full text + Claude's adjudication in
`PHASE0-REVIEW-LOG.md`). **All 13 accepted.** The design changes below are mechanized — they supersede
the original §Architecture / §Tech-stack / §Roadmap wherever they conflict.

**R1 — Tool input integrity (closure-bound tools, selectors-only, phase state-machine).** The Investigator
never passes datasets. Each run constructs its tools as **closures over server-owned run context** (the
loaded+validated supplier set, the typed ThreatCard, the run's snapshot IDs — see R13). A tool's
`inputSchema` accepts only **small selectors/enums drawn from that context** (e.g. a `supplierId` that
must be ∈ the run's validated set; an exposure-window enum), never arrays of records. An arg outside the
run context → a typed `FAIL_CLOSED` result (R5). A deterministic **phase state-machine** constrains tool
ORDER (cannot simulate before exposure is mapped, cannot draft before `decideRecommendation`). The model
chooses WHICH selector; the code owns WHAT data. This closes the input side that output-binding leaves open.

**R2 — Budget proven for the in-SDK loop.** Budget is enforced in **`prepareStep`** (runs before
`doGenerate`): `assertWithinBudget(spent, estimatedNext, cap)` throws there → that step's billable call
never happens. **`onStepFinish`** commits ACTUAL usage to the run ledger. The `generateText` call sets
**`maxRetries: 0`**; the bounded "+2 retry reserve" is modeled as explicit re-asks, each re-entering the
same `prepareStep` gate. A fake-model unit test asserts a `prepareStep` throw prevents `doGenerate` (zero
usage recorded). "Cap as a guard, not a hope" now holds per-step, not just at the outer boundary.

**R3 — Per-step cost-estimate drift controlled.** Because `generateText` re-sends the growing transcript,
each step's pre-call estimate is computed from the **current serialized prompt + accumulated tool-output
size**, not a fixed initial figure. Model-visible tool outputs are **capped + sanitized to small
structured digests** (never raw blobs). `maxOutputTokens` stays strict (`MAX_LIVE_OUTPUT_TOKENS`). If an
estimate cannot be computed, **fail closed** (no step).

**R4 — `stopWhen` specified.** `const MAX_INVESTIGATOR_STEPS = 6` (a real constant — the original
`stepCountIs(~6)` was a bug: `~6 === -7` in JS). `stopWhen: [stepCountIs(MAX_INVESTIGATOR_STEPS),
corroborated, refuse, toolFailed]`. `corroborated` / `refuse` / `toolFailed` are **pure predicates over
`steps[*].content` typed tool-result outputs ONLY** — never model text. Disagreement tests (predicate true
vs false on crafted tool-result fixtures) are part of the Phase-3 gate.

**R5 — Tool failures fail closed.** Any AI SDK `tool-error` part OR a typed `FAIL_CLOSED` tool result
**halts the loop immediately** (the `toolFailed` stopWhen predicate). Post-loop code treats an
incomplete/failed trajectory as a packet failure (NO_ACTION or hard error) — the model can never "retry
past" an Atlas/recommendation FAIL or launder a failed tool into a continue.

**R6 — Investigator loop is made non-load-bearing (risk-gated); reorder SURFACED to owner.** P3 stays
`ENABLE_AGENT_LOOP=false` and **carries no shippable value on its own**: P1 (domain credibility), P4
(Skeptic), and P5 (governed execution) all run on the **deterministic waterfall** and do not depend on the
loop. P3 is promoted to default-on **only** when trajectory evals demonstrate it **beats the waterfall** on
a defined metric (corroboration quality / exposure correctness) at acceptable cost — else the product
ships on waterfall + Skeptic + execution. **OWNER DECISION (recommended, not unilaterally applied):**
build P4 + P5 + the P1 domain wins **before** investing in P3, so value lands early and the loop is only
attempted against a proven baseline. The locked plan's phase numbering is unchanged pending owner sign-off.

**R7 — Skeptic input quarantined (`SkepticInputSchema`).** The cross-family Skeptic receives a typed object
of **deterministic tool outputs, IDs, numbers, URLs, and sanitized digests ONLY**. It is schema-prohibited
from raw news, Sentinel free-text summaries, Investigator prose, and tool-input strings. The Dual-LLM
quarantine thus extends to the critic — no untrusted text reaches it transitively.

**R8 — Unified run ledger + cap.** The Skeptic call (and any judge call made inside a run) emits a
first-class cost event / `agentRun` and counts against the **same per-run `$5` ledger + cap** as the three
agents. The cap accounts for ALL model spend in a run, not just the Investigator's.

**R9 — `executed_actions` = transactional outbox.** New action-level table: immutable `action_id`
(ULID), `payload_hash`, a status state-machine (`PENDING→APPROVED→CLAIMED→EXECUTED|FAILED`), a **claim/CAS
worker** (exactly one executor wins a row), a **provider idempotency key** (exactly-once external send),
`attempts`, `provider_response`, and action-level audit rows. The approval txn writes APPROVED rows; a
separate worker claims + sends — decoupling external I/O from the approval transaction.

**R10 — Per-action approval (ID + content hash).** Approval authorizes **specific `action_id`s at a
specific `payload_hash`**, not a whole packet. Per-action states support partial approval, selective send,
reversible-internal auto-fire vs irreversible-outward human-gate, and failed-action handling. A content-
hash mismatch at execution time → reject (the approved thing must be the executed thing).

**R11 — n8n legacy boundary resolved.** The legacy `/api/n8n/approval-callback` (which authorizes approval
today) is **quarantined behind a flag and not extended** (per `AGENTS.md`). The NEW n8n executor is a
**separate downstream path that can ONLY transition already-APPROVED action rows toward EXECUTED** — it
executes, never authorizes. Existing legacy tests stay green under the flag; the new path gets its own
auth + idempotency tests.

**R12 — Execution audit/observability hardened.** Execution audit IDs are **ULID/SHA-256-backed** (not the
small stable-hash). Redacted **trajectory + execution events** are emitted via the existing pino logger.
Metrics/alerts cover stuck / retried / failed / partially-executed actions.

**R13 — Immutable source provenance (snapshots).** At run start, capture **snapshot IDs + content hashes**
for the supplier dataset, signal enrichment, scenario, and pricing table. Every tool result, action row,
and audit record **references those immutable snapshot IDs**. "Traced to a source" is pinned to the source
*version*, so the trace stays valid across tool-call → approval → execution even if underlying data changes.

---

## 🔧 REVISION 2 — resolutions to Codex Round 2 (AUTHORITATIVE; supersedes Revision 1 where they overlap)

Round 2 CLOSED 9/13 and confirmed the mechanisms are real. These resolve the remaining tightenings + the
4 new issues (full adjudication in `PHASE0-REVIEW-LOG.md`). R6 is escalated to the owner (below).

**R3′ — conservative upper-bound estimate (not a heuristic).** The pre-step estimate is a worst-case
UPPER BOUND: input tokens via a conservative bytes→tokens ratio over the *current* serialized transcript +
tool-output digests; output cost via `MAX_LIVE_OUTPUT_TOKENS × output_price`. If a step's usage cannot be
bounded (unknown tokenizer / missing pinned price row) the loop **fails closed** (no step). `onStepFinish`
commits ACTUAL usage; the `$5` cap is checked against the upper bound *before* the billable call.

**R9′ — exactly-once INTENT, not exactly-once DELIVERY.** The outbox guarantees the action is enqueued
once and retries dedupe on the provider idempotency key — i.e. exactly-once *intent*. External *delivery*
is at-least-once (a send can succeed while its ack is lost), so the model adds: **claim leases with
timeout** (a crashed worker's lease expires → another reclaims), **reconciliation** of ambiguous outcomes
(sent-but-unacked → re-query/`NEEDS_RECONCILE`), and **provider-specific idempotency keys** (Slack/Resend
where supported; dedupe-on-our-key otherwise). The product promise is "exactly-once intent + at-least-once
delivery with dedupe + reconciliation," never "exactly-once delivery."

**NEW-1 — telemetry redaction (quarantine extends to traces).** AI SDK `experimental_telemetry` raw
capture (`recordInputs`/`recordOutputs`) is **default OFF**; raw prompts/tool-call args never become span
attributes. Only the **redacted trajectory schema** (tool names, typed result digests, costs, verdicts) is
emitted. Langfuse is **local/dev-only, opt-in**. A test asserts no raw signal or supplier prose appears in
any emitted trace.

**NEW-2 — Slack approval is server-verified, never an authority.** A Slack interactive approval is just a
transport. Before ANY approval mutation the server **verifies the Slack signing secret + timestamp replay
window**, maps the Slack actor to an **authorized approver**, and looks up the `action_id` + `payload_hash`
— the identical server-side gate as the bearer-token path. An unverified or unmapped Slack POST approves
nothing. (Preserves "nothing irreversible without a human, enforced server-side.")

**NEW-3 — two-tier snapshots (raw server-only vs sanitized model-visible).** Provenance snapshots split in
two: **raw snapshots** (full signal text, full supplier records) are **server-only**, never dereferenceable
by a tool, the Skeptic, or the UI. **Sanitized evidence snapshots** (digests, IDs, numbers, allow-listed
URLs) are the only snapshots tools/Skeptic/UI may reference by ID. R13 provenance holds without re-opening
the quarantine (closes the R13 caveat + NEW-3).

**NEW-4 — fuller execution state machine.** States: `PENDING → APPROVED → CLAIMED → EXECUTED | FAILED`,
plus **`REJECTED`, `CANCELLED`, `EXPIRED`, `NEEDS_RECONCILE`**. Transitions include claim **lease expiry**
(`CLAIMED → APPROVED` on timeout for safe reclaim), a **retry deadline** (`→ FAILED`/`NEEDS_RECONCILE`),
and a manual reconcile path. Every transition is per-action and content-hash-checked (R10).

**R6 — RESOLVED (owner decision, 2026-06-25): REORDER — "value first, loop last & gated."** The owner chose
to resequence the stochastic Investigator loop to LAST and trajectory-eval-gated. Phase *identities* stay
aligned to the canonical plan (no numbering drift); the **EXECUTION ORDER** is amended:

> **Execution order (owner-approved):** `P1-domain → P2-quarantine → P4-Skeptic → P5-execution →
> P6-war-room-UI → P7-evals → P3-Investigator-loop (optional, gated last)`.

- **P1** runs its **domain-credibility** half first — threat-type enum (`MATERIAL_SHORTAGE_ALLOCATION`,
  `EXPORT_CONTROL`, `QUALITY_RECALL`), supplier-email rewrite (impact-assessment requests; fixes the
  score-leak bug), TTR/TTS exposure + single-source penalty, margin-at-risk (`marginPct`), the resurrected
  scored `RecoveryOptionSchema`, and the Ops + Finance playbooks — all **pure deterministic waterfall wins**.
  P1's "wrap deterministic fns as typed tools" half is needed only by the loop, so it **moves into the P3
  cluster**.
- **P4 (Skeptic), P5 (governed execution), P6 (war-room UI)** all operate on the **deterministic waterfall**
  output — none depends on the loop. The Skeptic critiques the deterministic finding; execution acts on the
  approved packet; the UI renders `packet.agentRuns` + the Skeptic verdict (loop trajectory is additive when
  P3 lands).
- **P7's trajectory-eval harness becomes the PROMOTION GATE for P3:** the loop ships default-on **only** if
  trajectory evals show it beats the waterfall on a defined metric at acceptable cost; else it stays
  `ENABLE_AGENT_LOOP=false` and the product ships on waterfall + Skeptic + execution.
- **Net:** every shippable increment lands on the proven waterfall; the stochastic loop is the final,
  optional, evidence-gated experiment. Execution engine after final APPROVE: **`/autopilot`** (owner-chosen).
