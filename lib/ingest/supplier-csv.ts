import { createHash } from "node:crypto";
import Papa from "papaparse";
import {
  CountryCodeSchema,
  SectorSchema,
  SeveritySchema,
  SupplierSchema,
  type Sector,
  type Supplier,
  type SupplierRowReport,
  type SupplierUploadReport
} from "@/lib/schemas";
import { COUNTRY_NAME_TO_ISO } from "@/lib/data/country-iso";

// ---------------------------------------------------------------------------
// P2.5 supplier CSV ingestion core (R4-5/6). Framework-free: no Next.js / no DB
// imports, so the route handler is a thin adapter and the core is unit-testable
// in isolation. This module owns sanitization, the canonical-ID derivation (a
// collision-resistant SHA-256 digest of the normalized name+country, so the ID is
// a quarantined opaque handle and genuine duplicates dedup while distinct keys
// stay distinct), semantic validation, and tier detection. The route enforces the
// BYTE cap before calling in here; the ROW cap is enforced here during parse via
// papaparse `step` + `parser.abort()` so an unbounded row array is never
// materialized.
// ---------------------------------------------------------------------------

// Byte cap is enforced on the RAW request body in the route, BEFORE parse (a huge
// file must be rejected without parsing it -- DoS posture). Re-exported here so the
// one constant has a single home and the core test can assert it.
export const MAX_CSV_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_CSV_ROWS = 2000;

// Carried on every upload response. The dashboard UI string is Phase 8; this is
// the contract-level disclosure (R4-5/6).
export const RETENTION_DISCLOSURE =
  "Local demo only; uploaded supplier data is purgeable via reset.";

// The four leading formula triggers from the PLAN-binding set. (OWASP's wider set
// also lists leading tab/CR/LF; we additionally trim leading whitespace before the
// check so a space cannot smuggle a trigger past it -- see sanitizeCell.)
const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@"]);

// Tier-1 logical fields -> the header tokens accepted for each (case/format
// insensitive; see normalizeHeader). Tier-1 is the only write path in P2.5.
const TIER1_FIELDS = {
  name: ["name", "supplier_name", "suppliername"],
  country: ["country", "country_code", "countrycode"],
  region: ["region"],
  risk_tier: ["risk_tier", "risktier", "tier", "risk"],
  sector: ["sector", "industry"],
  standard_lead_time_days: [
    "standard_lead_time_days",
    "lead_time_days",
    "leadtime",
    "lead_time"
  ]
} as const;

// Recognized Tier-2 columns. Their PRESENCE flips the detected tier to TIER_2;
// P2.5 does NOT write them (route/runway/inventory writes are Phase 4/5). Detect
// + flag is the whole Tier-2 obligation here.
const TIER2_HEADERS = new Set([
  "lane",
  "route",
  "on_hand_units",
  "onhand_units",
  "daily_use_units",
  "daily_usage_units",
  "unit_revenue",
  "unit_revenue_usd",
  "revenue_per_unit"
]);

// The ISO-3166 alpha-2 name map now lives in lib/data/country-iso.ts (single source of
// truth: ingest + the Verifier's geo-coherence check normalize through the SAME table, so
// "United States" vs "US" can never read as agreement in one path and conflict in another).
// A row outside this map plus the alpha-2 regex is still rejected WITH A SPECIFIC REASON
// (see normalizeCountry / its caller), never silently.

export type IngestResult = {
  suppliers: Supplier[];
  report: SupplierUploadReport;
  // True when the row cap aborted the parse (the parse stopped early; trailing
  // rows were never read). Surfaced so the route can tell the user the upload was
  // truncated rather than fully ingested.
  aborted: boolean;
  abortReason?: string;
};

// Neutralize a leading formula trigger so the value cannot be interpreted as a
// formula by a spreadsheet downstream. Strategy: prefix-escape with a leading
// apostrophe (the spreadsheet text-literal convention) rather than DELETE the
// character, so no data is lost. BOTH leading and trailing whitespace are trimmed
// FIRST so (a) a value like "   =cmd()" cannot bypass the trigger check, and (b) a
// header like "name " is uniformly clean (no trailing "_" after normalizeHeader,
// so it still matches its Tier-1 alias). Applied to EVERY cell (header + data)
// before the value is hashed into an ID, stored, or echoed in the report.
export function sanitizeCell(value: string): string {
  // .trim() removes space, tab, CR, LF, and other Unicode whitespace from BOTH
  // ends -- so a leading tab/CR cannot smuggle a trigger past the check (OWASP
  // CSV-injection note), and a trailing space cannot corrupt a header token.
  const trimmed = value.trim();
  const first = trimmed.charAt(0);
  if (FORMULA_TRIGGERS.has(first)) {
    return `'${trimmed}`;
  }
  return trimmed;
}

