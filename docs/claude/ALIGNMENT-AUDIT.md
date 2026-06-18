# ALIGNMENT-AUDIT — the keep-vs-rebuild gap register (from-scratch, both lenses)

> **Owner:** sharan_98 · **Started:** 2026-06-17 (Stage 0→Plan) · **Governs:** the rework execution order. Companion to `PROCESS-CHARTER.md` (the how) and `PLAN.md` / `Success_Criteria.md` (the what).
>
> **Plain English.** A component-by-component ledger. For each part of the app it records: what's actually there today (checked, not assumed), the bar it must hit, where it falls short, a provisional *keep / rebuild* verdict, and the facts we must verify before we build. This is the "verify before build" rule applied to the whole app at once.
>
> **Method.** (1) **Verified state** — read from the live tree on 2026-06-17, never the prior session's self-report (the rework's premise: *nothing assumed correct*). (2) **Bar** = the component's own `Success_Criteria.md` rows + **Lens A** (claude-os doctrine) + **Lens B** (the named enterprise/industry canon, re-swept live per phase). (3) Verdicts are **provisional** — each is confirmed only by Stage-1 verification + the acceptance-gate at build time.

## Verdict legend
`SALVAGE` keep as-is (gated + at bar; light re-gate to confirm) · `RE-GATE` likely sound, must be re-verified vs the bar + live canon · `HARDEN` sound core, needs named additions to reach bar · `REBUILD` falls short of the ActionOps/enterprise design, rebuild · `BUILD-NEW` doesn't exist, build it · `DEFER` owner-blocked (`GEMINI_API_KEY`) or expansion-path.

## Scoreboard (at a glance — provisional)

| # | Component (phase) | Verified state | Provisional verdict | Owner-gated? |
|---|---|---|---|---|
| A | **Identity in code** (P1) | docs rebranded; **6 code files still "LaunchOps"**; agents named LaunchOps; ActionOps:LaunchOps file ratio 12:6 | **HARDEN** (rides P4–7 + P8 rebuilds; residual cleanup) | no |
| B | **Data layer** (P2) | 8 ActionOps tables + V1/V2 schema + store + fail-closed auth + CSV ingest + seed — all Codex-gated | **RE-GATE** (re-run verify + live-pg; spot-check vs canon) | no |
| C | **Signal layer** (P3) | `gdelt.ts` gated (P3.1); **P3.2 unbuilt**; `cached.ts` still LaunchOps fixtures; `verify:live` absent | **RE-GATE** (gdelt) + **BUILD-NEW** (P3.2 + verify:live) | no |
| D | **Agent / LLM core** (P4–7) | **still the LaunchOps pipeline**; emits V1; LaunchOps gatekeeper; no cost-ledger; preview model alias | **REBUILD** + **BUILD-NEW** (gatekeeper, cost-ledger, injection eval) | **YES — `GEMINI_API_KEY`** |
| E | **UI** (P8) | `action-packet-view` gated (calm command center, WCAG-claimed); `launchops-dashboard.tsx` still named; V1/V2 render coherence ? | **RE-GATE** (a11y + badge/staleness vs live canon) + **HARDEN** (rename, V1/V2) | no |
| F | **Evals** (P9) | **DETERMINISTIC HALF BUILT + gated 2026-06-17** (`e84b1fc`→`720ff25`): `lib/evals/*` 7 graders + hard golden-task BLOCK + injection eval + `evals/golden/` 7 records/22 corruptions. Judge calibration (G-5) + NLI (G-7) still post-key | **DONE (deterministic, G-6/G-8)** + **DEFER** (judge G-5, NLI G-7 → `GEMINI_API_KEY`) | partial |
| G | **Deploy / infra** (P10) | `verify`/`verify:full` present; **no `verify:live`, no `coverage`**; observability deferred; expansion section in PLAN | **BUILD-NEW** (verify:live, coverage) + **HARDEN** (CI, observability) | no |

**Execution order (front-load non-LLM, per the owner-block):** A-residual + B + C + E + F(deterministic) + G — all key-free — proceed now; **D + F(judge) begin when `GEMINI_API_KEY` lands.**

---

## A. Identity in code (Phase 1) — HARDEN

