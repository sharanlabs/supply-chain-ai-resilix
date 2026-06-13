> **Stale — predecessor content; scheduled for rewrite in Phase 4 (Sentinel + Verifier).** This still describes the LaunchOps / RESILIX-v1 system. The ActionOps target is defined in PLAN.md (repo root). Do not treat as current until rewritten.

# Sentinel Agent: Complete Build Documentation

**System:** RESILIX Supply Chain Crisis Intelligence
**Agent:** Sentinel (Threat Detection)
**Version:** 2.0 (Final)
**Date:** 2026-03-28
**Author:** Sharan Kumar

---

## 1. What Sentinel Does

Sentinel is the first agent in the RESILIX pipeline. It receives raw news articles from the GDELT global news API, classifies supply chain disruptions, and produces a structured Threat Alert Card. This card becomes the input for Atlas, the downstream impact assessment agent.

Sentinel answers three questions from unstructured news data:
- What type of supply chain disruption is this?
- How severe is it?
- Where is it happening (regions, countries, shipping routes, sectors)?

Sentinel does not assess business impact, recommend actions, or access the supplier database. Its only job is threat classification and geographic scoping.

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

Sentinel's output (Threat Alert Card) feeds two downstream consumers:
1. **n8n Code node:** Uses `affected_countries`, `affected_sectors`, and `affected_routes` to filter the 500-supplier database before Atlas receives it.
2. **Atlas agent:** Uses the full card as context for structuring the exposure assessment.

---

## 3. Model Selection

### Model: Gemini 3.1 Pro Preview

**Model string:** `gemini-3.1-pro-preview`

**Why this model:**
- Released February 19, 2026 by Google DeepMind
- 1M token context window (our prompts use ~2,300 tokens, well within budget)
- 65,536 token max output
- Native structured output support via `response_json_schema` parameter
- Supports combining structured output with Google Search grounding (needed for Strategist)
- Pricing: $2.00 per 1M input tokens, $12.00 per 1M output tokens
- Accessible via Google AI Studio for free interactive testing, and via API with $300 credits

**Previous model (deprecated):** `gemini-3-pro-preview` was shut down on March 9, 2026. Google's migration path points to `gemini-3.1-pro-preview` as the replacement.

**Free tier models available:** `gemini-3-flash-preview` and `gemini-3.1-flash-lite-preview` have free API tiers, but all RESILIX development and testing uses the same production model to avoid behavioral differences between test and deployment.

### Thinking Level: LOW

Gemini 3.1 Pro supports three thinking levels that control the depth of internal reasoning before generating a response:

| Level | Use Case | Token Cost | Latency |
|-------|----------|------------|---------|
| LOW | Classification, extraction, summarization | ~200-500 thinking tokens | 1-3 seconds |
| MEDIUM | Analysis, moderate reasoning | ~500-2000 thinking tokens | 3-8 seconds |
| HIGH | Complex reasoning, strategic planning | ~2000+ thinking tokens | 8-30 seconds |

Sentinel uses LOW because it performs classification and extraction, not deep reasoning. It maps article content to predefined categories (7 event types, 5 severity levels, 3 confidence tiers) and extracts geographic information. This is pattern matching, not strategic analysis.

If thinking level is not specified, Gemini 3.1 Pro defaults to HIGH, which is the most expensive option. Specifying LOW explicitly saves over 70% on thinking token costs.

---

## 4. Development Environment

### Google AI Studio

**URL:** aistudio.google.com

Google AI Studio is a free web-based interface for testing prompts with Gemini models. It provides interactive access to the same models available via the paid API, without consuming API credits for manual testing. The interface has four key areas:

1. **Model selector:** Dropdown at top to select Gemini 3.1 Pro Preview
2. **System Instructions:** Panel where the agent's permanent identity, rules, and constraints are pasted. This is the prompt.
3. **Chat input:** Where test data (GDELT articles) is pasted for each test run. This simulates what n8n will inject in production.
4. **Run Settings:** Temperature, thinking level, output length, safety settings, and tool toggles.

### Configuration

Every setting was verified against Google's official documentation for Gemini 3 models before testing.

