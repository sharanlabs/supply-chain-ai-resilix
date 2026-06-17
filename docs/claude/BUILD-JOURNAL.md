# Build journal -- RESILIX ActionOps

Living record of the build, kept in parallel with the work. It captures what was
done, what worked, what failed and why, and how each failure was corrected, so the
next session (any account) and the owner get the full story, not just the resume
pointer.

How this relates to the other records:
- `docs/claude/HANDOFF.md` -- the resume pointer (live state + next micro-step).
- `tasks/lessons.md` -- one durable line per mistake (the compounding-lessons loop).
- `docs/decision_log.md` -- the architectural decisions.
- This file -- the narrative that connects them: the journey, the dead ends, the fixes.

Update it the moment something works, fails, or is corrected -- not at the end.

---

## 2026-06-17

### P2.7 -- fail-closed authentication (closed Phase 2)

What was done: added fail-closed bearer-token auth to the mutation surface
(`secureModeRequired` gates upload + approve + run-exception; deny-on-missing-config).

What worked:
- The gate found real holes. Reading the routes (and the acceptance-gate confirming
  it) surfaced that two mutation routes -- packet approve and run-exception -- had
  **no authentication at all**. That is the kind of gap a feature-focused pass misses
  and a security review catches.
- Running an independent `security-specialist` afterward confirmed the result against
  OWASP A01/A05/A07 + ASVS, and ruled out an ungated mutation route by enumerating all
  six routes -- the one check that could have flipped the verdict.

What failed, and the fix:
- Codex round 1 caught a **fail-open**: `REQUIRE_APPROVAL_TOKEN === "true"` left an
  operator who wrote `True` / `1` / `" true "` silently authless. Fixed with a robust
  `envBool` parser, moved into a shared dependency-free `lib/server/env-flags.ts` so the
  `liveAiEnabled` predicate can no longer drift between the auth check and the pipeline.
- The token compare leaked the configured secret's length (raw `timingSafeEqual` returns
  early on a length mismatch). Fixed by hashing both sides to a fixed 32-byte SHA-256
  digest first.

Outcome: `npm run verify` green (138 passed/8 skipped), acceptance-gate SHIP, Codex
REVISE -> fix -> closure APPROVE, security-specialist verdict meets-industry-bar.
Committed `b42ebc8`; relay `06faa5c`. Phase 2 complete.

### The plan-stage correction (the meta-lesson of the session)

What failed: I went straight to execution and skipped the plan stage's grounding. I did
not run `guidelines-monitor`, did not use the project's designated `security-specialist`
up front, did not declare which frameworks the work leaned on (gsd-core / gstack /
superpowers), and did not ground the plan in the knowledge base or the external canon. I
leaned on Codex + the acceptance-gate as if they were the whole of "grounded," when they
are one layer of it.

Why: the autopilot framing pulled toward "ship the increment through the gates," and I
rationalized a single gate as sufficient -- which is the opposite of triangulating across
the curated sources and the designated reviewers.

How it was corrected (owner caught it across several questions):
- Ran `guidelines-monitor` -> the plan follows the canon (OWASP-2025, Willison/Meta,
  Gemini structured-output, Anthropic BEA) with 5 sourced PARTIALs to close before ship
  (top: a Phase-7 injection-laundering path through Sentinel's free-text fields).
- Ran `security-specialist` -> P2.7 meets the industry bar, 4 Low expansion-path residuals.
- Grounded the frameworks against `PLANNING-FRAMEWORKS.md` and declared them per phase.
- Self-audited against the Fable mindset: I had held the inner loop (ground/verify/
  re-evaluate, including real verification every edit) but missed principle 6 (discover
  capabilities before committing) and principle 9 (plan-gate before executing).
- Grounded a dedicated anti-AI capability (internal `no-ai-slop.md` + external canon).

Durable lesson: the plan stage's capability-discovery, framework-declaration, and
all-source grounding is where industry-grade starts. It is not ceremony to skip; doing it
first is cheaper than retrofitting it after the owner notices it is missing.

### Phase 3 / P3.1 -- GDELT signal fetcher (in progress)

What was done: built `lib/signals/gdelt.ts` -- GDELT DOC 2.0 as the core disruption
signal, replay-first, resilient (it never throws into the pipeline).

What worked:
- Live-probing GDELT first (the recency rule) surfaced the throttle **before** any design.
  GDELT returned `429 "limit requests to one every 5 seconds"`, so the fetcher was built
  for it from the start: >=5s spacing + a per-scan cache + 429/error backoff + a long
  timeout (the live call took 15.6s).
- Dependency injection (`fetchImpl`, `now`) was chosen so every HTTP and timing edge case
  is testable deterministically, after verifying the codebase had no fetch-mocking pattern.

What failed, and the fix:
- A control-char strip regex in `sanitizeText` was mangled into garbage on Write -- twice
  (the `\u00xx` escapes did not survive, leaving literal control bytes). Stopped fighting
  it and switched to a numeric `codePointAt` scan; verified the file is clean and the logic
  is correct (control chars -> space, hyphens and non-Latin text preserved).
- An adversarial "any blindspots" pass caught five more before any test ran: the first call
  would be wrongly throttled (`lastCallAt = 0`); the cache grew unbounded; failure could
  serve an hours-old cache; a `javascript:`/`data:` URL would pass `z.string().url()` and
  become a renderable XSS link. All fixed (negative-infinity init, FIFO cache cap, a
  max-serve-stale bound, an http/https-only scheme check).

Status: module built and blindspot-hardened. Still ahead: the anti-AI comment pass
(trim WHAT-comments to WHY), the full edge-case test suite, then verify ->
acceptance-gate -> Codex -> commit.

### Industry-grade gaps identified (carried, not yet closed)

Missing vs a top-shop baseline: Prettier (formatter), `.editorconfig`, `.nvmrc`, test
coverage tooling + thresholds, pre-commit hooks, structured logging/observability, and
CODEOWNERS/PR-template/CONTRIBUTING. Present already: CI (`.github/workflows/verify.yml`),
strict eslint, vitest, secret-scan, zod validation, the gate discipline. Plan: a small
"industry-grade hardening" increment for the cheap craft items (`.editorconfig`, `.nvmrc`,
coverage, the anti-AI pass); Prettier as its own increment (it reformats everything);
observability and the GitHub-collaboration files on the expansion path.

### Parallel claude-os work (cross-reference)

The agent-rewind do-no-harm hook was wired + hardened in the `claude-os` repo this session
(its own record is in that repo's `STATE.md`). A live test caught a `2>/dev/null`
false-positive; a Codex round caught a same-second snapshot collision and a credential-path
copy. Both fixed; committed `d2bfaca`.
