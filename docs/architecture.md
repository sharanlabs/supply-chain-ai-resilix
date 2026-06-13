> **Stale — predecessor content; scheduled for rewrite in Phase 7 (Strategist + Dispatcher).** This still describes the LaunchOps / RESILIX-v1 system. The ActionOps target is defined in PLAN.md (repo root). Do not treat as current until rewritten.

# RESILIX Architecture

**Version:** 1.0
**Last Updated:** 2026-03-29

---

## System Overview

RESILIX is a sequential three-agent pipeline orchestrated by n8n Cloud. Each agent receives structured input, processes it through Gemini 3.1 Pro, and produces structured output validated before handoff to the next stage. No agent operates independently or in parallel.

```
                          RESILIX Pipeline Architecture

  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
  │  GDELT API  │────>│  SENTINEL   │────>│    ATLAS    │────>│ STRATEGIST  │
  │  (News)     │     │  (Classify) │     │  (Assess)   │     │  (Respond)  │
  └─────────────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
                             │                   │                   │
                        Threat Alert        Risk Exposure       Crisis Playbook
                           Card                Report
                             │                   │                   │
                      ┌──────┴──────┐     ┌──────┴──────┐     ┌──────┴──────┐
                      │  Validate   │     │  Validate   │     │  Validate   │
                      │  + Approve  │     │  + Approve  │     │  + Approve  │
                      └─────────────┘     └─────────────┘     └─────────────┘
```

## Pipeline Flow (15 Nodes)

### Phase 1: Data Ingestion
1. **Manual Trigger** starts the pipeline (Schedule Trigger in production)
2. **HTTP Request (GDELT)** queries the GDELT DOC 2.0 API for news articles matching a crisis query
3. **IF Node** checks whether articles were returned. Empty results log to Error_Log and stop.

### Phase 2: Threat Detection (Sentinel)
4. **HTTP Request (Gemini API)** sends articles to Gemini 3.1 Pro with the Sentinel system prompt. Thinking level: LOW. Structured output enforced via response_json_schema.
5. **Code Node (Validate Sentinel)** parses JSON, checks required fields, validates event_type enum and severity range
6. **IF Node (Severity Gate)** checks severity >= 3. Low-severity events are logged but do not trigger full analysis.

### Phase 3: Impact Assessment (Atlas)
7. **Google Sheets (Read)** pulls Suppliers, Products, and Routes data
8. **Code Node (Pre-Filter)** applies dual filtering mode based on event_type. Route-first for maritime crises, country-first for production crises, merged for geopolitical. Pre-calculates all financial aggregates.
9. **HTTP Request (Gemini API)** sends filtered data to Gemini 3.1 Pro with the Atlas system prompt. Thinking level: MEDIUM.
10. **Code Node (Validate Atlas)** cross-checks every supplier_id against the filtered database. Verifies revenue figures match pre-calculated values.

### Phase 4: Response Generation (Strategist)
11. **Code Node (Template Match)** maps crisis_type to the correct playbook template (1:1 mapping, 7 types to 7 templates)
12. **HTTP Request (Gemini API)** sends Atlas report + matched template to Gemini 3.1 Pro with the Strategist system prompt. Thinking level: HIGH.
13. **Code Node (Validate Strategist)** checks all three action tiers present, confidence tags on every action, limitations section exists, financial figures match Atlas input.

### Phase 5: Logging
14. **Google Sheets (Execution_Log)** records pipeline results: timing, token usage, cost, status per agent
15. **Google Sheets (Error_Log)** captures any validation failures with error codes and context

## Data Flow Between Agents

Each agent communicates through a JSON schema that serves as a data contract.

| Contract | From | To | Schema File | Key Fields |
|----------|------|-----|-------------|------------|
| Threat Alert Card | Sentinel | n8n + Atlas | schema_threat_alert_card.json | event_type, severity, affected_countries, affected_routes, affected_sectors |
| Risk Exposure Report | Atlas | Strategist | schema_risk_exposure_report.json | affected_suppliers[], route_disruptions[], estimated_revenue_exposure, concentration_risk_summary |
| Crisis Playbook | Strategist | End User | schema_crisis_playbook.json | immediate_actions[], short_term_actions[], strategic_actions[], executive_briefing, limitations |

## API Configuration

All three agents use the same Gemini API endpoint with different configurations:

| Parameter | Sentinel | Atlas | Strategist |
|-----------|----------|-------|------------|
| Model | gemini-3.1-pro-preview | gemini-3.1-pro-preview | gemini-3.1-pro-preview |
| Thinking Level | LOW | MEDIUM | HIGH |
| Temperature | 1.0 | 1.0 | 1.0 |
| Max Output Tokens | 65,536 | 65,536 | 65,536 |
| Structured Output | Yes (response_json_schema) | Yes | Yes |
| Google Search Grounding | OFF | OFF | OFF |
| Estimated Cost/Call | $0.03-$0.05 | $0.05-$0.10 | $0.08-$0.15 |

## Data Layer

Google Sheets serves as the data layer for this prototype. Six sheets in one workbook:

| Sheet | Rows | Purpose | Read By |
|-------|------|---------|---------|
| Suppliers | 500 | Supplier facilities with operational fields | n8n Code node (Atlas pre-filter) |
| Products | 500 | Products mapped to suppliers and routes | n8n Code node (Atlas pre-filter) |
| Shipping_Routes | 25 | Chokepoints and trade lanes | n8n Code node (Atlas pre-filter) |
| Crisis_Log | 50 | Historical events with GDELT query URLs | Reference only |
| Playbook_Templates | 7 | Response frameworks per crisis type | n8n Code node (Strategist template match) |
| Execution_Log | Dynamic | Pipeline run records | n8n logging node |

## Security Model

- API keys stored as n8n credentials, never hardcoded in workflow JSON
- Google Sheets accessed via OAuth (n8n Google Sheets node handles authentication)
- No sensitive data in the repository (all credentials in n8n credential store)
- .gitignore excludes any local credential files

## Why Sequential, Not Orchestrator

The pipeline uses a sequential pattern rather than an orchestrator pattern. Each agent runs one at a time, in order, with validation between stages. This was chosen because:

1. Each agent's output is the next agent's input. There is no parallelism possible.
2. Sequential flow is easier to debug. When something fails, you know exactly which stage failed and what its input was.
3. Human approval gates between agents require sequential pause points.
4. The orchestrator pattern adds complexity (state management, retry logic, parallel coordination) without benefit for a three-stage linear pipeline.
