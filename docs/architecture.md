# RESILIX ActionOps — Architecture

**Last updated:** 2026-06-22 (rewritten from the superseded RESILIX-v1 / LaunchOps doc; the v1 n8n / Google-Sheets / 3-agent design no longer exists). Authoritative scope: [PLAN.md](../PLAN.md); success criteria: [Success_Criteria.md](Success_Criteria.md).

## System overview

RESILIX ActionOps is an **in-app Next.js pipeline** (App Router + TypeScript), not an external orchestrator. One disruption signal plus a supplier dataset becomes one **DecisionPacketV2** — an evidence-cited, human-approval-gated action packet. The pipeline is a **sequential six-agent chain with a deterministic gatekeeper and a human approval gate**, entered at `/api/run-exception → buildDecisionPacket → runActionOpsAgents` (`lib/agents/actionops/index.ts`) and rendered by the `/` server component.

The defining property is a **hard split: deterministic TypeScript calculates and validates; LLMs only classify and draft.** The deterministic spine is the default and ships standalone — with the live-AI flag off (`ENABLE_LIVE_AI`), every agent routes to a deterministic body and the packet is produced with zero model calls. Live AI is the gated upgrade.

```
  signal (GDELT DOC 2.0 / NWS live, or a dated REPLAY fixture)
        │
        ▼
  ┌── Sentinel ────┐  LLM #1 — classify raw text into a closed vocab (+ OTHER_UNMAPPED).
  │                │  The ONLY agent that sees raw article text. Names → validated IDs;
  │                │  evidence URLs ∈ fetched set.                      → threatCard
  ├── Verifier ────┤  deterministic — source count / recency / corroboration; templated
  │                │  rationale, no LLM.
  ├── Atlas ───────┤  deterministic TS — exposure matching on validated IDs only; score =
  │                │  RISK_TIER_BASE[tier] + leadComponent(days). Sentinel-handoff firewall
  │                │  (misclassified / claimed-but-unmapped → fail closed). → exposureResults
  ├── Simulator ───┤  deterministic TS — runway + revenue-at-risk arithmetic; Tier-1-only
  │                │  input → no simulation + a dataGaps note.          → simulation?
  ├── Strategist ──┤  LLM #2 — role playbooks grounded ONLY in Atlas/Simulator numbers;
  │                │  playbook steps are numeral-free.                  → playbooks
  ├── Dispatcher ──┤  LLM #3 — drafts top-5 supplier emails from a STRUCTURED whitelist only,
  │                │  never raw text; every numeral carries a claims[] entry. → supplierMessages
  └── Gatekeeper ──┘  deterministic — every numeral ↔ a claims[].sourcePath (both directions),
                      every URL ∈ fetched evidence, every entity a known ID. Fails closed on
                      any agent FAIL.
        │
        ▼
  Human approval — drafts stay drafts until a person approves (atomic, audited).
```

Source of truth for the chain: `lib/agents/actionops/` (`sentinel.ts`, `atlas.ts`, `simulation-math.ts`, `strategist.ts`, `dispatcher.ts`, `gatekeeper.ts`, `index.ts`) and `lib/pipeline/` (`build-packet.ts`, `run-exception.ts`, `citation-check.ts`, `recommendation.ts`, `replay-packet.ts`).

## Agents — deterministic vs LLM

| Agent | Kind | Produces | Notes |
|-------|------|----------|-------|
| Sentinel | **LLM** | `threatCard` | Closed-vocab classification with an `OTHER_UNMAPPED` escape hatch (`resolveEventType`); the only agent given raw signal text; output passes `applyThreatFirewall`. |
| Verifier | deterministic | corroboration / recency | Templated rationale from its own checks; a distinct `AgentRun`. |
| Atlas | deterministic TS | `exposureResults` | Integer scoring; chokepoint scope-firewall fails closed on out-of-scope or misclassified matches. |
| Simulator | deterministic TS | `simulation?` | Exact arithmetic (`recomputeSimulation`); present only when inventory columns (data tier 2 — completeness, not supplier tier) exist. Projects revenue-at-risk over fixed horizons — a time-to-survive question in the TTS/TTR vulnerability framing; formal node-level TTS/TTR modelling is out of scope. |
| Strategist | **LLM** | `playbooks` | Numeral-free steps; every figure comes from Atlas/Simulator. |
| Dispatcher | **LLM** | `supplierMessages` + `claims[]` + `actionItems` | Structured-whitelist prompt; `applyDispatcherFirewall` rejects any link of any form. |
| Gatekeeper | deterministic | pass/fail | Bidirectional citation contract via the shared `collectCitationFailures`. |

**AI-value asymmetry (stated honestly).** The three LLM calls are not equal in value. **Sentinel is the genuine AI capability** — free-text → closed vocabulary under an injection firewall, a job rules do poorly. **Strategist and Dispatcher are LLM prose over deterministic templates that already ship** (`deterministicPlaybooks` / `deterministicDrafts`): they buy tone and variation, not capability. In the default (key-off) demo the AI is **latent** — Sentinel reads a replay fixture and the deterministic bodies produce the packet; the live AI is realized only on the gated, authenticated path.

## The trust spine (why this shape, not ceremony)

Each invariant answers a documented 2026 failure mode, and each is enforced in code:

- **Prompt-injection laundering is cut by construction.** Only Sentinel reads raw text (the single `JSON.stringify(signals…)` in `sentinel.ts`); the Dispatcher prompt whitelist (`dispatcher.ts`) excludes `threatCard.summary` / location free-text, so a surviving injection cannot reach an outbound email. (OWASP LLM01/05; Willison lethal-trifecta; Meta Rule-of-Two.)
- **No model-invented number reaches the UI.** All math is deterministic TS. The bidirectional citation contract (`lib/pipeline/citation-check.ts`) is called by *both* the produce-time gatekeeper and the grade-time grader — one definition, no maker/judge divergence.
- **Degradation is disclosed, never faked.** A four-value mode taxonomy (`LIVE_AI` / `DETERMINISTIC_RULES` / `REPLAY` / `FAILED_TO_FALLBACK`, via `computeEffectiveMode`) keys a visible "degraded" badge; a live call that silently fell back fails the eval.
- **Calibrated refusal.** `decideRecommendation` (`lib/pipeline/recommendation.ts`) emits a `NO_ACTION` packet (playbooks + drafts withheld, `missingEvidence[]` listed) when a real exposure is reported by a single uncorroborated, low-confidence source.
- **Fail-closed cost cap.** `assertWithinBudget` (`lib/agents/budget.ts`) throws `BudgetExceededError` *before* a breaching call can bill; fails closed on non-finite inputs. A shared run-level retry reserve bounds a run at ≤5 calls.

## Data contract — DecisionPacketV2

The canonical output is a versioned discriminated union (`packetVersion`; `lib/schemas.ts`). V2 fields: `threatCard`, `exposureResults`, `simulation?`, `playbooks`, `supplierMessages` (each numeral carrying a `claims[]` entry `{value, unit, sourcePath}`), `actionItems`, `dataTier` + `dataGaps`. Supplier/product names cross agent boundaries **only as validated internal IDs**; URLs only from the fetched-evidence allowlist.

## Data layer

Drizzle ORM over **PostgreSQL (node-postgres)** with an in-memory fallback for a zero-setup demo (`lib/server/store.ts`). Approval is **atomic** — one transaction: `SELECT … FOR UPDATE` + conditional `UPDATE … WHERE approval_status='PENDING' RETURNING` + a unique `processed_approval_events(event_id)` insert + audit, rolling back to `EVENT_CONFLICT`. Runs are **idempotent within a single instance** (an in-process keyed mutex in `lib/pipeline/run-exception.ts` + a DB unique key); cross-instance reservation is post-MVP. CSV ingestion enforces byte/row caps, formula-injection sanitization, and canonical `SUP-<sha256>` IDs before any agent sees a name.

## Signal layer

GDELT DOC 2.0 is the **primary** live signal; NWS is live; USGS/EONET are fixture-only. Replay-first and resilient: a fetch outage surfaces a schema-valid `CACHED`/`FAILED` marker, never a faked live read (`lib/signals/`, shared `sanitize.ts` trust boundary; `fetchGdeltSignals`). The landing page serves one captured live packet relabelled `REPLAY` (`lib/pipeline/replay-packet.ts`, fail-loud on schema or non-live-capture drift).

## Evaluation harness

The executable contract: deterministic graders (`lib/evals/`, `evals/`) — citation faithfulness, entity/URL existence, off-taxonomy, injection quarantine — plus a **golden-task regression BLOCK** (`evals/golden-tasks.test.ts`, 7 frozen records + 26 corrupted twins inside `npm run verify`), plus **one LLM-as-judge** (`lib/evals/judge.ts`) for the single semantic check code cannot do (unsupported-claim prose). The judge is a **configurable cross-family, fail-closed, off-by-default secondary check** — the calibrated/recommended config is a non-Gemini Meta model (`llama-4-scout` via Groq's free tier; `JUDGE_PROVIDER=groq`), with a same-family Gemini fallback when no Groq key is set — never a hard gate; see [adr/0002-same-family-llm-judge.md](adr/0002-same-family-llm-judge.md).

## Model & cost policy

Live agents call Gemini, default `gemini-2.5-flash` (GA), pinned via a single `GEMINI_MODEL` config point with a **ListModels preflight** that fails loud if the configured model is unavailable (a retirement is a one-line bump, never a silent fallback). The cost ledger persists real tokens × a pinned price table; build spend ≤ $5 (metered ≈ $1.0–1.3).

## Web security

Per-request **nonce-based CSP** (`proxy.ts`, `strict-dynamic`, no `script-src 'unsafe-inline'`), static headers (HSTS, nosniff, frame-deny, COOP/CORP `same-origin`) in `lib/server/security-headers.ts`, **fail-closed auth** on the mutation routes (`lib/server/security.ts`, length-oblivious constant-time compare), and a fixed-window rate limiter (`lib/server/rate-limit.ts`).

## Legacy

The RESILIX-v1 / LaunchOps engine is retained only to build the V1 back-compat oracle fixture (`evals/fixtures/decision-packet-v1.ts`): `runLaunchOpsAgents` (`lib/agents/run.ts`, off the billing path) over `lib/legacy/impact.ts` (relocated from `lib/engine/` 2026-06-22, banner-marked). It makes no live AI calls and is not part of the product path.
