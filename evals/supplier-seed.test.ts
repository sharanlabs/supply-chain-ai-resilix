import { existsSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_CSV_BYTES, ingestSupplierCsv } from "@/lib/ingest/supplier-csv";
import {
  EXPECTED_SEED_ROW_COUNT,
  SEED_CSV_PATH,
  ingestSeed,
  readSeedCsv
} from "@/lib/ingest/seed-suppliers";
import { CountryCodeSchema, SectorSchema, SeveritySchema } from "@/lib/schemas";

// P2.6 -- the ~150-row US-plurality supplier seed. This suite proves the seed flows
// 100% clean through the P2.5 ingestion core and pins the AUTHORED composition with
// EXACT counts (not "coverage"): `normalizeSector` silently maps an unknown sector
// token to OTHER_UNMAPPED, so a typo'd sector in the CSV would degrade silently and
// a coverage-only test would still pass. Exact per-sector counts + OTHER_UNMAPPED===0
// make any such drift fail loudly. Composition rationale: data/seed/README.md.

// Authored tallies (sum to 150; OTHER_UNMAPPED intentionally absent).
const EXPECTED_SECTORS: Record<string, number> = {
  ELECTRONICS: 16,
  ENERGY: 16,
  SEMICONDUCTORS: 14,
  AUTOMOTIVE: 14,
  PHARMACEUTICALS: 12,
  CHEMICALS: 12,
  INDUSTRIAL_MACHINERY: 11,
  MEDICAL_DEVICES: 9,
  METALS_MINING: 9,
  CONSUMER_GOODS: 9,
  AGRICULTURE_FOOD: 8,
  LOGISTICS: 8,
  AEROSPACE_DEFENSE: 6,
  TEXTILES_APPAREL: 6
};
const EXPECTED_COUNTRIES: Record<string, number> = {
  US: 71,
  CN: 24,
  DE: 11,
  MX: 9,
  JP: 7,
  TW: 5,
  KR: 5,
  IN: 5,
  SA: 3,
  AE: 3,
  VN: 2,
  NL: 2,
  QA: 2,
  KW: 1
};
const EXPECTED_TIERS: Record<string, number> = {
  MEDIUM: 59,
  HIGH: 55,
  LOW: 21,
  CRITICAL: 15
};
const GULF = ["AE", "SA", "QA", "KW"];

