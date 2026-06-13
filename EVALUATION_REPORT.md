> **Superseded — 2026-06-12.** This documents the predecessor system (RESILIX v1 / LaunchOps). The current product is **RESILIX ActionOps**; see README.md and docs/Success_Criteria.md at the repo root. Retained for history — not current.

# Evaluation Report

## Overview

This report documents the results of testing the RESILIX pipeline against the success criteria defined in SUCCESS_CRITERIA.md. All tests used the live n8n pipeline with Gemini 3.1 Pro Preview and real-time GDELT news data.

**Test date:** [DATE]
**Pipeline version:** v2.0
**Model:** gemini-3.1-pro-preview
**Orchestration:** n8n Cloud Starter
**Data:** 500 suppliers, 25 routes, 500 products, 7 playbook templates

---

## System-Level Results

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Scenarios tested | 7 of 7 | [X] of 7 | [PASS/FAIL] |
| Pipeline completion time | Under 5 minutes | [X]s avg | [PASS/FAIL] |
| Hallucination rate | Under 5% | [X]% | [PASS/FAIL] |
| Playbook quality score | 3.5 / 5.0 | [X] / 5.0 | [PASS/FAIL] |
| Cost per run | Under $0.50 | $[X] avg | [PASS/FAIL] |
| Schema validation | Zero violations | [X] violations | [PASS/FAIL] |
| Error handling | 8 of 8 modes | [X] tested | [PASS/FAIL] |

---

## Happy Path Test Results

### HP-01: Strait of Hormuz (MILITARY_CONFLICT / MARITIME_SECURITY)

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| GDELT query | `Iran Hormuz shipping disruption` | - | - |
| Sentinel event_type | MARITIME_SECURITY or MILITARY_CONFLICT | [X] | [PASS/FAIL] |
| Sentinel severity | 4-5 | [X] | [PASS/FAIL] |
| Sentinel confidence | HIGH (5+ distinct domains) | [X] | [PASS/FAIL] |
| Filter mode | ROUTE_FIRST | [X] | [PASS/FAIL] |
| Suppliers affected | >0 | [X] | [PASS/FAIL] |
| Products at risk | >0 | [X] | [PASS/FAIL] |
| Revenue exposure | Matches pre-calculated | $[X] | [PASS/FAIL] |
| Strategist: 3 tiers present | Yes | [YES/NO] | [PASS/FAIL] |
| Strategist: all confidence tagged | Yes | [YES/NO] | [PASS/FAIL] |
| Strategist: limitations present | Yes | [YES/NO] | [PASS/FAIL] |
| Total pipeline time | Under 300s | [X]s | [PASS/FAIL] |
| Cost | Under $0.50 | $[X] | [PASS/FAIL] |
| Hallucinated supplier IDs | 0 | [X] | [PASS/FAIL] |
| Revenue mismatch | Within $1 | [X] | [PASS/FAIL] |

### HP-05: Japan Earthquake (NATURAL_DISASTER)

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| GDELT query | `Japan earthquake supply chain disruption` | - | - |
| Sentinel event_type | NATURAL_DISASTER | [X] | [PASS/FAIL] |
| Filter mode | COUNTRY_FIRST | [X] | [PASS/FAIL] |
| Suppliers in Japan matched | >0 | [X] | [PASS/FAIL] |
| Pipeline time | Under 300s | [X]s | [PASS/FAIL] |
| Cost | Under $0.50 | $[X] | [PASS/FAIL] |

### HP-07: Red Sea / Suez (MARITIME_SECURITY)

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| GDELT query | `Red Sea Suez shipping attacks Houthi` | - | - |
| Sentinel event_type | MARITIME_SECURITY | [X] | [PASS/FAIL] |
| Filter mode | ROUTE_FIRST | [X] | [PASS/FAIL] |
| Suez-dependent routes flagged | Yes | [YES/NO] | [PASS/FAIL] |
| Route cascading correct | Yes | [YES/NO] | [PASS/FAIL] |
| Pipeline time | Under 300s | [X]s | [PASS/FAIL] |

[Add HP-02 through HP-06 as executed]

---

## Hallucination Audit

The pipeline performs automated hallucination checks at two points:

1. **Validate_Atlas:** Every supplier_id in Atlas output is cross-checked against the pre-filtered supplier list. Any ID not in the list triggers ATLAS_HALLUCINATED_SUPPLIER error and halts the pipeline.

2. **Validate_Atlas:** Revenue figure is compared to the pre-calculated total. Difference > $1 triggers ATLAS_REVENUE_MISMATCH error.

| Check | Method | Across All Runs | Status |
|-------|--------|----------------|--------|
| Supplier IDs in Atlas | Automated cross-check | [X] IDs checked, [X] hallucinated | [PASS/FAIL] |
| Revenue in Atlas | Automated match | [X] runs checked, [X] mismatches | [PASS/FAIL] |
| Supplier names in Strategist | Manual spot-check | [X] names checked, [X] fabricated | [PASS/FAIL] |
| Route names in Strategist | Manual spot-check | [X] names checked, [X] fabricated | [PASS/FAIL] |
| Financial figures in Strategist | Manual comparison to Atlas input | [X] figures checked, [X] fabricated | [PASS/FAIL] |

**Overall hallucination rate:** [X] fabricated data points / [X] total data points = [X]%

---

## Performance Results

| Metric | Target | Run 1 | Run 2 | Run 3 | Average |
|--------|--------|-------|-------|-------|---------|
| Sentinel time | Under 30s | [X]s | [X]s | [X]s | [X]s |
| Atlas time | Under 60s | [X]s | [X]s | [X]s | [X]s |
| Strategist time | Under 120s | [X]s | [X]s | [X]s | [X]s |
| Full pipeline | Under 300s | [X]s | [X]s | [X]s | [X]s |
| Input tokens | - | [X] | [X] | [X] | [X] |
| Output tokens | - | [X] | [X] | [X] | [X] |
| Thinking tokens | - | [X] | [X] | [X] | [X] |
| Total tokens | Under 23,000 | [X] | [X] | [X] | [X] |
| Cost per run | Under $0.50 | $[X] | $[X] | $[X] | $[X] |

---

## Quality Rubric Scores

Scored by human review using the 5-dimension rubric in SUCCESS_CRITERIA.md.

| Dimension | HP-01 | HP-05 | HP-07 | Average |
|-----------|-------|-------|-------|---------|
| Actionability (1-5) | [X] | [X] | [X] | [X] |
| Completeness (1-5) | [X] | [X] | [X] | [X] |
| Accuracy (1-5) | [X] | [X] | [X] | [X] |
| Clarity (1-5) | [X] | [X] | [X] | [X] |
| Confidence calibration (1-5) | [X] | [X] | [X] | [X] |
| **Total (/25)** | **[X]** | **[X]** | **[X]** | **[X]** |

**Target:** 3.5 average per dimension (17.5/25 total)
**Result:** [X]/25 average - **[PASS/FAIL]**

---

## Edge Cases Tested

| Test | Input | Expected Behavior | Actual | Status |
|------|-------|-------------------|--------|--------|
| EC-01: Empty GDELT | Query with no results | Stops at IF_Has_Articles, logs NO_ARTICLES_FOUND | [X] | [PASS/FAIL] |
| EC-03: Low severity | Low-severity event | Stops at Severity_Gate, logs LOW_SEVERITY_SKIPPED | [X] | [PASS/FAIL] |

---

## Key Findings

### What Worked

[Fill after testing. Example points to evaluate:]
- Did dual filtering correctly prevent revenue inflation?
- Did confidence calibration match domain count?
- Did the pipeline handle different crisis types correctly?
- Did error handling catch issues gracefully?

### Issues Discovered

[Fill after testing. Document any:]
- Unexpected classifications
- Edge cases not covered
- Performance bottlenecks
- Data quality issues in the source sheets

### Differences from AI Studio Testing

GDELT returns a rolling 3-month window of articles. The pipeline was tested with live data, which differs from the static test data used in Stage 2 AI Studio testing. Key differences to note:

- Article count and source domains vary per query
- Severity classification may differ based on current article content
- Confidence levels may shift as different sources appear
- This is expected and demonstrates the system works with unseen data

---

## Conclusion

[One paragraph summarizing whether the system met its success criteria, with specific numbers.]
