"""
RESILIX Atlas Test Data Generator
Simulates the n8n Code node pre-filtering logic.
Produces the exact JSON that Atlas will receive as input.

Usage: python3 atlas_test_generator.py
Output: Three JSON files in /home/claude/atlas_test_data/
"""

import csv
import json
import math
from datetime import datetime, timedelta

# --- Load data ---
def load_csv(path):
    with open(path) as f:
        return list(csv.DictReader(f))

suppliers = load_csv('/mnt/project/RESILIX_Suppliers.csv')
products = load_csv('/mnt/project/RESILIX_Products.csv')
routes = load_csv('/mnt/project/RESILIX_Shipping_Routes.csv')

sup_by_id = {s['supplier_id']: s for s in suppliers}
route_by_id = {r['route_id']: r for r in routes}

TODAY = "2026-03-29"

def calculate_impact_date(buffer_days):
    base = datetime.strptime(TODAY, "%Y-%m-%d")
    return (base + timedelta(days=int(buffer_days))).strftime("%Y-%m-%d")

def build_atlas_input(scenario_name, sentinel_card, filtering_mode):
    """
    Core pre-filtering logic. Mirrors what the n8n Code node will do.
    
    filtering_mode: "ROUTE_FIRST" or "COUNTRY_FIRST"
    """
    affected_routes = sentinel_card.get("affected_routes", [])
    affected_countries = sentinel_card.get("affected_countries", [])
    affected_sectors = sentinel_card.get("affected_sectors", [])

    # --- STEP 1: Filter suppliers and products based on mode ---
    if filtering_mode == "ROUTE_FIRST":
        # Products on affected routes -> their suppliers
        filtered_products = [
            p for p in products 
            if p['shipping_route_id'] in affected_routes
        ]
        affected_sup_ids = set(p['primary_supplier_id'] for p in filtered_products)
        filtered_suppliers = [
            s for s in suppliers 
            if s['supplier_id'] in affected_sup_ids
        ]
    elif filtering_mode == "COUNTRY_FIRST":
        # Suppliers in affected countries, optionally filtered by sector
        filtered_suppliers = [
            s for s in suppliers 
            if s['country'] in affected_countries
        ]
        if affected_sectors and "ALL" not in affected_sectors:
            filtered_suppliers = [
                s for s in filtered_suppliers 
                if s['sector'] in affected_sectors
            ]
        affected_sup_ids = set(s['supplier_id'] for s in filtered_suppliers)
        filtered_products = [
            p for p in products 
            if p['primary_supplier_id'] in affected_sup_ids
        ]
    else:
        filtered_suppliers = []
        filtered_products = []

    # --- STEP 2: Get affected routes from filtered products ---
    affected_route_ids = set(p['shipping_route_id'] for p in filtered_products)
    filtered_routes = [r for r in routes if r['route_id'] in affected_route_ids]

    # --- STEP 3: Pre-calculate aggregates ---
    total_revenue = sum(float(p['annual_revenue_usd']) for p in filtered_products)
    
    critical_suppliers = [
        s for s in filtered_suppliers 
        if s['dependency_level'] == 'CRITICAL'
    ]
    single_source = [
        s for s in filtered_suppliers 
        if s['backup_supplier_id'] == 'NONE'
    ]
    
    avg_buffer = 0
    if filtered_suppliers:
        avg_buffer = round(
            sum(int(s['inventory_buffer_days']) for s in filtered_suppliers) 
            / len(filtered_suppliers), 1
        )

    # --- STEP 4: Time to impact ---
    time_to_impact = 0
    if critical_suppliers:
        impacts = [
            int(s['inventory_buffer_days']) - int(s['lead_time_days']) 
            for s in critical_suppliers
        ]
        time_to_impact = max(0, min(impacts)) if impacts else 0

    # --- STEP 5: Concentration risk ---
    concentration = {
        "single_country_exposure_pct": 0,
        "single_supplier_exposure_pct": 0,
        "top_country": "N/A",
        "top_supplier_id": "N/A",
        "risk_level": "LOW"
    }
    
    if total_revenue > 0:
        # Country concentration
        country_rev = {}
        for p in filtered_products:
            c = p['primary_supplier_country']
            country_rev[c] = country_rev.get(c, 0) + float(p['annual_revenue_usd'])
        
        top_country = max(country_rev.items(), key=lambda x: x[1])
        country_pct = round((top_country[1] / total_revenue) * 100, 1)
        
        # Supplier concentration
        sup_rev = {}
        for p in filtered_products:
            sid = p['primary_supplier_id']
            sup_rev[sid] = sup_rev.get(sid, 0) + float(p['annual_revenue_usd'])
        
        top_supplier = max(sup_rev.items(), key=lambda x: x[1])
        supplier_pct = round((top_supplier[1] / total_revenue) * 100, 1)
        
        # Risk level
        if country_pct > 60:
            risk_level = "CRITICAL"
        elif country_pct > 40:
            risk_level = "HIGH"
        elif country_pct > 20:
            risk_level = "MODERATE"
        else:
            risk_level = "LOW"
        
        concentration = {
            "single_country_exposure_pct": country_pct,
            "single_supplier_exposure_pct": supplier_pct,
            "top_country": top_country[0],
            "top_supplier_id": top_supplier[0],
            "risk_level": risk_level
        }

    # --- STEP 6: Build per-supplier detail ---
    supplier_details = []
    for s in filtered_suppliers:
        sup_products = [
            p for p in filtered_products 
            if p['primary_supplier_id'] == s['supplier_id']
        ]
        rev = sum(float(p['annual_revenue_usd']) for p in sup_products)
        
        # Check if secondary supplier is in an unaffected zone
        secondary_info = None
        for p in sup_products:
            sec_id = p.get('secondary_supplier_id', '')
            if sec_id and sec_id != 'NONE' and sec_id in sup_by_id:
                sec_sup = sup_by_id[sec_id]
                secondary_info = {
                    "secondary_supplier_id": sec_id,
                    "secondary_supplier_country": sec_sup['country'],
                    "secondary_in_affected_zone": sec_sup['country'] in affected_countries
                }
        
        detail = {
            "supplier_id": s['supplier_id'],
            "supplier_name": s['supplier_name'],
            "country": s['country'],
            "sector": s['sector'],
            "dependency_level": s['dependency_level'],
            "backup_available": s['backup_supplier_id'] != 'NONE',
            "backup_supplier_id": s['backup_supplier_id'],
            "products_affected": len(sup_products),
            "revenue_at_risk": round(rev, 2),
            "inventory_buffer_days": int(s['inventory_buffer_days']),
            "risk_score": int(s['risk_score']),
            "contract_expiry": s['contract_expiry'],
            "lead_time_days": int(s['lead_time_days']),
            "estimated_impact_date": calculate_impact_date(s['inventory_buffer_days'])
        }
        if secondary_info:
            detail["secondary_supplier_info"] = secondary_info
        
        supplier_details.append(detail)
    
    # Sort by dependency_level priority, then revenue descending
    dep_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    supplier_details.sort(
        key=lambda x: (dep_order.get(x['dependency_level'], 4), -x['revenue_at_risk'])
    )

    # --- STEP 7: Build route details ---
    route_details = []
    for r in filtered_routes:
        route_prods = [
            p for p in filtered_products 
            if p['shipping_route_id'] == r['route_id']
        ]
        route_rev = sum(float(p['annual_revenue_usd']) for p in route_prods)
        
        normal = int(r['normal_transit_days'])
        disrupted = int(r['disrupted_transit_days'])
        
        route_details.append({
            "route_id": r['route_id'],
            "route_name": r['route_name'],
            "current_status": r['current_status'],
            "normal_transit_days": normal,
            "additional_transit_days": disrupted - normal,
            "cost_increase_pct": float(r['cost_increase_pct']),
            "alternate_route": r['alternate_route'],
            "affected_products_count": len(route_prods),
            "affected_revenue": round(route_rev, 2)
        })
    
    route_details.sort(key=lambda x: -x['affected_revenue'])

    # --- ASSEMBLE FINAL OUTPUT ---
    return {
        "scenario": scenario_name,
        "filtering_mode": filtering_mode,
        "sentinel_card": sentinel_card,
        "pre_calculated": {
            "report_id": f"ATL-2026-0329-001",
            "trigger_alert_id": sentinel_card["alert_id"],
            "timestamp": f"{TODAY}T12:00:00Z",
            "total_suppliers_affected": len(filtered_suppliers),
            "critical_suppliers_affected": len(critical_suppliers),
            "total_products_at_risk": len(filtered_products),
            "estimated_revenue_exposure": round(total_revenue, 2),
            "average_inventory_buffer_days": avg_buffer,
            "single_source_dependencies": len(single_source),
            "estimated_time_to_impact_days": time_to_impact,
            "no_exposure_detected": len(filtered_suppliers) == 0,
            "concentration_risk": concentration
        },
        "supplier_details": supplier_details,
        "route_details": route_details
    }


