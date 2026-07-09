> **Legacy reference — RESILIX v1 / LaunchOps.** Not part of the ActionOps build; retained as historical reference. Current design: README.md and PLAN.md at the repo root.

# Workflow Exports

## `resilix_erp_case_workflow.json` — the ActionOps ERP_CASE outbound (S6, current)

The importable n8n workflow for RESILIX's one governed outbound channel: the `ERP_CASE`
dispatch. It demonstrates governed workflow automation without ever putting n8n in the
decision loop. The contract:

- **Post-approval only, by construction.** `ERP_CASE` is routed to the `N8N` channel and
  classified `IRREVERSIBLE` (`lib/server/action-taxonomy.ts`); the outbox executor records
  every outward action `PENDING` and dispatches it **only after a human approves the packet**.
  n8n receives nothing before that gate, and the startup reconcile sweep can never auto-fire it
  (the moat re-drives only REVERSIBLE actions). **Scope note:** in this MVP `ERP_CASE` is
  *classified but never actually derived* by `deriveGovernableActions()` — there is no ERP
  integration to trigger it, so the outbound path is proven by the transport + this workflow
  + the tests, not by a live packet-derived dispatch (the live smoke used a synthetic message;
  see `PHASE5-GATE.md`).
- **Digest-only body.** RESILIX POSTs a sanitized JSON body `{actionType, channel,
  idempotencyKey, ...digest}` (`lib/server/transports/n8n-transport.ts`) — no raw prose, every
  field control-stripped and length-capped.
- **Idempotent by key.** The `idempotencyKey` field dedupes a re-driven dispatch; the workflow
  upserts on it (the `Set` node is a placeholder for your NetSuite/Epicor/Dynamics case node —
  keep the upsert-on-key so a re-drive never opens a duplicate case).
- **Optional header auth.** Set `N8N_ERP_WEBHOOK_HEADER_NAME` / `N8N_ERP_WEBHOOK_HEADER_VALUE`
  on the RESILIX side (both or neither — fail-closed) to match a webhook credential in n8n; n8n
  has no standard `Authorization: Bearer`, so the header name is itself configuration. (This is
  header-credential auth, not an HMAC signature — n8n's webhook trigger has no HMAC scheme.)

A running n8n instance is **optional operator infra**, not a repo deliverable — the app dispatches
through the typed transport seam whether or not an n8n endpoint is configured (unconfigured →
`NoopTransport`, inert). Live-smoke recipe (headless, no Docker): `PHASE5-GATE.md`.

## `launchops_approval_workflow.json` — legacy reference

The n8n approval orchestration pattern for the predecessor LaunchOps direction.

The app remains the source of truth for:

- deterministic calculations
- AI agents
- gatekeeper validation
- decision packet state

n8n is used only for approval/notification orchestration and callback simulation.

For a protected callback demo, set `N8N_CALLBACK_SECRET` in the app and pass the
same value into the workflow request as `callbackSecret`; the HTTP Request node
sends it as `x-resilix-callback-secret`. Protected callbacks also send
`callbackEventId` and `callbackSentAt` so the app can reject stale callbacks and
treat repeated callback events idempotently.
