import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { suppliers } from "@/db/schema";
import {
  SupplierRowReportSchema,
  SupplierSchema,
  SupplierUploadReportSchema
} from "@/lib/schemas";
import {
  MAX_CSV_BYTES,
  MAX_CSV_ROWS,
  RETENTION_DISCLOSURE,
  canonicalSupplierId,
  ingestSupplierCsv,
  sanitizeCell
} from "@/lib/ingest/supplier-csv";

// A minimal valid Tier-1 header + one row builder so each test states only what
// it varies. Tier-1 columns: name, country, region, risk_tier, sector,
// standard_lead_time_days.
function csv(rows: string[]): string {
  return ["name,country,region,risk_tier,sector,standard_lead_time_days", ...rows].join(
    "\n"
  );
}

describe("P2.5 sanitizeCell (formula-injection neutralization)", () => {
  it("neutralizes every leading formula trigger in the PLAN set (= + - @)", () => {
    expect(sanitizeCell("=cmd()")).not.toMatch(/^=/);
    expect(sanitizeCell("+x")).not.toMatch(/^\+/);
    expect(sanitizeCell("-x")).not.toMatch(/^-/);
    expect(sanitizeCell("@x")).not.toMatch(/^@/);
  });

  it("preserves the original characters after escaping (no data loss)", () => {
    expect(sanitizeCell("=SUM(A1)")).toContain("=SUM(A1)");
  });

  it("leaves a benign value untouched", () => {
    expect(sanitizeCell("Acme Components")).toBe("Acme Components");
  });

  it("strips leading whitespace before checking the trigger (no bypass via space)", () => {
    // OWASP notes leading whitespace can smuggle a trigger past a naive check.
    expect(sanitizeCell("   =cmd()")).not.toMatch(/^\s*=/);
  });
});

describe("P2.5 canonicalSupplierId (ID-quarantine + dedup by construction)", () => {
  it("derives a deterministic ID from normalized (name + country)", () => {
    const a = canonicalSupplierId("Acme Components", "US");
    const b = canonicalSupplierId("Acme Components", "US");
    expect(a).toBe(b);
    expect(a).toMatch(/^SUP-/);
  });

  it("collapses case/whitespace variants of the same name+country to one ID", () => {
    expect(canonicalSupplierId("  acme   components ", "us")).toBe(
      canonicalSupplierId("ACME COMPONENTS", "US")
    );
  });

  it("does not embed the raw uploaded string (an injection payload never crosses raw)", () => {
    const payload = "=HYPERLINK(\"http://evil\")";
    const id = canonicalSupplierId(payload, "US");
    expect(id).not.toContain("=");
    expect(id).not.toContain("HYPERLINK");
    expect(id).not.toContain("evil");
  });

  it("different name+country yields a different ID", () => {
    expect(canonicalSupplierId("Acme", "US")).not.toBe(
      canonicalSupplierId("Acme", "DE")
    );
  });

  it("distinguishes the historical 32-bit collision pair (regression: SHA-256 PK)", () => {
    // Under the old non-crypto stableHash these two distinct normalized keys both
    // produced SUP-1d9d1859, falsely deduping two unrelated suppliers into one and
    // emitting a false MATCHED_OVERWRITE. With a SHA-256 digest they MUST differ.
    expect(canonicalSupplierId("gd3rdkuae2f027jr5jiv842", "US")).not.toBe(
      canonicalSupplierId("y3mnzv00611 6v1yw0cp", "US")
    );
  });
});

