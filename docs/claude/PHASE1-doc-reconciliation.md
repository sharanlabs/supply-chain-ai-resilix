# Phase 1 — repo-wide doc identity reconciliation

_Generated 2026-06-12 from the 26-doc identity-drift audit (ultracode workflow `phase1-identity-audit`, 26 parallel auditors). Source of truth = README.md + docs/Success_Criteria.md + PLAN.md._

This records every non-source-of-truth doc's identity status and disposition. Banners were applied 2026-06-12 to superseded/legacy/rewrite-later docs; the two active docs were fixed inline. Build phases consult the **Rewrite in** column to know which docs to regenerate when.

| Doc | Identity | Verdict | Disposition | Rewrite in | Status |
|-----|----------|---------|-------------|-----------|--------|
| `AGENTS.md` | LAUNCHOPS | CONTRADICTS | FIX_CONTRADICTIONS_NOW | — | fixed inline 2026-06-12 |
| `docs/resume_positioning.md` | LAUNCHOPS | CONTRADICTS | FIX_CONTRADICTIONS_NOW | — | fixed inline 2026-06-12 |
| `EVALUATION_REPORT.md` | RESILIX_V1 | SUPERSEDED | ADD_SUPERSEDED_BANNER | — | banner applied 2026-06-12 |
| `Resilix_readme.md` | LAUNCHOPS | SUPERSEDED | ADD_SUPERSEDED_BANNER | — | banner applied 2026-06-12 |
| `docs/enterprise_scaling.md` | RESILIX_V1 | SUPERSEDED | ADD_SUPERSEDED_BANNER | — | banner applied 2026-06-12 |
| `docs/launchops_architecture.md` | LAUNCHOPS | SUPERSEDED | ADD_SUPERSEDED_BANNER | — | banner applied 2026-06-12 |
| `docs/limitations_and_future_work.md` | RESILIX_V1 | SUPERSEDED | ADD_SUPERSEDED_BANNER | — | banner applied 2026-06-12 |
| `docs/stage_gates.md` | LAUNCHOPS | SUPERSEDED | ADD_SUPERSEDED_BANNER | — | banner applied 2026-06-12 |
| `docs/decision_log.md` | RESILIX_V1 | LEGACY_REFERENCE | ADD_LEGACY_BANNER | — | banner applied 2026-06-12 |
| `prompts/Atlas Agent Prompt.md` | RESILIX_V1 | LEGACY_REFERENCE | ADD_LEGACY_BANNER | — | banner applied 2026-06-12 |
| `workflows/README.md` | LAUNCHOPS | CONTRADICTS | ADD_LEGACY_BANNER | — | banner applied 2026-06-12 |
| `data/RESILIX_data_README.md` | MIXED | CONTRADICTS | REWRITE_IN_BUILD_PHASE | Phase 2 Data model | banner applied 2026-06-12 |
| `db/README.md` | MIXED | CONTRADICTS | REWRITE_IN_BUILD_PHASE | Phase 2 (data model + driver swap Neon->node-postgres, atomic mutation… | banner applied 2026-06-12 |
| `docs/Atlas_Build_Documentation.md` | RESILIX_V1 | CONTRADICTS | REWRITE_IN_BUILD_PHASE | Phase 5 Atlas exposure engine | banner applied 2026-06-12 |
| `docs/Sentinel_Build_Documentation.md` | RESILIX_V1 | CONTRADICTS | REWRITE_IN_BUILD_PHASE | Phase 4 (Sentinel + Verifier) | banner applied 2026-06-12 |
| `docs/Strategist_Build_Documentation.md` | RESILIX_V1 | CONTRADICTS | REWRITE_IN_BUILD_PHASE | Phase 7 Strategist + Dispatcher | banner applied 2026-06-12 |
| `docs/architecture.md` | RESILIX_V1 | CONTRADICTS | REWRITE_IN_BUILD_PHASE | Phase 7 (Strategist + Dispatcher) — the point at which all six agents … | banner applied 2026-06-12 |
| `docs/data_dictionary.md` | RESILIX_V1 | CONTRADICTS | REWRITE_IN_BUILD_PHASE | Phase 2 | banner applied 2026-06-12 |
| `docs/demo_script.md` | LAUNCHOPS | CONTRADICTS | REWRITE_IN_BUILD_PHASE | Phase 8 UI rework — 4 tabs (Live Events / Exposure / Simulation / Acti… | banner applied 2026-06-12 |
| `docs/enterprise_readiness.md` | LAUNCHOPS | CONTRADICTS | REWRITE_IN_BUILD_PHASE | Phase 10 — Expansion & adoption | banner applied 2026-06-12 |
| `docs/hallucination_mitigation.md` | RESILIX_V1 | CONTRADICTS | REWRITE_IN_BUILD_PHASE | Phase 7 (Strategist + Dispatcher, gatekept) — owns the gatekeeper, cla… | banner applied 2026-06-12 |
| `docs/prompt_patterns.md` | RESILIX_V1 | CONTRADICTS | REWRITE_IN_BUILD_PHASE | Phase 4 Sentinel + Verifier | banner applied 2026-06-12 |
| `prompts/Sentinel Agent Prompt.md` | MIXED | CONTRADICTS | REWRITE_IN_BUILD_PHASE | Phase 4 Sentinel + Verifier | banner applied 2026-06-12 |
| `prompts/Strategist Agent Prompt.md` | RESILIX_V1 | CONTRADICTS | REWRITE_IN_BUILD_PHASE | Phase 7 Strategist | banner applied 2026-06-12 |
| `shared_reasoning.md` | MIXED | LEGACY_REFERENCE | LEAVE | — | left as-is (consistent / historical scratch) |
| `tasks/lessons.md` | NEUTRAL | CONSISTENT | LEAVE | — | left as-is (consistent / historical scratch) |

## Counts

- Total audited: 26
- Banners applied this pass: 22 (skipped, already bannered: 0)
- Fixed inline: AGENTS.md, docs/resume_positioning.md
- Left as-is: shared_reasoning.md (council scratch), tasks/lessons.md (consistent)

## Rewrite-in-build-phase queue

These carry a 'stale until Phase N' banner now and get full rewrites when their phase runs:
- `data/RESILIX_data_README.md` → Phase 2 Data model
- `db/README.md` → Phase 2 (data model + driver swap Neon->node-postgres, atomic mutations, idempotency)
- `docs/Atlas_Build_Documentation.md` → Phase 5 Atlas exposure engine
- `docs/Sentinel_Build_Documentation.md` → Phase 4 (Sentinel + Verifier)
- `docs/Strategist_Build_Documentation.md` → Phase 7 Strategist + Dispatcher
- `docs/architecture.md` → Phase 7 (Strategist + Dispatcher)
- `docs/data_dictionary.md` → Phase 2
- `docs/demo_script.md` → Phase 8 UI rework
- `docs/enterprise_readiness.md` → Phase 10
- `docs/hallucination_mitigation.md` → Phase 7 (Strategist + Dispatcher, gatekept)
- `docs/prompt_patterns.md` → Phase 4 Sentinel + Verifier
- `prompts/Sentinel Agent Prompt.md` → Phase 4 Sentinel + Verifier
- `prompts/Strategist Agent Prompt.md` → Phase 7 Strategist
