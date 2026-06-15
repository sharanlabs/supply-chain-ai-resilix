import { afterEach, describe, expect, it } from "vitest";
import type { Supplier } from "@/lib/schemas";
import {
  __resetMemorySuppliersForTest,
  getSupplierStore,
  getSupplierStoreMode
} from "@/lib/server/supplier-store";

// These tests exercise the IN-MEMORY store branch (the default when DATABASE_URL
// is unset). The Postgres branch is covered by the gated live-pg suite (test:db)
// like the existing decision-packet store, since it needs a real cluster.

function supplier(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: "SUP-test0001",
    name: "Acme Components",
    country: "US",
    region: "West",
    riskTier: "HIGH",
    backupSupplierId: null,
    standardLeadTimeDays: 30,
    sector: "SEMICONDUCTORS",
    ...overrides
  };
}

describe("P2.5 supplier store (in-memory branch)", () => {
  afterEach(() => {
    __resetMemorySuppliersForTest();
  });

  it("defaults to the memory store when DATABASE_URL is unset", () => {
    expect(getSupplierStoreMode()).toBe("memory");
  });

  it("upserts and reads back a supplier", async () => {
    const store = getSupplierStore();
    await store.upsertSuppliers([supplier()]);
    const all = await store.listSuppliers();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("SUP-test0001");
  });

  it("upsert is last-write-wins on the canonical ID", async () => {
    const store = getSupplierStore();
    await store.upsertSuppliers([supplier({ region: "West" })]);
    await store.upsertSuppliers([supplier({ region: "East", riskTier: "LOW" })]);
    const all = await store.listSuppliers();
    expect(all).toHaveLength(1);
    expect(all[0].region).toBe("East");
    expect(all[0].riskTier).toBe("LOW");
  });

  it("returns the count of suppliers written", async () => {
    const store = getSupplierStore();
    const count = await store.upsertSuppliers([
      supplier({ id: "SUP-a" }),
      supplier({ id: "SUP-b", name: "Beta Co" })
    ]);
    expect(count).toBe(2);
  });

  it("reset purges all suppliers (retention: purgeable via reset)", async () => {
    const store = getSupplierStore();
    await store.upsertSuppliers([supplier()]);
    await store.resetSuppliers();
    expect(await store.listSuppliers()).toHaveLength(0);
  });
});
