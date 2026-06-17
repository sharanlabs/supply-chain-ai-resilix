// Derive the golden-record supplier id sets from the REAL ingest, never by hand.
//
// Every supplier id a golden packet references is read from `ingestSeed()` -- the
// same canonical `SUP-<sha256>` ids the live pipeline would key off. So a golden
// record cannot drift from the ingest contract: change the seed or the id rule and
// these sets move with it (the P2.6 / P3.2 "derive through the shared function,
// pin the joint cells" discipline applied to the eval fixtures).

import { ingestSeed } from "@/lib/ingest/seed-suppliers";
import type { Supplier } from "@/lib/schemas";

const seed = ingestSeed();

export const ALL_SUPPLIERS: readonly Supplier[] = seed.suppliers;

export const KNOWN_SUPPLIER_IDS: ReadonlySet<string> = new Set(
  seed.suppliers.map((s) => s.id)
);

// The Hormuz exposure set: Gulf-origin suppliers. In this seed every Gulf supplier
// (SA/AE/QA/KW) is ENERGY or CHEMICALS by design (P2.6's backward-from-scenario
// construction), so the country filter alone yields exactly the 9 the Strait of
// Hormuz scenario should match -- the joint (country x sector) cell the demo rests
// on. We assert the count so a seed change that breaks the scenario fails loudly
// here rather than silently weakening the exposure grader.
const GULF_COUNTRIES = new Set(["SA", "AE", "QA", "KW"]);

export const HORMUZ_SUPPLIERS: readonly Supplier[] = seed.suppliers.filter((s) =>
  GULF_COUNTRIES.has(s.country)
);

export const HORMUZ_SUPPLIER_IDS: ReadonlySet<string> = new Set(
  HORMUZ_SUPPLIERS.map((s) => s.id)
);

if (HORMUZ_SUPPLIERS.length !== 9) {
  throw new Error(
    `Hormuz golden set expected 9 Gulf suppliers, got ${HORMUZ_SUPPLIERS.length} -- ` +
      "the seed's country x sector distribution changed; re-derive the scenario."
  );
}

// A supplier the Hormuz event does NOT touch -- a US-domestic supplier -- used by
// the zero-exposure control and as the "invented match" in corrupted variants.
export const NON_GULF_SUPPLIER: Supplier =
  seed.suppliers.find((s) => s.country === "US") ??
  (() => {
    throw new Error("seed has no US supplier for the zero-exposure control");
  })();
