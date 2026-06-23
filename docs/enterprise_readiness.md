# Enterprise Readiness — what's built, what's deferred, and the trigger for each

RESILIX ActionOps is a **v0.1 showcase build**, not a deployed production system. This doc is deliberately framed as a *map*, not a backlog: the enterprise-grade plumbing below is **intentionally deferred**, and each item names the concrete **trigger** that would justify building it. Filling these in now — before the trigger exists — would add cost and complexity the project doesn't need and would make the artifact heavier without making it better.

In plain terms: the stack and engineering discipline are enterprise-*credible* today; the enterprise-*operational* layer is sequenced behind real-world triggers (actual load, real tenants, a customer who demands SSO, an auditor who demands compliance). None of those triggers exist yet, so none of the work below is "missing" — it's *not yet earned*.

## Already built (the discipline layer that proves it'd scale right)

These are shipped and verified in the current build — the habits that separate "uses enterprise tools" from "behaves like enterprise software":

- **Fail-closed security.** Mutation routes require a bearer `APPROVAL_TOKEN` in secure mode; missing/weak secrets cause the route to **deny**, not silently allow (`lib/server/security.ts`). The n8n approval callback is a separately-secured boundary (`x-resilix-callback-secret`, length-floored, replay-resistant via fresh timestamp + event ID). It is a legacy path, out of the ActionOps core loop per `AGENTS.md` — secured and retained, not extended.
- **Rate limiting** on every mutation route (`lib/server/rate-limit.ts`).
- **Idempotency** — cross-instance safe for *persistence* (the persist transaction reserves the key and returns the winner on conflict, so two instances can never persist two packets); single-instance for *work* (in-process mutex). The double-work gap is disclosed, bounded by the budget cap, and listed below.
- **Audit trail** — approval and callback actions append audit events (`HUMAN_APPROVAL`, `N8N_APPROVAL_CALLBACK`); every agent run stores model, mode, latency, token estimate, input/output hashes, and validation status.
- **Structured logging with secret redaction** (`pino`, `lib/server/logger.ts`) — bearer / n8n / provider-key shapes are redacted before logging.
- **Typed persistence** — Drizzle ORM over PostgreSQL (node-postgres), with a zero-setup in-memory fallback when `DATABASE_URL` is absent.
- **Deterministic spine + bounded AI** — business math runs in code; the LLM explains and drafts but is non-authoritative for numbers and IDs; a gatekeeper validates before a human approves.
- **CI quality gate** (`.github/workflows/verify.yml`) — typecheck, lint, tests, build, secret scan, `npm audit --audit-level=high`, and Playwright e2e + accessibility (axe / keyboard / WCAG 2.2 AA) on pull requests and pushes to `main`/`master` (plus manual dispatch), with a gated Postgres proof when a `DATABASE_URL` secret is present.
- **Evals harness** — deterministic graders (numeral→source citation, entity/URL existence, injection quarantine), golden-task BLOCK cases, and a calibrated cross-family LLM judge as a fail-closed backstop.

## Deferred — the enterprise-expansion path, in trigger order

Each row is sequenced behind the event that makes it worth the cost. Until then it stays off the build.

| Capability | Trigger that activates it | Why deferred now |
| --- | --- | --- |
| **Scheduled / continuous scans** (the "packet ready at 2 a.m." workflow) | A user who needs background monitoring, not on-demand runs | Today runs are episodic by design; continuous monitoring is a different cost and reliability profile. |
| **Reserve-before-assembly idempotency** (eliminate double-*work* across instances, not just double-persist) | A multi-instance deployment under real concurrent load | Needs a schema migration (reserve row before pipeline assembly). Current save-time dedup already prevents orphan packets; the only cost is bounded duplicate work. |
| **Managed / HA Postgres** — replication, failover, connection pooling (PgBouncer-class) | Production traffic with an uptime/latency SLA | A single Postgres is correct for a showcase; HA earns its operational cost only under real availability requirements. |
| **SSO / RBAC / user identity / multi-tenant isolation** | An enterprise buyer, or more than one organization on the system | The current model is a single-operator war room; bearer-token auth is sufficient. Tenant isolation is a security surface you don't open until you have tenants. |
| **ERP adapters** (NetSuite / Epicor / Dynamics class) + email handoff of approved drafts | A paying customer integrating their system of record | Connect to real enterprise systems only through explicit adapters with permission, data classification, and redaction controls. |
| **Observability** — API/latency metrics, signal-fetch + model-failure + fallback-rate dashboards, alerting, SLOs | A hosted deployment carrying real traffic | Metrics are only meaningful against production load; premature dashboards measure nothing. |
| **Compliance program** — SOC 2, append-only audit enforced at the DB policy layer, data-retention controls | A customer or contract that requires it | An audit *log* exists; a compliance *program* is an organizational commitment, not a code change. |
| **Managed secret store** for model / DB / workflow credentials | A hosted, multi-environment deployment | Local `.env` is appropriate for a showcase; a secret manager is a deployment concern. |
| **Source-authority modelling for refusal** (treat an official advisory as corroboration, beyond the threat's own confidence) | Demand for authoritative-single-source handling | The calibrated refusal already fires on a corroboration + confidence rule; authority modelling is a refinement, not a gap in the control. |
| **Hosted deployment + runtime checks** | A pilot or live demo audience | The verified build runs locally; deploying is a step taken when there's someone to deploy for. |

## Demo boundaries (unchanged, and disclosed)

- Operational supplier data is **synthetic** (~150-row seeded US dataset), disclosed as such; seed-derived figures are stamped and never mixed into results from a user's own upload.
- Public signals (GDELT, NWS) are **enrichment only**, not enterprise visibility; each fetch is labelled `LIVE` / `CACHED` / `FAILED`, never faked.
- No real Apple / Amazon / FedEx / supplier / carrier / customer / private-ERP data is claimed.
- n8n is **approval orchestration only** — it does not own calculations or AI reasoning, and it is an external system, not a dependency of this app.
- Model outputs are **non-authoritative** for numbers and IDs.

## The story this supports

The credible claim is not "production-ready enterprise software." It's **operational discipline at v0.1, with a sequenced path to enterprise scale**:

```text
signals enrich context
synthetic enterprise data represents internal truth
deterministic code calculates impact
bounded AI explains and drafts
gatekeeper validates
human approves
audit trail records the decision
```

Being able to name *which* enterprise capability comes next, and *what trigger* activates it, is itself the evidence that the expansion would be built right — which is what enterprise buyers, analysts, and engineering leads should trust.