# ============================================================
# TEST SCENARIO 1: SCN-01 Hormuz (Route-First, High Exposure)
# ============================================================
sentinel_hormuz = {
    "alert_id": "SEN-2026-0328-001",
    "timestamp": "2026-03-28T20:53:00Z",
    "event_type": "MARITIME_SECURITY",
    "event_summary": "Rising tensions have prompted international warnings for commercial shipping to avoid the Strait of Hormuz. Multiple naval advisories issued for vessels transiting the Persian Gulf region, with potential disruption to global oil and LNG supply chains.",
    "severity": 4,
    "affected_regions": ["Persian Gulf", "Middle East"],
    "affected_routes": ["RTE-0001", "RTE-0014", "RTE-0015", "RTE-0016", "RTE-0025"],
    "affected_commodities": ["Oil", "LNG"],
    "confidence": "HIGH",
    "data_freshness": "38 days",
    "event_subcategory": "Chokepoint Threat",
    "source_count": 9,
    "affected_countries": ["Iran"],
    "estimated_duration": "30-90 days",
    "affected_sectors": ["Energy"]
}

test1 = build_atlas_input("SCN-01 Hormuz Maritime Security", sentinel_hormuz, "ROUTE_FIRST")

# ============================================================
# TEST SCENARIO 2: SCN-05 Japan Earthquake (Country-First)
# ============================================================
sentinel_japan = {
    "alert_id": "SEN-2026-0329-001",
    "timestamp": "2026-03-29T08:00:00Z",
    "event_type": "NATURAL_DISASTER",
    "event_summary": "A 7.2 magnitude earthquake struck the Kanto region of Japan, causing structural damage to port facilities and manufacturing plants. Multiple factories in Yokohama and Tokyo report operational shutdowns pending safety inspections.",
    "severity": 4,
    "affected_regions": ["East Asia", "Japan"],
    "affected_routes": [],
    "affected_commodities": ["Electronics", "Automotive parts", "Semiconductors"],
    "confidence": "HIGH",
    "data_freshness": "6 hours",
    "event_subcategory": "Earthquake",
    "source_count": 12,
    "affected_countries": ["Japan"],
    "estimated_duration": "14-30 days",
    "affected_sectors": ["ALL"]
}