- **State (verified 2026-06-17).** README + `Success_Criteria.md` are ActionOps (Phase-1 gated). But shipped code still carries "LaunchOps" in `app/page.tsx`(2), `components/launchops-dashboard.tsx`(2 + filename), `lib/agents/run.ts`(2), `lib/pipeline/run-exception.ts`(3), `lib/schemas.ts`(5), `lib/server/store.ts`(1). The pipeline's agents are named the LaunchOps set.
- **Bar.** `Success_Criteria`/todo deployment criterion: "README states the ActionOps thesis with **zero LaunchOps identity remnants**." Enterprise bar: identity is consistent in code, not just docs.
- **Gap (✓ verified).** Identity drift in core code; `launchops-dashboard.tsx` filename; LaunchOps agent names.
- **Provisional verdict.** HARDEN. Most of this is subsumed by the D (agent-core REBUILD → `run.ts`, `run-exception.ts`) and E (UI REBUILD → dashboard) work; the residual (`schemas.ts`, `store.ts`, `page.tsx`) is a rename pass with a grep-gated "zero remnants" check.
- **Stage-1 verification.** Internal only — confirm no functional coupling to the LaunchOps identifiers before renaming (types/keys persisted in the DB or fixtures).

## B. Data layer (Phase 2) — RE-GATE

- **State (verified).** `db/schema.ts` (8 additive ActionOps tables incl. persisted `disruption_events` + the M:N join), `lib/schemas.ts` (V1/V2 `discriminatedUnion`), `lib/server/store.ts` (version-aware, node-postgres, atomic approval, in-process idempotency), `lib/server/security.ts` (fail-closed `APPROVAL_TOKEN`, P2.7), CSV ingest (P2.5), seed (P2.6). Every increment Codex-gated; live-pg verified on a throwaway Postgres 17.
- **Bar.** `Success_Criteria`: approval atomic, idempotent (single-instance), fail-closed auth, CSV guards (≤2MB/≤2000/formula-injection/ID-canonicalization), versioned contract. **Lens B:** transactional-integrity + schema-design canon; OWASP input-validation; CSV formula-injection (leading `= + - @`).
- **Gaps (? to confirm).** Cross-instance idempotency is **deferred** (single-instance MVP) — name it as expansion-path, confirm it's the right call at the bar. The V2 contract is **defined but never produced** (pipeline emits V1) — a D-phase concern, not a B defect. "Not assumed correct": re-run the gate, don't trust the prior PASS.
- **Provisional verdict.** RE-GATE → likely SALVAGE + minor HARDEN.
- **Stage-1 verification.** Re-run `npm run verify` + the live-pg suite (proof, not memory). Live canon: Postgres/Drizzle transactional patterns; current OWASP CSV-injection guidance (does the sanitize still cover it?); cross-instance idempotency (advisory-lock / reservation-row) for the expansion note. Sources: **Lens B data row** + `database-designer`.

## C. Signal layer (Phase 3) — RE-GATE (gdelt) + BUILD-NEW (P3.2)

- **State (verified).** `lib/signals/gdelt.ts` (390, P3.1 gated — ≥5s spacing, bounded cache, 429 backoff, never-throws-into-pipeline, shared `HttpUrlSchema` no-`javascript:` guard, worst-case-stale on bad dates). `fetchers.ts` (224), `cached.ts` (56 — **still the 3 LaunchOps fixtures** per HANDOFF). **P3.2 unbuilt:** NWS-keep / Open-Meteo-drop / replay-snapshot recorder / `verify:live`. `verify:live` script **absent** (✓).
- **Bar.** `Success_Criteria`: replay labeled + capture-date shown + degraded badged + healthy-never-mislabeled; `verify:live` wired into `verify:full`. **Lens B:** resilient fetch, the untrusted-text trust boundary (Law 11), caching.
- **Gaps (✓).** `verify:live` missing; P3.2 incomplete; `cached.ts` LaunchOps fixtures; Open-Meteo not yet removed.
- **Provisional verdict.** `gdelt.ts` RE-GATE (re-verify); P3.2 + `verify:live` BUILD-NEW; `cached.ts` REBUILD (dated ActionOps fixtures).
- **Stage-1 verification (verify-before-build, live).** **Re-probe GDELT DOC 2.0** live (the HANDOFF found a 429 "one request / 5s" throttle on 2026-06-17 — re-confirm + capture a dated artlist fixture + the article field shape). Confirm NWS API + User-Agent rule current. Sources: GDELT docs + live probe; **Lens B signal/data**.