describe("P2.5 SupplierRowReportSchema (discriminated-union per-outcome contract)", () => {
  it("rejects an UNMATCHED row with no reason (zero-match-impossible enforced)", () => {
    const result = SupplierRowReportSchema.safeParse({
      rowIndex: 1,
      outcome: "UNMATCHED"
    });
    expect(result.success).toBe(false);
  });

  it("accepts a well-formed UNMATCHED row (reason present)", () => {
    const result = SupplierRowReportSchema.safeParse({
      rowIndex: 1,
      outcome: "UNMATCHED",
      reason: "Missing required field: name"
    });
    expect(result.success).toBe(true);
  });

  it("accepts MATCHED with ids and MATCHED_OVERWRITE with ids + reason", () => {
    expect(
      SupplierRowReportSchema.safeParse({
        rowIndex: 1,
        outcome: "MATCHED",
        supplierId: "SUP-abc",
        supplierName: "Acme"
      }).success
    ).toBe(true);
    expect(
      SupplierRowReportSchema.safeParse({
        rowIndex: 2,
        outcome: "MATCHED_OVERWRITE",
        supplierId: "SUP-abc",
        supplierName: "Acme",
        reason: "Duplicate; last-write-wins overwrite applied"
      }).success
    ).toBe(true);
  });
});

