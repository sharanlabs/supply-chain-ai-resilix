# RESILIX ActionOps

**A crisis-to-action war room for supply-chain teams.** One live disruption signal plus your supplier list becomes an **evidence-cited, human-approved action packet** — a classified threat, which of *your* suppliers are exposed, a runway/revenue-at-risk simulation, role playbooks, and drafted supplier emails where **every number traces to a source**.

## Why this exists — and how it's different (2026)

Mid-market procurement teams in 2026 don't lack alerts. They lack **operationalization**: turning a disruption into a response. Enterprise risk platforms (Resilinc, Everstream, Interos, Exiger, project44) integrate that loop — at enterprise prices and enterprise onboarding. Below them, the de-facto tool in hour zero is *pasting your supplier list into ChatGPT* — which always answers, never corroborates, does unverifiable math, leaves no audit trail, and **cannot refuse**.

RESILIX's wedge is not speed or "we act, they detect" — incumbents are fast and are shipping agentic action too. It is a **trust-and-accountability spine that no incumbent currently markets**, against a documented 2026 attack surface (OWASP LLM01 prompt injection):

- **Every numeral is sourced or it's blocked.** A bidirectional citation contract: each figure in any draft must resolve to a structured input, and each input figure it cites must value- and unit-match — checked at produce time *and* by an independent grader. No model-invented number reaches the UI.
- **Untrusted news never reaches the email drafter.** Only one agent (Sentinel) sees raw article text; the drafter receives validated, structured fields only — the prompt-injection laundering path is cut by construction, with a de-obfuscation pre-pass against homoglyph/zero-width/base64 evasions.
- **Degradation is disclosed, never faked.** A four-value mode taxonomy (`LIVE_AI` / `DETERMINISTIC_RULES` / `REPLAY` / `FAILED_TO_FALLBACK`) — a live call that silently fell back fails the eval and renders a visible "degraded" badge.
- **A calibrated LLM judge** screens drafted prose for unsupported claims that carry no numeral (fail-closed; TPR/TNR calibrated against a labelled set), as the one semantic check on top of the deterministic graders.
- **Nothing sends without human approval** — atomic, audited.
- **A fail-closed cost cap.** Real per-call tokens × a pinned price table; a call that would breach the budget throws before it bills.

The single highest-signal artifact is the **eval harness**: deterministic graders + a golden-task regression BLOCK + the calibrated judge, run over real pipeline output. Full market analysis: [docs/competitive-gap-2026.md](docs/competitive-gap-2026.md). (Not affiliated with Resilinc; this is unrelated to their "WarRoom" product.)

## What one run produces

A single **decision packet**:

- **Threat card** — event classified into a closed vocabulary (chokepoint closure, route diversion, tariff deadline, natural disaster, port/labor/cyber disruption, supplier bankruptcy, geopolitical conflict, or `OTHER_UNMAPPED`), severity, confidence, every source cited and linkable.
- **Exposure map** — which of your suppliers are affected and the explicit rule that matched each.
- **Runway simulation** — revenue-at-risk over time and runout dates (present only when inventory data exists; absent with a stated reason otherwise).
- **Role playbooks** — what procurement, ops, and finance each do next, grounded only in the structured numbers.
- **Drafted supplier emails** — top-5 exposed suppliers, every figure carrying a `claims[]` entry, sitting in an approval queue. Nothing sends without a human clicking approve.
- **Action items.**

## How it decides

```text
GDELT / NWS signal (or dated replay fixture)
→ Sentinel        LLM — classifies raw text into closed enums (+ OTHER_UNMAPPED escape hatch); the ONLY agent that sees raw text
→ Verifier        deterministic — source count, recency, corroboration; rationale templated, no LLM
→ Atlas           deterministic TypeScript — exposure matching on validated IDs only, scored on risk tier + lead time
→ Simulator       deterministic TypeScript — runway and revenue-at-risk arithmetic
→ Strategist      LLM — playbooks grounded only in Atlas/Simulator numbers, numeral-free steps
→ Dispatcher      LLM — drafts from structured + whitelisted fields only, never raw article text
→ Gatekeeper      deterministic — every numeral traces to inputs, every URL to fetched evidence, every entity to a known ID
→ Human approval  drafts stay drafts until a person approves
```

Hard rules, no exceptions:

- **Deterministic code calculates; LLMs explain and draft.** No number shown in the UI was produced by a model — exposures and runway math are deterministic TypeScript.
- **Only Sentinel ever sees raw article text.** Fetched articles are untrusted data, never instructions.
- **Every claim is evidence-linked.** Supplier names cross agent boundaries only as validated IDs; URLs only from the fetched-evidence allowlist; each draft carries a `claims[]` list the gatekeeper cross-checks both directions.
- **Nothing sends without human approval** — atomic, audited.
- **Three LLM calls per run (two in reserve).** Per-call tokens, finish reason, and computed cost are persisted; **each run** is hard-stopped before it can exceed the $5 cap (a fail-closed pre-call check), and total build spend (≤ $5, metered ≈ $1.0–1.3) is tracked via the persisted cost ledger — the runtime guard is per-run, the build total is the ledger sum.

## Live, replay, synthetic — all disclosed

