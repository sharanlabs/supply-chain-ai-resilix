> **Stale — predecessor content; scheduled for rewrite in Phase 2.** This still describes the LaunchOps / RESILIX-v1 system. The ActionOps target is defined in PLAN.md (repo root). Do not treat as current until rewritten.

# RESILIX Data Dictionary

**Version:** 1.0
**Last Updated:** 2026-03-29

Every field across all datasets with format, valid values, and source.

---

## Suppliers (500 rows, 20 columns)

| Field | Type | Format | Valid Values | Source |
|-------|------|--------|-------------|--------|
| supplier_id | String | SUP-NNNN | SUP-0001 to SUP-0500 | Generated, sequential |
| supplier_name | String | Free text | Real facility names | Open Supply Hub |
| country | String | Full name | 17 countries (see distribution below) | Open Supply Hub |
| region | String | Free text | Geographic region | Open Supply Hub |
| city | String | Free text | City name | Open Supply Hub |
| latitude | Float | Decimal degrees | -90 to 90 | Open Supply Hub |
| longitude | Float | Decimal degrees | -180 to 180 | Open Supply Hub |
| sector | String | Enum | Electronics, Apparel, Automotive, Energy, Food & Beverage, Consumer Goods | Open Supply Hub (mapped) |
| product_type | String | Free text | Product category | Open Supply Hub |
| facility_type | String | Free text | Factory, warehouse, etc. | Open Supply Hub |
| num_workers | Integer | Whole number | Varies | Open Supply Hub |
| tier | String | Enum | TIER_1, TIER_2, TIER_3 | Business enrichment |
| dependency_level | String | Enum | CRITICAL, HIGH, MEDIUM, LOW | Business enrichment |
| backup_supplier_id | String | SUP-NNNN or NONE | Valid supplier_id or "NONE" | Business enrichment |
| annual_spend_usd | Integer | USD | Varies | Business enrichment |
| lead_time_days | Integer | Days | 7-90 | Business enrichment |
| inventory_buffer_days | Integer | Days | 7-60 | Business enrichment |
| risk_score | Integer | 1-100 | Higher = more risk | Business enrichment |
| last_audit_date | String | YYYY-MM-DD | Past dates | Business enrichment |
| contract_expiry | String | YYYY-MM-DD | Future dates | Business enrichment |

**Country distribution:** China (80), Vietnam (30), United States (30), Germany (30), Japan (30), Brazil (30), India (28), Thailand (28), Egypt (28), Italy (28), Taiwan (25), South Korea (25), Bangladesh (25), Saudi Arabia (25), Turkey (23), UAE (20), Qatar (15).

**Sector distribution:** Electronics (161), Apparel (152), Automotive (78), Energy (56), Food & Beverage (30), Consumer Goods (23).

**Dependency distribution:** MEDIUM (222), HIGH (116), LOW (107), CRITICAL (55).

**Backup availability:** 61 suppliers have NONE (no backup). 439 have a valid backup_supplier_id.

---

## Products (500 rows, 15 columns)

| Field | Type | Format | Valid Values | Source |
|-------|------|--------|-------------|--------|
| product_id | String | PRD-NNNN | PRD-0001 to PRD-0500 | Generated, sequential |
| product_name | String | Free text | Product descriptions | DataCo patterns |
| sector | String | Enum | Same as Suppliers | Mapped from supplier |
| primary_supplier_id | String | SUP-NNNN | Valid supplier_id | Assigned (1:1 mapping) |
| primary_supplier_country | String | Full name | Supplier's country | Derived from supplier |
| shipping_route_id | String | RTE-NNNN | Valid route_id | Assigned |
| unit_cost_usd | Float | USD | Varies | DataCo patterns |
| annual_units | Integer | Whole number | Varies | Business enrichment |
| annual_revenue_usd | Float | USD | unit_cost * annual_units | Calculated |
| current_inventory_units | Integer | Whole number | Varies | Business enrichment |
| inventory_days_remaining | Integer | Days | Varies | Calculated |
| criticality | String | Enum | HIGH, MEDIUM, LOW | Business enrichment |
| substitutable | String | Enum | YES, NO | Business enrichment |
| last_updated | String | YYYY-MM-DD | Recent date | Generated |
| secondary_supplier_id | String | SUP-NNNN or NONE | Valid supplier_id or "NONE" | Business enrichment |

**Criticality distribution:** MEDIUM (250), HIGH (145), LOW (105).

**Route distribution (top 5):** RTE-0009 Shanghai-LA (157), RTE-0018 Istanbul-Genoa (64), RTE-0021 Bangkok-LA (49), RTE-0014 Mumbai-Felixstowe (42), RTE-0016 Jebel Ali-Singapore (33).

**Secondary supplier:** 61 products have NONE. 439 have a valid secondary_supplier_id.

---

## Shipping Routes (25 rows, 18 columns)

