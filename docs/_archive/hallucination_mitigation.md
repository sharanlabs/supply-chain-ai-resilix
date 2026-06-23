> **Stale — predecessor content; scheduled for rewrite in Phase 7 (Strategist + Dispatcher, gatekept).** This still describes the LaunchOps / RESILIX-v1 system. The ActionOps target is defined in PLAN.md (repo root). Do not treat as current until rewritten.

# RESILIX Hallucination Mitigation

**Version:** 1.0
**Last Updated:** 2026-03-29

This document describes the five-layer system designed to prevent RESILIX agents from generating fabricated data. Each layer catches a different failure mode. Together, they reduce hallucination risk to measurable levels.

---

## Why Hallucination Mitigation Matters Here

In a supply chain crisis system, a fabricated supplier ID or invented revenue figure does not just produce a wrong answer. It produces a wrong action. If Strategist recommends contacting "SUP-9999" during a crisis and that supplier does not exist, the response team wastes time chasing a phantom while real suppliers go uncontacted. The hallucination mitigation system is not an enhancement. It is a structural requirement.

---

## Layer 1: Data Grounding

**What it does:** Each agent works exclusively from real, structured data. No agent generates information from general knowledge.

| Agent | Data Source | What It Sees |
|-------|-----------|-------------|
| Sentinel | GDELT DOC 2.0 API | Real article titles, URLs, domains, dates, source countries |
| Atlas | Google Sheets (pre-filtered) | Real supplier IDs, names, countries, sectors, revenue, inventory |
| Strategist | Atlas report + playbook template | Pre-calculated numbers from n8n + industry framework from templates |

**What it catches:** Prevents the model from inventing data points by ensuring every input is real and traceable.

**Example:** Sentinel cannot fabricate a source article because every article in its input came from a live GDELT query with a verifiable URL. Atlas cannot invent a supplier because it only sees suppliers that exist in the database after n8n pre-filtering.

---

## Layer 2: Prompt Constraints

**What it does:** Every prompt includes explicit instructions restricting the model to provided data.

Sentinel: "Ground every claim in the provided articles. Use article titles, domains, dates, and source countries as your only evidence."

Atlas: "Report only what the data contains. Do not estimate, calculate, or infer any numbers."

Strategist: "Every number must trace to the Risk Exposure Report. If you need a number not in the report, state 'data not available.'"

**What it catches:** Prevents the model from supplementing provided data with training knowledge. When information is missing, the model says so rather than guessing.

**Example:** If GDELT articles mention a port disruption but do not name which commodities are affected, Sentinel returns an empty affected_commodities array rather than guessing "oil" based on the region.

---

## Layer 3: Output Validation

**What it does:** n8n Code nodes programmatically verify every agent's output before it passes to the next stage.

### Sentinel Validation
- JSON parsing check (catches malformed responses)
- Required field presence check (9 required fields)
- event_type enum validation (7 allowed values)
- severity range check (1-5)

### Atlas Validation
- Every supplier_id cross-checked against the pre-filtered supplier list
- Revenue figure compared against n8n's pre-calculated total (tolerance: $1)
- Route IDs checked against the filtered route list
- no_exposure_detected consistency check (true only when arrays are empty)

### Strategist Validation
- All three action tiers present with minimum items (3, 3, 2)
- Every action has confidence and basis fields
- Limitations section is present and non-empty
- Financial figures in executive_briefing cross-checked against Atlas input

**What it catches:** Fabricated IDs, invented numbers, missing required sections, schema violations. This is the most concrete layer because it uses deterministic code, not prompt instructions.

**Example:** If Atlas outputs supplier_id "SUP-9999" but SUP-9999 is not in the pre-filtered list, the validation node returns error code ATLAS_HALLUCINATED_SUPPLIER and the pipeline routes to error handling.

---

## Layer 4: Confidence Scoring

**What it does:** Every recommendation in the Strategist output is tagged HIGH, MEDIUM, or LOW with a stated basis explaining the evidence.

| Level | Rule | Verifiable? |
|-------|------|------------|
| HIGH | Directly supported by specific data in the report | Yes: check if the cited data point exists |
| MEDIUM | Reasonable inference from data + industry practice | Partially: check data point, assess inference logic |
| LOW | General best practice, not data-specific | Yes: verify the named framework exists |

**What it catches:** Overconfidence. If a recommendation cites "12 single-source dependencies" but the report shows 4, the basis is verifiably wrong. Without confidence tagging, all recommendations look equally trustworthy.

**Example:** A recommendation to "diversify away from Bangladesh concentration (73.4%)" tagged HIGH with basis "concentration_risk_summary.single_country_exposure_pct = 73.4%" is verifiable against the Atlas report. A recommendation to "conduct quarterly risk reviews" tagged LOW with basis "standard practice per ISO 22301" correctly signals it is not data-specific.

---

## Layer 5: Human-in-the-Loop

**What it does:** A human reviews and approves each agent's output before it passes to the next stage.

**⚠ Predecessor description — corrected.** The CURRENT ActionOps system does **not** "review-after-run." Approval is an atomic transaction that gates the mutation **before** it commits (`UPDATE … WHERE approval_status='PENDING' RETURNING`; mutation routes require `APPROVAL_TOKEN`), so an unapproved packet never takes effect. The paragraph below describes the predecessor prototype only.

In the prototype, this is implemented as review-after-run rather than pause-and-wait. The pipeline runs end-to-end with validation checks serving as automated guardrails. The human reviews outputs post-execution. In production, n8n's Wait node or webhook-based approval would pause the pipeline between stages.

**What it catches:** Everything the other four layers miss. Subtle contextual errors, tone issues, recommendations that are technically correct but practically wrong. A machine can verify that SUP-0213 exists. A human can judge whether contacting that supplier at 2 AM during a natural disaster is appropriate.

---

## Layer Interaction

The five layers work as defense in depth. Each catches failures the others miss.

| Failure Type | Caught By |
|-------------|-----------|
| Model invents a source article | Layer 1 (data grounding: only real GDELT articles provided) |
| Model estimates revenue instead of using provided number | Layer 2 (prompt: "do not estimate") + Layer 3 (validation: revenue mismatch check) |
| Model fabricates a supplier ID | Layer 3 (validation: ID cross-check against database) |
| Model marks all recommendations HIGH confidence | Layer 4 (confidence: reviewer checks basis statements) |
| Model produces technically valid but contextually wrong advice | Layer 5 (human: judgment review) |

---

## Measuring Hallucination Rate

Hallucination rate is calculated as: (fabricated data points / total verifiable data points) across all test cases.

A "data point" is any specific claim that can be checked against source data: a supplier ID, a revenue figure, a route name, a country, a source URL, a transit delay number.

Target: under 5% across all 7 crisis scenarios (28+ test cases).