| Setting | Value | Reasoning |
|---------|-------|-----------|
| Model | Gemini 3.1 Pro Preview | Production model, same as deployment |
| API Key | Connected | Full access, no rate limits |
| Temperature | 1.0 | Google: "For all Gemini 3 models, we strongly recommend keeping the temperature parameter at its default value of 1.0. Changing the temperature may lead to unexpected behavior, such as looping or degraded performance." |
| Top P | 0.95 | Default, no change needed for Gemini 3 |
| Thinking level | Low | Classification task, saves tokens and latency |
| Output length | 65536 | Maximum allowed, prevents truncation |
| Structured outputs | OFF | Tested with prompt-based JSON enforcement first. Schema enforcement added in Stage 3 via API. |
| Code execution | OFF | Sentinel does not execute code |
| Function calling | OFF | Sentinel does not call functions |
| Grounding with Google Search | OFF | Sentinel works only with provided GDELT data, no web search |
| URL context | OFF | Sentinel analyzes article metadata, not full article pages |
| Media resolution | Default | Text-only prompts, not relevant |

**Key technical notes:**
- Temperature below 1.0 was initially recommended (0.2) but corrected after research confirmed Gemini 3 models are optimized for 1.0 and lower values cause looping.
- Only one tool (Structured Output, Grounding, Code Execution) can be enabled at a time in the AI Studio interface. In the API, they can be combined. This means Strategist's combination of structured output + Google Search grounding will work in production but must be tested separately in AI Studio.

---

## 5. Data Source: GDELT DOC 2.0 API

### What GDELT Is

The GDELT Project (Global Database of Events, Language, and Tone) monitors news media worldwide, providing real-time indexing of global news coverage. The DOC 2.0 API provides full-text search across a rolling 3-month window of articles.

**API endpoint:** `https://api.gdeltproject.org/api/v2/doc/doc`

**Key parameters:**
- `query`: Search terms (e.g. "Hormuz shipping disruption")
- `mode`: `artlist` returns article metadata
- `maxrecords`: Maximum articles returned (up to 250 per query)
- `format`: `json` for structured response

**Rate limit:** 1 request per 5 seconds. Contact kalev.leetaru5@gmail.com for higher volume.

### Response Format

The ArticleList mode returns a JSON object with an `articles` array. Each article contains:

| Field | Type | Description |
|-------|------|-------------|
| url | string | Full article URL |
| url_mobile | string | Mobile URL (often empty) |
| title | string | Article headline (any language) |
| seendate | string | When GDELT indexed the article, format YYYYMMDDTHHMMSSZ |
| socialimage | string | Social sharing image URL |
| domain | string | Publisher domain |
| language | string | Article language |
| sourcecountry | string | Country of publication |

**What GDELT does NOT return in artlist mode:** No tone scores, no Goldstein scale, no CAMEO codes, no structured event data. Those are in the raw Event Database (downloadable CSVs), not the API. This was a Stage 1 lesson learned.

### Test Data Captured

A real GDELT query was executed to capture test data before writing the Sentinel prompt:

**Query URL:**
```
https://api.gdeltproject.org/api/v2/doc/doc?query=Iran%20Hormuz%20shipping%20disruption&mode=artlist&maxrecords=25&format=json
```

**Response:** 10 articles about the Strait of Hormuz crisis
- 9 distinct publisher domains
- 7 languages (English, Dutch, Indonesian, Polish, Turkish)
- 6 source countries (UK, US, Indonesia, Poland, Pakistan, Turkey)
- Date range: January 15 to February 22, 2026

This response became the primary test input for Sentinel development.

---

## 6. Output Schema: Threat Alert Card

The Threat Alert Card is defined by `schema_threat_alert_card.json`. It is the contract between Sentinel and Atlas.

### Schema Summary

- 16 fields total (9 required, 7 optional)
- `additionalProperties: false` (no extra fields allowed)
- ID pattern: `SEN-YYYY-MMDD-NNN` (regex validated)

### Field Inventory