describe("P2.5 ingestSupplierCsv (core: parse, validate, sanitize, dedup, tier)", () => {
  it("matches a valid Tier-1 row and assigns a canonical ID", () => {
    const result = ingestSupplierCsv(
      csv(["Acme Components,US,West,HIGH,SEMICONDUCTORS,30"])
    );
    expect(result.report.matched).toBe(1);
    expect(result.report.unmatched).toBe(0);
    expect(result.suppliers).toHaveLength(1);
    expect(result.suppliers[0].id).toBe(
      canonicalSupplierId("Acme Components", "US")
    );
    expect(SupplierSchema.parse(result.suppliers[0])).toEqual(result.suppliers[0]);
  });

  it("returns a report that satisfies the response contract", () => {
    const result = ingestSupplierCsv(
      csv(["Acme Components,US,West,HIGH,SEMICONDUCTORS,30"])
    );
    expect(SupplierUploadReportSchema.parse(result.report)).toEqual(result.report);
    expect(result.report.retention).toBe(RETENTION_DISCLOSURE);
  });

  it("sanitizes a formula-injection name in both stored value and report display", () => {
    const result = ingestSupplierCsv(
      csv(["=cmd()|payload,US,West,HIGH,ELECTRONICS,15"])
    );
    const stored = result.suppliers[0];
    expect(stored.name).not.toMatch(/^=/);
    const row = result.report.rows[0];
    // The single valid row matches; narrow the union to read the stored name.
    expect(row.outcome).toBe("MATCHED");
    if (row.outcome !== "MATCHED" && row.outcome !== "MATCHED_OVERWRITE") {
      throw new Error("expected a matched row");
    }
    expect(row.supplierName).not.toMatch(/^=/);
    // The canonical ID never carries the raw payload.
    expect(stored.id).not.toContain("=");
    expect(stored.id).not.toContain("cmd");
  });

  it("dedups same (name+country) to one supplier with last-write-wins and an overwrite note", () => {
    const result = ingestSupplierCsv(
      csv([
        "Acme Components,US,West,HIGH,SEMICONDUCTORS,30",
        "acme components,US,East,LOW,ELECTRONICS,10"
      ])
    );
    expect(result.suppliers).toHaveLength(1);
    // last-write-wins: the second row's values survive.
    expect(result.suppliers[0].region).toBe("East");
    expect(result.suppliers[0].riskTier).toBe("LOW");
    expect(result.report.overwritten).toBe(1);
    const overwriteRow = result.report.rows.find(
      (r) => r.outcome === "MATCHED_OVERWRITE"
    );
    expect(overwriteRow?.reason).toMatch(/overwrite/i);
  });

  it("makes a silent zero-match structurally impossible: every rejected row has a reason", () => {
    const result = ingestSupplierCsv(
      csv([
        ",US,West,HIGH,SEMICONDUCTORS,30", // missing name
        "Bad Country Co,ZZZ,West,HIGH,SEMICONDUCTORS,30", // not alpha-2, not a known name
        "Bad Tier Co,US,West,NOPE,SEMICONDUCTORS,30", // bad risk tier
        "Bad Lead Co,US,West,HIGH,SEMICONDUCTORS,not-a-number" // bad lead time
      ])
    );
    expect(result.report.matched).toBe(0);
    expect(result.report.unmatched).toBe(4);
    // Every single row carries a specific, non-empty reason.
    for (const row of result.report.rows) {
      expect(row.outcome).toBe("UNMATCHED");
      // Narrow the discriminated union so `reason` (UNMATCHED-only here) is typed.
      if (row.outcome !== "UNMATCHED") {
        throw new Error(`expected UNMATCHED row, got ${row.outcome}`);
      }
      expect(row.reason).toBeTruthy();
      expect(row.reason.length).toBeGreaterThan(0);
    }
  });

  it("normalizes country codes (lowercase + full name) so a fixable row is not silently dropped", () => {
    const result = ingestSupplierCsv(
      csv([
        "Lower Co,us,West,HIGH,SEMICONDUCTORS,30",
        "Named Co,United States,West,HIGH,SEMICONDUCTORS,30"
      ])
    );
    expect(result.report.matched).toBe(2);
    expect(result.suppliers.every((s) => s.country === "US")).toBe(true);
  });

  it("maps an unrecognized sector to OTHER_UNMAPPED rather than rejecting the row", () => {
    const result = ingestSupplierCsv(
      csv(["Mystery Co,US,West,HIGH,QUANTUM_WIDGETS,30"])
    );
    expect(result.report.matched).toBe(1);
    expect(result.suppliers[0].sector).toBe("OTHER_UNMAPPED");
  });

  it("flags a Tier-1-only upload as TIER_1", () => {
    const result = ingestSupplierCsv(
      csv(["Acme Components,US,West,HIGH,SEMICONDUCTORS,30"])
    );
    expect(result.report.dataTier).toBe("TIER_1");
    expect(result.report.tier2ColumnsDetected).toHaveLength(0);
  });

  it("flags an upload carrying Tier-2 columns as TIER_2 (detect-only, no Tier-2 write)", () => {
    const header =
      "name,country,region,risk_tier,sector,standard_lead_time_days,on_hand_units,daily_use_units";
    const result = ingestSupplierCsv(
      [header, "Acme Components,US,West,HIGH,SEMICONDUCTORS,30,1000,50"].join("\n")
    );
    expect(result.report.dataTier).toBe("TIER_2");
    expect(result.report.tier2ColumnsDetected).toEqual(
      expect.arrayContaining(["on_hand_units", "daily_use_units"])
    );
    // Detect-only: the persisted supplier still carries Tier-1 fields only.
    expect(Object.keys(result.suppliers[0]).sort()).toEqual(
      Object.keys(getTableColumns(suppliers)).sort()
    );
  });

  it("maps a Tier-1 header carrying a trailing space to its field (no trailing _)", () => {
    // "name " must normalize to "name" (not "name_") so the row is not rejected as
    // missing the required name field.
    const text = [
      "name ,country,region,risk_tier,sector,standard_lead_time_days",
      "Acme Components,US,West,HIGH,SEMICONDUCTORS,30"
    ].join("\n");
    const result = ingestSupplierCsv(text);
    expect(result.report.matched).toBe(1);
    expect(result.report.unmatched).toBe(0);
  });

  it("detects a Tier-2 header carrying a trailing space (e.g. 'on_hand_units ')", () => {
    const text = [
      "name,country,region,risk_tier,sector,standard_lead_time_days,on_hand_units ",
      "Acme Components,US,West,HIGH,SEMICONDUCTORS,30,1000"
    ].join("\n");
    const result = ingestSupplierCsv(text);
    expect(result.report.dataTier).toBe("TIER_2");
    expect(result.report.tier2ColumnsDetected).toContain("on_hand_units");
  });

  it("aborts at the row cap and never materializes an unbounded array", () => {
    const rows = Array.from(
      { length: MAX_CSV_ROWS + 50 },
      (_, i) => `Supplier ${i},US,West,HIGH,SEMICONDUCTORS,30`
    );
    const result = ingestSupplierCsv(csv(rows));
    expect(result.report.totalRows).toBeLessThanOrEqual(MAX_CSV_ROWS);
    expect(result.aborted).toBe(true);
    expect(result.abortReason).toMatch(/row cap/i);
  });

  it("exposes the documented caps", () => {
    expect(MAX_CSV_BYTES).toBe(2 * 1024 * 1024);
    expect(MAX_CSV_ROWS).toBe(2000);
  });
});
