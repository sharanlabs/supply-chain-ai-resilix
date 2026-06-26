# Batched Codex cross-model closure — Phases 2+4+5+6+7

**2026-06-26, autopilot.** Codex (gpt-5.5, xhigh) over `git diff a3f1758..HEAD -- lib/ app/ db/` (the production delta since the Phase-1 stamp). **VERDICT: REVISE.** The load-bearing SAFETY invariants ALL HELD — the findings are refinements + defense-in-depth, not safety holes.

## Invariants Codex could NOT refute (the headline)
- **Auth boundary / approval gate** — execute route verifies the bearer BEFORE work, rejects non-APPROVED (422), passes no real transport registry.
- **Taxonomy moat** — reversibility derives from the action TYPE in code; outward actions record PENDING, never dispatch.
- **NoopTransport default** — no real external send reachable by default.
- **Skeptic fail-closed + quarantine** — a broken live verdict → accepted:false → `applySkepticGate` forces NO_ACTION + the schema superRefine requires withheld outputs; the prompt receives only `buildSkepticFinding()` (no summary/rationale/signal prose/location.region).
- **Phase 2 quarantine** — `QuarantinedSignal = Omit<PublicSignal,"summary">`; the Verifier consumes the quarantined view.
- **DI seam** — the page (`loadReplayPacket`) and the live POST (`/api/run-exception`, options built from the request schema) cannot pass scenario/supplier overrides.

## Findings + disposition (primary-model-final)
- **[Med] `skeptic` budget estimate** (`index.ts:72`) — the Skeptic live budget uses the GEMINI model estimate but bills the GROQ Skeptic model; a repriced/unknown `SKEPTIC_MODEL` could bill before `assertWithinBudget` fires. **→ FIX:** `challengeFindingLive` recomputes/preflights its OWN model estimate (`resolvedSkepticModel`) before the live call.
- **[Med] outbox crash-recovery** (`action-executor.ts:339`) — winner-only for concurrent callers, but a crash AFTER the PENDING reservation strands the action (retries dedupe without dispatch). **→ ALREADY TRACKED** in `PHASE5-GATE.md` ("exactly-once intent, not delivery"); a lease/attempt-state + reconcile path is owed BEFORE wiring a real transport — inert under Noop. No code change now.
- **[Med] DI seam not ENFORCED** (`run-exception.ts:9`) — `RunExceptionOptions` inherits the `scenarioOverride`/`suppliersOverride`/`skeptic` DI fields, so "test-only/never-billed" is a convention at the exported wrapper, not enforced (the HTTP route is safe). **→ FIX (defense-in-depth):** reject the overrides unless `NODE_ENV==="test"` (and not live), or omit them from the production wrapper's type.
- **[Low] Skeptic fail-open edge** (`skeptic.ts:284`) — a forced `enabled:()=>true` with no Groq key + no injected generator falls through to `liveGenerateObject`'s default Gemini provider. **→ FIX:** after Groq binding, fail closed if no Groq generator (require `generate` when overriding `enabled`).
- **[Low] "flag-off behavior-identical" is imprecise** (`index.ts:106`) — deterministic runs now add `RUN-SKEPTIC`, so it is action/decision/no-billing-identical, not byte-identical. **→ FIX:** narrow the claim.
- **[Low] stale comment** (`build-packet.ts:40`) — says `app/page.tsx` calls `buildDecisionPacket`; it calls `loadReplayPacket()`. **→ FIX:** comment.
- **[Low] forward-compat claim vs closed enum** (`schemas.ts:780`) — the comment promises tolerance of unknown executed-action statuses, but the enum is closed. **→ FIX:** comment.

## Disposition
Applied AFTER Phase 3 (which is editing `index.ts`/`build-packet.ts` concurrently), on the final tree, then re-verify + commit. #2 stays a tracked forward-guardrail. Codex validation was logic-only (read-only sandbox; Vitest EPERM) — `npm run verify:full` is GREEN first-hand here (642/24 + 20 e2e).
