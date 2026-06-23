> **Stale — predecessor content; scheduled for rewrite in Phase 8 UI rework.** This still describes the LaunchOps / RESILIX-v1 system. The ActionOps target is defined in PLAN.md (repo root). Do not treat as current until rewritten.

# Demo Script

## Setup

Start the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Walkthrough

1. Run the flagship scenario.
2. Open Exception Queue and show the launch-critical camera module delay.
3. Open Impact View and show deterministic calculations:
   - inventory days remaining
   - shipment delay
   - launch unit gap
   - revenue at risk
4. Open Agent Trace and show five bounded agents.
5. Open Decision Packet and show the three ranked options.
6. Open AI Trust Panel and show source evidence, data evidence, calculation evidence, and gatekeeper status.
7. Open Approval Console and approve the packet.
8. Show audit trail update.

## Talk Track

RESILIX does not claim private enterprise visibility. It shows how public signals and synthetic operational data can drive an auditable exception-to-action workflow. The important engineering claim is traceability: AI drafts and explains, but code calculates and the gatekeeper validates.
