# PLAN — Showcase expansion: "make what's big legible, then bigger — no artificial bloat" — 2026-07-06

**Status: FIXED GOAL, owner-approved 2026-07-06 (revised same day, mid-run owner directive).**
Advisor-guided (project-advisor read-only pass) + blindspot-scout unknowns pass, synthesized and
final-called by the main session (Fable). Supersedes the "only remaining = owner deploy" end-state of the
`PLAN-CUSTOMS-DEFENSE-2026-07-02` era. RESILIX (ActionOps + Customs Defense Desk) is the ASSET.

## The goal (declarative)

RESILIX as a full-spectrum applied-AI showcase — agents, multi-agent, MCP, retrieval, workflow automation,
evals, governance — that a **90-second reviewer** can actually read, where **every capability has a named
in-product consumer** (native to the product story, never a bolted-on tool demo), and all standing
invariants hold: LLM never authoritative for numbers/IDs/approvals · atomic audited in-app approval ·
injection quarantine · synthetic-data disclosure · no secrets committed · n8n never in the approval loop.

**Owner decisions locked 2026-07-06:**
1. **One flagship** — ActionOps is the product; the Customs Defense Desk presents as a module within it.
2. **The build-process trail is a NAMED exhibit** — gates/lessons/cross-model reviews surface as
   "How this was built" (evidence of agentic-workflow engineering, the target role itself).
3. **Public demo posture = REPLAY-only, $0, no keys on the public URL** (fail-closed
   `REQUIRE_APPROVAL_TOKEN=true`); live runs stay local. **Loop/Skeptic live promotion is owner-gated
   later — NOT on this ladder** (blocked on: billable smoke, the recorded Skeptic caution-wart fix,
   the frozen-fixture re-capture coupling, and the public-key cost posture).
4. **Deploy moves to the very END** (owner directive mid-run): build the entire ladder first, deploy once.
5. **The design build is IN SCOPE** (owner directive mid-run): Fable applies its own judgment against
   [[resilix-design-bar]] + the 5 `samples/2026/` directions, records WHY, builds it as a gated increment.
   The billable homepage re-capture stays owner-gated — the frozen fixture must remain honest without it.

## Why this shape (the blindspot-scout evidence, 2026-07-06)

Cross-verified 2026 hiring-side sources agree: reviewers spend ~90 seconds; the surface that gets read is
README → walkthrough → eval numbers → design-decisions doc; depth beats breadth; eval harnesses and honest
failure notes are the strongest senior signals; anti-slop screening penalizes unverifiable claims and
tool-collecting. RESILIX has the depth; the deficit is legibility. Hence: legibility first, then
capabilities in strict native-consumer order. No complete rework — the unknowns pass found packaging debt,
not build debt.

## Methodology (right-sized, per [[resilix-personal-project-rightsize]])

Per increment: short declarative spec (success criteria + acceptance tests, consumer named up front) →
build → `npm run verify` (or `verify:full` for UI/API/demo changes) → acceptance-gate → commit → push.
**Codex cross-model: ONE batched pass at the END of the ladder**, plus a dedicated pass for S3 (the MCP
surface is safety-critical). Verify-over-memory for every new dependency (MCP SDK, pg full-text, n8n
webhook shape) — installed packages + official docs, never model memory.

## The ladder (fixed order, revised 2026-07-06 mid-run)

### S2 — Legibility front door (FIRST BUILD: make the existing depth readable)
- **Consumer:** the 90-second reviewer (recruiter/hiring engineer) hitting the repo root or demo URL.
- **SC:** README rewritten reviewer-first — what it is (one flagship, two modules) → the trust spine →
  REAL verified eval numbers → 60-second run path → "How this was built" named exhibit (gates/lessons/
  cross-model trail) → honest limitations. 2-minute walkthrough script/storyboard for the owner to record.
  Root curated do-no-harm (nothing moved that breaks references). `CLAUDE.md` → `AGENTS.md` pointer.
- **AT:** every number in the README verified against the live test suites on HEAD (no grown counts);
  de-slop pass on prose; links resolve; `npm run verify` untouched-green.

### S-D — Design build (the shipped app adopts the strongest 2026 direction)
- **Consumer:** the same reviewer, plus the walkthrough/screenshots (which must reflect the final look —
  hence design lands BEFORE the MCP/RAG/n8n stories get captured).
- **SC:** ONE direction (or strongest synthesis) from `samples/2026/` built into the shipped app at the
  design bar ([[resilix-design-bar]]: white/cool grounds, ONE steel accent, no green/pink/cream/orange,
  Geist/no serif, narrative-first, anti-cliché). The pick + WHY recorded here and surfaced for owner review
  (not blocked on it). Frozen homepage fixture stays honest — re-derived deterministically if the new UI
  needs different data shape; NO billable re-capture.
- **AT:** `verify:full` green incl. WCAG 2.2 AA e2e; golden oracles byte-unchanged; fixture arithmetic
  guards green; acceptance-gate SHIP.
- **DECISION RECORDED (S-D pick):** see § Design decision below (filled at build time).

### S3 — Read-only MCP server over the war room (strongest positioning differentiator)
- **Consumer:** any MCP client (Claude Desktop/Code) asking the war room questions; tool calls logged to
  the audit trail (in-product consumer); the README "agent-ready" section.