- **Live signals:** GDELT DOC 2.0 (primary) and the National Weather Service API, replay-first and resilient (a fetch outage surfaces a `CACHED`/`FAILED` marker, never a faked live read).
- **Live AI:** the three LLM agents call Gemini (`gemini-2.5-flash` default, GA, with a ListModels preflight that fails loud if the configured model is unavailable). Model + pricing verified as-of 2026-06-18; Gemini 2.5 retires no earlier than 2026-10-16, and the preflight + single `GEMINI_MODEL` config point make a retirement a one-line bump, never a silent mid-run fallback. Off by default (`ENABLE_LIVE_AI`); the deterministic spine runs identically with the key off.
- **Replay-first demo:** each scenario carries dated, synthetic signal fixtures; replay is always labelled, never presented as live. The landing page itself serves a frozen, real live-captured packet relabelled `REPLAY` ($0, reproducible).
- **Synthetic enterprise data:** a seeded ~150-row US supplier dataset, disclosed as such; seed-derived figures are stamped and never mixed into results from your own upload.
- **Your data:** a tiered CSV upload — Tier-1 columns unlock exposure mapping, optional inventory columns unlock runway simulation. Every upload gets a per-row matched/unmatched report; a silent zero-match is structurally impossible. Uploaded names are formula-injection-sanitized and canonicalized to internal IDs before any agent sees them.

## The scenarios

Hormuz chokepoint closure (flagship) · tariff-deadline countdown · Red Sea / Suez diversion · hurricane on a single-source plant (replay) · supplier bankruptcy · a zero-exposure control (valid event, no match → "no direct exposure", no invented findings) paired with an off-taxonomy control (out-of-vocabulary event → `OTHER_UNMAPPED`, never force-fit) · and a **thin-evidence refusal control** (a real exposure reported by one unverified, low-confidence source → `NO_ACTION`, with the missing-evidence list). All run end-to-end live and deterministically.

## Limitations

Stated up front, because the credibility of an evidence tool depends on it:

- **Episodic, not continuous.** Runs are on-demand; there is no background monitoring. The "packet ready at 2 a.m." workflow is roadmap, gated on scheduled scans.
- **Calibrated refusal fires on a corroboration + confidence rule.** When a real exposure is reported by a single uncorroborated, low-confidence source, the pipeline emits a `NO_ACTION` packet with the missing-evidence list (shipped, deterministic + a confirmatory live leg). It does not yet model *source authority* beyond the threat's own confidence — an authoritative single source (e.g. an official weather warning) is treated as actionable.
- **The landing demo is a single frozen REPLAY.** The home surface serves one captured live packet (Hormuz, from `evals/fixtures/live/`) relabelled `REPLAY` — reproducible and $0, never a live per-visit call. Running the other scenarios, or a fresh live pass, is via the authenticated API and the eval harness, not the landing page.
- **Your CSV goes stale.** Exposure results are only as current as the last upload.
- **Single-instance idempotency.** Concurrent-run de-duplication is authoritative within one Node instance; cross-instance reservation is post-MVP.
- **Mid-market willingness-to-pay is unproven.** This is built as a portfolio-grade artifact; the affordability wedge is real but the demand is not yet validated (see the competitive analysis).

## Status

**The ActionOps pipeline runs end-to-end** — live (Gemini) and deterministic — across all seven scenarios (eight records, including the thin-evidence refusal control), gated increment by increment (each through `npm run verify` + an independent acceptance gate + a cross-model review). Built from the LaunchOps predecessor per [PLAN.md](PLAN.md): the data layer at scale (node-postgres, atomic approval, idempotency, CSV ingestion, ~150-row seed, fail-closed auth), the GDELT + NWS signal layer, the six-agent core, the `NO_ACTION` refusal path, the cost ledger, the evals harness (deterministic graders + golden-task BLOCK + calibrated judge), and a WCAG 2.2 AA accessibility pass. Full review trail: [PLAN-REVIEW-LOG.md](PLAN-REVIEW-LOG.md).

## Roadmap (post-MVP, in trigger order)

1. Scheduled scans — unlocks the 2 a.m. packet positioning.
2. ERP integration (NetSuite/Epicor/Dynamics class), email handoff of approved drafts, SSO, multi-tenancy.
3. Source-authority modelling for refusal (treat an official advisory as corroboration), beyond the threat's own confidence.

## Tech stack

Next.js App Router · TypeScript · Tailwind + shadcn-style primitives · Zod · Vercel AI SDK with Gemini · Drizzle ORM over PostgreSQL (node-postgres; in-memory fallback for a zero-setup demo) · Vitest · Playwright.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The default mode needs no credentials and no database.

Optional environment (`cp .env.example .env`):

- `ENABLE_LIVE_AI=true` + `GEMINI_API_KEY` — turn on the live agent layer (secure mode; requires `APPROVAL_TOKEN` on mutation routes).
- `GEMINI_MODEL` — override the default `gemini-2.5-flash`.
- `DATABASE_URL` — switch packet storage from in-memory to PostgreSQL (`npm run db:push` after setting).

## Validation

```bash
npm run verify        # typecheck + lint + unit/eval tests + build + secret scan
npm run verify:full   # + Playwright end-to-end (a11y included)
npm run verify:live   # live-signal smoke (NWS anchor)
```

Live-AI evals (real Gemini calls, billed) are gated behind `RUN_LIVE_AI_TESTS=true`. Success criteria, defined before the build: [docs/Success_Criteria.md](docs/Success_Criteria.md).
