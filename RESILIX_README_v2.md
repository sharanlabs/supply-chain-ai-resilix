# Supply Chain AI: RESILIX

A multi-agent AI system for supply chain crisis intelligence. RESILIX monitors global events in real time, maps their impact on a supplier network, and generates structured response playbooks.

## The Problem

Supply chain disruptions cost the global economy over $4 trillion per year. Enterprise tools like Everstream, Resilinc, and Z2Data address this, but they cost $50,000 to $500,000 annually. Most organizations have no systematic way to detect a crisis, assess supplier exposure, and generate a response plan in the same workflow.

## What RESILIX Does

RESILIX runs three specialized AI agents in sequence. Each one has a defined job, works with real data, and passes its output to the next agent through a validated handoff.

| Agent | Job | Input | Output |
|-------|-----|-------|--------|
| Sentinel | Threat Detection | Live news articles from GDELT | Threat Alert Card (type, severity, affected regions, countries, sectors) |
| Atlas | Impact Assessment | Threat Alert Card + supplier database | Risk Exposure Report (affected suppliers, revenue at risk, time to impact) |
| Strategist | Response Generation | Risk Exposure Report | Crisis Playbook (immediate, short-term, strategic actions with confidence scoring) |

A human reviews and approves the output between each stage. No agent acts without oversight.

## Architecture

```
GDELT News API
      |
      v
 [ SENTINEL ] ---> Human Approval ---> [ ATLAS ] ---> Human Approval ---> [ STRATEGIST ]
      |                                    |                                     |
  Classifies                          Reads from                           Uses Gemini
  threat from                         Google Sheets                        3.1 Pro with
  real articles                       (suppliers,                          search grounding
                                       routes,
                                       products)

Orchestration:  n8n (visual workflow builder)
Guardrails:     n8n Guardrails node on input and output of each agent
Validation:     n8n Code nodes cross-check all data references
Logging:        Execution log and error log in Google Sheets
```

## Crisis Scenarios

RESILIX handles seven types of supply chain disruption. It is not tied to any single event.

1. Shipping strait closure (e.g. Strait of Hormuz)
2. Semiconductor supply disruption (e.g. Taiwan Strait)
3. Tariff or trade policy change (e.g. cross-border tariff escalation)
4. Port shutdown (e.g. labor strike, congestion)
5. Natural disaster (e.g. earthquake, typhoon)
6. Cyber attack on logistics (e.g. ransomware)
7. Maritime security threat (e.g. Red Sea shipping attacks)

## Data

The system is built on open source data from publicly available databases and frameworks.

