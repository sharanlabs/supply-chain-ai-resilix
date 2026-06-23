# Reliability Positioning — why the human stays in the loop

> External figures below are primary-source verified as-of 2026-06-22 (CRMArena-Pro, arXiv 2505.18878; International AI Safety Report 2026, arXiv 2602.21012). The architecture claim stands on its own regardless of the statistics.

## The claim this product makes
RESILIX ActionOps does **not** rely on an LLM to be accurate where the evidence says LLMs are not. The contract is fixed: **deterministic code calculates → AI reasons and drafts → gatekeeper validates → human approves → audit trail records.** Every number, ID, option score, and approval decision is produced by code or a person — never asserted by a model. The AI reasons and drafts; it is never authoritative.

## Why that contract matters (the reliability frontier)
The current evidence on agent reliability points at the decision layer as exactly where AI fails:

- **Enterprise agents top out well below a production bar.** Salesforce AI Research's **CRMArena-Pro** reports leading LLM agents at **~58% single-turn success, falling to ~35% in multi-turn** realistic enterprise tasks (arXiv 2505.18878). The decision loop RESILIX automates is exactly multi-turn.
- **Persistent unreliability is named a core open problem** by the Bengio-led **International AI Safety Report 2026** (100+ experts, 30+ countries; arXiv 2602.21012) — capability is advancing faster than the reliability and control that production use depends on.

RESILIX is designed *against* this frontier, not into it. Because no model output is authoritative, a model that is wrong a third of the time on a draft still cannot move money, email a supplier, or approve an action — the deterministic engine, the gatekeeper, and the human catch it first. The failure modes the literature documents do not reach output here; they are contained at the layer where the contract puts code and a person in charge.

## What this is NOT
Not a claim that the model is reliable — the opposite. The architecture *assumes* the model is unreliable and earns trust by keeping the unreliable component out of the authoritative path. That is the difference between a demo and a system a mid-market operator can sign off on.

## Sources (primary-verified 2026-06-22)
- Salesforce AI Research — CRMArena-Pro (enterprise agent benchmark) · arXiv 2505.18878.
- International AI Safety Report 2026 (Yoshua Bengio et al.) — `internationalaisafetyreport.org` · arXiv 2602.21012.
- claude-os AI-failure watch ledger: `knowledge/source-registry/evals-ai-failure.md`.
