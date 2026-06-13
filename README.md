# RESILIX ActionOps

**Target design:** a crisis-to-action war room for supply-chain teams. One live disruption signal plus your supplier CSV becomes an evidence-cited, human-approved action packet in under five minutes.

> **Current state (2026-06-12) — read this first.** This repository is mid-rebuild, and this README describes the **ActionOps target design**, not what runs today. What actually runs right now is the **LaunchOps predecessor**: a fixed scenario picker (not CSV upload), four hardcoded sample suppliers (not the ~150-row seed), four public fetchers (USGS, Open-Meteo, NWS, NASA EONET — not the planned GDELT + NWS pair), a length-based token *estimate* (not metered cost), and no endpoint authentication. Every capability described below is the build target; where today's code differs, it is flagged inline with **`today:`**. Nothing here is claimed as already built that isn't. Build sequence and full review trail: [PLAN.md](PLAN.md) · [PLAN-REVIEW-LOG.md](PLAN-REVIEW-LOG.md).

The speed claim, defined precisely: wall-clock from pressing **Scan now** to a rendered action packet is under 5 minutes in live mode, with real LLM calls asserted by the eval suite (a run that silently fell back to deterministic output fails the eval, and renders a visible "degraded — no live AI" badge in the UI). Replay mode renders in seconds and is always labeled as replay, never presented as live.

## The problem, as of June 2026

A procurement analyst at a US mid-market manufacturer (50–499 employees) may be juggling several of these at once: the Strait of Hormuz effectively closed since early March, a tariff regime rebuilt on Section 232 after the Supreme Court struck the IEEPA tariffs in February (with new Section 301 investigations and a 60-day China pause expiring in August), Red Sea transits still frozen with Cape routing the default into 2027, and Shanghai–Jebel Ali spot rates that jumped from $1,800 to over $4,000/FEU in 48 hours, with $3,000/FEU emergency surcharges on top. (Sources for these figures: [docs/claude/RESEARCH-us-landscape-2026-06-12.md](docs/claude/RESEARCH-us-landscape-2026-06-12.md).)

The failure mode is not missing alerts. It is that alerts, supplier exposure, inventory runway, and the actual response — emails, tasks, an executive brief — live in separate tools and separate hours of someone's day. Enterprise control towers integrate that loop at enterprise prices; a news feed is free and stops at the alert.

RESILIX ActionOps aims to be the integrated loop at spreadsheet-team prices. Detection products exist; exposure-mapping products exist. The bet here is narrower and honest: close the loop from verified signal to approvable action packet, for teams that run on a supplier spreadsheet, without the enterprise platform that loop usually demands. (This README never claims "no one does this." Plenty of tools do pieces of it; enterprise suites do the whole loop at enterprise cost. The integration at this price point is the wedge.)

## What one run produces (target design)

A single action packet:

- **Threat card** — event classified into a fixed vocabulary, severity, confidence, every source cited and linkable
- **Exposure map** — which of your suppliers, products, and routes are affected and the explicit rule that matched each one
- **Runway simulation** — 3/7/14/30-day runout dates, revenue-at-risk over time, and cost-ranked mitigation options (present only when inventory data exists; absent with a stated reason otherwise)
- **Role playbooks** — what procurement, ops, and finance each do next
- **Drafted supplier emails** — capped to the top-5 exposed suppliers plus a reusable template, sitting in an approval queue. Nothing sends, ever, without a human clicking approve.
- **Task list and executive one-pager**

## How it decides — and what it never does

```text
GDELT / NWS signal (or dated replay fixture)
→ Sentinel        LLM — classifies raw text into closed enums (+ OTHER_UNMAPPED escape hatch)
→ Verifier        deterministic — source count, recency, corroboration; rationale templated, no LLM
→ Atlas           deterministic TypeScript — exposure matching on validated IDs only
→ Simulator       deterministic TypeScript — runway and revenue-at-risk arithmetic
→ Strategist      LLM — playbooks grounded only in Atlas/Simulator numbers
→ Dispatcher      LLM — drafts, given structured numbers and whitelisted fields, never raw article text
→ Gatekeeper      deterministic — every numeral traces to inputs, every URL to fetched evidence, every entity to a known ID
→ Human approval  drafts stay drafts until a person approves
```

Hard rules, none of which have exceptions:

- **Deterministic code calculates; LLMs explain and draft.** No number visible in the UI was produced by a model.
- **Only Sentinel ever sees raw article text.** Fetched articles are untrusted data, never instructions. The drafting agent receives validated, structured fields only — a poisoned article cannot reach an outgoing email.
- **Every claim is evidence-linked.** Supplier names cross agent boundaries only as IDs validated against your data; URLs only from the fetched-evidence allowlist; each draft carries a structured claims list the gatekeeper cross-checks both directions.
- **Nothing sends without human approval.** Approval is an atomic, audited operation.
- **Three LLM calls per run, two in reserve.** Per-call token usage and cost are persisted (`today:` agent runs store a length-based token *estimate*, not metered API cost — the real cost ledger lands in phase 4); the whole build is budgeted at ≤ $5 of API spend.

