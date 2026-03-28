# Data Sources

## Overview

RESILIX is built on open source data from publicly available databases and industry frameworks. This document describes every data source, how it was obtained, and its license.

## Open Source Data

### 1. Open Supply Hub

- **URL:** https://opensupplyhub.org
- **What:** 500 real production facilities across 17 countries and 6 sectors, with facility names, addresses, countries, coordinates, sectors, product types, and worker counts
- **How obtained:** Free account registration, search by sector and country, CSV download
- **License:** Open data, free to use, share, and build upon
- **Coverage:** Electronics (China, Vietnam, Taiwan, South Korea, USA), Apparel (Bangladesh, India, Thailand, Turkey, Egypt, Italy), Automotive (Germany, Japan), Energy (UAE, Saudi Arabia, Qatar), Food and Beverage (Brazil)

### 2. GDELT Project (DOC 2.0 API)

- **URL:** https://api.gdeltproject.org
- **What:** Real-time global news monitoring covering article titles, URLs, publication dates, source domains, and source countries
- **How obtained:** Direct API calls. No account or API key required.
- **License:** Free and open for any use
- **Note:** The API searches the last 3 months of global news coverage by default. It returns article metadata, not full article text.

### 3. DataCo Smart Supply Chain Dataset

- **URL:** https://doi.org/10.17632/8gx2fvg2k6.3
- **What:** 180,000+ supply chain order records with product categories, pricing, shipping modes, and geographic distribution
- **How obtained:** Downloaded from Kaggle
- **License:** CC BY 4.0
- **Attribution:** Fabian Constante (2019). DataCo SMART SUPPLY CHAIN FOR BIG DATA ANALYSIS [Dataset]. Licensed under CC BY 4.0.
- **How used:** Product categories, unit pricing patterns, and shipping mode distributions were used as reference for data modeling. The raw dataset was not loaded directly into Google Sheets.

### 4. Maritime Chokepoint Data

- **Sources:** IMF PortWatch, UNCTAD Review of Maritime Transport, Visual Capitalist, Port Economics Management (Notteboom et al. 2026), SAFETY4SEA
- **What:** 7 global maritime chokepoints with coordinates, traffic volumes, transit times, and risk profiles
- **How obtained:** Compiled from publicly available sources
- **License:** Public knowledge

### 5. Industry Frameworks

Playbook templates are informed by published standards:

- NIST Cybersecurity Framework (CSF) and NIST SP 800-34
- ISO 22301 Business Continuity Management
- ISO 27001 Information Security
- ISO 28000 and ISO 28001 Supply Chain Security
- FEMA Emergency Management Framework
- BIMCO Maritime Security Clauses
- IMO Maritime Safety Guidelines
- UKMTO Reporting Protocols
- WTO Trade Policy Review Guidelines
- CISA Supply Chain Risk Management Guidelines
- IPC Supply Chain Guidelines
- SEMI Semiconductor Supply Chain Standards

## Business Enrichment Fields

The following fields represent internal operational data that organizations do not make public. These are modeled on established supply chain management patterns from published research and industry benchmarks.

| Field | What It Represents | How It Was Modeled |
|-------|-------------------|-------------------|
| tier | Supply chain tier classification | TIER_1 (40%), TIER_2 (40%), TIER_3 (20%). Larger facilities weighted toward TIER_1. |
| dependency_level | Sourcing concentration | CRITICAL (10%), HIGH (25%), MEDIUM (45%), LOW (20%). Electronics in concentrated regions have higher single-source rates. |
| backup_supplier_id | Alternative sourcing option | Assigned from same sector in a different country. 20% have no backup, reflecting real single-source risk patterns. |
| annual_spend_usd | Procurement value | Follows Pareto distribution. Range of $50K to $8.5M. Sector-adjusted. |
| lead_time_days | Standard delivery time | Based on shipping distance. Range of 5 to 64 days. |
| inventory_buffer_days | Safety stock runway | Higher values assigned to CRITICAL dependencies. Range of 7 to 60 days. |
| risk_score | Composite risk indicator | Formula: (dependency weight x 40%) + (lead time weight x 30%) + (region volatility x 30%). Scale of 1 to 100. |
| last_audit_date | Compliance audit date | Within the last 18 months. 10% are overdue (older than 12 months). |
| contract_expiry | Contract end date | Within the next 6 to 18 months. 15% expire within 90 days. |

## Data Integrity Rules

1. Every supplier_id referenced in the Products tab exists in the Suppliers tab. No orphaned references.
2. Every shipping_route_id referenced in the Products tab exists in the Shipping Routes tab. No orphaned references.
3. Every backup_supplier_id points to a real supplier in a different country within the same sector, or is set to NONE.
4. No supplier references itself as a backup.
5. Every supplier has at least one product mapped to it. 100% referential coverage.
6. No required fields are blank. All use NONE where data is unavailable.
7. All dates follow ISO 8601 format (YYYY-MM-DD).
8. All currency values are in USD.
9. All coordinates use decimal degrees in the WGS 84 standard and fall within their country's geographic bounds.
10. All city names are validated against known city names per country.

## Google Sheet Structure

Sheet name: RESILIX_Data

| Tab | Rows | Columns | Description |
|-----|------|---------|-------------|
| suppliers | 500 | 20 | Production facilities with operational fields |
| shipping_routes | 25 | 18 | Maritime chokepoints and trade lanes |
| products | 500 | 15 | Product catalog mapped to suppliers and routes |
| crisis_log | 50 | 12 | Historical crisis events from GDELT |
| playbook_templates | 7 | 16 | Response templates per crisis type |
| execution_log | 0+ | 12 | Runtime audit trail, fills during execution |
| error_log | 0+ | 9 | Error tracking, fills during execution |

## JSON Schemas

Three schemas define the data contracts between agents. These are used by n8n Code nodes to validate agent output before handoff to the next stage.

| Schema | Agent | Fields |
|--------|-------|--------|
| [threat_alert_card.json](schemas/threat_alert_card.json) | Sentinel | 16 fields, 9 required |
| [risk_exposure_report.json](schemas/risk_exposure_report.json) | Atlas | 14 top-level + 14 per supplier + 9 per route |
| [crisis_playbook.json](schemas/crisis_playbook.json) | Strategist | 11 fields, 10 required |