| Source | What It Provides | License |
|--------|-----------------|---------|
| [Open Supply Hub](https://opensupplyhub.org) | 500 real production facilities across 17 countries and 6 sectors | Open data |
| [GDELT Project](https://gdeltproject.org) | Real-time global news articles via API | Free and open |
| [DataCo Supply Chain](https://doi.org/10.17632/8gx2fvg2k6.3) | Product categories and pricing patterns | CC BY 4.0 |
| Maritime chokepoint data | 7 global chokepoints from IMF, UNCTAD, and academic sources | Public |
| Industry frameworks | NIST CSF, ISO 22301, FEMA, BIMCO, IMO | Published standards |

Business enrichment fields such as supplier tiering, dependency levels, lead times, and spend follow realistic distributions modeled on published supply chain research. These fields represent internal operational data that organizations do not make public.

Full details: [data/README.md](data/README.md)

### Data Volumes

| Dataset | Rows | Description |
|---------|------|-------------|
| Suppliers | 500 | Real facilities from Open Supply Hub with 20 operational fields |
| Shipping Routes | 25 | 7 chokepoints + 18 trade lanes verified against UNCTAD data |
| Products | 500 | Mapped to suppliers and routes with 100% referential coverage |
| Crisis Log | 50 | Real events sourced from GDELT across all 7 crisis types |
| Playbook Templates | 7 | One per crisis type, based on ISO 22301, NIST, FEMA, BIMCO frameworks |
| JSON Schemas | 3 | Data contracts between agents (Threat Alert Card, Risk Exposure Report, Crisis Playbook) |

## Tech Stack

| Component | Tool |
|-----------|------|
| AI Model | Google Gemini 3.1 Pro |
| Orchestration | n8n Cloud (Pro) |
| Data Layer | Google Sheets |
| News Intelligence | GDELT DOC 2.0 API |
| Supplier Data | Open Supply Hub |
| Dashboard | Google Looker Studio |
| Repository | GitHub |

## Hallucination Mitigation

A five-layer system designed to prevent the agents from generating fabricated data.

1. **Data grounding.** Each agent works from real, structured data. Sentinel reads real GDELT articles. Atlas reads from the supplier database. Strategist receives pre-calculated numbers.
2. **Prompt constraints.** Every prompt includes: "Only reference information from the provided data. If information is not available, respond with DATA NOT AVAILABLE."
3. **Output validation.** n8n Code nodes check every supplier ID against the actual database. JSON schemas are validated. Numbers are range-checked. The LLM never calculates financial figures; n8n does the math.
4. **Confidence scoring.** Every recommendation is tagged HIGH, MEDIUM, or LOW with a stated basis.
5. **Human-in-the-loop.** A human approves each agent's output before it passes to the next stage.

Full details: [docs/HALLUCINATION_MITIGATION.md](docs/HALLUCINATION_MITIGATION.md)

## Documentation

| Document | What It Covers |
|----------|---------------|
| [SUCCESS_CRITERIA.md](docs/SUCCESS_CRITERIA.md) | Pass/fail criteria defined before building |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design and data flow |
| [DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md) | Every field, format, valid value, and source |
| [PROMPT_PATTERNS.md](docs/PROMPT_PATTERNS.md) | Prompt engineering techniques used |
| [HALLUCINATION_MITIGATION.md](docs/HALLUCINATION_MITIGATION.md) | Five-layer prevention architecture |
| [DECISION_LOG.md](docs/DECISION_LOG.md) | Architectural decisions with rationale |
| [EVALUATION_REPORT.md](docs/EVALUATION_REPORT.md) | Test results and quality scores |
| [LIMITATIONS_AND_FUTURE_WORK.md](docs/LIMITATIONS_AND_FUTURE_WORK.md) | What this system is and is not |
| [ENTERPRISE_SCALING.md](docs/ENTERPRISE_SCALING.md) | Production migration path |
| [LESSONS_LEARNED.md](docs/LESSONS_LEARNED.md) | Reflections on the build process |

## Results

These will be updated after evaluation is complete.

| Metric | Target | Actual |
|--------|--------|--------|
| Scenarios tested | 7 of 7 | - |
| Pipeline completion time | Under 5 minutes | - |
| Hallucination rate | Under 5% | - |
| Playbook quality score | 3.5 / 5.0 or higher | - |
| Cost per run | Under $0.50 | - |

## Limitations

This is a working prototype, not a production deployment. Key limitations include:

- Google Sheets as the data layer (production would use PostgreSQL or Snowflake)
- n8n Cloud trial for orchestration (production would use self-hosted n8n on Kubernetes)
- No authentication or access control
- No automated monitoring or alerting
- 500 suppliers in the database (enterprise systems handle 50,000+)

The full production migration path is documented in [ENTERPRISE_SCALING.md](docs/ENTERPRISE_SCALING.md).

## Attribution

- Supplier facility data from [Open Supply Hub](https://opensupplyhub.org)
- News data from [GDELT Project](https://gdeltproject.org)
- Product patterns from: Fabian Constante (2019). DataCo SMART SUPPLY CHAIN FOR BIG DATA ANALYSIS. doi:10.17632/8gx2fvg2k6.3. Licensed under CC BY 4.0.
- Playbook structures informed by NIST CSF, ISO 22301, FEMA, BIMCO, and IMO frameworks

## Author

Built by **Sharan Kumar**.

## License

MIT License. See [LICENSE](LICENSE) for details.
