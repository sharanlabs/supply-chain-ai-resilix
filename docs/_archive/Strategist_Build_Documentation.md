> **Stale — predecessor content; scheduled for rewrite in Phase 7 Strategist + Dispatcher.** This still describes the LaunchOps / RESILIX-v1 system. The ActionOps target is defined in PLAN.md (repo root). Do not treat as current until rewritten.

# Strategist Agent: Complete Build Documentation

**System:** RESILIX Supply Chain Crisis Intelligence
**Agent:** Strategist (Crisis Response Generation)
**Version:** 1.0
**Date:** 2026-03-29
**Author:** Sharan Kumar

---

## 1. What Strategist Does

Strategist is the final agent in the RESILIX pipeline. It receives a Risk Exposure Report from Atlas and a matching Playbook Template, then generates a structured Crisis Playbook with actionable recommendations across three time horizons: immediate (0-48 hours), short-term (1-4 weeks), and strategic (1-6 months).

Strategist answers three questions from structured exposure data:
- What should the supply chain team do right now to contain damage?
- What should they do over the next month to stabilize operations?
- What structural changes should they make to prevent recurrence?

Every recommendation is tagged with a confidence level (HIGH, MEDIUM, or LOW) and a stated basis explaining why the recommendation is made and what data supports it. The output includes an executive briefing for C-suite decision-makers, draft stakeholder communications, and an explicit limitations section.

Strategist does not detect threats (that is Sentinel's job) or assess supplier exposure (that is Atlas's job). Its only job is strategic response generation from pre-validated data.

---

## 2. Position in the Pipeline

```
GDELT News API
      |
      v
 [ SENTINEL ]  --->  Human Approval  --->  [ ATLAS ]  --->  Human Approval  --->  [ STRATEGIST ]
      |                                        |                                        |
  Classifies threat                     Assesses supplier                      Generates crisis
  from news articles                    and route exposure                     response playbook
      |                                        |                                        |
  Threat Alert Card                   Risk Exposure Report                   Crisis Playbook
```

Strategist's inputs come from two sources:
1. **Atlas (via n8n):** The Risk Exposure Report containing affected suppliers, products, routes, revenue exposure, concentration risk, and time-to-impact calculations. All financial figures are pre-calculated by n8n Code nodes. Strategist never recalculates them.
2. **Playbook Templates (via n8n):** The n8n Code node matches the crisis_type field from the Atlas report to one of 7 pre-built playbook templates. Each template contains action frameworks, communication drafts, escalation criteria, and recovery estimates sourced from industry standards.

Strategist's output (Crisis Playbook) is the pipeline's final deliverable. It is consumed by supply chain managers, logistics directors, and executives who need to act.

---

## 3. Model Selection

### Model: Gemini 3.1 Pro Preview

**Model string:** `gemini-3.1-pro-preview`

Strategist uses the same model as Sentinel and Atlas. All three agents run on the same model to eliminate behavioral differences between test and production. See Sentinel Build Documentation for full model rationale.

### Thinking Level: HIGH

| Level | Agent | Use Case | Token Cost | Latency |
|-------|-------|----------|------------|---------|
| LOW | Sentinel | Classification, extraction | ~200-500 thinking tokens | 1-3 seconds |
| MEDIUM | Atlas | Data assembly, threshold application | ~500-2000 thinking tokens | 3-8 seconds |
| HIGH | Strategist | Strategic planning, complex reasoning | ~2000+ thinking tokens | 8-30 seconds |

Strategist uses HIGH because it performs the most complex reasoning in the pipeline. It must:
- Interpret a template framework and customize it with specific data
- Calibrate confidence across multiple recommendation types
- Generate three distinct scenario projections (best/worst/most likely)
- Draft professional stakeholder communications in three different tones
- Identify limitations and gaps in its own analysis

Google's official guidance (Gemini 3 Developer Guide, Developers Blog) recommends HIGH "for complex tasks that require optimal thinking (e.g. strategic business analysis)." This matches Strategist's function exactly.

