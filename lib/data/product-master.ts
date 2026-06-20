import { ProductSchema, type ProductMaster } from "@/lib/schemas";

// ---------------------------------------------------------------------------
// The product master -- the authoritative catalog of products the ActionOps demo
// reasons about. This is the products analog of the supplier seed: the eval
// allowlist `KNOWN_PRODUCT_IDS` (evals/golden/seed-ids.ts) is DERIVED from this
// single list, exactly as `KNOWN_SUPPLIER_IDS` is derived from `ingestSeed()`. So
// the existence grader can no longer be self-referential -- a `productRunouts[]`
// id is "real" only if it is in THIS catalog, not merely because the run happened
// to declare it. (The run-scoped check -- a runout only for a declared simulation
// input -- stays enforced separately by gradeSimulatorArithmetic; this list is the
// catalog-existence half, the anti-fabrication allowlist.)
//
// Provenance: SYNTHETIC / modeled, like the supplier seed (data/seed/README.md).
// No real-company or real-SKU claims; revenue-per-unit and priority are illustrative
// values chosen to be internally coherent with the demo scenarios, not sourced.
//
// Membership rule: every productId any demo scenario can emit MUST appear here
// (the Hormuz / pharma / single-source live + golden scenarios and the frozen demo
// packet). evals/product-master.test.ts enumerates those sources and fails loudly
// if a scenario references a product this catalog omits -- so the catalog cannot
// silently drift behind the scenarios it is supposed to authorize.
// ---------------------------------------------------------------------------

const RAW_PRODUCT_MASTER: ProductMaster[] = [
  // Hormuz scenario: a Gulf-origin petrochemical feedstock (CHEMICALS exposure).
  {
    id: "PROD-GULF-CHEM",
    name: "Gulf petrochemical feedstock",
    revenuePerUnitUsd: 1_200,
    priority: "HIGH"
  },
  // Red Sea / pharma scenario: an India-sourced active pharmaceutical ingredient.
  {
    id: "PROD-IN-PHARMA",
    name: "Generic active pharmaceutical ingredient",
    revenuePerUnitUsd: 4_500,
    priority: "CRITICAL"
  },
  // Hurricane scenario: a single-source precision component (no qualified alternate).
  {
    id: "PROD-SINGLE-SOURCE",
    name: "Single-source precision component",
    revenuePerUnitUsd: 8_000,
    priority: "CRITICAL"
  },
  // Demo packet runouts: the battery-electrolyte and catalyst lines the frozen
  // Hormuz capture sequences builds against (lib/data/demo-packet.ts).
  {
    id: "PROD-ELECTROLYTE-A",
    name: "Battery electrolyte solution (line A)",
    revenuePerUnitUsd: 300,
    priority: "HIGH"
  },
  {
    id: "PROD-CATALYST-B",
    name: "Industrial process catalyst (line B)",
    revenuePerUnitUsd: 2_200,
    priority: "MEDIUM"
  }
];

// Validate at module load -- the same fail-loud posture as ingestSeed(): a malformed
// entry (bad priority, negative revenue) throws on first import (and so fails the
// build's typecheck/test pass) rather than silently seeding a broken catalog.
export const PRODUCT_MASTER: readonly ProductMaster[] = Object.freeze(
  RAW_PRODUCT_MASTER.map((p) => ProductSchema.parse(p))
);

// A duplicate id would make the catalog ambiguous and silently shrink the allowlist
// Set below -- reject it loudly at load.
const uniqueIds = new Set(PRODUCT_MASTER.map((p) => p.id));
if (uniqueIds.size !== PRODUCT_MASTER.length) {
  throw new Error(
    `Product master has duplicate ids: ${PRODUCT_MASTER.length} rows but ${uniqueIds.size} unique ids.`
  );
}