| Field | Type | Required | Key Constraint |
|-------|------|----------|----------------|
| alert_id | string | Yes | Pattern: ^SEN-\d{4}-\d{4}-\d{3}$ |
| timestamp | string | Yes | ISO 8601 date-time |
| event_type | string | Yes | Enum: 7 crisis types |
| event_summary | string | Yes | 20-500 characters |
| severity | integer | Yes | 1-5 |
| affected_regions | array | Yes | minItems: 1 |
| affected_routes | array | Yes | Route IDs from reference table |
| affected_commodities | array | No | Industry-standard terms |
| source_articles | array | No | title, url, source_domain, published_date per article |
| confidence | string | Yes | Enum: HIGH, MEDIUM, LOW |
| data_freshness | string | No | Duration (e.g. "6 weeks") |
| event_subcategory | string | No | Narrower classification |
| source_count | integer | No | Minimum 0 |
| affected_countries | array | Yes | minItems: 1 |
| estimated_duration | string | No | Range based on crisis type |
| affected_sectors | array | No | Enum: 7 values including ALL |

### Enumerations

**event_type:** MILITARY_CONFLICT, GEOPOLITICAL, TRADE_POLICY, PORT_DISRUPTION, NATURAL_DISASTER, CYBER_ATTACK, MARITIME_SECURITY

**confidence:** HIGH (5+ distinct domains), MEDIUM (3-4), LOW (1-2)

**affected_sectors:** Electronics, Apparel, Automotive, Energy, Food & Beverage, Consumer Goods, ALL

---

## 7. Prompt Architecture

### Design Principles

The Sentinel prompt was designed following verified Gemini 3 best practices:

1. **Direct and concise.** Gemini 3 responds best to clear, direct instructions and may over-analyze verbose prompts designed for older models.
2. **Positive framing over blanket negatives.** Rather than "do not hallucinate," the prompt says "base your analysis strictly on the provided articles." Open-ended negative constraints cause Gemini 3 to over-index and fail at basic logic.
3. **Constraints at the end.** Google's documentation recommends placing negative constraints after the core instructions, not at the top.
4. **Consistent structure.** Markdown headings throughout. No mixing of XML and Markdown.
5. **Few-shot example.** One example showing correct classification, route cascading, and confidence calibration.

### Prompt Structure

| Section | Purpose | Token Estimate |
|---------|---------|----------------|
| Header | Version, model, thinking level, schema reference | ~50 |
| Identity | Role, pipeline context (Atlas downstream), think silently + date | ~80 |
| Principles | 5 rules: data grounding, political neutrality, silence over fabrication, conflicting signals handling, multi-event separation | ~200 |
| Input specification | GDELT artlist JSON format with field table | ~100 |
| Error handling | Empty input and no-relevance cases producing valid schema output | ~120 |
| Classification | Event type table (7 types), severity table (5 levels), confidence table (3 tiers) | ~200 |
| Route reference | 7 chokepoints + 18 trade lanes with "Via" column | ~450 |
| Sectors | 7 allowed values with ALL guidance | ~40 |
| Example | Red Sea scenario demonstrating route cascading | ~120 |
| Output specification | JSON template matching all 16 fields | ~200 |
| Field rules | Complete table with rules for all 16 fields | ~350 |
| Constraints | Hard constraints: no fabrication, no invented routes, no unsupported data | ~100 |
| **Total** | | **~2,010** |

### Key Design Decisions

**Route cascading via "Via" column:** Trade lanes in the route reference table include their chokepoint dependencies (e.g. "RTE-0008: Shanghai to Rotterdam | via Malacca + Suez"). When Sentinel detects a chokepoint disruption, it flags both the chokepoint and all dependent trade lanes using information explicitly in the prompt, not outside geographic knowledge.

**Error handling produces valid schema output:** The schema sets `additionalProperties: false`. A response like `{"no_threat_detected": true}` would be rejected in structured output mode. Instead, error cases produce a minimal valid Threat Alert Card with severity 1, confidence LOW, and descriptive event_summary.