test2 = build_atlas_input("SCN-05 Japan Earthquake", sentinel_japan, "COUNTRY_FIRST")

# ============================================================
# TEST SCENARIO 3: Zero Match (Edge Case)
# ============================================================
sentinel_zero = {
    "alert_id": "SEN-2026-0329-002",
    "timestamp": "2026-03-29T10:00:00Z",
    "event_type": "NATURAL_DISASTER",
    "event_summary": "Volcanic eruption reported on a remote Pacific island. No major shipping lanes affected. Limited regional impact expected.",
    "severity": 2,
    "affected_regions": ["Pacific Islands"],
    "affected_routes": [],
    "affected_commodities": [],
    "confidence": "LOW",
    "data_freshness": "2 hours",
    "event_subcategory": "Volcanic Eruption",
    "source_count": 2,
    "affected_countries": ["Atlantis"],
    "estimated_duration": "7-14 days",
    "affected_sectors": ["ALL"]
}

test3 = build_atlas_input("Zero Match Edge Case", sentinel_zero, "COUNTRY_FIRST")


# --- Write outputs ---
import os
os.makedirs('/home/claude/atlas_test_data', exist_ok=True)

for name, data in [("test1_hormuz", test1), ("test2_japan", test2), ("test3_zero_match", test3)]:
    path = f'/home/claude/atlas_test_data/{name}.json'
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)
    
    # Print summary
    pc = data['pre_calculated']
    print(f"\n{'='*60}")
    print(f"  {data['scenario']}")
    print(f"  Filtering: {data['filtering_mode']}")
    print(f"  Suppliers: {pc['total_suppliers_affected']}")
    print(f"  Products: {pc['total_products_at_risk']}")
    print(f"  Revenue: ${pc['estimated_revenue_exposure']:,.2f}")
    print(f"  CRITICAL: {pc['critical_suppliers_affected']}")
    print(f"  No backup: {pc['single_source_dependencies']}")
    print(f"  Time to impact: {pc['estimated_time_to_impact_days']} days")
    print(f"  No exposure: {pc['no_exposure_detected']}")
    print(f"  Concentration: {pc['concentration_risk']['risk_level']} ({pc['concentration_risk']['top_country']} @ {pc['concentration_risk']['single_country_exposure_pct']}%)")
    print(f"  File: {path}")
    print(f"{'='*60}")

print("\nAll test data generated.")
