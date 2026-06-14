import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import {
  actionItems,
  chokepoints,
  disruptionEvents,
  exposureResults,
  products,
  routeChokepoints,
  routes,
  supplierMessages,
  suppliers
} from "@/db/schema";
import {
  ActionItemSchema,
  ChokepointSchema,
  CountryCodeSchema,
  DisruptionEventSchema,
  ExposureResultSchema,
  ProductSchema,
  RouteSchema,
  SectorSchema,
  SupplierMessageDraftSchema
} from "@/lib/schemas";

// P2.4 schema-extension alignment test (real teeth). The rows below are typed as
// `typeof <table>.$inferSelect`, so a Drizzle/Zod drift (numeric -> string,
// timestamp -> Date, nullable column vs non-null Zod field, a renamed/added/
// dropped column) fails `tsc` or the runtime parse, not production. The master
// tables align 1:1; the three transactional projections carry extra persistence
// columns (disruption_event_id / created_at) and are validated through the same
// DB-row -> domain mapper Phases 5/7/8 will use (drop persistence cols, null ->
// undefined for the optional fields).

function columns(table: Parameters<typeof getTableColumns>[0]): string[] {
  return Object.keys(getTableColumns(table)).sort();
}

describe("P2.4 sector + country contracts", () => {
  it("SectorSchema is a closed set with the OTHER_UNMAPPED escape hatch", () => {
    expect(SectorSchema.options).toContain("OTHER_UNMAPPED");
    expect(SectorSchema.safeParse("SEMICONDUCTORS").success).toBe(true);
    expect(SectorSchema.safeParse("NOT_A_REAL_SECTOR").success).toBe(false);
  });

  it("CountryCodeSchema accepts ISO-3166 alpha-2 only", () => {
    expect(CountryCodeSchema.safeParse("US").success).toBe(true);
    expect(CountryCodeSchema.safeParse("USA").success).toBe(false);
    expect(CountryCodeSchema.safeParse("us").success).toBe(false);
  });
});

describe("P2.4 master-data: DB-shaped rows satisfy their Zod schema 1:1", () => {
  it("products", () => {
    const row: typeof products.$inferSelect = {
      id: "prod-1",
      name: "Flagship Handset",
      revenuePerUnitUsd: 899.99,
      priority: "CRITICAL"
    };
    expect(ProductSchema.parse(row)).toEqual(row);
    expect(columns(products)).toEqual(["id", "name", "priority", "revenuePerUnitUsd"]);
  });

  it("chokepoints (incl. null region/country)", () => {
    const row: typeof chokepoints.$inferSelect = {
      id: "cp-hormuz",
      name: "Strait of Hormuz",
      region: null,
      country: null
    };
    expect(ChokepointSchema.parse(row)).toEqual(row);
    const populated: typeof chokepoints.$inferSelect = {
      id: "cp-suez",
      name: "Suez Canal",
      region: "Mediterranean-Red Sea",
      country: "EG"
    };
    expect(ChokepointSchema.parse(populated)).toEqual(populated);
    expect(columns(chokepoints)).toEqual(["country", "id", "name", "region"]);
    expect(getTableColumns(chokepoints).region.notNull).toBe(false);
    expect(getTableColumns(chokepoints).country.notNull).toBe(false);
  });

  it("routes", () => {
    const row: typeof routes.$inferSelect = {
      id: "route-asia-eu",
      name: "Shanghai to Rotterdam",
      originCountry: "CN",
      destinationCountry: "NL",
      mode: "SEA"
    };
    expect(RouteSchema.parse(row)).toEqual(row);
    expect(columns(routes)).toEqual([
      "destinationCountry",
      "id",
      "mode",
      "name",
      "originCountry"
    ]);
  });

  it("route_chokepoints (M:N join: composite key, both columns NOT NULL)", () => {
    expect(columns(routeChokepoints)).toEqual(["chokepointId", "routeId"]);
    expect(getTableColumns(routeChokepoints).routeId.notNull).toBe(true);
    expect(getTableColumns(routeChokepoints).chokepointId.notNull).toBe(true);
  });

  it("disruption_events (DB Date -> ISO mapper; null location; numeric confidence)", () => {
    const row: typeof disruptionEvents.$inferSelect = {
      id: "evt-1",
      eventType: "PORT_CLOSURE",
      severity: "HIGH",
      region: null,
      country: null,
      chokepointId: null,
      summary: "Tanker traffic halted at the strait.",
      evidenceUrls: ["https://example.com/report"],
      confidence: 0.82,
      sourceCapturedAt: new Date("2026-06-13T00:00:00.000Z"),
      createdAt: new Date("2026-06-13T00:00:00.000Z")
    };
    // Phase 5/7/8 DB-row -> domain mapper: timestamptz Date -> ISO string for the
    // z.string().datetime() contract. (Drizzle mode:"string" would emit the
    // Postgres "YYYY-MM-DD HH:mm:ss+HH" format, which z.string().datetime() rejects.)
    const domain = {
      ...row,
      sourceCapturedAt: row.sourceCapturedAt.toISOString(),
      createdAt: row.createdAt.toISOString()
    };
    expect(DisruptionEventSchema.parse(domain)).toEqual(domain);
    expect(columns(disruptionEvents)).toEqual([
      "chokepointId",
      "confidence",
      "country",
      "createdAt",
      "eventType",
      "evidenceUrls",
      "id",
      "region",
      "severity",
      "sourceCapturedAt",
      "summary"
    ]);
    expect(getTableColumns(disruptionEvents).chokepointId.notNull).toBe(false);
  });
});