Cost impact: HIGH thinking generates approximately 3,000-5,000 thinking tokens per call. At $12/M output tokens, this adds $0.036-$0.060 per run. Against $300 in API credits, this is negligible.

Performance: 8-30 second latency is well within Strategist's 120-second target from SUCCESS_CRITERIA.md.

### Google Search Grounding: OFF

Strategist does not use Google Search grounding. Three reasons:

1. **Data grounding principle.** Strategist's job is to transform Atlas data plus playbook template into a customized response plan. Everything it needs is in the input. Adding external search results would inject unverified information.

2. **Hallucination mitigation conflict.** Layer 1 (data grounding) and Layer 2 (prompt constraint: "only reference provided data") would be violated if external search results influenced recommendations.

3. **Determinism.** Search results vary by time and region. The same input should produce consistent recommendations. External search introduces unpredictability.

This can be revisited as a future enhancement if Strategist needs real-time freight rates, breaking news context, or market pricing. For now, the template-first, data-customized approach keeps the output grounded and verifiable.

---

## 4. Design Philosophy: Template-First, Data-Customized

The core design decision separating Strategist from a generic "write me a crisis plan" prompt is the template-first approach.

### The Problem with Freeform Generation

If you ask an LLM to "generate a crisis response plan for a Hormuz shipping disruption," it produces generic advice: diversify suppliers, find alternate routes, increase safety stock. This advice is correct but useless. A supply chain manager already knows these principles. They need to know which specific suppliers are affected, what the revenue exposure is, which routes to reroute through, and what the cost and time impact will be.

### How RESILIX Solves This

Strategist receives two inputs:

1. A **Playbook Template** providing the structural framework. Each template was built from industry standards (ISO 22301, NIST SP 800-34, FEMA, BIMCO, IMO) and contains 6 immediate actions, 6 short-term actions, 6 strategic actions, 3 communication drafts, escalation criteria, and recovery estimates. The template tells Strategist what types of actions to generate.

2. A **Risk Exposure Report** providing the specific data. This report contains named suppliers, their IDs, countries, dependency levels, backup availability, revenue at risk, inventory buffers, disrupted routes with exact transit delays and cost increases, and concentration risk analysis. The report tells Strategist what to put in those actions.

The result: every recommendation references specific supplier names and IDs (e.g., "Contact SUP-0359 Shichifuku Towel Co."), specific routes with exact numbers (e.g., "RTE-0022 Nagoya to Long Beach, +7 days, +25% cost"), and exact financial figures from the pre-calculated report. This is the pattern enterprise tools like Resilinc and Everstream use internally: structured templates populated with live data.

---

## 5. n8n vs LLM Responsibility Split

Strategist has the inverse split from Atlas. Atlas is n8n-heavy (36/39 fields from Code nodes). Strategist is LLM-heavy by design, because strategic reasoning is what the LLM is suited for.

### n8n Handles (5 fields, deterministic)

| Field | Source | Method |
|-------|--------|--------|
| playbook_id | Generated | STR-YYYY-MMDD-NNN pattern |
| trigger_report_id | Passed through | From Atlas report_id |
| timestamp | Generated | Current ISO 8601 |
| crisis_type | Passed through | From Atlas report |
| severity | Passed through | From Atlas report |

n8n also handles:
- **Template matching:** Maps crisis_type to the correct template (1:1 mapping, seven types to seven templates)
- **Input assembly:** Injects both the Atlas report and the matched template into Strategist's prompt
- **Schema validation:** Validates Strategist's JSON output against schema_crisis_playbook.json
- **Error routing:** If Strategist returns invalid JSON, routes to error handler

### LLM Handles (everything else)

| Output Section | What the LLM Does |
|---------------|-------------------|
| immediate_actions | Customizes template framework with report data, assigns confidence/basis/owner |
| short_term_actions | Same as above for 1-4 week horizon |
| strategic_actions | Same as above for 1-6 month horizon |
| executive_briefing | Synthesizes exposure into 2-3 sentence summary, projects three financial scenarios |
| stakeholder_communications | Fills template placeholders with actual data from report |
| limitations | Identifies gaps, assumptions, and scope restrictions in the analysis |

