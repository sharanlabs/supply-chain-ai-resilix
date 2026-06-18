import { readFileSync } from "node:fs";
import path from "node:path";
import { ingestSupplierCsv, type IngestResult } from "@/lib/ingest/supplier-csv";
import type { SupplierUploadReport } from "@/lib/schemas";
import type { SupplierStore } from "@/lib/server/supplier-store";

// ---------------------------------------------------------------------------
// P2.6 -- the ~150-row US-plurality supplier seed (the showcase dataset). It is a
// Tier-1 CSV that flows through the SAME P2.5 ingestion core (sanitize / canonical
// ID / Zod validation), so the seed can never drift from the upload contract: if a
// future schema change breaks user uploads, it breaks this seed too. Composition +
// provenance live in data/seed/README.md; the exact tallies are pinned in
// evals/supplier-seed.test.ts so an edit to the CSV that changes the dataset fails
// loudly. Tier-2 route/inventory data is intentionally OUT of this seed (P2.5 does
// not persist it, and P2.4 models routes/inventory as separate normalized tables --
// Phase 4/5 seed those). A Tier-1 seed with the right country/sector mix is what
// the deterministic exposure engine (Atlas, Phase 5) matches on.
// ---------------------------------------------------------------------------

// Resolved from the project root (process.cwd()) -- the working directory under
// `next build` / `next dev` / `next start` and vitest alike, where data/seed/ lives
// on disk. Deliberately NOT import.meta.url: a bundler (Turbopack) rewrites that to
// the emitted CHUNK location, so a relative data path would resolve into .next/, and
// the bundled URL also fails fileURLToPath's cross-realm `instanceof URL` check --
// the ERR_INVALID_ARG_TYPE the `/` server-component build surfaced when this module
// entered the page graph. A bundled deploy that does not ship data/seed would need
// the file copied to the runtime cwd -- not a concern for the test + local-pg +
// demo-render paths this seed serves.
export const SEED_CSV_PATH = path.join(
  process.cwd(),
  "data/seed/us-suppliers.seed.csv"
);

// The seed is authored to exactly this many rows; asserting the count means a
// truncated or extended CSV fails loudly instead of silently seeding a different
// dataset than the demo and tests assume.
export const EXPECTED_SEED_ROW_COUNT = 150;

export function readSeedCsv(): string {
  return readFileSync(SEED_CSV_PATH, "utf8");
}

// Ingest the seed through the P2.5 core. The seed is REQUIRED to ingest 100%
// clean: any unmatched row or a truncating abort is a defect in the seed FILE, so
// we fail loudly with the specific row reasons rather than seed a partial set.
export function ingestSeed(): IngestResult {
  const result = ingestSupplierCsv(readSeedCsv());

  if (result.aborted) {
    throw new Error(`Seed CSV ingestion aborted: ${result.abortReason ?? "unknown reason"}`);
  }

  if (result.report.unmatched > 0) {
    const reasons = result.report.rows
      .filter((row) => row.outcome === "UNMATCHED")
      .map((row) => `row ${row.rowIndex}: ${row.reason}`)
      .join("; ");
    throw new Error(`Seed CSV has ${result.report.unmatched} unmatched row(s): ${reasons}`);
  }

  // The seed must be EXACTLY the authored dataset: no truncation, no extension, and
  // no duplicate (name+country) collapse. Check the RAW report counts, not just the
  // deduped supplier length -- a 151-row file with one duplicate dedups back to 150
  // suppliers and would slip past a length-only check, so we also pin totalRows and
  // require zero overwrites.
  if (
    result.report.totalRows !== EXPECTED_SEED_ROW_COUNT ||
    result.report.matched !== EXPECTED_SEED_ROW_COUNT ||
    result.report.overwritten !== 0 ||
    result.suppliers.length !== EXPECTED_SEED_ROW_COUNT
  ) {
    throw new Error(
      `Seed must be exactly ${EXPECTED_SEED_ROW_COUNT} unique rows, but got ` +
        `totalRows=${result.report.totalRows}, matched=${result.report.matched}, ` +
        `overwritten=${result.report.overwritten}, suppliers=${result.suppliers.length}. ` +
        "A duplicate (name+country) pair or a truncated/extended CSV is the likely cause."
    );
  }

  return result;
}

// Load the seed into a supplier store. The store is dependency-INJECTED so this
// module never imports the DB layer (the validation test needs no DB; the gated pg
// test passes getSupplierStore()). Idempotent: the canonical ID is the primary key,
// so re-seeding upserts last-write-wins and the row count stays stable.
export async function seedSuppliers(
  store: SupplierStore
): Promise<{ written: number; report: SupplierUploadReport }> {
  const { suppliers, report } = ingestSeed();
  const written = await store.upsertSuppliers(suppliers);
  return { written, report };
}