## D. Agent / LLM core (Phases 4–7) — REBUILD + BUILD-NEW · **owner-gated on `GEMINI_API_KEY`**

- **State (verified) — the heart of the rework.** `lib/agents/run.ts` is **still the LaunchOps pipeline** (`runLaunchOpsAgents`: Signal Analyst → Impact Analyst → Resolution Planner → Execution Drafter → Decision Gatekeeper); it emits **V1 packets** (`run-exception.ts:94 packetVersion: 1` + `executionDraft`). `gatekeeper.ts` validates LaunchOps `operationsData`/options/`evidenceIds` — **not** the ActionOps `claims[]`/numeral-mapping gatekeeper. **Cost ledger (R4-10) unbuilt:** `tokenEstimate = estimateTokens(length/4)`, no `costUsd`/`finishReason`/pricing-table. Model alias **defaults to a preview** (`gemini-3-flash-preview`), contradicting PLAN's GA-default. The ActionOps agents (Sentinel/Verifier/Atlas/Simulator/Strategist/Dispatcher) exist only as **names in fixtures/types**, not a running pipeline.
- **Bar.** `Success_Criteria` (agent-level + hallucination/integrity): closed-vocab enums + `OTHER_UNMAPPED` firewall; supplier-name → validated-ID only; **only Sentinel sees raw text, Dispatcher never does**; Verifier deterministic (templated rationale, no LLM); Atlas/Simulator deterministic + hand-computed-fixture exact; Strategist grounded only in Atlas/Simulator numbers; Dispatcher `claims[]` + the **bidirectional numeral↔sourcePath gatekeeper** (wrong-context number fails); 3 LLM calls (+2 reserve); cost ledger persisted; prompt-injection neutralized (article + CSV). **Lens B:** Anthropic *Building Effective Agents* (workflow-not-agent for this) + structured outputs; Google/Gemini constrained-decoding + function-calling; OpenAI Agents SDK patterns; **OWASP LLM01/LLM05**; **Willison lethal-trifecta**; **Meta Rule-of-Two**; HuggingFace/Databricks agent-eval.
- **Gaps (✓).** The entire ActionOps agent core is unbuilt; gatekeeper is LaunchOps; cost ledger missing; model alias drift; the Dispatcher-never-raw-text injection quarantine unbuilt.
- **Provisional verdict.** REBUILD (the 6-agent pipeline + `run-exception` to emit V2) + BUILD-NEW (ActionOps gatekeeper, cost ledger, injection eval). **DEFER start to `GEMINI_API_KEY`** — but the deterministic agents (Verifier/Atlas/Simulator), the gatekeeper, the schemas, and the tests are **buildable pre-key** against fixtures (only Sentinel/Strategist/Dispatcher need live LLM).
- **Stage-1 verification (deep, live, the largest research thread).** Re-verify the **Gemini model lineup + free-tier RPM/RPD as of 2026-06-17** (ListModels + AI Studio) before committing the alias/batching — is `gemini-3-flash-preview` current, and what's the GA alias? Constrained-decoding force-fit vs parse-fail (settles the `OTHER_UNMAPPED` firewall). The current OWASP LLM Top-10 (2025) + Willison + Meta Rule-of-Two wording. Sources: **Lens B agentic + security rows**, `ai-engineering-specialist`, `security-specialist`.

## E. UI (Phase 8) — RE-GATE + HARDEN

- **State (verified).** `components/action-packet-view.tsx` (1051, P8 gated `c1c7ea5` — "calm command center", WCAG 2.2 AA claimed, ARIA tablist/tabpanel). `components/launchops-dashboard.tsx` (588, **still named LaunchOps**). The view renders the V2 ActionOps packet — but the pipeline emits V1 (render-path coherence to confirm).
- **Bar.** `Success_Criteria`: replay labeled + capture-date; degraded badge keyed to `FAILED_TO_FALLBACK` only; healthy runs never mislabeled. **Lens B:** **WCAG 2.2 AA + ARIA APG**; Next.js App-Router + React best-practice; anti-slop/human-craft; Refactoring-UI taste.
- **Gaps (✓ + ?).** `launchops-dashboard.tsx` naming (✓); V1/V2 render coherence (?); WCAG 2.2 AA re-verify (gated, but "not assumed correct"); the **staleness marker** (G1 — data layer done; UI surfacing was the P8 job — confirm it landed).
- **Provisional verdict.** RE-GATE (re-verify a11y + badge/staleness against the live WCAG 2.2 / APG canon) + HARDEN (rename; V1/V2 coherence). Likely SALVAGE-heavy.
- **Stage-1 verification.** WCAG 2.2 AA success criteria + ARIA APG tablist/tabpanel/live-region semantics (current); Next.js + React best-practice (current). Sources: **Lens B frontend row**, `frontend-specialist`, `design-review`, a11y tooling.