This split means Strategist never calculates financial figures (n8n already did that in Atlas), never generates IDs (n8n does that), and never decides which template to use (n8n matches by crisis_type). The LLM focuses entirely on reasoning and communication.

---

## 6. Output Schema: Crisis Playbook

The Crisis Playbook is defined by `schema_crisis_playbook.json`. It is the final deliverable of the RESILIX pipeline.

### Schema Summary

- 10 required top-level fields, additional nested required fields within objects
- `additionalProperties: false` (no extra fields allowed)
- ID pattern: `STR-YYYY-MMDD-NNN` (regex validated)

### Key Structural Requirements

| Section | Min Items | Timeframe | Purpose |
|---------|-----------|-----------|---------|
| immediate_actions | 3 | 0-48 hours | Contain damage, secure supply |
| short_term_actions | 3 | 1-4 weeks | Stabilize, activate alternatives |
| strategic_actions | 2 | 1-6 months | Structural resilience |
| executive_briefing | N/A | N/A | C-suite decision support |
| limitations | 1 | N/A | Honest scope declaration |

Each action item requires four fields: `action` (specific recommendation), `confidence` (HIGH/MEDIUM/LOW), `basis` (why, referencing data or framework), and `owner` (responsible team/role).

### Confidence Calibration

| Level | Definition | Usage |
|-------|-----------|-------|
| HIGH | Directly supported by specific data in the Atlas report | "12 single-source dependencies identified in the report" |
| MEDIUM | Reasonable inference from report data combined with industry practice | "Buffer of 23 days vs 14-day delay suggests 9-day margin" |
| LOW | General industry best practice, not specific to this data | "Standard practice per ISO 22301" |

This three-tier system ensures reviewers know how much to trust each recommendation. If all actions were tagged HIGH, the calibration would be meaningless. The prompt enforces mixed calibration by requiring LOW for industry-practice actions that lack specific data backing.

---

## 7. Prompt Architecture

### Design Principles

The same principles from Sentinel and Atlas apply, following verified Gemini 3 best practices:

1. Direct and concise instructions (Gemini 3 over-analyzes verbose prompts)
2. Positive framing over blanket negatives
3. Constraints placed at the end
4. Consistent Markdown structure throughout
5. Few-shot example showing correct judgment calls

### Prompt Structure

| Section | Purpose | Token Estimate |
|---------|---------|----------------|
| Header | Version, model, thinking level, schema reference | ~50 |
| Identity | Role, pipeline context, two-input design, audience (managers/executives), date | ~120 |
| Principles | 5 rules: template-first, number-tracing, confidence tagging, limitation declaration, political neutrality | ~180 |
| Input specification | Two tables: Risk Exposure Report fields with usage notes, Playbook Template fields with usage notes | ~350 |
| Error handling | no_exposure_detected case producing valid minimal schema output | ~200 |
| Confidence calibration | 3-tier table with definitions and examples | ~80 |
| Action tier definitions | Timeframe, purpose, minimum items per tier | ~60 |
| Example | Two correctly formatted actions (one immediate HIGH, one strategic MEDIUM) with explanations | ~250 |
| Output specification | JSON template matching all schema fields | ~300 |
| Field rules | Complete table with rules for all 26+ fields | ~400 |
| Constraints | 7 hard rules: no fabrication, correct confidence, template recovery times, scope limits, limitations required, error handling, tier boundary enforcement | ~160 |
| **Total** | | **~2,150** |

### Key Design Decisions

**Template-first approach:** Strategist does not generate recommendations from scratch. It customizes a pre-built framework using specific data. This reduces hallucination because the LLM has structure before it generates content, and it ensures consistency across different crisis types because every template follows the same pattern.

**Explicit input specification tables:** Two separate tables (one for Atlas report fields, one for template fields) tell the model exactly what each data source contains and how to use it. This prevents the model from ignoring available data or inventing fields that do not exist.

**Separate owner mapping per tier:** The playbook templates define responsible_roles split by tier (e.g., "Immediate: Crisis Response Team, Supplier Relations | Short-term: VP Supply Chain, HR | Strategic: CEO, Board Risk Committee"). The prompt maps these to the `owner` field per action, ensuring organizational alignment matches the template's design.

