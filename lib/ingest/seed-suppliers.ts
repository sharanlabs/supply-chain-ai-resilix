import { readFileSync } from "node:fs";
import path from "node:path";
import { ingestSupplierCsv, type IngestResult } from "@/lib/ingest/supplier-csv";
import type { Supplier, SupplierUploadReport } from "@/lib/schemas";
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

// P1 backup linkage (SEED-ONLY enrichment). The P2.5 upload path deliberately leaves
// backupSupplierId null -- cross-supplier linkage is relational territory, not a per-row
// upload concern -- but with the whole seed left null, EVERY supplier reads as
// single-source and the Atlas single-source penalty becomes a constant that discriminates
// nothing. This overlay gives the seed a realistic dual-sourced cohort to contrast against.
//
// DIRECTION (the guidelines-monitor correction, 2026-06-25): sourcing arrangement is an
// INDEPENDENT observed attribute, NOT a function of risk tier -- and Kraljic practice is to
// dual-source the high-risk/high-impact items (segment, do not blanket). So single-source is
// decoupled from tier here: a supplier is single-source iff it is (1) DELIBERATELY sole-sourced
// (a specialized/qualified-single-source part -- a real business decision), or (2) STRUCTURALLY
// alone -- no qualified alternate exists in the base. Everyone else is DUAL-SOURCED, including
// most CRITICAL suppliers (the resilient norm). The result is a realistic MIX where the +12
// single-source penalty discriminates WITHIN a tier (a critical single-source lane outscores a
// critical dual-sourced one), instead of moving in lockstep with the tier base. A qualified
// alternate = another seed supplier in the SAME sector, a DIFFERENT country, at LOW or MEDIUM
// risk tier (a high-risk alternate is not a qualified backup); chosen by canonical-id order so
// the linkage is stable across runs. (Tracked refinement: this does not yet check a shared
// sub-tier dependency -- the "illusion of diversification".)
const QUALIFIED_BACKUP_TIERS = new Set<Supplier["riskTier"]>(["LOW", "MEDIUM"]);

// Suppliers the firm DELIBERATELY sole-sources despite alternates existing -- a specialized
// or single-qualified part (independent of risk tier). Keyed by the seed's stable display
// name. Includes the demo headline (a CRITICAL Gulf chemical lane with no qualified backup)
// plus a sole-sourced specialty energy + leading-edge semiconductor lane, so single-source
// spans tiers/sectors rather than tracking the risk tier.
const DELIBERATELY_SOLE_SOURCED = new Set<string>([
  "Abu Chemical Partners 078", // CRITICAL CHEMICALS (AE) -- the headline single-source lane
  "Ras Energy Systems 095", // HIGH ENERGY (QA) -- a sole-sourced specialty energy input
  "Hsinchu Semiconductor Holdings 001" // CRITICAL SEMICONDUCTORS (TW) -- a sole-sourced node
]);

export function linkBackupSuppliers(suppliers: Supplier[]): Supplier[] {
  const byId = [...suppliers].sort((a, b) => a.id.localeCompare(b.id));
  return suppliers.map((s) => {
    // Deliberately sole-sourced (or sectorless) -> single-source regardless of alternates.
    if (DELIBERATELY_SOLE_SOURCED.has(s.name) || s.sector == null) {
      return { ...s, backupSupplierId: null };
    }
    // Otherwise dual-sourced when a qualified alternate exists. The check is on the
    // ALTERNATE's tier (it must be stable, LOW/MEDIUM), NOT on this supplier's tier -- so a
    // critical supplier with a qualified alternate is dual-sourced (the norm); single-source
    // is the deliberate or structurally-alone exception.
    const backup = byId.find(
      (o) =>
        o.id !== s.id &&
        o.sector === s.sector &&
        o.country !== s.country &&
        QUALIFIED_BACKUP_TIERS.has(o.riskTier)
    );
    return { ...s, backupSupplierId: backup ? backup.id : null };
  });
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

  // Apply the backup-linkage overlay AFTER the count guard (it adds backupSupplierId, never
  // changes the row count), so the seed carries a realistic dual-sourced cohort.
  return { ...result, suppliers: linkBackupSuppliers(result.suppliers) };
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
