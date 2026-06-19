# Reliability Positioning — why the human stays in the loop

> **Status:** draft, 2026-06-19. **⚠ VERIFY-LIVE BEFORE MERGE.** The two external figures below come from a secondary digest, not a primary read. Project doctrine is live-verify, never from memory — confirm the exact figure + wording at the primary source before this doc backs any public or credibility-facing claim. The *architecture* claim stands on its own regardless; only the cited statistics need verification.

## The claim this product makes
RESILIX ActionOps does **not** rely on an LLM to be accurate where the evidence says LLMs are not. The contract is fixed: **deterministic code calculates → AI reasons and drafts → gatekeeper validates → human approves → audit trail records.** Every number, ID, option score, and approval decision is produced by code or a person — never asserted by a model. The AI reasons and drafts; it is never authoritative.

## Why that contract matters (the reliability frontier)
The current evidence on agent reliability points at the decision layer as exactly where AI fails:

- **Enterprise function-calling tops out well below a production bar.** Salesforce AI Research's **CRMArena-Pro** reports leading agents succeeding **&lt;65%** on realistic enterprise tasks. *(⚠ verify the exact figure + task framing at the CRMArena / CRMArena-Pro primary before citing.)*
- **"Persistent unreliability" and "jagged intelligence" are named the core open challenge** by the Bengio-led **International AI Safety Report 2026** (100+ experts, 30+ countries). *(⚠ verify the exact phrasing at the primary report.)*

RESILIX is designed *against* this frontier, not into it. Because no model output is authoritative, a model that is wrong a third of the time on a draft still cannot move money, email a supplier, or approve an action — the deterministic engine, the gatekeeper, and the human catch it first. The failure modes the literature documents do not reach output here; they are contained at the layer where the contract puts code and a person in charge.

## What this is NOT
Not a claim that the model is reliable — the opposite. The architecture *assumes* the model is unreliable and earns trust by keeping the unreliable component out of the authoritative path. That is the difference between a demo and a system a mid-market operator can sign off on.

## Sources (verify live before load-bearing use)
- Salesforce AI Research — CRMArena / CRMArena-Pro (enterprise agent benchmark).
- International AI Safety Report 2026 (Yoshua Bengio et al.) — `internationalaisafetyreport.org` · arXiv 2602.21012.
- claude-os AI-failure watch ledger: `knowledge/source-registry/evals-ai-failure.md`.