## Live, replay, synthetic — all disclosed (target design)

- **Live fetchers (target — phase 3):** GDELT DOC 2.0 and the National Weather Service API, both live-tested with dated results before being claimed. `today:` the running code fetches USGS, Open-Meteo, NWS, and NASA EONET; GDELT is not yet wired and Open-Meteo is slated for removal (DNS failure 2026-06-12).
- **Fixture-only sources:** USGS earthquakes, NHC storms.
- **Replay-first demo:** every scenario ships real, recorded signal fixtures with their capture date rendered in the UI ("Recorded signals: 2026-06-12"). Replay is never labeled live.
- **Synthetic enterprise data (target):** a seeded dataset of ~150 fictional US suppliers, disclosed as such. `today:` the predecessor seeds four sample suppliers. Numbers derived from seed data are stamped `ASSUMED (demo data)` and appear only on the seeded demo path — never mixed into results from your upload.
- **Your data (target — phase 2):** a tiered CSV upload. Tier 1 (~8 required columns) unlocks exposure mapping. Tier 2 (optional inventory columns) unlocks runway simulation. Every upload gets a per-row matched/unmatched report with reasons; a silent zero-match is structurally impossible. `today:` input is a fixed scenario picker — there is no upload path yet.

## Limitations

Stated up front because the credibility of an evidence tool depends on it:

- **Episodic, not continuous.** Runs are on-demand. There is no background monitoring in the MVP — the "packet ready at 2 a.m., human approves at 6" workflow is roadmap, gated on scheduled scans, and not claimed today.
- **Your CSV goes stale.** Exposure results are only as current as the last upload; the packet shows the upload date.
- **Replay is the demo default.** Live mode is intended as a verified toggle (`verify:live`, added in phase 3, will exercise both fetchers and every prompt/schema pair), but the never-fails demo path is replayed, disclosed data.
- **Authless today; fail-closed is a phase-2 mechanism.** The current build has no endpoint authentication on any path, including when `DATABASE_URL` is set — acceptable for a local single-user demo, not for any exposed deployment. Phase 2 adds token-gated, fail-closed mutation routes (and a mandatory callback secret, with no `DEMO_UNCONFIGURED` pass-through) for when a real database or CSV uploads are enabled, and never exposes live-AI endpoints without auth. Multi-user auth and SSO are expansion scope.

## Status

**Rebuild in progress.** This repository is being reoriented from an earlier project (LaunchOps) into ActionOps per [PLAN.md](PLAN.md) — ten phases, reviewed through three internal adversarial rounds plus a cross-model review (full argument in [PLAN-REVIEW-LOG.md](PLAN-REVIEW-LOG.md)). This README states the build target: the pipeline described above lands phase by phase, and the current code still reflects the predecessor until the corresponding phase ships. The approval flow, gatekeeper, and audit trail carry over from the predecessor and are hardened (transactional approval, idempotent runs) in phase 2.

## Roadmap (post-MVP, in trigger order)

1. Tier-2 CSV onboarding tooling — triggered by the first real upload lacking inventory columns
2. Scheduled scans — unlocks the 2 a.m. packet positioning; triggered by the first user asking for monitoring
3. Additional scenario pathways: domestic trucking (FMCSA), DRAM allocation, ransomware, export-control
4. ERP integration (NetSuite/Epicor/Dynamics class), email handoff of approved drafts, SSO, multi-tenancy

## Tech stack

Next.js App Router · TypeScript · Tailwind + shadcn-style primitives · Zod · Vercel AI SDK with Gemini · Drizzle ORM (target: local PostgreSQL via node-postgres from phase 2 — the current salvage code still uses the Neon HTTP driver; in-memory fallback for zero-setup demo) · Vitest · Playwright

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The default mode needs no credentials and no database.

Optional environment (`cp .env.example .env.local`):

- `ENABLE_LIVE_AI=true` + `GEMINI_API_KEY` — turn on the live agent layer
- `DATABASE_URL` — switch packet storage from in-memory to Postgres (`npm run db:push` after setting). Today this goes through the Neon HTTP driver; local PostgreSQL via node-postgres lands in phase 2.

## Validation

```bash
npm run verify        # lint + typecheck + build + secrets scan + unit/integration tests
npm run verify:full   # + Playwright end-to-end
```

`verify:live` (added in phase 3) smoke-tests both live fetchers and every prompt/schema pair against fixtures before any showcase.

Success criteria, defined before the build: [docs/Success_Criteria.md](docs/Success_Criteria.md)
