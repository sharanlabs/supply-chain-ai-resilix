# Right-sized re-review pass — 2026-07-16 (supersedes the stalled 2026-07-14 dual-flagship run)

> Owner decision 2026-07-16: right-sized single pass — Codex Sol @ high over 4 sections (A engine/moat 80 · B surfaces/data/build 90 · C evals/teeth 112 · D docs/claims 42; stragglers folded: prompts→A, CI+workflows→B, root claims files→D; exclusions: docs/_archive, gate records, tasks, legacy evaluation/, LICENSE, shared_reasoning.md), findings disposed primary-model-final by the session seat (Fable 5), no evaluator dispatches, no reconcile rounds. Frozen target: HEAD `8048d0d`, tree clean (this gate dir untracked).
> Run artifacts (events JSONL per section): session scratchpad `rework-review/`; distilled findings + dispositions land HERE (committed evidence — lessons.md P2.5).

## Leg 1 — main-session doctrine-delta read (Fable seat, 2026-07-16)

Changes in `~/claude-os` doctrine + the model landscape since the ladder ran (2026-07-06→09), checked against this repo:

- **Δ1 [MED, recency] — Gemini defaults + pricing table are one generation stale.** Live check 2026-07-16 (ai.google.dev models/changelog via search; to re-verify at fix time): Gemini 3.5 Flash is GA (May 2026), Gemini 3 Flash / 3.1 Pro current; Gemini 2.0 shut down 2026-06-01; `gemini-2.5-flash` (our `DEFAULT_GEMINI_MODEL`, run.ts:30) still served but no longer the GA best-value flagship. `lib/agents/pricing.ts` knows only 2.5-era + Groq rows (PRICING_VERSION 2026-06-22). **Fail-safe today:** `costUsd` throws on unknown ids, and `scripts/preflight-models.mjs` verifies the configured model on the key — so nothing silently mis-meters. **Disposition: fix in this pass** — refresh default + add current-generation pricing rows (live-verified ≥2 sources at fix time), bump PRICING_VERSION; recorded /loop fixture + metered README claims stay historical (disclosed recording).
- **Δ2 [note] — Codex seat doctrine moved (2026-07-10):** seat = `gpt-5.6-sol`, default effort `high` (this run complies; effort passed explicitly per call).
- **Δ3 [note] — proof-of-work gate bundle (2026-07-15 doctrine):** artifacts now arrive at the acceptance-gate with an evidence bundle. Process-side; applied to this pass (events JSONL + this record = the bundle). No shipped-code impact.
- **Δ4 [note] — anti-slop/eval canon upgrades (2026-07-15):** covered by section C's vacuity-focused packet rather than a separate leg.

## Leg 2 — Codex Sol section reviews

All four sections dispatched sequentially through `codex-guarded` (Sol @ high, read-only, full JSONL event capture). Receipts adequate on A/B/C (hash echoed, files inspected, citations quoted verbatim). Timing: A 13:54→14:10 · B 14:10→14:26 · C 14:26→15:03 · D 15:03→(in flight).

- Section A (engine/moat): **15 findings** (A-01..A-07 ActionOps · C-01..C-05 customs · P-01 citation-check · S-01/S-02 schema/ingest).
- Section B (surfaces/data/build): **15 findings** (B-01..B-15). Sol explicitly found NO refutation of invariants 1 (authoritative binding), 2, or 5 on this section; core execute/reconcile approval gate + keyless production posture HOLD.
- Section C (evals/teeth): **15 findings** (relabeled EV-01..EV-15 to avoid ID clash).
- Section D (docs/claims): **15 findings** (D-01..D-15), 13 claim-vs-reality — the packaging-honesty tier. Completed 15:15.

## Dispositions (primary-model-final, Fable seat; verified first-hand against code before disposing)

