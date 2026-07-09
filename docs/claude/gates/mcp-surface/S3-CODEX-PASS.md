# S3 — MCP surface: dedicated Codex cross-model pass (safety-critical)

**Stage:** showcase ladder S3 (read-only MCP server). This is the ONE rung that gets a dedicated
Codex pass mid-ladder (the surface is safety-critical: a remote agent protocol over the war room),
per PLAN-SHOWCASE-2026-07-06.md § Methodology. Batched final Codex pass still owes the whole ladder.

**Surface under review:** app/api/mcp/[transport]/route.ts · lib/server/mcp-server.ts ·
verifyMcpToken (lib/server/security.ts) · evals/mcp-server.test.ts · evals/e2e/mcp.spec.ts ·
scripts/secret-scan.mjs · docs/mcp.md · playwright.config.ts (test bearer).

**Prior gate:** security-specialist read = SAFE-TO-SHIP (0 High/Critical; 2 MED + 2 LOW, ALL applied
primary-model-final: disableSse:true · instruction-vs-data DISCLOSURE frame · generic secret-scan
rule + recorded-exception allowlist (red-green proven) · inert resource_metadata docs note).

## Rounds

### Round 1 — Codex (gpt-5.x, read-only) → VERDICT: REVISE (6 findings; 0 HIGH, no auth bypass)
Codex confirmed: no path to a tool handler without a valid bearer; verifyMcpToken fail-closed;
no resources/prompts registered; never-echo real + tested. Findings, all disposed primary-model-final:

1. **[MED] WWW-Authenticate origin host-header poisonable** (route.ts) — ACCEPTED. `resourceUrl` now
   set from `MCP_PUBLIC_ORIGIN` when configured (public deploys pin it), else request-derived; the
   pointer is inert anyway (no metadata endpoint mounted) — defense-in-depth on the stated deviation.
2. **[MED] audit line logged raw untrusted supplierId** — ACCEPTED. Audit now records NORMALIZED
   fields only (source, minScore, supplierIdKnown, a sha256 hashPrefix for correlation) — never the
   raw arg. Refines the security-specialist's log-*forging*-safe read with log-*capture* safety.
3. **[MED] registry pin not independent (maker=judge)** — ACCEPTED. Added an INDEPENDENT source-scan
   test: mcp-server.ts must import no action-executor/action-transport/db/drizzle/build-packet and
   call no approvePacket/executeAction/dispatchAction/buildDecisionPacket — structural moat teeth a
   harmless-named future mutating tool can't slip past. (Caught + fixed my own false positives: the
   FORBIDDEN_TOOL_VERBS literal names the verbs; crypto .update() is not a DB write — scan scoped.)
4. **[LOW] disableSse not regression-pinned** — ACCEPTED. +2 e2e: /api/mcp/sse and /api/mcp/message
   return 401/404/405 (never a live 200) both authed and unauthed.
5. **[MED] secret-scan generic-rule false negatives + value-only allowlist** — ACCEPTED-NARROWED.
   Added case-insensitive + camelCase key coverage (apiKey/botToken/accessToken); value charset kept
   conservative ON PURPOSE (broadening to ./+/= false-positives on import paths/hashes/URLs across
   the codebase — the provider-prefix rules + lockfile review cover exotic shapes). Red-green proven.
6. **[LOW] docs overstate spec "current stable"/future-date/caret-not-pin** — ACCEPTED. Reworded to
   "current as of 2026-07-09" + "announced upcoming" for the 2026-07-28 revision; **exact-pinned**
   both MCP deps in package.json (no caret — safety-critical, tested against these exact versions).

Post-fix: mcp unit 11/11, mcp e2e 6/6, secret-scan red-green, typecheck clean. → resume round.

### Round 2 — Codex (resume) → VERDICT: REVISE (all 6 fixes CONFIRMED landed; 3 residuals)
Codex verified each round-1 fix in the code. Residuals, all disposed primary-model-final:
- **R1 (resourceUrl fallback silent in prod)** — ACCEPTED. Route now FAILS CLOSED: production + a
  configured MCP_ACCESS_TOKEN + no MCP_PUBLIC_ORIGIN → 503 misconfig (the request-derived challenge
  origin is never used when the surface is live in prod); dev/test/replay-only unaffected. Matches the
  repo's secure-mode-requires-strong-config pattern.
- **R5 (allowlist value-only)** — ACCEPTED. Allowlist is now a Map scoped by FILE BASENAME + value;
  the same fake token in an unexpected file trips CI (red-green proven).
- **R6 (lockfile root metadata still caret)** — ACCEPTED. Regenerated package-lock.json
  (--package-lock-only); root deps now show exact 1.26.0 / 1.1.0.
Post-fix: secret-scan clean + file-scope negative control fails as intended; typecheck clean. → resume round 3.

### Round 3 — Codex (resume) → VERDICT: APPROVED
Confirmed all 3 round-2 residuals landed (R1 503 misconfigHandler; R5 file-scoped allowlist Map;
R6 lockfile exact pins). **The dedicated S3 cross-model gate is DISCHARGED** (3 rounds, 6 findings +
3 residuals, all disposed primary-model-final; no HIGH, no auth bypass at any round — the read-only
moat held throughout). The ladder-end BATCHED Codex pass still owes S-D.1/S-D.2/S-L/S4/S6.

### acceptance-gate → SHIP (first pass)
5 gates clean (grill · Codex APPROVED · verify 847/34/53 · enterprise+taste · anti-slop). 3 advisories +
1 AT-letter note routed to the LADDER-END BATCHED Codex pass (not a re-open): (a) the prod-503 misconfig
branch has no automated coverage (e2e runs NODE_ENV=development) — Codex-eyeballed, 4 lines; (b) DONE this
rung — docs/mcp.md now documents MCP_PUBLIC_ORIGIN + the prod-503 requirement; (c) the moat test is a
blocklist (registry pin + e2e 3-tool pin are the backstop); (AT) drive the existing injection corpus
through supplierId (truncated 64ch, assert never-echoed) — ~10 lines, closes the AT's letter (the never-echo
path is content-invariant, so the representative payload + the invariant already cover the substance).
