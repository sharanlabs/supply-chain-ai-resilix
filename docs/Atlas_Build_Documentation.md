> **Stale — predecessor content; scheduled for rewrite in Phase 5 Atlas exposure engine.** This still describes the LaunchOps / RESILIX-v1 system. The ActionOps target is defined in PLAN.md (repo root). Do not treat as current until rewritten.

# Atlas Agent: Complete Build Documentation

**System:** RESILIX Supply Chain Crisis Intelligence
**Agent:** Atlas (Impact Assessment)
**Version:** 1.0 (Final)
**Date:** 2026-03-29
**Author:** Sharan Kumar

---

## 1. What Atlas Does

Atlas is the second agent in the RESILIX pipeline. It receives pre-filtered and pre-calculated supply chain data from an n8n Code node, assembles it into a structured Risk Exposure Report, and validates the data for coherence. This report becomes the input for Strategist, the downstream response generation agent.

Atlas answers three questions from structured supplier data:
- Which suppliers and products in our network are exposed to this crisis?
- How much revenue is at risk and how quickly will it affect operations?
- Where is our concentration risk highest?

Atlas does not classify threats (Sentinel's job), recommend actions (Strategist's job), or calculate financial figures (n8n Code node's job). Its only job is structured assembly and validation of pre-calculated data.

---

## 2. Position in the Pipeline

```
GDELT News API
      |
      v
 [ SENTINEL ]  --->  Human Approval  --->  n8n Code  --->  [ ATLAS ]  --->  Human Approval  --->  [ STRATEGIST ]
      |                                        |                 |                                        |
  Classifies threat                     Filters suppliers   Assembles and                        Generates crisis
  from news articles                    Calculates all      validates the                        response playbook
      |                                 financial figures   Risk Exposure Report                       |
  Threat Alert Card                   Pre-filtered data    Risk Exposure Report               Crisis Playbook
```

Atlas sits between two systems:

1. **Upstream (n8n Code node):** Receives Sentinel's Threat Alert Card, filters the 500-supplier database using dual filtering modes, calculates all financial aggregates, and packages everything into a structured input for Atlas. Every number Atlas receives is pre-calculated.
2. **Downstream (Strategist agent):** Uses the Risk Exposure Report to generate a Crisis Playbook with actionable recommendations. Precision in Atlas's output directly determines the quality of those recommendations.

---

## 3. Model Selection

### Model: Gemini 3.1 Pro Preview

**Model string:** `gemini-3.1-pro-preview`

**Why this model:** Same model as Sentinel and Strategist. RESILIX uses a single model across all agents to eliminate behavioral differences between test and production. See the Sentinel Build Documentation for full model specifications (1M token context window, 65,536 max output, $2/$12 per million input/output tokens).

### Thinking Level: MEDIUM

| Level | Use Case | Token Cost | Latency |
|-------|----------|------------|---------|
| LOW | Classification, extraction, summarization | ~200-500 thinking tokens | 1-3 seconds |
| **MEDIUM** | **Analysis, moderate reasoning** | **~500-2000 thinking tokens** | **3-8 seconds** |
| HIGH | Complex reasoning, strategic planning | ~2000+ thinking tokens | 8-30 seconds |

Atlas uses MEDIUM because it validates data coherence, not just extracts or classifies. It needs to reason about whether the pre-filtered data makes sense as a whole: does a Hormuz crisis affecting Bangladesh suppliers make sense? (Yes, because those suppliers ship through Hormuz routes.) Is a 100% single-country concentration expected for a Japan earthquake? (Yes, the earthquake affects only Japanese facilities.) These validation questions require moderate reasoning but not the deep strategic planning that Strategist needs.

---

## 4. Development Environment

### Google AI Studio

Same configuration as Sentinel with one change.

| Setting | Value | Change from Sentinel |
|---------|-------|---------------------|
| Model | Gemini 3.1 Pro Preview | No change |
| Temperature | 1.0 | No change |
| Thinking level | **Medium** | **Changed from Low** |
| Output length | 65536 | No change |
| Structured outputs | OFF | No change |
| Code execution | OFF | No change |
| Function calling | OFF | No change |
| Grounding with Google Search | OFF | No change |
| URL context | OFF | No change |

---

## 5. The n8n / LLM Split

This is the most important architectural decision in Atlas. The split determines what the LLM does versus what deterministic code handles.

### The Problem

The Risk Exposure Report schema has 39 fields. Sending raw data (500 suppliers, 500 products, 25 routes) to an LLM and asking it to filter, calculate, and assemble the report would be expensive (~75,000+ tokens), slow, and prone to numerical hallucination. LLMs are unreliable at arithmetic, and a supply chain manager reviewing the output would immediately lose trust if revenue figures were wrong.

### The Solution

36 of 39 fields come from database lookups or deterministic calculations handled by the n8n Code node before Atlas. The LLM handles only 3 functions:

| Responsibility | Handler | Why |
|---------------|---------|-----|
| Supplier/route filtering (dual mode) | n8n Code | Deterministic data lookup |
| All financial calculations | n8n Code | LLMs are unreliable at arithmetic |
| Counts and averages | n8n Code | Simple aggregation, no judgment needed |
| Metadata (IDs, timestamps) | n8n Code | Pattern generation |
| Concentration risk thresholds | Atlas LLM | Applying CRITICAL/HIGH/MODERATE/LOW labels to pre-calculated percentages |
| Zero-exposure confirmation | Atlas LLM | Judgment call: is zero exposure real or a data gap? |
| Schema assembly and validation | Atlas LLM | Formatting pre-calculated data into valid JSON |

This follows Layer 3 of the hallucination mitigation architecture: "n8n Code nodes check every supplier ID against the actual database. The LLM never calculates financial figures; n8n does the math."

### Why This Matters

Enterprise supply chain platforms (Everstream, Resilinc, Z2Data) use the same pattern. Deterministic operations (math, filtering, lookups) run in code. AI handles classification, interpretation, and presentation. The intelligence is in knowing where to put each capability, not in giving the LLM more work than it should have.

---

## 6. Dual Filtering Modes

### The Discovery

During the Atlas pre-work audit, data analysis revealed that naive country-based filtering inflates revenue exposure by up to 467% for route-based crises. A Suez Canal closure affects 67 products shipped through Suez routes, with $275M in actual revenue at risk. Country-first filtering (finding all suppliers in countries that have any Suez-route product) pulls in 316 suppliers across 10 countries, inflating the figure to $1.56B. Most of those suppliers ship through the Pacific, nowhere near Suez.

### The Solution

Two filtering modes in the n8n Code node, selected automatically based on `event_type` from Sentinel:

| Event Type | Filtering Mode | Rationale |
|-----------|---------------|-----------|
| MILITARY_CONFLICT | Route-first | Blocks shipping corridors, not local production |
| MARITIME_SECURITY | Route-first | Threatens specific shipping lanes |
| PORT_DISRUPTION | Route-first | Affects specific port and its routes |
| NATURAL_DISASTER | Country-first | Destroys local production capacity |
| TRADE_POLICY | Country-first | Tariffs affect all exports from a country |
| GEOPOLITICAL | Both (merged, deduplicated) | Could affect routes and local production |
| CYBER_ATTACK | Route-first | Targets logistics systems on specific corridors |

**Route-first filtering:** Start with `affected_routes` from Sentinel. Find all products shipped via those routes. Find the suppliers for those products. This answers: "Whose goods actually travel through the disrupted corridor?"

**Country-first filtering:** Start with `affected_countries` from Sentinel. Find all suppliers in those countries. Find their products. This answers: "Whose production facilities are in the affected zone?"

### Validation

| Scenario | Route-First | Country-First | Correct Mode |
|----------|------------|---------------|-------------|
| SCN-01 Hormuz (maritime) | 88 suppliers, $422M | 113 suppliers, $553M | Route-first |
| SCN-07 Suez (maritime) | 67 suppliers, $275M | 316 suppliers, $1.56B | Route-first |
| SCN-05 Japan (earthquake) | N/A | 30 suppliers, $198M | Country-first |
| SCN-03 China (tariff) | N/A | 80 suppliers, $341M | Country-first |

---

## 7. Pre-filtering Logic (n8n Code Node)

The n8n Code node between Sentinel and Atlas runs JavaScript. It receives Sentinel's Threat Alert Card and the full supplier/product/route data from Google Sheets, then produces a structured data package for Atlas.

### Data Flow

```
Input:
  - Sentinel Threat Alert Card (event_type, affected_routes, affected_countries, affected_sectors)
  - Google Sheets: Suppliers (500 rows), Products (500 rows), Routes (25 rows)

Processing:
  1. Determine filtering mode from event_type
  2. Filter suppliers and products (route-first or country-first)
  3. Filter routes (from filtered products)
  4. Calculate all aggregates:
     - total_suppliers_affected, critical_suppliers_affected
     - total_products_at_risk, estimated_revenue_exposure
     - average_inventory_buffer_days, single_source_dependencies
     - estimated_time_to_impact_days (min of buffer - lead_time across CRITICAL suppliers)
     - concentration_risk (country and supplier percentages, risk_level)
  5. Build per-supplier detail (revenue_at_risk, estimated_impact_date, etc.)
  6. Build per-route detail (additional_transit_days, cost_increase_pct, etc.)

Output:
  - sentinel_card: Original Threat Alert Card (passthrough)
  - filtering_mode: "ROUTE_FIRST" or "COUNTRY_FIRST"
  - pre_calculated: All aggregate fields
  - supplier_details: Array of affected suppliers with all fields
  - route_details: Array of disrupted routes with all fields
```

### Key Calculations

**estimated_time_to_impact_days:** `min(inventory_buffer_days - lead_time_days)` across all CRITICAL suppliers, clamped to 0. When this is zero or negative, it means some CRITICAL suppliers already need reorders placed before their inventory buffer runs out. This is the most urgent metric in the report.

**concentration_risk_summary.risk_level:** Based on single_country_exposure_pct thresholds: CRITICAL (>60%), HIGH (>40%), MODERATE (>20%), LOW (<=20%). A Japan earthquake produces 100% = CRITICAL because all affected suppliers are in Japan. A Hormuz crisis produces 28.7% = MODERATE because exposure is spread across UAE, India, Bangladesh, Saudi Arabia, and Qatar.

**estimated_impact_date:** `today + inventory_buffer_days` for each supplier. Tells the supply chain manager when each supplier's disruption will actually affect production.

### Token Budget

The pre-filtering reduces what Atlas sees from ~75,000 tokens (all 500 suppliers) to a manageable subset:

| Scenario | Suppliers | Products | Routes | Data Tokens | Total Input |
|----------|----------|----------|--------|-------------|-------------|
| SCN-01 Hormuz | 88 | 88 | 5 | ~26,400 | ~28,300 |
| SCN-03 China Tariff | 80 | 80 | varies | ~24,000 | ~26,000 |
| SCN-07 Suez | 67 | 67 | 6 | ~20,100 | ~22,000 |
| SCN-05 Japan | 30 | 30 | 7 | ~9,000 | ~11,000 |
| SCN-02 Taiwan | 25 | 25 | varies | ~7,500 | ~9,500 |

All scenarios fit within Gemini 3.1 Pro's context window with substantial margin. Worst-case input cost: ~$0.06 per call.

---

## 8. Output Schema: Risk Exposure Report

The Risk Exposure Report is defined by `schema_risk_exposure_report.json`. It is the contract between Atlas and Strategist.

### Schema Summary

- 39 fields total across 3 levels (top-level, per-supplier, per-route)
- 8 required top-level fields
- 7 required per-supplier fields, 6 optional
- 5 required per-route fields, 4 optional
- `additionalProperties: false` (no extra fields allowed)
- ID pattern: `ATL-YYYY-MMDD-NNN` (regex validated)

### Top-Level Fields

| Field | Type | Required | Source |
|-------|------|----------|--------|
| report_id | string | Yes | n8n (generated) |
| trigger_alert_id | string | Yes | Sentinel card (passthrough) |
| timestamp | string | Yes | n8n (generated) |
| total_suppliers_affected | integer | Yes | n8n (count) |
| critical_suppliers_affected | integer | No | n8n (count) |
| total_products_at_risk | integer | Yes | n8n (count) |
| estimated_revenue_exposure | number | Yes | n8n (sum) |
| average_inventory_buffer_days | number | No | n8n (average) |
| single_source_dependencies | integer | No | n8n (count where backup = NONE) |
| affected_suppliers | array | Yes | n8n (filtered, enriched) |
| route_disruptions | array | Yes | n8n (filtered, enriched) |
| no_exposure_detected | boolean | No | Atlas LLM (judgment) |
| estimated_time_to_impact_days | integer | No | n8n (min of buffer - lead_time) |
| concentration_risk_summary | object | No | n8n (percentages) + Atlas LLM (risk_level) |

### Per-Supplier Fields

| Field | Type | Required | Key Constraint |
|-------|------|----------|----------------|
| supplier_id | string | Yes | Pattern: ^SUP-\d{4}$ |
| supplier_name | string | Yes | Exact match from database |
| country | string | Yes | Exact match from database |
| sector | string | Yes | One of 6 sector values |
| dependency_level | string | Yes | Enum: CRITICAL, HIGH, MEDIUM, LOW |
| products_affected | integer | Yes | minimum: 1 |
| revenue_at_risk | number | Yes | Pre-calculated, not estimated |
| backup_available | boolean | No | Derived: backup_supplier_id != NONE |
| inventory_buffer_days | integer | No | From supplier database |
| risk_score | integer | No | 1-100, from supplier database |
| lead_time_days | integer | No | From supplier database |
| estimated_impact_date | string | No | Calculated: today + buffer days |

---

## 9. Prompt Architecture

### Design Principles

The Atlas prompt was designed following the same verified Gemini 3 best practices as Sentinel, with one addition specific to data grounding tasks:

1. **Direct and concise.** Same as Sentinel.
2. **Positive framing over blanket negatives.** Same as Sentinel.
3. **Constraints at the end.** Same as Sentinel.
4. **Consistent structure.** Markdown headings throughout.
5. **Strict grounding instruction.** Google's Gemini 3 prompting guide (updated March 27, 2026) recommends for data grounding tasks: "You are a strictly grounded assistant limited to the information provided in the User Context. In your answers, rely only on the facts that are directly mentioned in that context." Atlas adapts this for structured data passthrough.

### Prompt Structure

| Section | Purpose | Token Estimate |
|---------|---------|----------------|
| Header | Version, model, thinking level, schema reference | ~50 |
| Identity | Role, pipeline position (n8n upstream, Strategist downstream), date | ~80 |
| Principles | 4 rules: number passthrough, no fabrication, zero-exposure honesty, political neutrality | ~150 |
| Input specification | Five data blocks: sentinel_card, filtering_mode, pre_calculated, supplier_details, route_details | ~120 |
| Error handling | Zero suppliers, missing fields, inconsistent data | ~100 |
| Concentration risk thresholds | CRITICAL >60%, HIGH >40%, MODERATE >20%, LOW otherwise | ~60 |
| Example | Worked example showing correct number passthrough and schema assembly | ~150 |
| Output specification | Full JSON template matching Risk Exposure Report schema | ~250 |
| Field rules | Complete table for all fields: which are passthrough vs judgment | ~300 |
| Constraints | No independent calculations, no fabricated IDs, exact number passthrough | ~100 |
| **Total** | | **~1,360** |

### Key Design Decisions

**Number passthrough, not calculation.** The most important constraint in the Atlas prompt. Every financial figure, every count, every average comes from the n8n Code node. Atlas copies these values into the output exactly as provided. The prompt states: "All financial figures are pre-calculated. Use the exact values from pre_calculated. Do not estimate, round, or recalculate."

**No few-shot example with full supplier data.** The example uses a simplified 3-supplier scenario to demonstrate correct passthrough behavior without consuming thousands of tokens. The model generalizes from the small example to the full 88-supplier input.

**secondary_supplier_info excluded from output.** The input data includes secondary supplier information for context, but the Risk Exposure Report schema does not have a field for it. Atlas reads it for validation awareness but does not include it in the output. The Strategist may use it in future iterations.

**Concentration risk threshold verification.** The n8n Code node pre-calculates the risk_level, but Atlas verifies it matches the stated thresholds. If there is a discrepancy (unlikely, since the Code node uses the same thresholds), Atlas uses the correct level per the thresholds and notes the discrepancy in its thinking tokens.

**Political neutrality simplified.** Atlas works with structured supplier data, not news articles. There is minimal opportunity for political framing. The prompt says: "Reference the crisis type and geographic location as stated in the Sentinel card. Do not add political commentary beyond what the Sentinel card already states."

---

## 10. Test Results

Three tests were run in Google AI Studio with the v1.0 prompt. Each test validates against the success criteria defined in SUCCESS_CRITERIA.md.

### Test 1: Hormuz Crisis (SCN-01, Route-First Filtering)

**Input:** Pre-filtered data package with 88 suppliers across 5 countries (India, Bangladesh, Qatar, Saudi Arabia, UAE), $422M revenue at risk, 5 disrupted routes.

**Expected:** All numbers pass through unchanged, zero hallucinated supplier IDs, MODERATE concentration risk (28.7% UAE).

| Criterion | Output | Status |
|-----------|--------|--------|
| report_id | ATL-2026-0329-001 | PASS |
| trigger_alert_id | SEN-2026-0328-001 | PASS |
| total_suppliers_affected | 88 | PASS (exact match) |
| critical_suppliers_affected | 11 | PASS (exact match) |
| estimated_revenue_exposure | $422,050,531.99 | PASS (exact match) |
| concentration_risk_summary.risk_level | MODERATE | PASS (28.7% = correct) |
| concentration_risk_summary.top_country | United Arab Emirates | PASS |
| Supplier IDs validated against database | 88/88 | PASS (zero hallucinated) |
| Revenue figures spot-checked (7 suppliers) | All exact match | PASS |
| Route revenues (all 5 routes) | All exact match | PASS |
| Route total cross-check | $422,050,531.99 | PASS (matches reported total) |
| Schema structure | All 8 required fields present | PASS |
| no_exposure_detected | false | PASS |
| estimated_time_to_impact_days | 0 | PASS (CRITICAL suppliers past buffer) |

**Success criteria met:**
- Zero hallucinated supplier names or IDs: Yes (88/88 verified)
- 100% geographic accuracy: Yes (all suppliers in correct countries)
- Zero independently estimated numbers: Yes (all spot checks exact match)
- Valid JSON against schema: Yes

### Test 2: Japan Earthquake (SCN-05, Country-First Filtering)

**Input:** Pre-filtered data package with 30 Japanese suppliers, $198M revenue at risk, 7 routes.

**Expected:** All numbers pass through unchanged, 100% single-country concentration = CRITICAL.

| Criterion | Output | Status |
|-----------|--------|--------|
| total_suppliers_affected | 30 | PASS (exact match) |
| critical_suppliers_affected | 5 | PASS (exact match) |
| estimated_revenue_exposure | $197,574,582.82 | PASS (exact match) |
| concentration_risk_summary.risk_level | CRITICAL | PASS (100% > 60%) |
| concentration_risk_summary.top_country | Japan | PASS |
| All suppliers in Japan | 30/30 | PASS (zero non-Japan) |
| Supplier IDs validated | 30/30 | PASS (zero hallucinated) |
| Revenue spot-checked (3 suppliers) | All exact match | PASS |
| no_exposure_detected | false | PASS |

**Key validation:** This test confirms country-first filtering works correctly. All 30 Japanese suppliers are included regardless of which shipping route their products use. The 100% concentration risk is expected and correctly classified as CRITICAL.

### Test 3: Zero Match (Edge Case)

**Input:** Pre-filtered data package with 0 suppliers (Sentinel reported "Atlantis" as affected country, which has no suppliers in our database).

**Expected:** no_exposure_detected = true, empty arrays, $0 revenue, no fabricated data.

| Criterion | Output | Status |
|-----------|--------|--------|
| total_suppliers_affected | 0 | PASS |
| total_products_at_risk | 0 | PASS |
| estimated_revenue_exposure | $0.00 | PASS |
| no_exposure_detected | true | PASS |
| affected_suppliers | Empty array | PASS |
| route_disruptions | Empty array | PASS |
| No fabricated suppliers | Confirmed | PASS |
| No fabricated routes | Confirmed | PASS |

**Key validation:** This is the most important test for hallucination prevention. When given zero data, Atlas must not invent suppliers, routes, or revenue exposure. It correctly returns a valid schema with empty arrays and zero values.

---

## 11. Prompt Evolution Log

| Version | Changes | Trigger |
|---------|---------|---------|
| v1.0 | Complete prompt built from full pre-work audit. All 10 sections. Dual filtering modes designed. Test data generator built. Three tests passed. | Enterprise standard: no iterative patching |

Atlas achieved its final form in v1.0. This was possible because the full pre-work audit (data analysis, field mapping, token budget calculation, filtering mode validation, blindspot scan) was completed before writing began. The audit identified the dual filtering mode requirement, the n8n/LLM split, and all edge cases before the prompt was written.

This standard (complete audit, then build to final quality in one pass) was established after Sentinel required 6 versions to reach its final state. Sentinel v1.0 through v1.5 were iterative patches; v2.0 was a complete rebuild from audit. Atlas applied the lesson: audit first, build once.

---

## 12. Known Limitations

1. **1:1 supplier-to-product mapping.** Each supplier has exactly one product in the current database. Enterprise systems have many-to-many relationships. This simplification means `products_affected` is always 1 per supplier. Production systems would require a join table and more complex aggregation.

2. **No secondary supplier exposure analysis.** The Products table includes `secondary_supplier_id` for 439 products. Atlas receives this information but does not analyze whether the secondary supplier is also in the affected zone. This would improve the accuracy of `backup_available` assessments.

3. **Static threshold for concentration risk.** The CRITICAL/HIGH/MODERATE/LOW thresholds are fixed in the prompt. Production systems would allow configurable thresholds per crisis type or per business unit.

4. **estimated_time_to_impact_days can mask variation.** The field reports the minimum across CRITICAL suppliers. A scenario might have one supplier at 0 days (immediate) and another at 27 days, but the report shows only 0. A distribution or histogram would be more informative.

5. **No cascading impact analysis.** Atlas reports direct exposure (suppliers in the affected zone or on affected routes). It does not model second-order effects, such as a disrupted supplier's backup also being in the affected zone. The data exists (backup_supplier_id references other suppliers), but the analysis is not implemented.

6. **Route status is static from database.** The route `current_status` field comes from the Shipping Routes table, not from real-time monitoring. In production, route status would be updated by the Sentinel pipeline itself as new disruptions are detected.

---

## 13. Files

| File | Location | Description |
|------|----------|-------------|
| atlas_system_prompt_v1.md | prompts/ | Final Atlas prompt (v1.0) |
| schema_risk_exposure_report.json | data/schemas/ | Output schema (39 fields) |
| atlas_test_generator.py | evaluation/stage2_tests/ | Python script simulating n8n pre-filtering |
| atlas_test1_hormuz.json | evaluation/stage2_tests/ | Test 1 input (88 suppliers, route-first) |
| atlas_test2_japan.json | evaluation/stage2_tests/ | Test 2 input (30 suppliers, country-first) |
| atlas_test3_zero_match.json | evaluation/stage2_tests/ | Test 3 input (0 suppliers, edge case) |
| Test outputs | evaluation/stage2_tests/ | JSON outputs from all 3 tests |