### Section A — engine/moat
- **A-01 ACCEPT-NARROWED (HIGH→MED, live-mode only).** Verified: live Sentinel authors `confidence` (clamped [0,1], sentinel.ts:270) and it feeds `decideRecommendation`. Narrowing: it is one of three CONJUNCTIVE refusal conditions; deterministic corroboration dominates; deterministic/replay paths (the public demo) use fixture confidence — unaffected. Real risk: live model overstating confidence on an uncorroborated signal bypasses refusal. **Fix:** in the live firewall path only, cap model confidence below the action floor when the deterministic source count is uncorroborated (<2 distinct outlets) — makes the refusal trigger deterministic without touching fixtures/golden.
- **A-02 SPLIT.** (a) corroboration counting ambient sources: verify call-site signal binding at fix time; if the counted set is not event-bound, count only event-bound signals — ACCEPT pending that check. (b) "no actionable exposure defaults to ACT": **REFUTED as defect** — documented deliberate semantics (recommendation.ts:22–28: zero-exposure and off-taxonomy controls return ACT from this gate because the refusal is specifically about uncorroboratable actionable exposure; no outbound is produced without exposure). Kept as recorded design.
- **A-03 ACCEPT-NARROWED (live-mode only).** Verified sentinel.ts:242 — a live claim OMITTING the chokepoint on a chokepoint-scoped scenario passes the firewall (only a mismatching CLAIM fails closed). **Fix:** for a chokepoint-scoped scenario, require the live claim to carry a matching chokepoint (omission fails closed too); re-check eventType resolution fallback while there.
- **A-04 REFUTED as code defect; ACCEPT as packet/doc-precision item.** The "Skeptic re-derives from raw inputs" invariant belongs to the CUSTOMS deterministic Skeptic (skeptic-check.ts, D6 hardening). The ActionOps Skeptic is by design a cross-family CRITIC of the finding (skeptic.ts:31–43 says exactly that; ADR-0002). The overstatement was in THIS run's review packet (my authoring), not the code. Action: none in code; section-D pass will confirm no doc overstates it.
- **A-05 ACCEPT (MED→LOW, doc-comment fix).** Verified: the ANNOTATED downgrade for strong findings is the deliberate, invariant-guarded post-2026-06-28-false-veto design (skeptic.ts:584–602, with calibration oracle). The stale header line "a non-accept HOLDS the finding" (skeptic.ts:34) predates it. **Fix:** correct the header comment to describe the strength-aware gate honestly.
- **A-06 ACCEPT (live-mode only).** Live Dispatcher recipient set not code-bound to expected top-exposure suppliers. **Fix:** derive expected recipient IDs in code; enforce membership/cardinality in the firewall.
- **A-07 ACCEPT (live-mode only).** Pre-call guard prices a fixed 8k input tokens while context grows per step. **Fix:** conservatively bound the accumulated prompt (chars/3) per call in `prepareStep` pricing.
- **C-01 ACCEPT.** Verified: `renderPacketText` (defense-packet.ts:34–46) renders sections + namedGaps ONLY; prose claims citations/audit "attached" — they exist on the packet object (UI shows them) but NOT in the exported text artifact (counsel-gate.ts:70). **Fix:** render policy-citation, figure-provenance, deadline, and exhibit-audit appendices into the artifact; keep the export-door grader over the full text.
- **C-02 ACCEPT (HIGH→MED in demo posture).** Verified: export validates approval SHAPE (D6 #2) but approval is not content-bound. **Fix:** stamp a sha256 packet digest at approve(); exportPacket recomputes and refuses on mismatch.
- **C-03 REFUTED.** `consistentWithEntry` is generator-set synthetic ground truth (synthetic-entries.ts:166, `!contradicts`) — a world-fact of the synthetic case, not a caller-supplied verdict; exhibit bodies are opaque BY quarantine design, so there is nothing to re-derive from. **Action:** one clarifying comment at the quarantine boundary naming this synthetic-only trust; a real evidence layer would need a real extractor (recorded, out of showcase scope).
- **C-04 ACCEPT (HIGH→MED).** Verified: `Number("")`/`Number("   ")` → 0 slips the NaN guard (entry-scoper.ts:34,58); generator always emits well-formed records today. **Fix:** strict `^\d{10}$`-style field validation + exact record width in parseLine.
- **C-05 ACCEPT-NARROWED.** Verified: `input.seed` and DEMO_INTEREST constants are labeled TOOL_RETURN (pipeline.ts:93,103). **Fix:** honest sourceKind vocabulary (RAW_INPUT / DECLARED_ASSUMPTION / TOOL_RETURN) + grader accepts the enum; the full closed-registry-with-recompute is right-sized OUT (golden suite already pins the values).
- **P-01 ACCEPT-NARROWED.** Tighten citation-check: normalize claim values, require units on known numeric leaves (fold with EV-06). Full allowlist-of-path-shapes lands with the same fix.
- **S-01 ACCEPT.** Schema-level coherence refine (BLOCKED/failures ⇒ approvedForHumanReview=false) + approval-boundary check.
- **S-02 ACCEPT-NARROWED.** Length-cap + control-strip supplier display fields in SupplierSchema (shared sanitize already exists); prompt-side data delimiters already present — verify at fix time.

### Section A/B cross-check note
Sol-B independently confirmed invariants 1/2/5 hold on the surfaces; Sol-A's refutations of invariants 1–2 are live-mode-scoped and narrowed as above. No finding refutes the shipped public demo's honesty posture.

### Section B — surfaces/data/build (to finalize after D lands; provisional)
- **B-05 ACCEPT** (default `useLiveSignals` → false; explicit opt-in). **B-07 ACCEPT** (empty-header normalize). **B-09 ACCEPT** (CI runs `npm run verify`; coverage ratchet recorded-deferred). **B-11 ACCEPT** (ephemeral Postgres service for PR CI). **B-12 ACCEPT** (hardcode legacy workflow callback URL). **B-13 ACCEPT cheap legs** (import-inside-catch, shared bool parser, URL guard, fetch timeouts). **B-15 ACCEPT** (aria-live + focus handoff). **B-01/B-02 ACCEPT-NARROWED** (honest "simulated" labeling + whitespace-reason rejection; actor stays the demo actor, labeled). **B-03/B-04 ACCEPT-NARROWED** (workflow-template hardening: secret-check node, respond-after-guard; smoke stays but through a labeled non-authoritative path). **B-06 ACCEPT** (bounded body read). **B-08 ACCEPT-NARROWED** (ID-shape validation; open reads are the recorded demo posture — hosted-auth remains the owner decision). **B-10 ACCEPT** (prod CSP smoke in CI post-build). **B-14 DECIDE-AT-FIX** (audit cascade → RESTRICT + migration vs recorded-defer).

### Section C (evals) — EV-01..EV-15 (to finalize after D lands; provisional)
Cheap+real hardening ACCEPTED: EV-05 (extractor gaps, fail-closed), EV-06 (unit registry + positive-control pass===true), EV-09 (calibration errors ≠ TPs), EV-11 (stage-then-atomically-replace recorder), EV-13 (rate-limit hard-cap eviction + trusted-identity note), EV-14 (six→seven text), EV-15 (ordered loop assertion), EV-10 (a11y per-node binding + customs form controls + incomplete-handling), EV-03/EV-04 (ONE shared output-surface enumerator for graders + trajectory + injection). Deeper refactors EV-01/EV-02 (trajectory harness re-architecture: failed-step prerequisites, real Investigator tool events), EV-07 (literal joint-cell pinning for every scenario), EV-08 (live-eval hard gates), EV-12 (customs sourceRef registry — partially covered by C-05 fix): dispose individually at fix time — accept what lands cleanly within the right-size, record-defer the rest explicitly.

### Section D — docs/claims
- **D-01 ACCEPT (merged with A-01).** Same root: live confidence is model-authored. Fix = A-01's deterministic cap (live path) + narrow the "AI never owns a number" prose to name confidence honestly (model self-assessment, capped by deterministic evidence).
- **D-02 ACCEPT (doc fix).** The cross-family judge is an eval-time regression check, not a production gate — README relabeled. Wiring it into production is billable + owner-gated (recorded, not this pass).
- **D-03 ACCEPT (doc fix).** No auto-fire path for N8N is DELIBERATE (executor records outward PENDING); README wording corrected to "adapter + workflow mechanics proven; outward dispatch is operator-driven post-approval."
- **D-04 ACCEPT (doc + glass label; merged with B-01).** Homepage approve is a replay simulation — label it on the glass + in the walkthrough.
- **D-05 ACCEPT (code fix).** Keep the conservative reservation when mid-step usage is unavailable; never release on unknown cost.
- **D-06 ACCEPT (doc fix).** README points at `verify:full` for the table rows it actually proves; ledger row labeled as recorded history.
- **D-07 ACCEPT (doc fix, feeds Phase 4).** Deploy recipe gains the `APPROVAL_TOKEN` step (strong value) and corrected smoke expectations (503 AUTH_NOT_CONFIGURED vs 401 semantics).
- **D-08 ACCEPT (doc fix).** architecture.md updated for the default-ON step-driven loop + replay/waterfall paths; PLAN.md gets a dated stale-claims header note (history preserved, not rewritten).
- **D-09 ACCEPT (doc fix).** mcp.md: four tools incl. `query_customs_policy`, replay-backed vs corpus-backed distinguished.
- **D-10 ACCEPT-NARROWED.** Doc wording (structurally-cited + test-checked, not produce-time fail-closed) + cheap runtime non-empty-citation guard at the retrieval serve boundary.
- **D-11 ACCEPT.** Explainer wording (pre-structured synthetic metadata, honest); bodyDigest FNV-1a → sha256-16 IF no fixture pins the digest (check at fix; lessons.md P2.5 named FNV fine for fingerprints — the EXPLAINER's "tamper-evident seal" is the overclaim either way, wording fixed regardless).
- **D-12 ACCEPT-NARROWED (doc fix).** Call it shared-primitive recomputation + tamper detection; the independent hand-derived oracles live in the golden suite (P1 two-derivations discipline) — say so.
- **D-13 ACCEPT (doc fix).** "Self-attested named-reviewer demo gate," not licensed-counsel enforcement.
- **D-14 ACCEPT.** HANDOFF top block rewritten this session (paused-deploy state, reviewed hash); README cadence wording fixed to the recorded batched-gate reality.
- **D-15 ACCEPT (doc fix).** "Automated axe + keyboard checks pass; manual screen-reader pass pending."

## ▶ FIX-BATCH PROGRESS AT WRAP (2026-07-16 session end — owner called wrap; tree UNCOMMITTED, typecheck GREEN, resume exactly here)

**Done + suite-verified:**
- **Batch 1 (docs honesty) DONE** — README (D-02/03/06/10/14/15 + verify:full line + WCAG wording), mcp.md 4-tools (D-09), explainer (D-11/12/13 wording), architecture.md live topology (D-08), PLAN.md stale-claims header (D-08), walkthrough D-01/D-04 lines, skeptic.ts header (A-05), quarantine synthetic-trust comment (C-03). HANDOFF deploy-recipe fix (D-07) still queued for the HANDOFF rewrite at Phase-1 completion.
- **Batch 2 (customs engine) DONE, suites green** (customs:golden 34/34 + 5 customs files) — renderPacketText appendices (C-01: policy citations/provenance ledger/deadlines/exhibit audit; digests render `SHA-<hex>` = extractor-masked ID form), approve/export sha256 digest binding (C-02), strict fixed-width parse (C-04), honest sourceKind enum RAW_INPUT/DECLARED_ASSUMPTION (C-05, refs renamed `case-input#seed`/`demo-model#*`), bodyDigest fnv1a→sha256-16 (D-11), serve-time citation guard in retrievePolicy (D-10), skeptic-check updated (multi-value allowlist + policyCitationFigures + asOf dates + refusal citations re-derived); 1 stale test assertion updated (customs-gate-skeptic tampered-date: honest dueOn now legitimately in the appendix).
- **Batch 3 (ActionOps live-path) DONE, suites green** (sentinel 23 · dispatcher · investigator · live-pipeline 3) — live confidence cap when uncorroborated (A-01/D-01, index.ts, deterministic path byte-identical), evidence-bound corroboration live-only (A-02a, filters ctx.signals to Sentinel-cited sourceUrls), CHOKEPOINT_CLOSURE-without-chokepoint fails closed (A-03 NARROWED — non-chokepoint types still validly omit; new pin test), recipient-set binding (A-06 + new pin test; 2 controls updated to single-exposure), growing input-token budget estimate (A-07, estimateLiveCallCostUsd partial envelope + nextInputEstimateTokens), mid-step-throw reservation KEPT as unknown-cost upper bound (D-05 — REVERSES the earlier clear-reservation reconcile; test rewritten to pin conservative semantics: Skeptic blocked → NO_ACTION + summary carries the held reservation), live-pipeline mock now cites fetched-signal evidence (distinctSourceEvidence helper).
- **Batch 4 (surfaces) DONE except B-14** — useLiveSignals default false (B-05), blank idempotency header normalized (B-07), boot-reconcile robust bool + import-inside-try (B-13), MCP origin guarded parse + malformed-origin = prod misconfig 503 (B-13, security.ts), packet-GET ID shape gate (B-08), streamed+capped upload read (B-06), approve-route reason trim-refine + demo-actor comment (B-02), homepage approve simulation label on glass + audit detail (B-01/D-04), customs counsel-gate persistent live region + focus handoff on terminal states (B-15), legacy workflow callback URL hardcoded (B-12), ERP workflow template: fail-closed X-Resilix-Webhook-Secret guard + respond-after-guard 200/403 (B-03/B-04; erp-case-workflow structural test green), n8n-smoke authority note (B-03).

**▶ EXACT STOP POINT — B-14 (audit-row cascade→RESTRICT): db/schema.ts NOT yet edited.** The Edit failed on ambiguity (5 tables share the `.references(() => decisionPackets.id, { onDelete: "cascade" })` pattern) — apply ONLY to the `executedActions` table (the immutable audit/outbox row, ~line 350; decide the other 4 tables on their own merits: audit-bearing → restrict, derived/regenerable → cascade may stand), then `npm run db:generate` for the migration, then run the schema/alignment tests.

**Remaining after B-14 (in order):**
1. **Batch 5 (CI):** verify.yml runs `npm run verify` not the subset (B-09) · ephemeral Postgres service for PR `db:push` (B-11) · prod CSP smoke post-build in CI (B-10).
2. **Batch 6 (evals teeth, accepted set):** EV-14 six→seven text · EV-15 ordered loop assertion · EV-09 calibration errors ≠ TPs · EV-11 recorder stage-then-atomic-replace · EV-13 rate-limit hard-cap eviction · EV-05 extractor gaps · EV-06 unit registry + positive-control pass===true (folds P-01) · EV-10 a11y per-node/form-controls/incomplete · EV-03/04 shared output-surface enumerator. Dispose-at-fix effort call each; record-defer what doesn't land cleanly (EV-01/02/07/08/12 already record-deferred).
3. **Moat trio:** S-01 gatekeeper schema coherence refine · S-02 supplier display-field caps in SupplierSchema.
4. **Batch 7 (recency Δ1):** live-verify current Gemini GA pricing (ai.google.dev) → decide default bump vs pricing-rows-only; update README "Live AI" para as-of line either way.
5. **Close:** `npm run verify` + `verify:full` (e2e) green first-hand → re-check every disposition against the final diff → acceptance-gate on THIS record → commit (+ owner-gated push) → HANDOFF rewrite (incl. D-07 corrected deploy recipe + D-14 stale-block cleanup).

**Also this session (owner-directed, done):** grilling-frontend-prototyping skill/method REMOVED (no disk file existed; memory + task bindings reverted) · github.com/jakubkrehel/skills evaluated (16 md files, no executables, scan clean) → `better-colors` / `better-typography` / `better-ui` installed to `~/.claude/skills/` for the Phase-2 design build.

## Fix batches (execution order)
1. Docs honesty (D-02/03/04/06/07/08/09/12/13/14/15 + A-05 header comment + C-03 clarifying comment) — public credibility first.
2. Customs engine (C-01 render appendices · C-02 digest-bind · C-04 strict parse · C-05 sourceKind enum · D-10 runtime guard · D-11 digest).
3. ActionOps live-path (A-01+D-01 · A-02a · A-03 · A-06 · A-07 · D-05) — deterministic/replay outputs byte-identical (frozen fixture).
4. Surfaces (B-01/02 labels · B-05 · B-06 · B-07 · B-08 · B-12 · B-13 · B-15 · B-03/04 template).
5. CI (B-09 · B-10 · B-11).
6. Evals teeth (accepted EV items).
7. Recency Δ1 (Gemini default + pricing rows, live-verified at fix).
Each batch: `npm run verify` green first-hand before the next; e2e at the end; all dispositions re-checked against the diff.

## ▶ BATCHES 6+7 + MOAT TRIO COMPLETE (2026-07-22 session — Phase-1 fix tail CLOSED)

**Batch 6 (evals teeth) — all nine accepted EV items landed, dispose-at-fix:**
- EV-14 seven-scenario text ✅ · EV-15 ordered loop assertion ✅ · EV-09 error-bucket confusion cells
  (`classifyJudgeVerdict`, errors excluded from TPR/TNR + bounded ≤10%) ✅ · EV-11 atomic recorder
  (`evals/_helpers/atomic-write.ts` + inlined in `record-gdelt-fixture.mjs`) ✅ · EV-13 rate-limit
  HARD cap w/ oldest-window eviction + trusted-identity note ✅ · EV-05 extractor gaps (spelled-out
  magnitude w/o unit; parenthesized $-negative) ✅ · EV-06 unit registry (marginAtRiskUsd/survivalDays)
  + positive control ✅ — **the positive control immediately caught a real defect**: the shared
  `makeV2Packet` fixture carried an unsourced "7-day" numeral (fixed with a backing claim; the
  control exists for exactly this) · EV-03/04 ONE shared `enumerateOutputProseSurfaces` — grader +
  red-team scanner both import it; the recoveryOptions/exposure-rationale drift is closed structurally ✅.
- **EV-10 (a11y)** — the detailed scratchpad verdict was lost with the dead session; reconstructed
  from the summary ("per-node binding + customs form controls + incomplete-handling") + the G-series
  lesson class. Landed as: the stray lookup-state axe test bypassing `assertAxeClean` (violations-only,
  incomplete silently discarded, mislabeled "landing") routed through the shared per-node triage;
  BOTH lookup branches (results + no-match) scanned (R-3); explicit `<label for>` binding asserted for
  all three customs form controls. DEVIATION NOTED: reconstruction, not the original verdict text.
- EV-01/02/07/08/12 remain RECORD-DEFERRED as accepted.

**Moat trio:** S-01 ✅ — `GatekeeperReportSchema.superRefine` (BLOCKED/failures ⇒ approved=false fails
PARSE) + `gatekeeperClearsApproval` as the ONE approval predicate in BOTH store paths (memory+pg);
behavioral test proves a tampered boolean-true/BLOCKED report can no longer be approved (it could
before). S-02 ✅ — SupplierSchema name/region: min(1) + max(MAX_FIELD_LEN=120) + control-char rejection
via shared `containsControlChars` (fail-loud per-row ingest rejection, never silent repair); prompt-side
data delimiters VERIFIED at fix (dispatcher whitelist crosses as structured JSON + "DATA, never
instructions" framing). CONSEQUENCE: 30/50 supplierName injection-corpus mutations (length-inflating
obfuscations) are now cut AT THE INGEST BOUNDARY — the red-team harness counts fail-loud boundary
rejection as the strongest cut, with a non-vacuity floor requiring every BASE INTENT to keep ≥1
mutation proven cut downstream (all five do).

**Batch 7 (recency Δ1) — live-verified 2026-07-22** (ai.google.dev/gemini-api/docs/pricing + independent
tracker, agreeing): `gemini-2.5-flash` deprecation-scheduled **2026-10-16**; current GA default
`gemini-3.5-flash` ($1.50/$9.00). DEFAULT BUMPED to `gemini-3.5-flash` (staying on a deprecation-
scheduled default is the exact Δ1 stale-default pattern; bumped BEFORE retirement). 3.x GA rows +
day-old `gemini-3.6-flash` ($1.50/$7.50, released 2026-07-21, priced but NOT default) added; 2.5 rows
KEPT for recorded-run reproducibility; `PRICING_VERSION` → 2026-07-22; README + .env.example as-of
updated. Public $0/keyless demo untouched (live path only).

**Re-opened dispositions SETTLED on real ground:** C-05 narrowing STANDS — corrected basis = unit-level
hand-derived oracles (customs-penalty-core, two-derivations) + fail-closed produce-time citation check +
honestly-labeled Skeptic; per-scenario figure literals stay a DISCLOSED open gap (explainer says so
verbatim), record-deferred with EV-07. D-12 wording fix STANDS — grep confirms no doc claims the golden
suite pins figures; the explainer states the precise penalty-core/golden split.

**Evidence, first-hand 2026-07-22:** typecheck 0 · unit 901/955 (54 gated-skip) exit 0 · `npm run verify`
exit 0 · `npm run test:e2e` **59 passed, 0 failed** exit 0 (fresh `.next`, R-5 discipline). Logs in the
session scratchpad (`/tmp/claude-close-verify.log`, `claude-close-e2e.log`).

## ▶ CROSS-MODEL GATE ON THE FIX-TAIL DIFF (2026-07-22) — Codex NOT-APPROVED ×6 → ALL DISPOSED, suites re-green

**Provenance:** acceptance-gate BLOCKed the first close (3 route-backs: contradictory run.ts comment ·
key-availability unproven · no cross-model pass on the diff). Route-backs 1–2 cleared same-session
(comment rewritten; live ListModels on the project key returned the FULL 3.x lineup incl.
gemini-3.5-flash — the 2026-06-18 "key tops out at 2.5" observation is superseded; evidence:
EVIDENCE-2026-07-22-routeback.md, incl. the S-01 red-arm proof). Route-back 3 = Codex CLI read-only
single-thread review of the diff (first attempt died mid-run — infra, honestly reported, no verdict
banked; fresh relaunch completed). **Codex: 1 REFUTED + 6 findings (3 MED / 3 LOW), NOT APPROVED.**
Disposed primary-model-final:

- **Item 1 (S-01 completeness) REFUTED by Codex itself** — both HTTP approval routes converge on the
  shared predicate; the remaining boolean-only UI guard is the non-persisted replay simulation. The
  flagship invariant HOLDS under cross-model attack.
- **Item 3 MED ACCEPT (fixed)** — `tryAdversarialSupplier` manufactured a non-empty reason on a
  silent ingest drop, defeating the fail-loud check. Now returns "" when no per-row reason exists →
  the red-team floor fails the case. (My own harness bug; Codex caught it.)
- **Item 4 MED ACCEPT (fixed, two layers)** — `agentRuns[].summary` renders on the glass and can
  embed model-controlled text (firewall rejection reasons quote the hostile value) yet was absent
  from the shared enumerator — BOTH scanners shared the blind spot. Fixed: (a) agent-run summaries
  added to `enumerateOutputProseSurfaces`; (b) dispatcher firewall reasons now sanitize+cap every
  quoted model value (`quoted()` → sanitizeText ×80) at all 6 interpolation sites.
- **Item 5 MED ACCEPT (fixed)** — the eviction clone+sort was an attacker-triggered O(n log n) per
  at-cap insert. Replaced with a single O(n) min-scan (`evictOldestWindow`), matching the cost
  profile of the pre-existing sweep; the enforce-before-insert invariant means at most one eviction
  per insert.
- **Item 2 LOW ACCEPT-NARROWED (fixed + residual recorded)** — runtime `SupplierSchema` re-parse at
  the ONE write door (`parseSupplierRows` in both store impls, fail-loud). DELIBERATE RESIDUAL
  (in-code comment): rows written by manual SQL outside the port are not re-validated on read —
  operator trust boundary.
- **Item 6 LOW ACCEPT-AS-DESIGNED (pinned)** — `($300)` appositive-vs-accounting-negative is
  genuinely ambiguous notation; the conservative read (flag unparseable, never validate a possibly
  sign-flipped figure) is the deliberate posture. Now PINNED by a dedicated test with the rationale
  in-code, so the ambiguity is disclosed, not silent.
- **Item 7 LOW ACCEPT (fixed)** — two stale-default sinks missed by the Batch-7 class-grep:
  `scripts/preflight-models.mjs` validated 2.5 while the app resolves 3.5 (false-green preflight —
  now resolves identically, lockstep comment added) and the live-eval runbook forced
  `GEMINI_MODEL=gemini-2.5-flash` (override dropped). Lesson recorded (P8 recurrence).

**Post-disposal evidence, first-hand 2026-07-22 (supersedes the pre-Codex captures, which were
deleted per the P2.5 evidence rule):** typecheck 0 · unit **902/956** exit 0 · `npm run verify`
exit 0 · e2e **59 passed** exit 0. EVIDENCE-2026-07-22-{unit,verify,e2e}.log.
