> **Legacy reference — RESILIX v1 / LaunchOps.** Not part of the ActionOps build; retained as historical reference. Current design: README.md and PLAN.md at the repo root.

# RESILIX Decision Log

**Version:** 1.0
**Last Updated:** 2026-03-29

Every significant architectural decision, with rationale and alternatives rejected.

---

## DEC-01: Sequential Pipeline Over Orchestrator Pattern

**Decision:** Three agents run in sequence (Sentinel, Atlas, Strategist), not via an orchestrator.

**Rationale:** Each agent's output is the next agent's input. No parallelism is possible. Sequential flow is simpler to debug, log, and insert human approval gates.

**Rejected:** Orchestrator pattern (LangGraph-style). Adds state management, retry coordination, and parallel-execution complexity without benefit for a linear three-stage pipeline.

---

## DEC-02: Gemini 3.1 Pro for All Agents

**Decision:** All three agents use gemini-3.1-pro-preview. No model switching.

**Rationale:** Testing on one model and deploying on another introduces behavioral differences. Gemini 3.1 Pro supports all required features (structured output, thinking levels, 1M context window) and is within budget ($300 credits).

**Rejected:** Using free-tier Flash models for testing and Pro for production. Also rejected using different models per agent (e.g., Flash for Sentinel, Pro for Strategist). Consistency across the pipeline is more valuable than per-agent cost optimization.

---

## DEC-03: HTTP Request Node Over Chat Model Node in n8n

**Decision:** Call Gemini API via n8n HTTP Request node, not the native Chat Model sub-node.

**Rationale:** The Chat Model sub-node does not expose `thinking_level` or `response_json_schema` parameters (verified via n8n community reports). HTTP Request gives full control over the API request body.

**Rejected:** Native Google Gemini Chat Model sub-node. Also rejected the standalone Google Gemini node's "Message a Model" operation (needs testing in Stage 3 for parameter support).

---

## DEC-04: Dual Filtering Mode for Atlas Pre-Processing

**Decision:** Route-first filtering for maritime crises, country-first for production crises.

**Rationale:** Country-first filtering inflates revenue exposure by up to 467% for route-based disruptions. Verified against actual data: Suez country-first = $1.56B vs route-first = $275M. Maritime disruptions block shipping lanes, not factories. Only products that ship through affected routes should be counted.

**Rejected:** Universal country-first filtering (the simpler approach). Also rejected universal route-first (misses production-site crises like earthquakes and tariffs).

---

## DEC-05: n8n Handles Math, LLM Never Calculates

**Decision:** All financial calculations (revenue sums, averages, counts) are performed by n8n Code nodes. The LLM reports pre-calculated numbers as-is.

**Rationale:** LLMs make arithmetic errors. Deterministic code does not. When Atlas reports "$422M revenue at risk," that number was computed by JavaScript, not estimated by the model.

**Rejected:** Having the LLM calculate aggregates from raw supplier data. This would introduce undetectable math errors and make validation harder.

---

## DEC-06: Temperature 1.0 for All Gemini 3 Calls

**Decision:** Temperature set to 1.0 for every API call.

**Rationale:** Google's Gemini 3 Developer Guide states: "For all Gemini 3 models, we strongly recommend keeping the temperature parameter at its default value of 1.0." Lower values cause output looping and degraded performance. This was initially set to 0.2 and corrected after verification.

**Rejected:** Temperature 0.2 (initially recommended without verification, corrected to 1.0).

---

## DEC-07: Google Search Grounding OFF for All Agents

**Decision:** No agent uses Google Search grounding.

**Rationale:** Each agent works from provided structured data. External search results would inject unverified information, violating hallucination mitigation layers 1 and 2. Search also adds latency and cost ($14/1,000 queries).

**Rejected:** Enabling grounding for Strategist (considered for real-time freight rates). Deferred to future enhancement.

---

## DEC-08: Thinking Levels Matched to Task Complexity

**Decision:** LOW for Sentinel, MEDIUM for Atlas, HIGH for Strategist.

**Rationale:** Sentinel performs classification (pattern matching). Atlas performs data assembly (threshold application). Strategist performs strategic reasoning (multi-scenario analysis, communication drafting). Each level matches the cognitive demand. Google recommends HIGH "for complex tasks that require optimal thinking (e.g. strategic business analysis)."

**Rejected:** HIGH for all agents (wastes tokens on simple tasks). Also rejected MEDIUM for all (under-serves Strategist's complex reasoning needs).

---

## DEC-09: Evaluation Criteria Defined Before Building

**Decision:** SUCCESS_CRITERIA.md written in Stage 0, before any agent was designed.

**Rationale:** Google Cloud's agent evaluation documentation recommends defining measurable success before building. Writing criteria after seeing results introduces confirmation bias.

**Rejected:** Defining success criteria after testing (common but scientifically weak).

---

## DEC-10: Template-First Approach for Strategist

**Decision:** Strategist customizes pre-built playbook templates rather than generating recommendations from scratch.

**Rationale:** Templates sourced from ISO 22301, NIST, FEMA, BIMCO, and IMO provide proven response frameworks. The LLM populates these frameworks with specific data rather than inventing the framework. This reduces hallucination and ensures industry-standard structure.

**Rejected:** Freeform generation ("write a crisis response plan"). Produces generic advice without data specificity.

---

## DEC-11: MIT License

**Decision:** Open source under MIT License.

**Rationale:** Maximum accessibility for portfolio purposes. No restrictive clauses that might concern potential employers reviewing the code.

**Rejected:** Apache 2.0 (unnecessary patent clause for a portfolio project). GPL (too restrictive for demonstration purposes).

---

## DEC-12: Google Sheets as Data Layer

**Decision:** Use Google Sheets for all data storage in the prototype.

**Rationale:** Zero infrastructure cost. Native n8n integration via Google Sheets node. Easy to inspect and modify data during development. Appropriate for 500-row datasets.

**Rejected:** PostgreSQL (requires hosting infrastructure), Supabase (adds unnecessary complexity for a prototype), local CSV files (no API access from n8n Cloud).

---

## DEC-13: n8n Cloud Pro Trial Over Self-Hosted

**Decision:** Use n8n Cloud Pro trial (14 days) rather than self-hosting.

**Rationale:** No Docker setup required (MacBook Air 2020, 8GB RAM). Immediate access to workflow editor. Zero infrastructure management. The 14-day window and 1,000 execution limit are sufficient for building and testing the pipeline.

**Rejected:** Self-hosted n8n via Docker (hardware constraints, setup complexity for someone new to Docker). Also rejected Make.com and Zapier (less flexible for custom code nodes and API control).
