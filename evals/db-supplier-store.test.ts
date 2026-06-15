import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { suppliers as suppliersTable } from "@/db/schema";
import type { Supplier } from "@/lib/schemas";
import { getDb } from "@/lib/server/db";
import {
  getSupplierStore,
  getSupplierStoreMode
} from "@/lib/server/supplier-store";

// Gated live-Postgres integration test for the supplier store (P2.5), mirroring
// the existing db-persistence suite. Runs ONLY when RUN_DB_INTEGRATION_TESTS=true
// and DATABASE_URL is set (the test:db script + a live cluster); otherwise it
// skips. This exercises the REAL postgresStore branch -- onConflictDoUpdate
// last-write-wins and the $inferSelect -> domain round-trip against a real table --
// which the in-memory unit suite cannot reach.
//
// do-no-harm: this gated suite expects a THROWAWAY cluster, but it must NEVER
// truncate a shared table even so. All setup/teardown mutations are scoped to the
// specific test-generated supplier IDs (delete WHERE id IN (...testIds)) -- never a
// table-wide DELETE -- so a populated DATABASE_URL is not wiped, and FKs from
// exposure_results / supplier_messages onto suppliers are not violated. The reset()
// purge semantics (which truncate by design) are covered by the in-memory
// supplier-store.test.ts, so dropping the table-wide path here loses no coverage.

const shouldRun =
  process.env.RUN_DB_INTEGRATION_TESTS === "true" &&
  Boolean(process.env.DATABASE_URL?.trim());

const describeDb = shouldRun ? describe : describe.skip;

describeDb("Postgres supplier store integration", () => {
  // Unique IDs per run so the test is isolated and self-cleaning even if a prior
  // run left rows behind. ALL cleanup is scoped to exactly these IDs.
  const idA = `SUP-itest-${randomUUID()}`;
  const testIds = [idA];

  function supplier(overrides: Partial<Supplier> = {}): Supplier {
    return {
      id: idA,
      name: "Integration Acme",
      country: "US",
      region: "West",
      riskTier: "HIGH",
      backupSupplierId: null,
      standardLeadTimeDays: 30,
      sector: "SEMICONDUCTORS",
      ...overrides
    };
  }

  beforeAll(async () => {
    // Scoped to test IDs only -- never a table-wide DELETE (do-no-harm).
    await getDb().delete(suppliersTable).where(inArray(suppliersTable.id, testIds));
  });

  afterAll(async () => {
    await getDb().delete(suppliersTable).where(inArray(suppliersTable.id, testIds));
  });

  it("uses the postgres store branch", () => {
    expect(getSupplierStoreMode()).toBe("postgres");
  });

  it("upserts, reads back via $inferSelect mapper, and applies last-write-wins", async () => {
    const store = getSupplierStore();
    // Scope every assertion to this run's id. The suite no longer clears the table
    // (do-no-harm), so the DB may legitimately hold other suppliers (e.g. a P2.6
    // seed). "exactly one row for idA" is the real last-write-wins assertion --
    // asserting whole-table length would false-fail on a populated cluster.
    const rowsForA = async () =>
      (await store.listSuppliers()).filter((row) => row.id === idA);

    await store.upsertSuppliers([supplier({ region: "West", riskTier: "HIGH" })]);
    let mine = await rowsForA();
    expect(mine).toHaveLength(1);
    expect(mine[0].id).toBe(idA);
    expect(mine[0].region).toBe("West");
    // nullable columns round-trip as null through the DB-row -> domain mapper.
    expect(mine[0].backupSupplierId).toBeNull();
    expect(mine[0].sector).toBe("SEMICONDUCTORS");

    // Same canonical ID -> conflict -> last-write-wins (still exactly one row for idA).
    await store.upsertSuppliers([
      supplier({ region: "East", riskTier: "LOW", sector: null })
    ]);
    mine = await rowsForA();
    expect(mine).toHaveLength(1);
    expect(mine[0].region).toBe("East");
    expect(mine[0].riskTier).toBe("LOW");
    expect(mine[0].sector).toBeNull();
  });

  // NOTE: resetSuppliers() truncates the whole table by design, which cannot be
  // scoped to this run's IDs without defeating its purpose -- running it against a
  // shared cluster would violate do-no-harm. Its purge semantics are covered by the
  // in-memory supplier-store.test.ts, so it is intentionally NOT exercised here.
});