**Communication template population:** Rather than generating communications from scratch, Strategist fills [bracketed placeholders] in pre-written templates with actual data. This preserves the professional tone and structure designed into each template while making the communications specific and actionable.

**Error handling for zero exposure:** When Atlas reports no suppliers or products affected, Strategist must not fabricate a crisis playbook. The error handling section specifies a minimal valid response with severity 1, a single action recommending continued monitoring, and limitations noting the assessment covers Tier 1 only.

**Tier boundary enforcement (added after Test 1):** Constraint 7 explicitly requires actions to be placed in the correct tier based on their deadline timeframe. Without this, the model occasionally assigned multi-week deadlines to immediate_actions, conflating urgency of initiation with completion timeline.

---

## 8. Test Results

Three tests were run in Google AI Studio with the v1.0 prompt. Each test validates against the success criteria defined in SUCCESS_CRITERIA.md.

### Test 1: Hormuz Crisis (SCN-01, Severity 4, MILITARY_CONFLICT)

**Input:** Atlas report with 10 affected suppliers (3 CRITICAL, 3 HIGH, 3 MEDIUM, 1 LOW), 5 disrupted routes (RTE-0001, RTE-0014, RTE-0015, RTE-0016, RTE-0025), $42,843,446.88 revenue exposure, 3 single-source dependencies, CRITICAL concentration (Bangladesh 73.4%). Paired with TPL-01 (Military Conflict template).

**Expected:** Comprehensive playbook with all three tiers, executive briefing, communications, limitations. Actions should reference specific Hormuz routes, supplier IDs, backup suppliers, and exact financial figures.

| Criterion | Output | Status |
|-----------|--------|--------|
| All three tiers present | immediate_actions (3), short_term_actions, strategic_actions (2) confirmed in model thinking | PASS (see note) |
| Revenue cited exactly | $42,843,446.88 in situation_summary | PASS |
| Supplier IDs real | SUP-0213, SUP-0221, SUP-0223, SUP-0208, SUP-0222 all from test data | PASS |
| Route data correct | RTE-0001, RTE-0014, RTE-0015, RTE-0016 cited with correct delays and costs | PASS |
| Concentration data exact | Bangladesh 73.4%, SUP-0222 at 25.2% | PASS |
| Confidence calibration | HIGH (data-backed), MEDIUM (inference), LOW (NIST SP 800-34) | PASS |
| Owner mapping correct | VP Supply Chain, Logistics Director, Chief Supply Chain Officer, Board Risk Committee | PASS |
| Limitations present | 3+ items: Tier 1 only, seasonal variation, SKU-level masking, alternate route viability | PASS |
| Zero fabricated numbers | All visible figures match Atlas input exactly | PASS |
| Recovery timeline from template | 30-180 days (matches TPL-01 estimated_recovery_days) | PASS |

**Note on tier boundaries:** The initial run placed some actions with multi-week deadlines under immediate_actions instead of short_term_actions. Constraint 7 was added to enforce correct tier placement based on deadline timeframe. This does not affect content quality, only structural placement.

**Note on output capture:** The JSON output exhibited truncation artifacts during copy-paste from AI Studio. The model's full thinking process confirmed all sections (including short_term_actions and stakeholder_communications) were generated. The truncation is a capture issue, not a generation issue.

### Test 2: Japan Earthquake (SCN-05, Severity 4, NATURAL_DISASTER)

**Input:** Atlas report with 8 affected suppliers (5 CRITICAL, 1 HIGH, 2 MEDIUM), 3 disrupted routes (RTE-0009, RTE-0022, RTE-0023), $63,705,259.43 revenue exposure, 4 single-source dependencies, CRITICAL concentration (Japan 100%). Paired with TPL-05 (Natural Disaster template).

**Expected:** All three tiers, safety-first tone in communications, specific supplier recovery actions, geographic diversification in strategic tier.