function tallyBy(values: readonly unknown[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    const key = String(value);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

describe("P2.6 US supplier seed", () => {
  const result = ingestSupplierCsv(readSeedCsv());
  const { suppliers, report } = result;

  it("seed CSV exists and is well under the ingestion byte cap", () => {
    expect(existsSync(SEED_CSV_PATH)).toBe(true);
    const { size } = statSync(SEED_CSV_PATH);
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThan(MAX_CSV_BYTES);
  });

  it("ingests 100% clean through the P2.5 core (no unmatched, not truncated)", () => {
    // Surface the specific reasons so a regression is debuggable from the failure.
    const unmatchedReasons = report.rows
      .filter((row) => row.outcome === "UNMATCHED")
      .map((row) => `row ${row.rowIndex}: ${row.reason}`);
    expect(unmatchedReasons).toEqual([]);
    expect(result.aborted).toBe(false);
    expect(report.unmatched).toBe(0);
    expect(report.overwritten).toBe(0);
    expect(report.matched).toBe(EXPECTED_SEED_ROW_COUNT);
    expect(report.totalRows).toBe(EXPECTED_SEED_ROW_COUNT);
    expect(suppliers).toHaveLength(EXPECTED_SEED_ROW_COUNT);
  });

  it("ingestSeed() helper succeeds and returns the full set", () => {
    expect(() => ingestSeed()).not.toThrow();
    expect(ingestSeed().suppliers).toHaveLength(EXPECTED_SEED_ROW_COUNT);
  });

  it("is a Tier-1 seed (no Tier-2 route/inventory columns)", () => {
    expect(report.dataTier).toBe("TIER_1");
    expect(report.tier2ColumnsDetected).toEqual([]);
  });

  it("has the exact authored per-sector counts and zero OTHER_UNMAPPED", () => {
    const sectorTally = tallyBy(suppliers.map((s) => s.sector));
    expect(sectorTally).toEqual(EXPECTED_SECTORS);
    expect(sectorTally.OTHER_UNMAPPED ?? 0).toBe(0);
    expect(sectorTally.null ?? 0).toBe(0);
    for (const supplier of suppliers) {
      expect(SectorSchema.safeParse(supplier.sector).success).toBe(true);
    }
    const sum = Object.values(EXPECTED_SECTORS).reduce((a, b) => a + b, 0);
    expect(sum).toBe(EXPECTED_SEED_ROW_COUNT);
  });

  it("is US-plurality with the exact authored country counts", () => {
    const countryTally = tallyBy(suppliers.map((s) => s.country));
    expect(countryTally).toEqual(EXPECTED_COUNTRIES);
    // US is the single largest origin (the "US dataset" invariant).
    const max = Math.max(...Object.values(countryTally));
    expect(countryTally.US).toBe(max);
    expect(Object.values(countryTally).filter((n) => n === max)).toHaveLength(1);
    for (const supplier of suppliers) {
      expect(CountryCodeSchema.safeParse(supplier.country).success).toBe(true);
    }
  });

  it("carries a Gulf-origin set so the Hormuz primary demo can light up", () => {
    const gulfCount = suppliers.filter((s) => GULF.includes(s.country)).length;
    expect(gulfCount).toBe(9);
    // Plus a global ENERGY/CHEMICALS pool the Hormuz price-shock matches on.
    const energyChem = suppliers.filter(
      (s) => s.sector === "ENERGY" || s.sector === "CHEMICALS"
    ).length;
    expect(energyChem).toBe(28);
  });

  it("pins the scenario-critical country x sector joints (defends the demo design)", () => {
    // Marginal counts alone do not protect the scenario-backward design: swapping a
    // Gulf ENERGY row's country with a US LOGISTICS row's country preserves every
    // marginal (country totals, sector totals, Gulf count, ENERGY/CHEMICALS count)
    // while gutting the Hormuz Gulf-origin energy/chem set. These JOINT cells are the
    // real guard for each locked demo scenario (see data/seed/README.md).
    type Row = (typeof suppliers)[number];
    const count = (pred: (s: Row) => boolean) => suppliers.filter(pred).length;
    const isGulf = (s: Row) => GULF.includes(s.country);
    const isAsian = (s: Row) => ["TW", "KR", "JP"].includes(s.country);
    const isTariffSector = (s: Row) =>
      ["SEMICONDUCTORS", "ELECTRONICS", "AUTOMOTIVE", "METALS_MINING"].includes(
        String(s.sector)
      );

    // Hormuz (primary demo): the entire Gulf-origin set is ENERGY/CHEMICALS.
    expect(
      count((s) => isGulf(s) && (s.sector === "ENERGY" || s.sector === "CHEMICALS"))
    ).toBe(9);
    // DRAM / tariff semis: Asian semiconductor origins.
    expect(count((s) => isAsian(s) && s.sector === "SEMICONDUCTORS")).toBe(9);
    // Tariff Section 232/301: CN across the tariff-exposed sectors.
    expect(count((s) => s.country === "CN" && isTariffSector(s))).toBe(11);
    // Tariff autos: German automotive.
    expect(count((s) => s.country === "DE" && s.sector === "AUTOMOTIVE")).toBe(3);
    // Domestic trucking shock: US logistics.
    expect(count((s) => s.country === "US" && s.sector === "LOGISTICS")).toBe(7);
  });

  it("raw seed file has no formula-injection-leading cells (tamper guard)", () => {
    // The ingestion core sanitizes leading = + - @, so a tampered seed cell would be
    // silently neutralized and still ingest. Assert directly on the RAW file that no
    // data cell begins with a formula trigger, so seed-file tampering fails this suite
    // rather than being masked by sanitization. (Seed values contain no commas, so a
    // naive split is sufficient here.)
    const dataLines = readSeedCsv().trim().split("\n").slice(1);
    const offenders: string[] = [];
    dataLines.forEach((line, index) => {
      for (const cell of line.split(",")) {
        if (["=", "+", "-", "@"].includes(cell.trim().charAt(0))) {
          offenders.push(`row ${index + 1} cell "${cell}"`);
        }
      }
    });
    expect(offenders).toEqual([]);
  });

  it("has the exact authored risk-tier distribution", () => {
    const tierTally = tallyBy(suppliers.map((s) => s.riskTier));
    expect(tierTally).toEqual(EXPECTED_TIERS);
    for (const supplier of suppliers) {
      expect(SeveritySchema.safeParse(supplier.riskTier).success).toBe(true);
    }
  });

  it("has realistic, bounded, varied lead times", () => {
    const leads = suppliers.map((s) => s.standardLeadTimeDays);
    for (const lead of leads) {
      expect(Number.isInteger(lead)).toBe(true);
      expect(lead).toBeGreaterThanOrEqual(0);
      expect(lead).toBeLessThanOrEqual(64);
    }
    expect(Math.min(...leads)).toBeLessThan(15); // some fast domestic lanes
    expect(Math.max(...leads)).toBeGreaterThan(40); // some long trans-oceanic lanes
    expect(new Set(leads).size).toBeGreaterThan(10); // genuine spread, not a constant
  });

  it("derives unique, deterministic SUP- canonical IDs (sha256 quarantine)", () => {
    const ids = suppliers.map((s) => s.id);
    expect(new Set(ids).size).toBe(EXPECTED_SEED_ROW_COUNT);
    for (const id of ids) {
      expect(id).toMatch(/^SUP-[0-9a-f]{16}$/);
    }
    // Deterministic: re-ingesting the same bytes yields the identical ID set.
    const again = ingestSupplierCsv(readSeedCsv())
      .suppliers.map((s) => s.id)
      .sort();
    expect(again).toEqual([...ids].sort());
    // CSV ingest never links backups (later-phase relational territory).
    for (const supplier of suppliers) {
      expect(supplier.backupSupplierId ?? null).toBeNull();
    }
  });

  it("still detects Tier-2 columns WITHOUT widening the real seed (fixture)", () => {
    // The real seed stays Tier-1; this tiny inline fixture proves the P2.5 detector
    // still flips dataTier to TIER_2 when route/inventory columns appear.
    const tier2Csv =
      "name,country,region,risk_tier,sector,standard_lead_time_days,on_hand_units,lane\n" +
      "Acme Co,US,Texas,HIGH,ENERGY,12,5000,Jebel Ali to Houston\n" +
      "Beta Co,AE,Abu Dhabi,CRITICAL,ENERGY,40,2000,Jebel Ali to Houston\n";
    const t2 = ingestSupplierCsv(tier2Csv);
    expect(t2.report.dataTier).toBe("TIER_2");
    expect(t2.report.tier2ColumnsDetected).toEqual(
      expect.arrayContaining(["on_hand_units", "lane"])
    );
    // Tier-2 columns are detected/flagged but not persisted by P2.5; the rows still
    // ingest as Tier-1 supplier records.
    expect(t2.suppliers).toHaveLength(2);
  });
});
