# Showcase ladder — FINAL batched Codex cross-model pass

**Stage:** the ONE batched Codex pass over the whole ladder (git range 8e4908b..HEAD, 52 files,
+5077/-145), per PLAN-SHOWCASE-2026-07-06.md § Methodology. S3 additionally had its own dedicated
mid-ladder pass (docs/claude/gates/mcp-surface/S3-CODEX-PASS.md, APPROVED); this batch re-covers it.

**Scope named to Codex:** S2 (README numbers) · S-D.1/S-D.2 (token retheme + contrast-check + BLUF) ·
S-L (loop-replay loader + fixture) · S3 (MCP surface) · S4 (BM25 retrieval + citation-by-construction) ·
S6 (boot reconcile sweep + instrumentation + workflow). Codex asked to refute the boot-moat,
outbound-no-authority, cross-family-Skeptic, and citation-by-construction claims.

## Rounds
### Round 1 → VERDICT: REVISE (3 findings; no HIGH, no invariant break)
1. **[MED] Configured transports never wired into the execute route or boot reconcile** — both used
   `defaultTransportRegistry()` = `{}`, so a configured Slack/Email/N8N transport was ignored and a
   stranded REVERSIBLE action could be marked EXECUTED via Noop while an operator believed real
   delivery. ACCEPTED (also the S6 gate's standing advisory). FIX: execute route +
   reconcileAllStrandedDispatches now use `transportRegistryFromEnv()` (empty env → `{}` → Noop, so the
   keyless demo is byte-identical; the irreversible/outward guard is unchanged — outward stays PENDING,
   reconcile re-drives only REVERSIBLE).
2. **[MED] replay-loop loader didn't enforce the cross-family/non-injected loop semantics** (they lived
   only in tests, so a drifted fixture could render as genuine). ACCEPTED. FIX: `loadLoopTrajectory()`
   now enforces at load time — skeptic LIVE_AI + non-deterministic + non-Gemini (cross-family) + no
   "in-pipeline accept" marker + sequence includes `challengeFinding`; each throws with a regenerate msg.
3. **[LOW] MCP structural moat test had partial teeth** (static imports + a few call names only).
   ACCEPTED. FIX: the scan now covers dynamic `import()` + `require()` and a broadened authority-callsite
   list (executeApprovedPacketActions / dispatchGovernableAction* / reconcile*Dispatches /
   transitionApproval / save/updateDecisionPacket …).

Also applied (the two carried S3 advisories): `mcpMisconfiguredInProduction()` extracted as a pure
predicate (+4 unit tests); the injection BASE_INTENTS corpus driven through BOTH `query_supplier_exposure`
supplierId AND `query_customs_policy` query (no-match/hashed + never-echoed across the corpus).

### Round 2 (resume) → VERDICT: APPROVED
Codex confirmed all three fixes + both advisories on disk. **The final batched cross-model gate is
DISCHARGED** (2 rounds, 3 findings + 2 advisories, disposed primary-model-final; no HIGH at any round,
no standing invariant broken). Post-fix: verify:full FINAL_EXIT=0 — 869 unit / 34 golden / 56 e2e.