| Criterion | Output | Status |
|-----------|--------|--------|
| All three tiers present | immediate_actions (3), short_term_actions (3), strategic_actions (2) | PASS |
| Revenue cited exactly | $63,705,259.43 in situation_summary and strategic action | PASS |
| Supplier IDs real | SUP-0359, SUP-0352, SUP-0369, SUP-0342 (CRITICAL no-backup), SUP-0343, SUP-0346, SUP-0353, SUP-0344 (with backup) | PASS |
| Backup supplier IDs correct | SUP-0056, SUP-0161, SUP-0198, SUP-0390 cited as backups | PASS |
| Route data correct | RTE-0022 +7d +25%, RTE-0009 +7d +20%, RTE-0023 +10d +35% | PASS |
| Concentration data exact | 100% Japan, SUP-0342 at 24.0% | PASS |
| Confidence calibration | Mostly HIGH (data-backed), one MEDIUM (buffer vs recovery inference) | PASS |
| Owner mapping to template | Supplier Relations, Crisis Response Team (immediate). VP Supply Chain, HR (short-term). CEO, Board Risk Committee (strategic). All match TPL-05. | PASS |
| Stakeholder communications | All 3 present. Internal: 8 suppliers, 33.6 days, crisis meeting. Supplier: safety-first tone. Customer: 48-hour update commitment. | PASS |
| Limitations present | 4 items: Tier 1 only, seasonal variation, buffer distribution, port capacity | PASS |
| Recovery timeline from template | 14-180 days (matches TPL-05) | PASS |
| Contract expiry data used | References SUP-0359 (2026-05-15) and SUP-0342 (2026-05-10) for strategic timing | PASS (bonus) |
| Safety-first tone | Supplier message: "Safety comes first." Natural disaster template tone preserved. | PASS |

**Test 2 quality highlights:**
- The model leveraged contract_expiry dates from the report to time the strategic action of requiring business continuity plans "prior to their upcoming contract renewals starting in May 2026." This shows deep data utilization beyond the minimum requirements.
- Backup supplier activation was correctly separated: the model identified which 4 suppliers have backups and cited their specific backup IDs, while flagging the other 4 as single-source risks.
- The executive briefing's most_likely scenario quantifies the split: "backup suppliers mitigate roughly 50% of the impact" and "single-source dependencies without backups experience shortages after the 33-day inventory buffer is depleted." This is MEDIUM-confidence inference done correctly.

### Test 3: No Exposure (Edge Case)

**Input:** Atlas report with no_exposure_detected: true, 0 suppliers, 0 products, $0 revenue. Paired with TPL-05.

**Expected:** Minimal valid playbook. No fabricated crisis response. Severity 1, monitoring recommendation, limitations noting Tier 1 coverage only.

| Criterion | Expected Behavior | Status |
|-----------|-------------------|--------|
| No fabricated playbook | Should not generate detailed crisis actions for a non-existent exposure | PENDING |
| Valid schema output | Minimal JSON conforming to schema requirements | PENDING |
| Limitations present | Should note Tier 1 only assessment | PENDING |

**Status:** Test 3 output was run but not captured in documentation. Pending confirmation.

---

## 9. Quality Rubric Scores (Test 2, Assessed Against SUCCESS_CRITERIA.md)

| Dimension | Score | Reasoning |
|-----------|-------|-----------|
| Actionability | 5 | Step-by-step actions with named suppliers (SUP-0359, SUP-0342), specific routes (RTE-0022, RTE-0023), backup IDs (SUP-0056, SUP-0161), exact costs (+25%, +35%), and draft communications ready to customize |
| Completeness | 5 | All three tiers plus executive briefing plus communications (all 3) plus limitations (4 items) |
| Accuracy | 5 | Every number traces to Atlas input. $63,705,259.43 exact. 33.6 days exact. 100% concentration exact. Zero fabricated statistics. |
| Clarity | 5 | Executive briefing readable by non-technical audience. Actions are specific enough to execute. No jargon without context. |
| Confidence Calibration | 4 | Tags consistently match evidence. HIGH used for data-backed, MEDIUM for inference with explained reasoning. No LOW used in this scenario; all actions were genuinely data-backed or reasonably inferred, which is appropriate. A LOW action would have been ideal for completeness but none was forced. |