- **SC:** MCP endpoint exposes packet-retrieval / exposure-query / audit-trail tools — **read-only,
  token-authed, NO authority tools ever** (no approve/execute/set-score; the moat extends to the MCP
  surface); auth/consent/audit story documented explicitly (the 2026 MCP-security bar).
- **AT:** MCP client integration test round-trips each tool; adaptive injection red-team EXTENDED to MCP
  tool inputs/outputs → 0 leaks; structural test proves no tool can mutate state; mutation attempts 401/405;
  **dedicated Codex pass** (safety-critical surface).
- **FIRST TASK (flagged assumption):** verify the Next.js-compatible MCP transport against real installed
  packages + the official MCP TypeScript SDK docs — no MCP dependency exists in the repo today.

### S4 — Customs RAG, lexical-first (evidence-first retrieval)
- **Consumer:** the customs desk evidence spine (+ one MCP tool — two stories, one build).
- **SC:** cited-chunk retrieval over the customs corpus; every retrieved citation passes the existing
  fail-closed produce-time citation check (**the hard bar**; if it can't be met, STOP and record why —
  skip-with-reason is an owner-accepted outcome).
- **AT:** retrieval golden suite (recall@k on hand-labeled Q→chunk pairs) green BEFORE any consumer;
  citation check green on RAG-fed packets; existing customs golden 34/34 untouched.
- **Lowest-rung-first:** lexical (pg full-text / BM25-style) before any embedding pipeline; embeddings only
  if the golden suite proves the simpler rung insufficient. Corpus is small + already page-cited.

### S6 — n8n outbound channel (LAST — lowest capability-per-effort, right-sized)
- **Consumer:** the approved-action dispatch path (`ERP_CASE`), demonstrating governed workflow automation.
- **SC:** `ERP_CASE` webhook fires only POST-approval through the existing typed seam
  (`lib/server/action-transport.ts`); `reconcileStrandedDispatches` wired to the transport startup hook
  (the recorded forward-guardrail obligation, todo 2026-06-27); committed n8n workflow-export JSON as the
  demo artifact. A running n8n instance = optional owner infra, NOT a repo deliverable.
- **AT:** outbox tests prove no dispatch without APPROVED; HMAC signature verified; crash-recovery test
  drives a stranded REVERSIBLE row and never an outward one; structural test that n8n is absent from any
  approval path.

### Final gate — ONE batched Codex cross-model pass over the whole ladder → push → owner queue.

### S1 — Deploy (VERY LAST, owner action, ~10 min)
- **SC:** public URL serves the replay-first demo $0/keyless; `ENABLE_CUSTOMS_DESK=true`;
  `REQUIRE_APPROVAL_TOKEN=true` (fail-closed); synthetic disclosure visible on every surface.
- **AT (post-deploy smoke):** homepage + `/customs` render; mutation routes 401 without token; no live-LLM
  call fires keyless; secret scan clean.
- Owner commands: `npx vercel` → `npx vercel env add ENABLE_CUSTOMS_DESK production` (value `true`) →
  `npx vercel env add REQUIRE_APPROVAL_TOKEN production` (value `true`) → `npx vercel --prod`.

## Design decision (S-D) — filled at build time
_(recorded when the pick is made: which direction, why, what was synthesized, what was rejected)_

## Deferred / owner-gated (NOT on this ladder, tracked so nothing is lost)
- **Loop + Skeptic live promotion** (`ENABLE_AGENT_LOOP` default-on + Skeptic UI dramatization): blocked on
  billable (G) live gate ×3, the Skeptic geo-caution wart fix, the re-capture coupling, and the owner's
  public-key cost decision. The 2026-06-28 "not yet" STANDS.
- **Billable homepage re-capture** (couples moat re-verification; ONE paid step when the owner greenlights).
- **Walkthrough recording** (human step; script delivered by S2).

## Working set (advisor-selected, revised)
Skills: mcp-builder · next-best-practices · ce-frontend-design / design-taste-frontend ·
evaluation-methodology · ai-security · grill-me-codex · de-slop · documentation · humanizer ·
find-unknowns (S3 transport check).
Subagents: security-specialist (MCP posture) · evals-specialist (retrieval suite) · frontend-specialist
(S-D build support) · acceptance-gate (every increment exit).

## Top risks (with mitigations)
1. MCP as injection/exfil channel → read-only + no-authority tools, red-team extension, token auth,
   security read, dedicated Codex pass.
2. Design rebuild breaks frozen-fixture/oracle coupling → fixture re-derived deterministically, oracles
   asserted byte-unchanged, arithmetic guards stay green; NO paid re-capture in-ladder.
3. RAG dilutes the fail-closed citation bar → retrieval golden suite before consumers; hard bar; skip-with-
   reason allowed.
4. "Native consumer" erosion under showcase pressure → every spec names its consumer; one acceptance test
   per increment asserts the consumer actually renders/uses it; consumer-less capability = cut at spec time.
5. Legibility work introduces unverifiable claims → every README number re-verified on HEAD at S2 and again
   at the final gate.

## Owner queue (surfaced, not blocking)
1. **Deploy (S1, VERY LAST)** — commands above, after the final Codex pass.
2. **Review the S-D design pick** — rationale recorded in § Design decision; revert is one increment.
3. **Record the 2-minute walkthrough** — script delivered by S2.
4. **Later, if desired:** loop/Skeptic promotion decision + the ONE billable re-capture.
