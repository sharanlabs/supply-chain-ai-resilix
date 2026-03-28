# Success Criteria

This document defines the success criteria for RESILIX. All criteria were established before development started, following Google's recommended evaluation practice of defining measurable success before building (Google Cloud, Agent Evaluation Documentation, 2025).

## Evaluation Framework

Success is measured across four pillars, adapted from Google's agent quality framework:

1. **Effectiveness:** Does each agent produce correct, useful output?
2. **Efficiency:** Does the pipeline complete in a reasonable time and cost?
3. **Robustness:** Does the system handle errors, edge cases, and bad data gracefully?
4. **Safety:** Does the system prevent hallucinations, data leaks, and uncontrolled behavior?

## Agent-Level Success Criteria

### Sentinel (Threat Detection)

Sentinel succeeds when it:

| Criterion | How We Measure | Pass Threshold |
|-----------|---------------|----------------|
| Correctly identifies crisis type | Compare output type against known event type for each test case | 7 of 7 scenario types classified correctly |
| Assigns appropriate severity | Compare output severity against human judgment | Within plus or minus 1 of expected severity |
| Lists only real affected regions | Check all listed regions are actual geographic locations | Zero fabricated regions across all tests |
| Cites actual source articles | Check every source URL resolves to a real article | 100% of URLs return HTTP 200 |
| Returns valid JSON | Validate output against Threat Alert Card schema | Zero schema violations |
| Marks low confidence correctly | Check if fewer than 3 corroborating sources triggers LOW confidence | Consistent across all LOW-confidence cases |

### Atlas (Impact Assessment)

Atlas succeeds when it:

| Criterion | How We Measure | Pass Threshold |
|-----------|---------------|----------------|
| Identifies only real suppliers | Cross-check every supplier_id in output against Suppliers sheet | Zero hallucinated supplier names or IDs |
| Matches suppliers to correct regions | Verify supplier country is in the affected regions from Sentinel | 100% geographic accuracy |
| Uses pre-calculated numbers only | Compare financial figures in output against n8n Code node calculations | Zero independently estimated numbers |
| Reports no exposure when appropriate | Test with a region that has zero suppliers in our database | Returns "No direct supplier exposure detected" (not forced findings) |
| Returns valid JSON | Validate output against Risk Exposure Report schema | Zero schema violations |

### Strategist (Response Generation)

Strategist succeeds when it:

| Criterion | How We Measure | Pass Threshold |
|-----------|---------------|----------------|
| Produces all three tiers | Check output contains immediate, short-term, and strategic sections | All three present in every output |
| Tags every recommendation with confidence | Check every recommendation has HIGH, MEDIUM, or LOW tag | 100% tagged |
| Includes basis for each recommendation | Check every recommendation has a "Basis" or reasoning field | 100% include reasoning |
| Includes a Limitations section | Check output contains explicit limitations or caveats | Present in every output |
| Uses only numbers from Atlas | Compare all financial figures against the Risk Exposure Report input | Zero fabricated statistics |
| Produces actionable recommendations | Human review: could a supply chain manager act on this today? | Quality rubric score 3.5 or higher (see below) |

## System-Level Success Criteria

These measure the full pipeline (Sentinel to Atlas to Strategist) as a whole.

| Criterion | Target | How We Measure |
|-----------|--------|---------------|
| Pipeline completion time | Under 5 minutes | Timestamp at start vs timestamp at end, logged in Execution_Log |
| Hallucination rate | Under 5% | (Hallucinated data points / Total data points checked) across all test cases |
| Scenario coverage | 7 of 7 | Each crisis type produces valid end-to-end output |
| Human approval nodes work | Pass/Fail | Pipeline pauses and waits for approval between each agent |
| Error handling catches failures | 8 of 8 | Each defined failure mode is tested and handled correctly |
| Graceful degradation works | 4 of 4 | Each degradation level tested and produces appropriate user message |
| Cost per run | Under $0.50 | Total Gemini tokens used multiplied by per-token price |
| All inter-agent data valid | Pass/Fail | JSON schema validation passes at every handoff point |

## Playbook Quality Rubric

Every Strategist output is scored by a human on five dimensions. Each dimension uses a 1 to 5 scale.

### Dimension 1: Actionability

| Score | Description |
|-------|------------|
| 1 | Generic advice that anyone could write without data |
| 2 | Some specifics but mostly vague suggestions |
| 3 | Recommendations reference specific suppliers or routes but lack step-by-step detail |
| 4 | Clear actions with named suppliers, routes, and timelines |
| 5 | Step-by-step actions with specific suppliers, alternative routes, inventory adjustments, and draft communications ready to send |

### Dimension 2: Completeness

| Score | Description |
|-------|------------|
| 1 | Only one tier present or major sections missing |
| 2 | Two tiers present but thin on detail |
| 3 | All three tiers present with reasonable content |
| 4 | All three tiers plus executive briefing |
| 5 | All three tiers plus executive briefing plus communication drafts plus limitations section |

### Dimension 3: Accuracy