| Field | Type | Format | Valid Values | Source |
|-------|------|--------|-------------|--------|
| route_id | String | RTE-NNNN | RTE-0001 to RTE-0025 | Generated |
| route_name | String | Free text | Origin to Destination | Named |
| route_type | String | Enum | CHOKEPOINT, TRADE_LANE | Assigned |
| origin_region | String | Free text | Geographic region | Public data |
| destination_region | String | Free text | Geographic region | Public data |
| chokepoint | String | Free text | Chokepoint name or "Pacific Direct" etc. | UNCTAD, IMF |
| lat | Float | Decimal degrees | Chokepoint latitude | Public data |
| lng | Float | Decimal degrees | Chokepoint longitude | Public data |
| normal_transit_days | Integer | Days | 1-35 | UNCTAD, industry data |
| disrupted_transit_days | Integer | Days | 7-49 | Calculated from historical |
| normal_daily_vessels | Integer | Count | Varies | UNCTAD |
| pct_global_trade | Integer | Percentage | 0-35 | IMF, UNCTAD |
| key_commodities | String | Comma-separated | Oil, LNG, Electronics, etc. | Public data |
| current_status | String | Enum | OPEN, DISRUPTED, BLOCKED, HIGH_RISK, RESTRICTED | Assigned per scenario |
| disruption_scenario | String | SCN-NN | SCN-01 to SCN-07 | Mapped to crisis types |
| cost_increase_pct | Integer | Percentage | 15-80 | Industry estimates |
| alternate_route | String | Free text | Description of alternative | Industry knowledge |
| source | String | Free text | Data source reference | Attribution |

**Route types:** 7 chokepoints (RTE-0001 to RTE-0007), 18 trade lanes (RTE-0008 to RTE-0025).

---

## Crisis Log (50 rows, 12 columns)

| Field | Type | Format | Valid Values | Source |
|-------|------|--------|-------------|--------|
| event_id | String | EVT-NNNN | EVT-0001 to EVT-0050 | Generated |
| event_date | String | YYYY-MM-DD | Historical dates | News sources |
| event_type | String | Enum | 7 crisis types | Classified |
| severity | Integer | 1-5 | Based on impact assessment | Assigned |
| title | String | Free text | Event headline | News/GDELT |
| affected_regions | String | Comma-separated | Geographic regions | News sources |
| affected_routes | String | Comma-separated | RTE-NNNN IDs | Mapped |
| scenario | String | SCN-NN | SCN-01 to SCN-07 | Mapped |
| source_query | String | URL | GDELT API query URL | GDELT |
| source_type | String | Enum | GDELT, Manual | Source classification |
| status | String | Enum | RESOLVED, ACTIVE, MONITORING | Current state |
| source_url | String | URL | Reference article | News source |

---

## Playbook Templates (7 rows, 16 columns)

| Field | Type | Format | Valid Values | Source |
|-------|------|--------|-------------|--------|
| template_id | String | TPL-NN | TPL-01 to TPL-07 | Generated |
| crisis_type | String | Enum | 7 crisis types (1:1 with templates) | Mapped |
| scenario | String | SCN-NN | SCN-01 to SCN-07 | Mapped |
| description | String | Free text | Framework description | Written |
| immediate_actions | String | Pipe-delimited | 6 actions per template | ISO 22301, NIST, FEMA, BIMCO, IMO |
| short_term_actions | String | Pipe-delimited | 6 actions per template | Same frameworks |
| strategic_actions | String | Pipe-delimited | 6 actions per template | Same frameworks |
| comm_template_internal | String | Free text with [placeholders] | Internal message draft | Written |
| comm_template_supplier | String | Free text with [placeholders] | Supplier message draft | Written |
| comm_template_customer | String | Free text with [placeholders] | Customer message draft | Written |
| escalation_criteria | String | Free text | Conditions requiring C-suite escalation | Framework-based |
| source_frameworks | String | Pipe-delimited | Framework names | Attribution |
| last_updated | String | YYYY-MM-DD | Recent date | Maintained |
| severity_threshold | Integer | 1-5 | Minimum severity to trigger template | Assigned |
| estimated_recovery_days | String | Range | "X-Y" format (e.g., "30-180") | Historical patterns |
| responsible_roles | String | Pipe-delimited by tier | Role names per tier | Organizational design |

---

## JSON Schemas (3 files)

| Schema | Fields | Required | Used By |
|--------|--------|----------|---------|
| schema_threat_alert_card.json | 16 | 9 | Sentinel output, Atlas input |
| schema_risk_exposure_report.json | 39 | 8 | Atlas output, Strategist input |
| schema_crisis_playbook.json | 26+ | 10 | Strategist output |

All schemas enforce `additionalProperties: false`. ID fields use regex patterns (SEN-, ATL-, STR- prefixes). Enums restrict classification values to defined sets.

---

## Data Integrity Rules

1. Every product.primary_supplier_id references a valid supplier.supplier_id
2. Every product.shipping_route_id references a valid route.route_id
3. Every supplier.backup_supplier_id is either "NONE" or a valid supplier.supplier_id
4. Every product.secondary_supplier_id is either "NONE" or a valid supplier.supplier_id
5. Every crisis_log.scenario maps to exactly one playbook_template.scenario
6. 1:1 mapping: each supplier has exactly one product, each product has exactly one supplier

---

## Terminology

| Term | Definition |
|------|-----------|
| Business enrichment | Fields representing internal operational data that no organization publishes. Modeled on published supply chain research with realistic distributions. |
| Chokepoint | A narrow maritime passage where shipping traffic is concentrated (e.g., Strait of Hormuz, Suez Canal) |
| Trade lane | A shipping route between two ports that may transit one or more chokepoints |
| Dependency level | How critical a supplier is: CRITICAL (irreplaceable), HIGH (difficult to replace), MEDIUM (replaceable with effort), LOW (easily replaced) |
| Risk score | 1-100 composite score reflecting geographic risk, dependency, financial exposure, and lead time vulnerability |