// Normalize a supplier name for IDENTITY purposes (canonical ID + dedup key):
// lowercase, collapse internal whitespace, trim. This is the dedup key; same
// name+country (modulo case/spacing) -> same normalized string -> same ID.
function normalizeNameForId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

// The canonical internal supplier ID. Derived ONLY from the normalized
// (name + country) -- never embeds the raw uploaded string -- via a
// collision-resistant SHA-256 digest (16 hex chars = 64 bits; negligible
// birthday-collision probability at the 2000-row cap). This matters because the
// ID is a PRIMARY KEY: a non-crypto hash (e.g. the 32-bit stableHash) can map two
// distinct (name+country) keys to one ID, which would FALSELY dedup two unrelated
// suppliers and emit a false MATCHED_OVERWRITE. The SHA-256 digest makes that
// precondition true, so:
//   (1) an injection payload in the name never crosses downstream as a raw string
//       (the ID is a digest; downstream logic keys off this opaque handle), AND
//   (2) the same (name+country) deterministically maps to the same ID, so the
//       upsert collapses genuine duplicates = last-write-wins, while distinct keys
//       reliably stay distinct.
export function canonicalSupplierId(name: string, country: string): string {
  const key = `${normalizeNameForId(name)}|${country.toUpperCase()}`;
  return `SUP-${createHash("sha256").update(key).digest("hex").slice(0, 16)}`;
}

// Canonicalize a header token to its alias form: sanitizeCell trims BOTH ends
// (so "name " -> "name", not "name_"), then we lowercase and collapse any internal
// whitespace run to a single "_". Because the value is already end-trimmed, this
// never yields a leading/trailing underscore.
function normalizeHeader(raw: string): string {
  return sanitizeCell(raw).toLowerCase().replace(/\s+/g, "_");
}

// Map a header token to its Tier-1 logical field, or undefined if it is not a
// recognized Tier-1 column.
function tier1FieldForHeader(header: string): keyof typeof TIER1_FIELDS | undefined {
  for (const [field, aliases] of Object.entries(TIER1_FIELDS)) {
    if ((aliases as readonly string[]).includes(header)) {
      return field as keyof typeof TIER1_FIELDS;
    }
  }
  return undefined;
}

function normalizeCountry(raw: string): string | undefined {
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();
  if (CountryCodeSchema.safeParse(upper).success) {
    return upper;
  }
  const named = COUNTRY_NAME_TO_ISO[trimmed.toLowerCase()];
  return named;
}

function normalizeSector(raw: string): Sector {
  const upper = raw.trim().toUpperCase().replace(/\s+/g, "_");
  const parsed = SectorSchema.safeParse(upper);
  // Unrecognized sector maps to the escape hatch rather than rejecting the row --
  // sector is a nullable, classify-later column, so an unknown value is not a
  // reason to drop an otherwise-valid supplier.
  return parsed.success ? parsed.data : "OTHER_UNMAPPED";
}

// Validate + build ONE supplier from a header-keyed cell map. Returns either a
// typed Supplier or a SPECIFIC reason string (never a silent drop).
function buildSupplier(
  cells: Record<string, string>
): { ok: true; supplier: Supplier } | { ok: false; reason: string } {
  const rawName = cells.name ?? "";
  const name = sanitizeCell(rawName);
  if (name.trim().length === 0) {
    return { ok: false, reason: "Missing required field: name" };
  }

  const rawCountry = cells.country ?? "";
  if (rawCountry.trim().length === 0) {
    return { ok: false, reason: "Missing required field: country" };
  }
  const country = normalizeCountry(rawCountry);
  if (!country) {
    return {
      ok: false,
      reason: `Unrecognized country '${rawCountry.trim()}' (expected ISO-3166 alpha-2 code or a known country name)`
    };
  }

  const region = sanitizeCell(cells.region ?? "");
  if (region.trim().length === 0) {
    return { ok: false, reason: "Missing required field: region" };
  }

  const rawTier = (cells.risk_tier ?? "").trim().toUpperCase();
  const tierParsed = SeveritySchema.safeParse(rawTier);
  if (!tierParsed.success) {
    return {
      ok: false,
      reason: `Invalid risk_tier '${cells.risk_tier ?? ""}' (expected one of LOW, MEDIUM, HIGH, CRITICAL)`
    };
  }

  const rawLead = (cells.standard_lead_time_days ?? "").trim();
  const lead = Number(rawLead);
  if (rawLead.length === 0 || !Number.isInteger(lead) || lead < 0) {
    return {
      ok: false,
      reason: `Invalid standard_lead_time_days '${rawLead}' (expected a non-negative integer)`
    };
  }

  const sector = normalizeSector(cells.sector ?? "");

  const supplier: Supplier = {
    id: canonicalSupplierId(name, country),
    name,
    country,
    region,
    riskTier: tierParsed.data,
    // CSV ingest does not link backups (cross-supplier relational territory).
    backupSupplierId: null,
    standardLeadTimeDays: lead,
    sector
  };

  // Final genuine Zod gate: the built row must satisfy the persisted contract.
  // This is the same SupplierSchema the alignment test pins to $inferSelect, so a
  // build bug surfaces here, not in the DB.
  const validated = SupplierSchema.safeParse(supplier);
  if (!validated.success) {
    return {
      ok: false,
      reason: `Row failed validation: ${validated.error.issues
        .map((issue) => issue.message)
        .join("; ")}`
    };
  }
  return { ok: true, supplier: validated.data };
}