## F. Evals (Phase 9) — BUILD-NEW

- **State (verified).** 23 eval files exist (unit/integration/db — solid coverage of the *built* deterministic surfaces). But the **eval STAGE is unbuilt**: judge calibration (N=20–40 TPR/TNR, fail-closed), golden-task regression as a hard **BLOCK**, the prompt-injection eval (OWASP LLM01/05), the 6 end-to-end scenarios, the single flash-judge for no-unsupported-claims. No `tasks/golden/` for this project.
- **Bar.** `Success_Criteria` (hallucination/integrity graders + the 6 scenarios + demo-honesty); **Lens B:** error-analysis-first; LLM-as-judge calibration (judge ≥ system); golden-tasks-as-BLOCK; ADK eval taxonomy (checks/hallucination/efficiency/steps, fail-closed); the `eval-runner` organ-8.
- **Gaps (✓).** The eval harness, the 6 scenarios, the deterministic graders for ActionOps, the judge, the injection eval, golden tasks — all unbuilt for the ActionOps design.
- **Provisional verdict.** BUILD-NEW. **DETERMINISTIC HALF DONE + gated 2026-06-17** (component F, `e84b1fc`→`720ff25`; evidence `docs/claude/gates/evals/F-2026-06-17.md`): 7 graders + hard golden-task BLOCK + structural injection eval + 7 golden records/22 corruptions; the graders are the pre-key CONTRACT the agent core (D) must satisfy. **DEFERRED to D / post-key (tracked in `tasks/todo.md` so they are not silently dropped — lesson F-2):** the LLM judge (G-5), NLI faithfulness (G-7), the deliberate-misclassification Atlas-rejection assert, playbook-step numeral grading, product-existence vs a real master allowlist, and citation-grader calibration against D's first real drafts.
- **Stage-1 verification.** LLM-as-judge calibration canon (TPR/TNR, fail-closed, judge≥system); golden-task format; OWASP LLM01/05 injection-eval construction; organ-8 `eval-runner` integration. Sources: **Lens B evals row**, `evals_kb`, `evals-specialist`.

## G. Deploy / infra / ship (Phase 10) — BUILD-NEW + HARDEN

- **State (verified).** `verify` + `verify:full` (= verify + test:e2e) present; **no `verify:live`, no `coverage`** (H3). CI in `.github` (exists — verify it runs typecheck/lint/test/build). Observability deferred (fetchers/pipeline log via `note` fields only). Prettier (H4) deferred. The specific expansion/adoption section is drafted in PLAN §10.
- **Bar.** `Success_Criteria` reporting; PROJECT-CONSTRAINTS expansion-deliverable (named adopter + required integrations + compliance + rollout path); **Lens B:** CI/CD, 12-factor config, observability (structured logging, SLOs).
- **Gaps (✓).** `verify:live` + `coverage` scripts; observability (expansion); the recorded demo + final eval report (F-dependent).
- **Provisional verdict.** BUILD-NEW (`verify:live`, `coverage`) + HARDEN (CI, structured logging for the expansion path); ship deliverables DEFER to the end.
- **Stage-1 verification.** CI/CD + observability canon; the adopter's real required integrations (ERP class — NetSuite/Epicor/Dynamics; email; SSO; SOC 2 path). Sources: **Lens B deploy row** + PROJECT-CONSTRAINTS.

---

## Blindspot register (pre-build — each failure paired with its fix; failure-knowledge doctrine)

