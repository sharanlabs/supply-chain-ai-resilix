> **Superseded — 2026-06-12.** This documents the predecessor system (RESILIX v1 / LaunchOps). The current product is **RESILIX ActionOps**; see README.md and docs/Success_Criteria.md at the repo root. Retained for history — not current.

# RESILIX Enterprise Scaling

**Version:** 1.0
**Last Updated:** 2026-03-29

This document maps the path from working prototype to production deployment.

---

## Current State vs Production Requirements

| Component | Prototype | Production |
|-----------|-----------|------------|
| Data layer | Google Sheets (500 rows) | PostgreSQL or Snowflake (50,000+ rows) |
| Orchestration | n8n Cloud trial (14 days, 1,000 executions) | Self-hosted n8n on Kubernetes (unlimited) |
| AI model | Gemini 3.1 Pro via API | Multi-model with failover (Gemini, Claude, GPT) |
| Trigger | Manual (click to run) | Scheduled (every 6 hours) + webhook for urgent events |
| Authentication | None | OAuth 2.0 + RBAC |
| Monitoring | Google Sheets log | Prometheus + Grafana + PagerDuty alerts |
| Human approval | Post-execution review | In-workflow pause via n8n Wait node or webhook |
| Supplier data | Static CSV import | Live sync with ERP (SAP, Oracle) |
| Dashboard | Google Looker Studio | Embedded analytics (Looker, Metabase, or custom) |
| Cost per run | $0.15-$0.30 | $0.10-$0.20 (context caching reduces repeat costs) |

---

## Migration Path

### Phase 1: Infrastructure (Weeks 1-4)

**Database migration.** Move from Google Sheets to PostgreSQL on a managed service (AWS RDS, Google Cloud SQL, or Supabase).

Why PostgreSQL: indexing on supplier_id and country for fast filtering, ACID transactions for concurrent writes, JSON column support for storing pipeline outputs, proven at scale with millions of rows.

Migration steps:
1. Export all Google Sheets as CSV
2. Create PostgreSQL schema matching the data dictionary
3. Import CSVs with data validation
4. Update n8n nodes from Google Sheets to PostgreSQL
5. Verify all queries return identical results

**n8n self-hosting.** Deploy n8n on Kubernetes using the official Helm chart.

Why Kubernetes: horizontal scaling (add workers for parallel pipeline runs), automatic restarts on failure, resource limits per workflow, integration with secret managers (HashiCorp Vault, AWS Secrets Manager).

Deployment:
1. Provision a Kubernetes cluster (EKS, GKE, or self-managed)
2. Deploy n8n via Helm chart with PostgreSQL as the backend database
3. Configure queue mode for handling multiple simultaneous pipeline runs
4. Set up persistent volumes for workflow data
5. Import exported workflow JSON from the prototype

### Phase 2: Security and Operations (Weeks 4-8)

**Authentication.** Add OAuth 2.0 for API access and SSO (SAML/LDAP) for the n8n dashboard. n8n Enterprise supports both natively.

**Role-based access control.** Define roles: Analyst (view outputs), Operator (trigger runs), Admin (modify workflows). n8n Enterprise provides project-based RBAC.

**Monitoring.** Deploy Prometheus to collect n8n execution metrics. Build Grafana dashboards for pipeline health, success rate, latency, and cost. Configure PagerDuty alerts for pipeline failures, hallucination detections, and API errors.

**Secret management.** Migrate API keys from n8n's built-in credential store to HashiCorp Vault or AWS Secrets Manager. Rotate keys on a schedule.

### Phase 3: Data Integration (Weeks 8-16)

**ERP integration.** Connect supplier data to the organization's ERP system (SAP, Oracle, Microsoft Dynamics) via API or database replication. This replaces the static CSV import with live data that updates when suppliers change.

**Expanded supplier coverage.** Scale from 500 to 5,000+ suppliers. Add Tier 2 supplier visibility by incorporating sub-supplier relationships.

**Many-to-many relationships.** Replace the 1:1 supplier-product mapping with a junction table supporting multiple suppliers per product and multiple products per supplier. Update the pre-filtering logic to handle this correctly.

**GDELT integration hardening.** Implement robust error handling for GDELT API rate limits (1 request per 5 seconds), add retry logic with exponential backoff, and consider caching recent query results to avoid redundant calls.

### Phase 4: Intelligence Enhancement (Weeks 16-24)

**Multi-model support.** Abstract the model layer behind a common interface. Support Gemini 3.1 Pro as primary, Claude Sonnet as fallback, GPT-4o as secondary fallback. If one provider has an outage, the pipeline automatically switches.

**Google Search grounding for Strategist.** Enable real-time web search for freight rate lookups, breaking news context, and regulatory updates. This requires careful prompt modification to separate grounded (external) from data-backed (internal) recommendations.

**Trend detection.** Store Sentinel outputs over time. Build a trend analysis module that tracks whether media coverage of a crisis is increasing (escalating), stable (sustained), or decreasing (resolving). Alert when coverage acceleration exceeds a threshold.

**Quantitative financial modeling.** Replace the qualitative best/worst/most_likely narrative with Monte Carlo simulations that produce probability distributions for revenue impact.

---

## Cost Projections at Scale

| Scale | Runs/Day | Monthly Cost (Gemini) | Infrastructure | Total |
|-------|----------|----------------------|----------------|-------|
| Prototype | 2-3 | $10-$20 | $0 (trial) | $10-$20 |
| Small team | 10 | $50-$100 | $50-$100 (VPS) | $100-$200 |
| Department | 50 | $250-$500 | $200-$400 (K8s) | $450-$900 |
| Enterprise | 200+ | $1,000-$2,000 | $500-$1,000 (K8s) | $1,500-$3,000 |

Context caching (available on Gemini 3.1 Pro at $0.20/M tokens) reduces costs by 75-90% for repeated supplier data in the system instruction. At enterprise scale, this is the single largest cost optimization.

---

## What Does Not Change

The core architecture remains the same at any scale:
- Sequential pipeline (Sentinel, Atlas, Strategist)
- JSON schema contracts between agents
- 5-layer hallucination mitigation
- Confidence scoring on every recommendation
- Human approval gates between stages

The scaling path changes the infrastructure around this core, not the core itself. The prompts, schemas, and validation logic transfer directly from prototype to production.