describe("P2.4 transactional projections: DB row -> domain mapper satisfies the P2.3 schema", () => {
  it("exposure_results (NOT NULL event FK; numeric score; jsonb evidence)", () => {
    const row: typeof exposureResults.$inferSelect = {
      id: "exp-1",
      disruptionEventId: "evt-1",
      supplierId: "sup-1",
      supplierName: "Acme Components",
      country: "OM",
      sector: "SEMICONDUCTORS",
      exposureScore: 0.74,
      rationale: "Sole-source supplier sits downstream of the closed strait.",
      evidenceIds: ["evt-1"],
      createdAt: new Date("2026-06-13T00:00:00.000Z")
    };
    const domain = {
      id: row.id,
      supplierId: row.supplierId,
      supplierName: row.supplierName,
      country: row.country,
      sector: row.sector,
      exposureScore: row.exposureScore,
      rationale: row.rationale,
      evidenceIds: row.evidenceIds
    };
    expect(ExposureResultSchema.parse(domain)).toEqual(domain);
    expect(columns(exposureResults)).toEqual([
      "country",
      "createdAt",
      "disruptionEventId",
      "evidenceIds",
      "exposureScore",
      "id",
      "rationale",
      "sector",
      "supplierId",
      "supplierName"
    ]);
    expect(getTableColumns(exposureResults).disruptionEventId.notNull).toBe(true);
  });

  it("action_items (NOT NULL event FK; nullable due_date -> optional)", () => {
    const row: typeof actionItems.$inferSelect = {
      id: "act-1",
      disruptionEventId: "evt-1",
      title: "Confirm backup supplier capacity",
      owner: "ops@resilix.example",
      status: "OPEN",
      dueDate: null,
      createdAt: new Date("2026-06-13T00:00:00.000Z")
    };
    const domain = {
      id: row.id,
      title: row.title,
      owner: row.owner,
      status: row.status,
      dueDate: row.dueDate ?? undefined
    };
    expect(ActionItemSchema.parse(domain)).toEqual(domain);
    expect(columns(actionItems)).toEqual([
      "createdAt",
      "disruptionEventId",
      "dueDate",
      "id",
      "owner",
      "status",
      "title"
    ]);
    expect(getTableColumns(actionItems).disruptionEventId.notNull).toBe(true);
  });

  it("supplier_messages (NOT NULL event FK; drafts; jsonb claims)", () => {
    const row: typeof supplierMessages.$inferSelect = {
      id: "msg-1",
      disruptionEventId: "evt-1",
      supplierId: "sup-1",
      channel: "EMAIL",
      subject: null,
      body: "Please confirm your ability to expedite the open order.",
      claims: [
        { value: 0.74, unit: "exposure", sourcePath: "exposureResults[0].exposureScore" }
      ],
      approvalRequired: true,
      createdAt: new Date("2026-06-13T00:00:00.000Z")
    };
    const domain = {
      id: row.id,
      supplierId: row.supplierId,
      channel: row.channel,
      subject: row.subject ?? undefined,
      body: row.body,
      claims: row.claims,
      approvalRequired: row.approvalRequired
    };
    expect(SupplierMessageDraftSchema.parse(domain)).toEqual(domain);
    expect(columns(supplierMessages)).toEqual([
      "approvalRequired",
      "body",
      "channel",
      "claims",
      "createdAt",
      "disruptionEventId",
      "id",
      "subject",
      "supplierId"
    ]);
    expect(getTableColumns(supplierMessages).disruptionEventId.notNull).toBe(true);
  });
});

describe("P2.4 suppliers sector column", () => {
  it("suppliers gains a NULLABLE sector column", () => {
    expect(columns(suppliers)).toContain("sector");
    expect(getTableColumns(suppliers).sector.notNull).toBe(false);
  });
});
