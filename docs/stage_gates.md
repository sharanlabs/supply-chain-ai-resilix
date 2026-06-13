> **Superseded — 2026-06-12.** This documents the predecessor system (RESILIX v1 / LaunchOps). The current product is **RESILIX ActionOps**; see README.md and docs/Success_Criteria.md at the repo root. Retained for history — not current.

# Stage Gates

## Stage 1: Foundation And Reframe

Gate passed when:

- Next.js app boots locally.
- README reflects LaunchOps direction.
- existing RESILIX materials remain available.
- no secrets are committed.

## Stage 2: Synthetic Operations Dataset

Gate passed when:

- suppliers, components, inventory, shipments, orders, launch plan, and approval policy exist.
- flagship scenario can calculate impact without AI.

## Stage 3: Public Signal Layer

Gate passed when:

- USGS, Open-Meteo, NWS, and NASA EONET fetchers normalize into one shape.
- cached fallback works.

## Stage 4: Deterministic Impact Engine

Gate passed when:

- all business numbers come from code.
- tests prove calculations and source traceability.

## Stage 5: Agent Layer

Gate passed when:

- five agent runs are visible.
- outputs validate against schemas.
- live AI is optional and falls back deterministically when disabled or invalid.
- planner output cannot override deterministic scoring or introduce unknown option IDs.
- invalid evidence is blocked by the gatekeeper.

## Stage 6: Product UI

Gate passed when:

- user can run the flagship scenario.
- exception, impact, trace, decision packet, and approval screens are usable.

## Stage 7: n8n Workflow

Gate passed when:

- app can receive approval callback payload.
- callback can be protected by optional shared secret.
- workflow export documents the approval pattern.

## Stage 8: Evals And Demo Polish

Gate passed when:

- unit tests pass.
- pipeline integration test passes.
- Playwright scenario test is available.
- README states live versus synthetic boundaries.

## Stage 9: Persistent Backend

Gate passed when:

- packet storage is accessed through a repository boundary.
- local demo still works without paid infrastructure.
- `DATABASE_URL` switches packet state to Postgres/Neon.
- Drizzle migration covers decision packets, audit events, agent runs, run idempotency keys, and processed approval events.
- approval, callback, idempotency, and blocked-packet behavior stay covered by tests.

## Stage 10: Real Environment And CI Proof

Gate passed when:

- root `AGENTS.md` captures project-specific operating rules and validation gates.
- `npm run verify` covers typecheck, lint, unit/eval tests, production build, and secret scan.
- `npm run verify:full` adds the Playwright flagship scenario.
- GitHub Actions runs the app quality gate on pull requests and pushes.
- CI uses least-privilege repository permissions.
- CI runs a gated Postgres/Neon proof when `DATABASE_URL` is configured.
- local and CI DB proofs do not require live AI or public signal availability.