| Surface | Documented failure mode | The proven fix (designed-in) | Verified at |
|---|---|---|---|
| Agent core (D) | **Prompt injection** via GDELT article text (OWASP LLM01) | Only Sentinel sees raw text; Dispatcher never does; IDs-only across boundaries; injection eval | P7 + P9 |
| Agent core (D) | **Improper output handling** (LLM05) — model numbers leak into drafts | bidirectional `claims[]`↔`sourcePath` gatekeeper; wrong-context number FAILS | P7 |
| Agent core (D) | **Hallucinated entities/URLs** | closed-vocab + `OTHER_UNMAPPED`; validated-ID-only; evidence-allowlist | P4–7 |
| Agent core (D) | **Silent fallback mislabeled live** | mode taxonomy `FAILED_TO_FALLBACK`; live-eval asserts `LIVE_AI`; degraded badge | P4 + P8 + P9 |
| Data/CSV (B) | **Formula injection** (`= + - @`) + name-as-injection-channel | sanitize every cell pre-store/display; canonical `SUP-<sha256>` IDs; never raw names downstream | P2 (gated) |
| Evals (F) | **LLM-judge family bias / over-optimism** | judge ≥ system; cross-model Codex above the judge; deterministic graders carry the load; calibrate vs labels | P9 |
| Evals (F) | **Static-set blindness vs adaptive adversary** | injection eval uses adversarial cases crafted against THIS artifact, not only fixed fixtures | P9 |
| Signal (C) | **GDELT throttle / stale-served-as-live** | ≥5s spacing + backoff + max-serve-stale bound; CACHED vs LIVE status; capture-date in UI | P3 |
| Cost (D/G) | **$5 budget unenforceable** (length/4 estimate) | real cost ledger (API tokens × pinned price table) persisted per call | P4 + P10 |
| Memory/lessons | **Memory-poisoning** from untrusted content (ASI06) | lessons/Charter edits only from trusted context; untrusted finds are leads-to-verify | continuous |

