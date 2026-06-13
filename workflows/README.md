> **Legacy reference — RESILIX v1 / LaunchOps.** Not part of the ActionOps build; retained as historical reference. Current design: README.md and PLAN.md at the repo root.

# Workflow Exports

`launchops_approval_workflow.json` is the n8n approval orchestration pattern for the LaunchOps direction.

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
