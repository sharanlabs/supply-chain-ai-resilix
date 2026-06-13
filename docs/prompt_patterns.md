> **Stale — predecessor content; scheduled for rewrite in Phase 4 Sentinel + Verifier.** This still describes the LaunchOps / RESILIX-v1 system. The ActionOps target is defined in PLAN.md (repo root). Do not treat as current until rewritten.

# RESILIX Prompt Patterns

**Version:** 1.0
**Last Updated:** 2026-03-29

This document describes the prompt engineering techniques used across all three RESILIX agents. Each pattern was chosen based on verified Gemini 3.1 Pro behavior from Google's official documentation and validated through testing.

---

## 1. Enterprise Prompt Structure

All three agents follow the same 10-section structure, established after Sentinel's iterative v1.0-v1.5 cycle proved that patching costs more than designing correctly from the start.

| Section | Purpose | Present In |
|---------|---------|-----------|
| Header | Version, model, thinking level, schema reference | All 3 |
| Identity | Role, pipeline context, downstream consumer | All 3 |
| Principles | Core rules governing behavior | All 3 |
| Input Specification | Expected data format with field tables | All 3 |
| Error Handling | What to do with empty/invalid input | All 3 |
| Classification/Calibration | Decision tables for outputs | All 3 |
| Reference Data | Static data the agent needs | Sentinel, Strategist |
| Example | One correctly formatted output showing key judgments | All 3 |
| Output Specification | JSON template matching schema | All 3 |
| Field Rules | Complete table with rules for every field | All 3 |
| Constraints | Hard rules placed at the end | All 3 |

This structure was designed once and applied to all three agents. No agent was built without it.

## 2. Pattern: Pipeline Context in Identity

Every agent's identity section names its downstream consumer and explains how its output will be used. This prevents the agent from treating its task in isolation.

- Sentinel: "Atlas, the downstream impact assessment agent, uses your affected_countries and affected_sectors fields to filter a supplier database of 500 facilities across 17 countries."
- Atlas: "Strategist, the downstream response agent, uses your affected_suppliers and route_disruptions to generate specific crisis recommendations."
- Strategist: "Your output is consumed by supply chain managers and executives who need to act immediately."

This pattern reduces field omission because the model understands why each field matters to someone downstream.

## 3. Pattern: Positive Framing Over Blanket Negatives

Gemini 3 models respond better to "do this" than "don't do that." Open-ended negative constraints cause over-indexing and degraded logic.

Instead of: "Do not hallucinate supplier data."
We use: "Every supplier_id in your output must appear in the provided data. If a supplier is not in the data, it does not exist for this analysis."

Instead of: "Do not fabricate numbers."
We use: "Every number you cite must appear in the Risk Exposure Report exactly as provided. If you need a number not in the report, state 'data not available.'"

Constraints (hard negatives) are placed at the end of each prompt, after the model has absorbed the positive instructions. This follows Google's documented recommendation for Gemini 3 prompt construction.

## 4. Pattern: Template-First, Data-Customized (Strategist)

The Strategist does not generate crisis recommendations from scratch. It receives a pre-built playbook template containing 6 actions per tier, 3 communication drafts, escalation criteria, and recovery estimates. The model customizes this framework using specific data from the Atlas report.

Why this works: the LLM has structure before it generates content. Instead of inventing what a crisis response should look like, it fills in a proven framework with real numbers. This is how enterprise tools like Resilinc and Everstream operate internally.

## 5. Pattern: Route Cascading via Reference Tables (Sentinel)

Sentinel's prompt includes a 25-row route reference table with a "Via" column showing chokepoint dependencies (e.g., "RTE-0008: Shanghai to Rotterdam | via Malacca + Suez"). When a chokepoint is disrupted, the model flags both the chokepoint and all dependent trade lanes.