export function ingestSupplierCsv(text: string): IngestResult {
  // Parse header=false so we control header sanitization + 1-based row indexing
  // ourselves and never trust papaparse to dedup/transform untrusted keys.
  const headerRow: string[] = [];
  // Map a Tier-1 logical field -> the column index it lives in.
  const fieldColumnIndex: Partial<Record<keyof typeof TIER1_FIELDS, number>> = {};
  const tier2ColumnsDetected: string[] = [];

  let headerSeen = false;
  let dataRowCount = 0;
  let aborted = false;
  let abortReason: string | undefined;

  // The deduped supplier set, keyed by canonical ID (last-write-wins). The report
  // rows are accumulated separately so even overwritten rows leave an audit line.
  const supplierById = new Map<string, Supplier>();
  const reportRows: SupplierRowReport[] = [];
  let matched = 0;
  let overwritten = 0;
  let unmatched = 0;

  Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: "greedy",
    step: (results, parser) => {
      const row = results.data;
      if (!headerSeen) {
        headerSeen = true;
        for (let i = 0; i < row.length; i += 1) {
          const normalized = normalizeHeader(row[i] ?? "");
          headerRow.push(normalized);
          const field = tier1FieldForHeader(normalized);
          if (field && fieldColumnIndex[field] === undefined) {
            fieldColumnIndex[field] = i;
          }
          if (TIER2_HEADERS.has(normalized)) {
            tier2ColumnsDetected.push(normalized);
          }
        }
        return;
      }

      // Row cap: abort BEFORE processing the row beyond the cap so we never
      // materialize an unbounded array. parser.abort() stops the parse; trailing
      // rows are never read.
      if (dataRowCount >= MAX_CSV_ROWS) {
        aborted = true;
        abortReason = `Row cap exceeded: only the first ${MAX_CSV_ROWS} rows were ingested`;
        parser.abort();
        return;
      }

      dataRowCount += 1;
      const rowIndex = dataRowCount;

      // Build a header-keyed, SANITIZED cell map. Every cell is sanitized on read,
      // before it is used for an ID, stored, or echoed -- uniform neutralization.
      const cells: Record<string, string> = {};
      for (const [field, columnIndex] of Object.entries(fieldColumnIndex)) {
        if (columnIndex === undefined) {
          continue;
        }
        cells[field] = sanitizeCell(row[columnIndex] ?? "");
      }

      const built = buildSupplier(cells);
      if (!built.ok) {
        unmatched += 1;
        reportRows.push({
          rowIndex,
          outcome: "UNMATCHED",
          reason: built.reason
        });
        return;
      }

      const { supplier } = built;
      const isOverwrite = supplierById.has(supplier.id);
      supplierById.set(supplier.id, supplier);

      if (isOverwrite) {
        overwritten += 1;
        reportRows.push({
          rowIndex,
          outcome: "MATCHED_OVERWRITE",
          supplierId: supplier.id,
          supplierName: supplier.name,
          reason: `Duplicate (name+country) of canonical ID ${supplier.id}; last-write-wins overwrite applied`
        });
      } else {
        matched += 1;
        reportRows.push({
          rowIndex,
          outcome: "MATCHED",
          supplierId: supplier.id,
          supplierName: supplier.name
        });
      }
    }
  });

  const dataTier = tier2ColumnsDetected.length > 0 ? "TIER_2" : "TIER_1";

  const report: SupplierUploadReport = {
    dataTier,
    tier2ColumnsDetected,
    totalRows: dataRowCount,
    matched,
    overwritten,
    unmatched,
    rows: reportRows,
    retention: RETENTION_DISCLOSURE
  };

  return {
    suppliers: [...supplierById.values()],
    report,
    aborted,
    abortReason
  };
}
