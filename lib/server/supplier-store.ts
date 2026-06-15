import { suppliers as suppliersTable } from "@/db/schema";
import { SectorSchema, type Supplier } from "@/lib/schemas";
import { getDatabaseUrl, getDb } from "@/lib/server/db";

// ---------------------------------------------------------------------------
// P2.5 supplier store port. Mirrors the dual (pg / in-memory) branching of the
// decision-packet store (lib/server/store.ts): the same app runs on a local
// Postgres (DATABASE_URL set) OR an in-memory map (unset). Ingestion writes
// through this single port so it works in both modes.
//
// upsertSuppliers is last-write-wins by PRIMARY KEY (the canonical id). The core
// already deduped within one upload by canonical id, so within-batch dups are
// gone before they arrive; cross-upload dups (same name+country -> same id) also
// collapse here, keeping the dedup posture uniform across uploads.
// ---------------------------------------------------------------------------

export type SupplierStore = {
  // Returns the number of supplier rows written (post within-batch dedup).
  upsertSuppliers(rows: Supplier[]): Promise<number>;
  listSuppliers(): Promise<Supplier[]>;
  // Retention: uploaded data is purgeable via reset (R4-5/6). Phase 8 wires the
  // dashboard reset button to this; the port exposes it now.
  resetSuppliers(): Promise<void>;
};

const memorySuppliers = new Map<string, Supplier>();

const memoryStore: SupplierStore = {
  async upsertSuppliers(rows) {
    for (const row of rows) {
      memorySuppliers.set(row.id, row);
    }
    return rows.length;
  },

  async listSuppliers() {
    return [...memorySuppliers.values()].sort((a, b) => a.id.localeCompare(b.id));
  },

  async resetSuppliers() {
    memorySuppliers.clear();
  }
};

const postgresStore: SupplierStore = {
  async upsertSuppliers(rows) {
    if (rows.length === 0) {
      return 0;
    }
    const db = getDb();
    // One transaction for the whole batch: an upload either lands fully or not at
    // all (no half-ingested supplier set). last-write-wins via onConflictDoUpdate
    // on the primary key (the canonical id).
    await db.transaction(async (tx) => {
      for (const row of rows) {
        await tx
          .insert(suppliersTable)
          .values(toSupplierRow(row))
          .onConflictDoUpdate({
            target: suppliersTable.id,
            set: {
              name: row.name,
              country: row.country,
              region: row.region,
              riskTier: row.riskTier,
              backupSupplierId: row.backupSupplierId ?? null,
              standardLeadTimeDays: row.standardLeadTimeDays,
              sector: row.sector ?? null
            }
          });
      }
    });
    return rows.length;
  },

  async listSuppliers() {
    const db = getDb();
    const dbRows = await db.select().from(suppliersTable);
    return dbRows
      .map(fromSupplierRow)
      .sort((a, b) => a.id.localeCompare(b.id));
  },

  async resetSuppliers() {
    const db = getDb();
    await db.delete(suppliersTable);
  }
};

// Domain Supplier -> DB insert row. backupSupplierId / sector are nullable; the
// domain carries null (not undefined) for them, matching the column mode.
function toSupplierRow(row: Supplier): typeof suppliersTable.$inferInsert {
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    region: row.region,
    riskTier: row.riskTier,
    backupSupplierId: row.backupSupplierId ?? null,
    standardLeadTimeDays: row.standardLeadTimeDays,
    sector: row.sector ?? null
  };
}

// DB select row -> domain Supplier. The sector COLUMN is open `text` (infers
// `string | null`), so we parse it through SectorSchema rather than blind-casting:
// null stays null, a valid member passes, and any non-member stored value coalesces
// to OTHER_UNMAPPED (the same escape-hatch posture the ingest uses). country is
// likewise open text in the column but is always written normalized by ingest.
function fromSupplierRow(row: typeof suppliersTable.$inferSelect): Supplier {
  const sector =
    row.sector === null ? null : (SectorSchema.safeParse(row.sector).data ?? "OTHER_UNMAPPED");
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    region: row.region,
    riskTier: row.riskTier,
    backupSupplierId: row.backupSupplierId,
    standardLeadTimeDays: row.standardLeadTimeDays,
    sector
  };
}

export function getSupplierStore(): SupplierStore {
  return getDatabaseUrl() ? postgresStore : memoryStore;
}

export function getSupplierStoreMode() {
  return getDatabaseUrl() ? "postgres" : "memory";
}

// Test-only helper: clears the in-memory supplier map between tests so state does
// not leak across cases (the memory map is module-level, like the packet store's).
export function __resetMemorySuppliersForTest() {
  memorySuppliers.clear();
}