This keeps route cascading grounded in the prompt's explicit reference data rather than relying on the model's geographic knowledge. It was validated when Sentinel correctly flagged RTE-0024 (Yanbu to Mumbai) for a Red Sea disruption because the Via column shows "Red Sea + Bab el-Mandeb."

## 6. Pattern: Confidence Calibration with Three Tiers

All three agents use a consistent three-tier confidence system:

| Level | Definition | Sentinel | Atlas | Strategist |
|-------|-----------|----------|-------|------------|
| HIGH | Strong evidence | 5+ distinct source domains | Data directly from verified database | Recommendation directly supported by specific report data |
| MEDIUM | Moderate evidence | 3-4 distinct domains | N/A (Atlas does not estimate) | Reasonable inference from data + industry practice |
| LOW | Weak evidence | 1-2 distinct domains | N/A | General best practice, not data-specific |

Calibration is enforced by requiring the model to state its basis for each confidence assignment. "HIGH because 9 distinct publisher domains corroborated the event" is verifiable. "HIGH because this seems important" would be caught during review.

## 7. Pattern: Valid-Schema Error Handling

When an agent encounters empty or irrelevant input, it must still return output that conforms to its JSON schema. The schema sets `additionalProperties: false`, which means a response like `{"no_threat_detected": true}` would fail validation.

Instead, error cases produce minimal valid output:
- Sentinel: severity 1, confidence LOW, event_summary "No supply chain disruption identified"
- Atlas: no_exposure_detected true, empty arrays, $0 revenue
- Strategist: severity 1, single monitoring action, $0 financial impact, limitations noting Tier 1 scope

This ensures the n8n pipeline never breaks on schema validation during error conditions.

## 8. Pattern: Multi-Event Separation (Sentinel)

GDELT queries can return articles about multiple unrelated events. Without explicit instructions, Gemini merges them into one combined alert covering multiple continents with inflated severity.

Sentinel Principle 5 handles this: "If articles describe multiple distinct events, classify only the single most severe supply-chain-relevant event. Exclude unrelated articles."

This was added after Test 2 showed the model merging a Chittagong port strike, Fujairah oil halt, Storm Leo, and a Houthi military conflict into a single severity-5 alert. After the fix, the model correctly selected the military conflict as most severe and excluded the other 7 articles.

## 9. Pattern: Tier Boundary Enforcement (Strategist)

Strategist Constraint 7 explicitly requires actions to be placed in the correct tier based on deadline: 0-48 hours for immediate, 1-4 weeks for short-term, 1-6 months for strategic.

This was added after Test 1 showed the model placing actions with multi-week deadlines in immediate_actions. The model was confusing "urgency of initiation" with "completion timeline." The constraint makes the placement rule explicit.

## 10. Model-Specific Configurations

| Setting | Value | Why |
|---------|-------|-----|
| Temperature | 1.0 | Google requires 1.0 for all Gemini 3 models. Lower values cause output looping. |
| Thinking Level | LOW/MEDIUM/HIGH per agent | Matched to task complexity. Classification needs less reasoning than strategic planning. |
| Max Output Tokens | 65,536 | Maximum allowed. Prevents truncation of complex outputs. |
| Structured Output | ON (via API) | response_json_schema enforces schema compliance at the model level. |
| Google Search Grounding | OFF for all agents | Each agent works from provided data only. External search would inject unverified information. |

## 11. Prompt Token Budgets

| Agent | Prompt Tokens | Input Data Tokens | Total Context | Cost Per Call |
|-------|--------------|-------------------|---------------|---------------|
| Sentinel | ~2,100 | ~500-1,500 (GDELT articles) | ~3,600 | $0.03-$0.05 |
| Atlas | ~1,400 | ~2,000-5,000 (filtered suppliers) | ~6,400 | $0.05-$0.10 |
| Strategist | ~2,150 | ~3,000-8,000 (Atlas report + template) | ~10,150 | $0.08-$0.15 |
| **Pipeline Total** | | | | **$0.15-$0.30** |
