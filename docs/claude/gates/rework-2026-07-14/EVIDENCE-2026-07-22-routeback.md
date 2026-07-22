# Route-back evidence — acceptance-gate BLOCK items (2026-07-22)

## (1) run.ts contradictory comment — FIXED
`lib/agents/run.ts` default-model comment rewritten to current truth only: both halves of the
2026-07-22 verification (pricing/GA via ai.google.dev + independent tracker; key availability via
live ListModels), with the 2026-06-18 "key tops out at 2.5" observation explicitly superseded.

## (2) Key-availability proof — gemini-3.5-flash IS on the project key
Live ListModels (v1beta/models, real GEMINI_API_KEY from .env.local, key never printed), 2026-07-22,
exit 0:

```
TEXT-GEN MODELS ON KEY:
  gemini-2.5-flash
  gemini-2.5-flash-lite
  gemini-2.5-pro
  gemini-3.1-flash-lite
  gemini-3.1-flash-lite-preview
  gemini-3.1-pro-preview
  gemini-3.1-pro-preview-customtools
  gemini-3.5-flash
  gemini-3.5-flash-lite
  gemini-3.6-flash
HAS gemini-3.5-flash: true
```

The 2026-06-18 observation (no 3.x on the key) is stale — the key now serves the full 3.x lineup.
The new default cannot 404 at preflight on this key.

## (3) Diff footprint — frozen demo posture untouched
`git status --porcelain` (full, 29 M + 5 ??): NO file under `evals/fixtures/live/` and NOT
`lib/data/demo-packet.ts`. The only fixtures-path file in the diff is
`evals/fixtures/decision-packet-v2.ts` — a unit-test builder, not the frozen replay set.

## (4) S-01 red-arm — the tamper test is non-vacuous
Temporarily reverted the memory-path approval check to the pre-fix boolean
(`!existing.gatekeeper.approvedForHumanReview`), ran `npx vitest run evals/api-hardening.test.ts`:

```
× prevents approval when a TAMPERED report says approved=true but is BLOCKED with failures
Tests  1 failed | 8 passed (9)   RED_ARM_EXIT=1
```

Restored the `gatekeeperClearsApproval` predicate, re-ran: 9/9 passed, exit 0.
