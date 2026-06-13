> **Superseded — 2026-06-12.** This documents the predecessor system (RESILIX v1 / LaunchOps). The current product is **RESILIX ActionOps**; see README.md and docs/Success_Criteria.md at the repo root. Retained for history — not current.

# RESILIX LaunchOps AI Architecture

## Product Boundary

RESILIX LaunchOps AI is a decision execution layer for launch-critical supply exceptions. It does not claim to replace ERP, TMS, WMS, procurement, planning, carrier visibility, or supplier-risk platforms.

## Runtime Flow

```text
Next.js dashboard
→ /api/run-exception
→ public signal fetchers
→ exception builder
→ deterministic impact engine
→ bounded agents
→ gatekeeper
→ decision packet store
→ approval console / n8n callback
```

## Deterministic Core

The deterministic engine owns:

- inventory days remaining
- shipment delay days
- launch unit gap
- revenue at risk
- launch risk score
- recovery option base scores

These outputs include calculation traces and source IDs so the UI can show evidence instead of model claims.

## Agent Core

The agent layer is intentionally bounded:

- Signal Analyst summarizes source quality.
- Impact Analyst explains deterministic calculations.
- Resolution Planner explains the deterministic option ranking and is blocked if it recommends anything other than the top-scored valid option.
- Decision Gatekeeper blocks invalid IDs, unknown evidence, missing approval, and unsafe packets.
- Execution Drafter creates supplier, carrier, internal, and customer messages.

When live AI is enabled, Signal Analyst, Impact Analyst, Resolution Planner, and Execution Drafter use structured Gemini outputs through the Vercel AI SDK. When live AI is disabled or a model output fails schema or semantic validation, deterministic fallback agents preserve the same contract.

## Data Persistence

The app uses a packet-store abstraction:

- without `DATABASE_URL`, it uses the in-memory store for zero-cost repeatable demos.
- with `DATABASE_URL`, it uses Drizzle/Neon Postgres for decision packets, audit-event projections, agent-run projections, idempotency keys, and processed approval events.

The synthetic operations dataset stays in repo for the demo. Production adapters would replace it with governed ERP, planning, supplier, TMS, WMS, procurement, or launch-planning sources.

## Enterprise Controls

- Packet-bearing API responses are marked `Cache-Control: no-store`.
- n8n approval callbacks can require `N8N_CALLBACK_SECRET` via the `x-resilix-callback-secret` header.
- Protected callbacks include event IDs and freshness timestamps; repeated events are handled idempotently.
- Approval state transitions are terminal after approval or rejection.
- Agent trace metadata records model mode, latency, token estimate, input hash, output hash, and validation status.
- The UI trust panel separates deterministic authority from AI explanation/drafting authority.

## Public Data

Public data is signal enrichment only. It is not presented as enterprise visibility. If a live public API fails, cached fixtures are used and labeled.