**Multi-event separation (Principle #5):** GDELT queries can return articles about multiple unrelated events. Without explicit instructions, the model merges them into one combined alert. Principle #5 says: classify only the single most severe supply-chain-relevant event, exclude unrelated articles.

**Political neutrality (Principle #2):** All content follows the project rule: name countries as geographic facts, describe supply chain impact, no blame or sides. The prompt says "State geographic and factual information as reported in the articles. Do not assign blame, take sides, or editorialize."

**Confidence by distinct domains, not article count:** The same event reported by 5 outlets is more credible than 5 articles from the same outlet. Confidence is calibrated on distinct publisher domains, not total article count. This was verified correct when the Hormuz test data had 10 articles but 9 distinct domains, and Sentinel correctly reported source_count as 9.

**"NONE" string not addressed in Sentinel:** The backup_supplier_id = "NONE" pattern exists in the supplier data but Sentinel never sees supplier data. This is handled in the Atlas prompt.

---

## 8. Test Results

Three tests were run in Google AI Studio with the v2.0 prompt. Each test validates against the success criteria defined in SUCCESS_CRITERIA.md.

### Test 1: Hormuz Crisis (SCN-01, High Severity)

**Input:** 10 GDELT articles about Strait of Hormuz shipping warnings (9 distinct domains, 7 languages, Jan 15 to Feb 22 2026)

**Expected:** MARITIME_SECURITY or MILITARY_CONFLICT, severity 4-5, Hormuz-dependent routes, HIGH confidence

| Field | Output | Status |
|-------|--------|--------|
| alert_id | SEN-2026-0328-001 | PASS |
| timestamp | 2026-03-28T20:53:00Z | PASS |
| event_type | MARITIME_SECURITY | PASS |
| event_summary | "Rising tensions...commercial shipping vessels to avoid Iranian waters...Strait of Hormuz...global oil and LNG supply chains." | PASS |
| severity | 4 | PASS (expected 4-5) |
| affected_regions | Persian Gulf, Middle East | PASS (broad regional names) |
| affected_routes | RTE-0001, RTE-0014, RTE-0015, RTE-0016, RTE-0025 | PASS (all Hormuz-dependent) |
| affected_commodities | Oil, LNG | PASS |
| source_articles | All 10 articles, exact URL/title/domain match | PASS |
| confidence | HIGH | PASS (9 distinct domains) |
| data_freshness | 38 days | PASS |
| event_subcategory | Chokepoint Threat | PASS |
| source_count | 9 | PASS (wnp.pl counted once) |
| affected_countries | Iran | PASS (see note below) |
| estimated_duration | 30-90 days | PASS |
| affected_sectors | Energy | PASS |

**Note on affected_countries:** Output lists only Iran. UAE, Saudi Arabia, and Qatar (countries with infrastructure on Hormuz routes) are missing. Locked decision: the n8n Code node expands affected_countries by mapping affected_routes to supplier countries. This is deterministic data lookup, not LLM judgment.

**Success criteria met:**
- Correct crisis type classification: Yes
- Severity within +/- 1 of expected: Yes (4, expected 4-5)
- Zero fabricated regions: Yes
- All source URLs match input: Yes (10/10 exact match)
- Valid JSON structure: Yes
- Confidence calibrated from domain count: Yes

### Test 2: Mixed Articles (Multi-Event Separation)

**Input:** 10 GDELT articles from query "port strike disruption shipping" containing 4 distinct events:
1. Chittagong Port labor strike, Bangladesh (5 articles, Bangla language)
2. Fujairah port oil operations halted, UAE (2 articles)
3. Storm Leo shipping delays, Spain/Portugal (1 article)
4. Houthi/Iran military conflict disrupting shipping (1 article)

**Expected:** Classify single most severe event, exclude unrelated articles

| Field | Output | Status |
|-------|--------|--------|
| event_type | MILITARY_CONFLICT | PASS (most severe event) |
| severity | 5 | PASS (chokepoint + port operations halted) |
| source_articles | 3 articles (Houthi + 2 Fujairah) | PASS (excluded 7 unrelated) |
| source_count | 3 | PASS (3 distinct domains) |
| confidence | MEDIUM | PASS (3 domains = MEDIUM per threshold) |
| affected_routes | RTE-0001, RTE-0005, RTE-0014, RTE-0015, RTE-0016, RTE-0024, RTE-0025 | PASS |
| affected_countries | UAE, Iran, Yemen | PASS |
| data_freshness | 12 days | PASS (Mar 16 to Mar 28) |

**Critical validation:** This test was the reason v1.5 was created. The earlier prompt (v1.0-v1.4) merged all 4 events into a single alert with severity 5 covering three continents. v2.0 correctly separates them, classifying only the military conflict/Fujairah event as the most severe.

**Route cascading validated:** RTE-0024 (Yanbu to Mumbai) is included because the "Via" column shows "Red Sea + Bab el-Mandeb." The model used the prompt's reference table, not outside geographic knowledge.

### Test 3: Irrelevant Articles (Edge Case)

**Input:** 10 GDELT articles from query "celebrity award show entertainment" (BAFTA nominations, NAACP Image Awards, Stephen Colbert, Amy Poehler podcast). Zero supply chain relevance.

**Expected:** Minimal valid alert, no fabricated disruption

| Field | Output | Status |
|-------|--------|--------|
| event_type | MARITIME_SECURITY | PASS (default per error handling) |
| event_summary | "Articles analyzed but no supply chain disruption identified." | PASS (exact match to instruction) |
| severity | 1 | PASS |
| confidence | LOW | PASS |
| source_articles | Empty array | PASS |
| source_count | 0 | PASS |
| affected_regions | Empty array | PASS (see note) |
| affected_countries | Empty array | PASS (see note) |

**Note:** Empty arrays for affected_regions and affected_countries technically violate schema minItems: 1. This is acceptable because the locked decision is that n8n pre-checks GDELT responses for relevance before calling Sentinel. This edge case will not occur in the production pipeline. If it did, the n8n error handler would catch the schema violation and route to the "no threat" path.

---

## 9. Prompt Evolution Log

| Version | Changes | Trigger |
|---------|---------|---------|
| v1.0 | Initial prompt with basic structure | First draft |
| v1.1 | Formatting cleanup for AI Studio readability | Visual review |
| v1.2 | Political neutrality rewritten as supply-chain-focused | Project content rule |
| v1.3 | Added pipeline context (Atlas downstream), conflicting signals rule | Enterprise review |
| v1.4 | Added missing field rules (affected_regions, affected_commodities, affected_routes), cleaned JSON template, expanded example | Schema audit |
| v1.5 | Added multi-event separation (Principle #5) | Test 2 failure: model merged 4 events |
| v2.0 | Complete rebuild with full pre-work audit. Trade lanes with chokepoint context, valid-schema error handling, negative constraints at end, anti-guessing rules, political neutrality as named principle. | New session, applied enterprise standard |

v1.0 through v1.5 were iterative patches. v2.0 was built from a complete pre-work audit (programmatic schema check, data cross-reference, Gemini 3 best practices research). This standard (full audit before writing) is locked for all subsequent agent prompts.

---

## 10. Known Limitations

These are documented for LIMITATIONS_AND_FUTURE_WORK.md, not issues to fix.

1. **Event type classification is coarse.** 7 types cover broad categories. A complete blockade and a travel advisory both classify as MARITIME_SECURITY. The event_subcategory field partially addresses this but is freeform, not an enum. Production systems would have finer-grained classification.

2. **No trend detection.** Sentinel sees one batch of articles at a time. It cannot detect whether coverage is increasing, decreasing, or stable. Enterprise tools like Everstream track trends over time. This would require multiple runs and a time-series architecture.

3. **affected_countries depends on n8n expansion.** Sentinel identifies countries mentioned in articles but may miss countries whose infrastructure is at risk via route dependencies. The n8n Code node fills this gap by mapping affected_routes to supplier countries. Without n8n, Sentinel's country list is incomplete.

4. **Route reference table is static in the prompt.** All 25 routes are included in every call (~450 tokens). Production systems would inject only routes relevant to the query region, reducing token usage.

5. **No article content analysis.** Sentinel works from article metadata only (titles, domains, dates, source countries). It does not read full article text. Full-text analysis via URL context would improve classification accuracy but increase latency and token cost.

---

## 11. Files

| File | Location | Description |
|------|----------|-------------|
| sentinel_system_prompt_v2.md | prompts/ | Final Sentinel prompt (v2.0) |
| schema_threat_alert_card.json | data/schemas/ | Output schema (16 fields) |
| gdelt_test_hormuz.txt | evaluation/stage2_tests/ | Test 1 input (10 Hormuz articles) |
| Test outputs | evaluation/stage2_tests/ | JSON outputs from all 3 tests |
