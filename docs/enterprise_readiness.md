> **Stale — predecessor content; scheduled for rewrite in Phase 10.** This still describes the LaunchOps / RESILIX-v1 system. The ActionOps target is defined in PLAN.md (repo root). Do not treat as current until rewritten.

# Enterprise Readiness

RESILIX LaunchOps AI is built as an enterprise-grade demo, not a production system. The design goal is to show the control pattern a supply-chain AI product should use before it is connected to private ERP, supplier, logistics, or customer systems.

## Implemented Controls

- deterministic business calculations for inventory cover, delay impact, launch gap, revenue exposure, risk score, and option scores.
- Zod validation on packet, signal, impact, recovery option, gatekeeper, execution draft, and agent-run contracts.
- gatekeeper checks for unknown IDs, unknown evidence, non-finite calculations, approval thresholds, stale signals, and invalid recommendations.
- optional Gemini structured-output agents with deterministic fallback when disabled, invalid, or unavailable.
- planner semantic validation that blocks model output from overriding deterministic option ranking.
- packet-bearing API responses use `Cache-Control: no-store`.
- n8n approval callback can require `N8N_CALLBACK_SECRET` through the `x-resilix-callback-secret` header.
- protected callbacks require a fresh timestamp and event ID for replay resistance.
- scenario run requests support idempotency keys.
- approval mutations are terminal; an approved packet cannot be flipped to rejected, and repeated matching events are idempotent.
- when `DATABASE_URL` is set, packet state persists through Drizzle/Neon Postgres instead of the in-memory demo store.
- Postgres projections exist for audit events, agent runs, run idempotency keys, and processed approval events.
- public signal fetchers disclose `LIVE`, `CACHED`, or `FAILED` status.
- every agent run stores model, mode, latency, token estimate, input hash, output hash, validation status, and summary.
- approval and callback actions append audit events.
- unit, integration, security, build, and Playwright checks cover the flagship scenario.
- root `AGENTS.md` records project-specific engineering, validation, and security rules.
- `npm run verify` and `npm run verify:full` provide repeatable local quality gates.
- GitHub Actions runs typecheck, lint, tests, build, secret scan, dependency audit, and Playwright.
- a gated Postgres/Neon integration proof verifies persistence when `DATABASE_URL` is available.

## Demo Boundaries

- operational data is synthetic and disclosed.
- public data is enrichment only, not enterprise visibility.
- no real Apple, Amazon, FedEx, supplier, carrier, customer, or private ERP data is claimed.
- in-memory packet storage is used only when `DATABASE_URL` is not configured.
- n8n is approval orchestration only; it does not own calculations or AI reasoning.
- model outputs are non-authoritative for numbers and IDs.

## Production Gaps

- configure a managed Postgres/Neon `DATABASE_URL` secret and run the CI DB proof against it.
- move multi-table packet projection writes to a transaction-capable driver or outbox pattern if strict atomicity is required.
- add SSO, RBAC, user identity, and tenant boundaries.
- make audit-event writes append-only at the database permission/policy layer.
- add request authentication for user-facing APIs.
- add rate limiting and durable webhook replay storage.
- use a managed secret store for model, database, and workflow credentials.
- add observability for API latency, signal fetch failures, model failures, fallback rate, approval latency, and packet validation failures.
- connect to real enterprise systems only through explicit adapters with permission, data classification, and redaction controls.
- deploy the verified build to a hosted environment and capture deployment/runtime checks.

## Enterprise Story To Tell

The strongest product claim is not that RESILIX predicts every disruption. The stronger claim is operational discipline:

```text
signals enrich context
synthetic enterprise data represents internal truth
deterministic code calculates impact
bounded AI explains and drafts
gatekeeper validates
human approves
audit trail records the decision
```

That is the part enterprise buyers, business analysts, and engineering program managers should trust.
