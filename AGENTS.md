# RESILIX ActionOps — Agent Instructions

## Goal

Build and maintain **RESILIX ActionOps**: a crisis-to-action war room that turns a live disruption signal + a supplier CSV into an evidence-cited, human-approved action packet in under 5 minutes, for US mid-market manufacturers (50–499 employees) — the integrated loop at spreadsheet-team prices, not an enterprise platform. ("LaunchOps" is the predecessor being rebuilt away from; see PLAN.md for the phased rebuild.)

The product contract is:

```text
deterministic code calculates
AI reasons and drafts
gatekeeper validates
human approves
audit trail records
```

## Evidence Rules

- Inspect repo evidence before changing code.
- Prefer installed package behavior, lockfiles, schemas, tests, and official docs over memory.
- Do not invent APIs, package behavior, model behavior, file paths, schemas, or deployment steps.
- Separate verified facts, assumptions, and unverified risks in final handoffs.

## Architecture Rules

- Public data is signal enrichment only.
- Synthetic enterprise data must remain clearly disclosed.
- No real Apple, Amazon, FedEx, supplier, carrier, customer, or private ERP data may be claimed.
- LLM outputs must not be authoritative for numeric calculations, IDs, option scoring, or approval decisions.
- n8n is legacy and NOT in the core loop (PLAN.md out-of-scope); approval is an atomic, audited in-app operation. Core calculations and agent validation stay in the app.
- `DATABASE_URL` switches packet state from the in-memory demo store to Postgres via Drizzle. Target driver is node-postgres on local PostgreSQL (Phase 2); the current salvage code still uses the Neon HTTP driver until that swap.

## Security Rules

- Never commit `.env`, `.env.local`, credentials, tokens, private keys, production config, or sensitive logs.
- User-facing APIs require explicit validation and no-store responses when returning packet data.
- (Legacy) n8n callback compatibility (`N8N_CALLBACK_SECRET`, callback event IDs, timestamp freshness) applies only to the predecessor's callback path, which is out of the ActionOps core loop — do not extend it. New auth work is the Phase-2 fail-closed `APPROVAL_TOKEN` on mutation routes.
- Do not weaken idempotency, terminal approval state, gatekeeper blocking, or audit trail behavior.

## Validation Commands

Use the smallest relevant check for narrow changes. For stage gates or major changes, run:

```bash
npm run verify
```

Run the full browser scenario when UI, API flow, routing, or demo behavior changes:

```bash
npm run verify:full
```

Run the real Postgres/Neon proof only after setting `DATABASE_URL` and pushing the schema:

```bash
npm run db:push
RUN_DB_INTEGRATION_TESTS=true npm run test:db
```

## Done Criteria

- Typecheck, lint, tests, build, and secret scan pass for meaningful code changes.
- Playwright passes for demo-flow changes.
- DB proof passes when the change touches Postgres persistence and `DATABASE_URL` is available.
- README and docs stay honest about what is live, synthetic, validated, and unverified.