| Score | Description |
|-------|------------|
| 1 | Contains fabricated supplier names, routes, or statistics |
| 2 | Mostly accurate but some unverifiable claims |
| 3 | All referenced data traceable to source, minor imprecisions |
| 4 | Fully accurate with clear source attribution |
| 5 | Fully accurate, all numbers match Atlas input exactly, every claim supported |

### Dimension 4: Clarity

| Score | Description |
|-------|------------|
| 1 | Jargon-heavy, disorganized, hard to follow |
| 2 | Readable but dense, requires re-reading |
| 3 | Clear structure, mostly plain language |
| 4 | Well-organized, a supply chain manager could understand without explanation |
| 5 | Crystal clear, logically structured, could be handed directly to an executive |

### Dimension 5: Confidence Calibration

| Score | Description |
|-------|------------|
| 1 | All recommendations marked HIGH regardless of data quality |
| 2 | Confidence tags present but inconsistent with evidence |
| 3 | Most tags align with the underlying data quality |
| 4 | Tags consistently match evidence, with clear reasoning |
| 5 | Every tag has stated reasoning, LOW used appropriately when data is thin, HIGH only when strongly supported |

**Target: Average score of 3.5 or higher across all five dimensions, across all 7 scenarios.**

Maximum possible score per scenario: 25 (5 dimensions times 5 points).
Target minimum per scenario: 17.5 (average of 3.5).

## Test Plan Overview

### Happy Path Tests (7 tests)
One full pipeline run per crisis scenario. Each must produce valid output from Sentinel through Atlas through Strategist.

| Test | Scenario | What We Check |
|------|----------|--------------|
| HP-01 | Shipping strait closure | Full pipeline, route rerouting in playbook |
| HP-02 | Semiconductor disruption | Single-source dependency flagged correctly |
| HP-03 | Tariff spike | Cost impact calculated correctly |
| HP-04 | Port shutdown | Domestic rerouting options in playbook |
| HP-05 | Natural disaster | Supplier count in affected region correct |
| HP-06 | Cyber attack | Multi-route impact assessed correctly |
| HP-07 | Maritime attacks | Suez-dependent suppliers identified correctly |

### Edge Case Tests (7 tests)
Deliberately difficult inputs designed to test system boundaries.

| Test | Scenario | Expected Behavior |
|------|----------|------------------|
| EC-01 | GDELT returns zero articles | Sentinel returns "No threats detected" (does not fabricate) |
| EC-02 | Region with zero suppliers | Atlas returns "No direct exposure" (does not force findings) |
| EC-03 | Very low severity event (1-2) | Pipeline logs but does not trigger full analysis |
| EC-04 | Maximum severity event (5) | Comprehensive playbook with urgent tone |
| EC-05 | Two simultaneous crises | System processes sequentially, both produce valid output |
| EC-06 | Malformed GDELT JSON response | Error handler catches it, logs to Error_Log, does not crash |
| EC-07 | Gemini returns truncated response | System detects truncation, retries, or returns partial result with warning |

### Hallucination Tests (7 tests)
Specifically designed to catch fabricated data.

| Test | What We Check | Pass Condition |
|------|--------------|----------------|
| HA-01 | Sentinel source URLs | Every URL resolves to a real article |
| HA-02 | Atlas supplier IDs | Every ID exists in the Suppliers sheet |
| HA-03 | Atlas supplier countries | Every country matches what is in the sheet |
| HA-04 | Strategist financial numbers | Every number matches Atlas input exactly |
| HA-05 | Strategist supplier names | Every name mentioned exists in our database |
| HA-06 | Strategist route names | Every route mentioned exists in our Shipping_Routes sheet |
| HA-07 | Overall data point audit | Count all verifiable claims, check each against source data |

### Performance Tests (7 tests)
Measured during happy path runs.

| Metric | Target | Recorded In |
|--------|--------|------------|
| Sentinel response time | Under 30 seconds | Execution_Log |
| Atlas response time | Under 60 seconds | Execution_Log |
| Strategist response time | Under 120 seconds | Execution_Log |
| Full pipeline time | Under 5 minutes | Execution_Log |
| Tokens per run (Sentinel) | Under 5,000 | Execution_Log |
| Tokens per run (Atlas) | Under 8,000 | Execution_Log |
| Tokens per run (Strategist) | Under 10,000 | Execution_Log |

**Total test cases: 28 minimum (7 happy path + 7 edge case + 7 hallucination + 7 performance).**

Additional quality scoring: 7 scenarios times 5 rubric dimensions = 35 quality data points.

## How Results Will Be Reported

After testing is complete, the following will be updated:

1. **README.md Results table** on the GitHub homepage (replace hyphens with actual numbers)
2. **evaluation/EVALUATION_REPORT.md** with full test results, pass/fail for each test, quality scores, and hallucination audit
3. **evaluation/test_cases.json** with structured input/expected/actual for every test case
4. **demo/scenario_walkthroughs/** with one markdown file per scenario including screenshots

## What This Document Does Not Cover

This document defines success criteria only. It does not describe how the system is built (see ARCHITECTURE.md), what data it uses (see DATA_DICTIONARY.md), or how hallucinations are prevented (see HALLUCINATION_MITIGATION.md). Those documents will be written during their respective build stages.
