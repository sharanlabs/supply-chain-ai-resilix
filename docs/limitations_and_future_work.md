> **Superseded — 2026-06-12.** This documents the predecessor system (RESILIX v1 / LaunchOps). The current product is **RESILIX ActionOps**; see README.md and docs/Success_Criteria.md at the repo root. Retained for history — not current.

# RESILIX Limitations and Future Work

**Version:** 1.0
**Last Updated:** 2026-03-29

---

## What RESILIX Is

RESILIX is a working prototype demonstrating that a multi-agent AI system can detect supply chain crises from real news data, assess supplier exposure against a real database, and generate structured response playbooks. It proves the concept works end-to-end with enterprise-grade patterns: data grounding, structured contracts, hallucination mitigation, confidence scoring, and human oversight.

## What RESILIX Is Not

RESILIX is not a production deployment. It runs on a trial orchestration platform with a 500-supplier dataset stored in a spreadsheet. It does not process real-time data continuously, does not integrate with procurement systems, and does not have authentication, monitoring, or automated alerting. The gap between this prototype and a production system is documented here honestly.

---

## Data Limitations

**Supplier scope.** 500 facilities across 17 countries and 6 sectors. Enterprise supply chain platforms like Resilinc track 50,000+ suppliers across 100+ countries. RESILIX demonstrates the pattern; production would require a much larger database with more granular geographic coverage.

**1:1 supplier-product mapping.** Each supplier maps to exactly one product and vice versa. Real supply chains have many-to-many relationships: one supplier provides components to multiple products, and one product sources from multiple suppliers. This simplification was necessary for referential integrity with 500 rows but limits the realism of impact cascading.

**Tier 1 only.** RESILIX tracks direct (Tier 1) suppliers. It does not model Tier 2+ upstream dependencies. A Tier 1 supplier may source raw materials from sub-suppliers in affected regions, creating hidden exposure that RESILIX cannot detect.

**Static data.** Supplier data, product mappings, and route information are snapshots. They do not update automatically. In production, these would sync with ERP systems and procurement databases.

**Business enrichment fields.** Approximately 25% of the data (tiering, dependency levels, spend, lead times, inventory buffers, risk scores) follows realistic distributions modeled on published supply chain research but does not come from a real organization's internal systems. These fields represent data that no company makes public.

---

## Model Limitations

**Single model dependency.** All three agents run on Gemini 3.1 Pro. If this model is deprecated (as Gemini 3 Pro was on March 9, 2026), the entire pipeline requires migration. Production systems would abstract the model layer to support multiple providers.

**No fine-tuning.** The agents use zero-shot and few-shot prompting. Fine-tuning on historical supply chain crisis data could improve classification accuracy and recommendation quality, but requires training data that is difficult to obtain.

**Thinking token costs are opaque.** Gemini 3's thinking tokens are billed at output rates but the exact count is not fully controllable. A HIGH thinking call might generate 2,000 or 5,000 thinking tokens depending on input complexity, making cost prediction imprecise.

**No trend detection.** Sentinel sees one batch of articles at a time. It cannot detect whether media coverage is increasing, decreasing, or stable over time. Enterprise tools track sentiment trends and alert velocity.

---

## Infrastructure Limitations

**Google Sheets as data layer.** Sheets has row limits (10 million cells), no indexing, no transactions, and no concurrent write safety. It works for 500 rows but would fail at enterprise scale.

**n8n Cloud trial.** The 14-day trial with 1,000 executions is sufficient for building and testing but not for sustained operation. The trial workspace is deleted after expiry.

**No authentication.** The pipeline has no access control. Anyone with the n8n workspace URL could trigger or view executions.

**No monitoring or alerting.** The pipeline logs results to Google Sheets but does not send alerts when failures occur. Production systems would integrate with PagerDuty, Slack, or email for real-time notifications.

**No CI/CD.** Workflow changes are made directly in the n8n editor. There is no version control for the workflow itself (n8n workflow JSON can be exported but is not automatically tracked in Git).

---

## Analytical Limitations

**Financial projections are qualitative.** The executive briefing describes best/worst/most likely scenarios in narrative form, not quantitative models. Production systems would use Monte Carlo simulations or scenario-based financial modeling.

**No competitor analysis.** RESILIX does not model how competitor supply chains are affected by the same crisis, which influences pricing power and market response.

**No demand-side modeling.** Revenue exposure is calculated from annual figures and does not account for seasonal demand patterns, customer concentration, or order pipeline.

**Single-crisis assumption.** Each pipeline run handles one crisis. Compound crises (e.g., a natural disaster during a trade war) are processed as separate events without modeling interaction effects.

---

## Future Work

**Near-term (production migration):**
- Migrate data layer from Google Sheets to PostgreSQL or Snowflake
- Self-host n8n on Kubernetes for unlimited executions and persistent operation
- Add OAuth authentication and role-based access control
- Implement automated monitoring with alerting via Slack or email
- Add schedule-based triggering (run every 6 hours automatically)

**Medium-term (capability expansion):**
- Expand to 5,000+ suppliers with Tier 2 visibility
- Add many-to-many supplier-product relationships
- Enable Google Search grounding for Strategist to incorporate real-time freight rates and breaking news
- Build trend detection across multiple Sentinel runs using time-series analysis
- Add financial modeling (Monte Carlo) for quantitative impact projections

**Long-term (platform features):**
- Multi-model support (Gemini, Claude, GPT) with automatic failover
- Fine-tuned classification model trained on historical crisis data
- Interactive dashboard with drill-down from executive summary to supplier detail
- API endpoint for integration with ERP and procurement systems
- Automated playbook tracking (which actions were completed, which are pending)