*Post-build:* each surface re-runs its blindspot pass after rebuild (the gate's verify + Codex + the injection/hallucination evals).

## Stage-1 research scope (each thread answers the questions above → ends in a verdict)

Subordinate to the per-component questions; **every thread = research → verdict → action**, never a standalone digest. Domains (each: answer the component questions vs **live** Lens-B canon ≥3 sources/≥2 platforms, dated 2026-06-17 + an unknown-unknowns sweep):
1. **Agentic/LLM (D)** — Anthropic/Google/OpenAI/Microsoft/LangGraph/HF/Databricks agent canon + Gemini lineup re-verify.
2. **Security (D, cross-cutting)** — OWASP LLM Top-10 2025 (LLM01/05) + Agentic ASI + Willison trifecta + Meta Rule-of-Two, current.
3. **Data (B)** — Postgres/Drizzle transactional integrity + CSV-injection + cross-instance idempotency.
4. **Frontend (E)** — WCAG 2.2 AA + ARIA APG + Next.js/React best-practice, current.
5. **Evals (F)** — judge calibration + golden-tasks-as-BLOCK + injection-eval construction + organ-8.
6. **Deploy (G)** — CI/CD + observability + the adopter's required integrations (expansion path).
7. **Unknown-unknowns** — a cross-cutting sweep for off-radar failure modes / methods / sources none of the above framed.

## Owner gates (open)
- **`GEMINI_API_KEY`** in `.env` → unblocks D + the judge half of F. Everything else proceeds now.
- **Push HELD** (owner-ordered) — full-permissions does not rescind it.

## Stage-1 research results (2026-06-17 — Ultracode 6-agent fan-out; 3/6 returned + a code-verifying synthesis; agentic/security/deploy threads died on transient connection errors → their canon deferred to per-phase verify-before-build)

**Scope decision (owner 2026-06-17): web/desktop only, no mobile.** (WCAG 2.2 reflow-at-320px is a desktop-*zoom* criterion, still applies — verified PASS; no a11y lost.) The synthesis VERIFIED findings against the live code and overturned 4 false-alarm gaps.

**Verified NON-gaps — do NOT action:** reflow 1.4.10 PASS (the 512px `.brief-table` is sandboxed in `.table-scroll{overflow-x:auto}`); `useCountUp` already honors `prefers-reduced-motion`; UTC-pinned freshness timestamps are the correct deterministic-first-paint approach (KEEP); the tabs are APG-conformant (KEEP — if a test asserts manual activation, fix the test, not the component).

**Confirmed gaps (drive Wave 1):**
- **E (UI), key-free** — G-1 **Status-messages 4.1.3 FAIL** → a persistent, always-mounted `role="status" aria-live="polite"` sr-only region whose *text* changes (empty when live; the conditionally-mounted badge does not announce). G-2 **Focus-not-obscured 2.4.11 (NEW in 2.2) likely FAIL** → `scroll-margin-top`/`scroll-padding-top` ≥ 5.5rem for the sticky rail + header. G-3 Target-size 2.5.8 → measure evidence/source/audit links, pad if <24px and intersecting. G-4 Use-of-color/non-text-contrast → severity hues ≥3:1 + a numeric label beside each bar. **G-10 (highest product value): the human-approval gate is rubber-stampable under the 5-min clock (automation-bias) → design the approval UX against it — Atlas/Sim evidence + sources BEFORE the draft, logged approve/edit/reject with reason-on-reject, show sim sensitivity.**
- **F (evals)** — G-5 **flash-judge has ZERO calibration** → gold set ~50 (oversample the unsupported class), gate on **TNR (failure-class recall), not aggregate**, judge ≥ writer, **fail-closed** on judge error (*the ONLY truly key-gated eval*). G-6 injection eval is a single fixture + the grader is itself injectable → parameterized payloads per channel (article + CSV), **deterministic structural invariants as the PRIMARY grader** (no raw text to Dispatcher; URLs ∈ allowlist; entities ∈ known IDs; formula cells stripped), LLM grader secondary + never fed the raw payload. G-8 no golden-task CI hard-block → deterministic graders = hard merge-block (100% green, replay-mode $0), flash-judge advisory, freeze a golden record per scenario.
- **D (agent-core, mostly Wave 2)** — G-7 no citation-faithfulness → **NLI entailment (DeBERTa-class, a deliberate small non-Gemini LOCAL model dependency, free)** at Sentinel→Verifier; neutral/contradicted FAILS. G-9 MAST force-fit propagation → off-taxonomy/`OTHER_UNMAPPED` eval as a measured guard + one end-to-end coherence assert.
- **C/E** — G-11 per-feed freshness timestamp + a GDELT degradation path; finish P3.2.

**Canon corrections (apply to Charter Lens-B / C-H3 + project memory):**
- **MODEL → `gemini-3.5-flash`** (GA, best quality-per-cost, owner directive); `gemini-3.1-flash-lite` = budget floor; the stale `gemini-3-flash-preview` was forbidden by the GA-default rule. **DONE in `lib/agents/run.ts`.** OPEN: free-tier RPM/RPD not in the docs page → verify at D-start (ListModels + AI Studio).
- **OWASP Agentic Top-10 2026** CONFIRMED exists (genai.owasp.org, Dec 2025) — cite category NAMES + URL; exact ASI integers diverge across sources → verify vs the OWASP PDF at build. Keep OWASP LLM Top-10 2025 alongside (the agentic list builds on it).
- **Evals canon drift:** OpenAI Evals → read-only 2026-10-31, shutdown 11-30; HF `evaluate` superseded by `lighteval` + `judges`. Cite **Anthropic + Databricks + ADK + lighteval/judges**; drop the two sunsetting refs as living canon.
- **State AI law:** Colorado SB 24-205 REPEALED → SB 26-189 (eff 2027-01-01); RESILIX is OUT OF SCOPE (B2B; no consumer personal data). **Do NOT build human-review compliance machinery** (theater for an inapplicable law); keep a one-line watch item only.
- **a11y testing is THREE layers** (axe catches ~57% by volume): `@axe-core/playwright` (CI) + keyboard-only Playwright specs + a MANUAL screen-reader pass (only the human pass confirms the live-region actually announces).

**Execution order:** **Wave 1 (key-free, NOW):** A-residual rename + [Gemini alias ✓]; E a11y G-1…G-4 + G-10 approval-UX; C/E G-11 + P3.2; F deterministic harness (G-6, G-8) + NLI (G-7) + off-taxonomy/coherence (G-9); G `verify:live` + `coverage` + 3-layer a11y CI. **Wave 2 (key lands):** D 6-agent rebuild emitting V2 + `claims[]` gatekeeper + cost ledger; F judge calibration (G-5); ≤3 live showcase passes.

**Open (verify at phase, never asserted):** Gemini free-tier RPM/RPD; exact OWASP ASI01-10 integers.

---

_Verdicts are provisional until Stage-1 verification + the acceptance-gate confirm them. This file is updated as each component is verified, rebuilt, and gated._
