# Data Sources

## Overview

RESILIX uses a combination of real open data and synthetic business enrichment to simulate an enterprise supply chain environment. This document explains every data source, how it was obtained, its license, and what was generated synthetically.

## Real and Public Data (about 75%)

### 1. Open Supply Hub

- **URL:** https://opensupplyhub.org
- **What:** 400+ real production facilities worldwide with names, addresses, countries, coordinates, and sectors
- **How obtained:** Free account registration, search by sector and country, CSV download
- **License:** Open data, free to use, share, and build upon
- **Fields used:** facility name, address, country, latitude, longitude, sector, product type, facility type, number of workers

### 2. GDELT Project (DOC 2.0 API)

- **URL:** https://api.gdeltproject.org
- **What:** Real-time global news monitoring covering article titles, URLs, publication dates, source domains, and source countries
- **How obtained:** Direct API calls. No account or API key required.
- **License:** Free and open for any use
- **Fields used:** url, title, seendate, domain, language, sourcecountry
- **Note:** The API searches the last 3 months of global news coverage by default. It returns article metadata, not full article text.

### 3. DataCo Smart Supply Chain Dataset

- **URL:** https://doi.org/10.17632/8gx2fvg2k6.3
- **What:** 180,000+ supply chain order records with product categories, pricing, shipping modes, and geographic distribution
- **How obtained:** Downloaded from Kaggle
- **License:** CC BY 4.0, free to use with attribution
- **Attribution:** Fabian Constante (2019). DataCo SMART SUPPLY CHAIN FOR BIG DATA ANALYSIS [Dataset]. Licensed under CC BY 4.0.
- **How used:** Product categories, unit pricing patterns, country distribution, and shipping mode patterns were used as reference for realistic synthetic data generation. The raw dataset was not loaded directly into Google Sheets.

### 4. Maritime Chokepoint Data

- **Sources:** IMF PortWatch, UNCTAD Review of Maritime Transport, Visual Capitalist, Port Economics Management (Notteboom et al. 2026), Wikipedia, SAFETY4SEA
- **What:** 7 global maritime chokepoints with coordinates, traffic volumes, transit times, and risk profiles
- **How obtained:** Manually compiled from publicly available sources
- **License:** Public knowledge, all data points published across multiple sources
- **Fields used:** chokepoint name, coordinates, daily/annual vessel traffic, key commodities, current disruption status

## Synthetic Business Enrichment (about 25%)

The following fields are generated synthetically because this data is proprietary in real enterprises. No company publishes their internal tier mapping, dependency levels, supplier spend, or inventory buffers.

### Synthetic Fields in the Suppliers Tab

| Field | Why It Is Synthetic | How It Was Made Realistic |
|-------|--------------------|-----------------------|
| tier | No company publishes tiering | TIER_1 (40%), TIER_2 (40%), TIER_3 (20%). Larger facilities are more likely TIER_1. |
| dependency_level | Proprietary procurement data | CRITICAL (10%), HIGH (25%), MEDIUM (45%), LOW (20%). Electronics in China have higher single-source risk. |
| backup_supplier_id | Not publicly available | Assigned from same sector in a different country. 20% have NONE, reflecting realistic single-source risk. |
| annual_spend_usd | Confidential financial data | Range of $50K to $10M. Follows Pareto distribution where 20% of suppliers account for 80% of spend. |
| lead_time_days | Varies by contract | Range of 15 to 90 days. Based on distance: China to US is 45 to 60 days, Mexico to US is 15 to 25 days. |
| inventory_buffer_days | Internal operations data | Range of 7 to 60 days. Higher values assigned to CRITICAL dependencies. |
| risk_score | Calculated, not published | Formula: (dependency weight x 40%) + (lead time weight x 30%) + (region volatility x 30%). Scale of 1 to 100. |
| last_audit_date | Internal compliance data | Random date within the last 18 months. 10% are marked as overdue (older than 12 months). |
| contract_expiry | Confidential | Random date within the next 6 to 18 months. 15% expire within 90 days to create urgency in crisis scenarios. |

### Synthetic Fields in the Products Tab

| Field | Why It Is Synthetic | How It Was Made Realistic |
|-------|--------------------|-----------------------|
| product_id | Internal SKU system | Sequential format: PRD-XXXX |
| supplier and route mapping | Supply chain mapping is confidential | Logically mapped. Electronics products connect to China/Taiwan suppliers on Malacca/Suez routes. |
| unit_cost_usd | Pricing is confidential | Based on DataCo pricing patterns grouped by category |
| annual_units and revenue | Volume is confidential | Derived from cost multiplied by a realistic margin of 1.3x to 2.5x |
| current_inventory_units | Operational data | Derived from daily usage multiplied by buffer days |
| criticality | Business judgment | HIGH (20%), MEDIUM (50%), LOW (30%) |
| substitutable | Product-specific knowledge | YES (40%), NO (60%). Specialized products are more likely NO. |

### Playbook Templates

The crisis response templates are original but based on real industry frameworks:

- NIST Cybersecurity Framework (for cyber attack response)
- ISO 22301 Business Continuity (for natural disaster recovery)
- FEMA Emergency Management (for disaster response procedures)
- BIMCO and IMO Guidelines (for maritime security)
- Supply chain management literature (for tariff response and port disruption)

## Data Integrity Rules

1. Every supplier_id referenced in the Products tab exists in the Suppliers tab. No orphaned references.
2. Every shipping_route_id referenced in the Products tab exists in the Shipping_Routes tab. No orphaned references.
3. Every source_url in the Crisis_Log tab resolves to a real article, verified at the time of entry.
4. No required fields are left blank. All use N/A or NONE where data is unavailable.
5. All dates follow ISO 8601 format (YYYY-MM-DD).
6. All currency values are in USD.
7. All coordinates use decimal degrees in the WGS 84 standard.

## Google Sheet Structure

Sheet name: RESILIX_Data

| Tab | Rows | Columns | Description |
|-----|------|---------|-------------|
| suppliers | 500 | 20 | Master supplier and facility database |
| shipping_routes | 25 | 14 | Maritime chokepoints and trade lanes |
| products | 200 | 14 | Product catalog mapped to suppliers and routes |
| crisis_log | 50 | 11 | Historical crisis events from GDELT |
| playbook_templates | 7 | 7 | Response templates for each crisis type |
| execution_log | 0+ | 12 | Runtime audit trail, fills during execution |
| error_log | 0+ | 9 | Error tracking, fills during execution |

Total: approximately 782 rows, 87 unique columns, and 14,000 cells.