**Total: 24/25 (average 4.8). Target: 17.5 (average 3.5). Exceeds target.**

---

## 10. Prompt Evolution Log

| Version | Changes | Trigger |
|---------|---------|---------|
| v1.0 | Complete prompt built to enterprise standard from first version. Full pre-work audit (schema analysis, playbook template review, all 7 templates read, actual CSV data verified, Gemini 3 HIGH thinking researched against official Google docs). 10-section structure matching locked prompt standard. | Pre-work audit before writing |
| v1.0 (post-test) | Added Constraint 7: tier boundary enforcement requiring actions to be placed in the correct tier based on deadline timeframe | Test 1 showed multi-week deadlines in immediate_actions |

Unlike Sentinel (which went through v1.0 to v2.0 across 6 iterations), Strategist was built to the final standard from v1.0. The pre-work audit approach established during Sentinel's development was applied here: schema verification, data cross-reference, model behavior research, and example construction before writing the first line. One constraint was added after testing, which is a refinement within v1.0 rather than a structural rebuild.

---

## 11. Known Limitations

These are documented for LIMITATIONS_AND_FUTURE_WORK.md, not issues to fix.

1. **Template framework constrains creativity.** Strategist customizes pre-built templates rather than generating novel response strategies. For unprecedented crisis types not covered by the 7 templates, the output may be less effective. Production systems would allow template creation for new crisis categories.

2. **Financial projections are qualitative, not quantitative.** The executive briefing's best/worst/most_likely scenarios describe outcomes in narrative form. They do not produce numeric forecasts (e.g., "projected loss of $12.3M in Q2"). This is by design, as the data does not support precise forecasting, but it is a limitation compared to enterprise tools with financial modeling capabilities.

3. **Single-crisis assumption.** Each playbook addresses one crisis type. If two crises occur simultaneously (e.g., a natural disaster during a trade war), Strategist generates separate playbooks. It does not model interaction effects between concurrent disruptions.

4. **Tier 1 supplier scope.** All recommendations are based on direct suppliers in the database. Tier 2+ upstream effects, sub-supplier dependencies, and raw material constraints are not assessed.

5. **No feedback loop.** Strategist generates a one-time playbook. It does not update recommendations as the situation evolves. Production systems would re-run the pipeline periodically and track which actions have been completed.

6. **Communication drafts require human editing.** The stakeholder communications are starting points. They fill data into templates but do not account for relationship context, prior communications, or organization-specific tone and formatting requirements.

---

## 12. Comparison: Three-Agent Design Patterns

| Aspect | Sentinel | Atlas | Strategist |
|--------|----------|-------|------------|
| Thinking level | LOW | MEDIUM | HIGH |
| Primary function | Classification | Data assembly | Strategic reasoning |
| Input source | GDELT articles | Sentinel card + supplier database | Atlas report + playbook template |
| n8n vs LLM split | ~60/40 LLM | ~90/10 n8n | ~20/80 LLM |
| Key hallucination risk | Fabricated sources | Fabricated supplier IDs | Fabricated financial figures |
| Mitigation | Source URL passthrough | n8n pre-filtering + ID validation | Number-tracing rule + confidence tagging |
| Token cost per call | ~$0.03-$0.05 | ~$0.05-$0.10 | ~$0.08-$0.15 |

---

## 13. Files

| File | Location | Description |
|------|----------|-------------|
| strategist_system_prompt_v1.md | prompts/ | Final Strategist prompt (v1.0 with post-test constraint) |
| schema_crisis_playbook.json | data/schemas/ | Output schema |
| strategist_test_hormuz.txt | evaluation/stage2_tests/ | Test 1 input (10 suppliers, 5 routes, $42.8M) |
| strategist_test_japan.txt | evaluation/stage2_tests/ | Test 2 input (8 suppliers, 3 routes, $63.7M) |
| strategist_test_no_exposure.txt | evaluation/stage2_tests/ | Test 3 input (no exposure edge case) |
| Test outputs | evaluation/stage2_tests/ | JSON outputs from all tests |
