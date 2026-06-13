> **Stale — predecessor content; scheduled for rewrite in Phase 2 (data model + driver swap Neon->node-postgres, atomi….** This still describes the LaunchOps / RESILIX-v1 system. The ActionOps target is defined in PLAN.md (repo root). Do not treat as current until rewritten.

# Database And Persistence

RESILIX LaunchOps AI runs with a zero-cost in-memory packet store by default. When `DATABASE_URL` is set, the backend switches to the Drizzle/Neon Postgres store in `lib/server/store.ts`.

The Postgres schema stores:

- decision packets as canonical JSON payloads.
- audit-event projections for packet history.
- agent-run projections for trace review.
- run idempotency keys for repeatable scenario runs.
- processed approval events for n8n callback replay resistance.

The synthetic operations dataset remains in code for the demo. A production system would seed or ingest suppliers, inventory, shipments, orders, and launch plans from ERP, planning, TMS, WMS, procurement, or supplier systems.

```bash
npm run db:generate
npm run db:push
```

`npm run db:push` requires `DATABASE_URL`. Without `DATABASE_URL`, the app still boots and tests using the memory store.

After pushing the schema, run the gated persistence proof:

```bash
RUN_DB_INTEGRATION_TESTS=true npm run test:db
```

Current limitation: the Neon HTTP driver path is simple and low-cost, but multi-table packet projection writes are not wrapped in a database transaction. For strict production atomicity, move these writes to a transaction-capable Postgres driver or a durable workflow/outbox pattern.
