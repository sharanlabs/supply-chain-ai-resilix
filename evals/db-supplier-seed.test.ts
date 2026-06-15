import { describe, expect, it } from "vitest";
import {
  EXPECTED_SEED_ROW_COUNT,
  ingestSeed,
  seedSuppliers
} from "@/lib/ingest/seed-suppliers";
import {
  getSupplierStore,
  getSupplierStoreMode
} from "@/lib/server/supplier-store";

// Gated live-Postgres seed loader + proof (P2.6). Runs ONLY when
// RUN_DB_INTEGRATION_TESTS=true and DATABASE_URL is set (the `npm run seed:suppliers`
// and `npm run test:db` scripts against a live cluster); otherwise it skips. This is
// BOTH the operational seeding path and the live-pg proof that the ~150-row seed
// lands through the real postgresStore branch (the in-memory unit suite cannot reach
// that branch).
//
// do-no-harm: this suite is PURELY ADDITIVE. It upserts the seed by canonical PK
// (last-write-wins) and NEVER deletes or truncates -- re-running converges to exactly
// the 150 seed rows and removes nothing, so pointing it at a populated cluster only
// adds/refreshes the demo dataset. (The sibling db-supplier-store suite is already
// written to tolerate the seed living in the cluster.) Seed IDs are deterministic, so
// every assertion is scoped to those IDs rather than whole-table counts.

const shouldRun =
  process.env.RUN_DB_INTEGRATION_TESTS === "true" &&
  Boolean(process.env.DATABASE_URL?.trim());

const describeDb = shouldRun ? describe : describe.skip;

describeDb("Postgres supplier seed (P2.6)", () => {
  const seedSet = ingestSeed().suppliers;
  const seedIds = new Set(seedSet.map((s) => s.id));
  const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

  it("uses the postgres store branch", () => {
    expect(getSupplierStoreMode()).toBe("postgres");
  });

  it("seeds all 150 rows into the real table with exact field round-trip", async () => {
    const store = getSupplierStore();
    const { written } = await seedSuppliers(store);
    expect(written).toBe(EXPECTED_SEED_ROW_COUNT);

    const present = (await store.listSuppliers())
      .filter((s) => seedIds.has(s.id))
      .sort(byId);
    expect(present).toHaveLength(EXPECTED_SEED_ROW_COUNT);
    // Full field-level round-trip: every persisted seed row equals what was ingested
    // (catches sector/country/tier/lead corruption through the real pg mapper, not
    // just a row-count match).
    expect(present).toEqual([...seedSet].sort(byId));
    // The Gulf-origin set survives the round-trip (Hormuz demo precondition).
    const gulf = present.filter((s) => ["AE", "SA", "QA", "KW"].includes(s.country));
    expect(gulf).toHaveLength(9);
  });

  it("is idempotent: re-seeding keeps exactly 150 seed rows (last-write-wins)", async () => {
    const store = getSupplierStore();
    await seedSuppliers(store);
    await seedSuppliers(store);
    const present = (await store.listSuppliers()).filter((s) => seedIds.has(s.id));
    expect(present).toHaveLength(EXPECTED_SEED_ROW_COUNT);
  });
});
