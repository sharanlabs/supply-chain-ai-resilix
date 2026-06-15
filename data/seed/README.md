# Supplier seed (`us-suppliers.seed.csv`)

The RESILIX ActionOps showcase supplier dataset: a 150-row supplier base for a
US-headquartered, globally-sourced mid-market company. It is the demo's backbone --
the dataset against which the disruption scenarios produce exposure.

## This data is SYNTHETIC and MODELED. Not real company data.

Every supplier name, region, risk tier, and lead time in this file is fabricated.
The dataset is *modeled* on published supply-chain patterns (sector mix, sourcing
geographies, lead-time bands), in the same spirit as the predecessor data notes,
but it deliberately attaches no risk or operational claim to any real company.
Do not cite it as real sourcing data, and do not infer anything about a named
firm from it -- the names are descriptive synthetic labels (e.g.
`Texas Energy Holdings 071`), not real entities.

Why synthetic rather than scraped real facilities: this is a trust/evidence
product, so it must never assert a false attribute (e.g. "supplier X is CRITICAL
risk") about a real company. A clearly-synthetic, internally-consistent dataset is
the honest choice for a demo seed.

## What it is (Tier-1)

Six Tier-1 columns -- exactly the fields the P2.5 ingestion core persists:

| Column | Meaning |
|---|---|
| `name` | Synthetic display name |
| `country` | ISO-3166 alpha-2 origin code |
| `region` | Sub-national region / metro |
| `risk_tier` | `LOW` / `MEDIUM` / `HIGH` / `CRITICAL` |
| `sector` | A `SectorSchema` member (closed taxonomy) |
| `standard_lead_time_days` | Non-negative integer |

**Tier-2 (route / inventory / revenue) data is intentionally NOT in this seed.**
P2.5 ingestion does not persist Tier-2 columns (it only flags their presence), and
P2.4 models routes, inventory, and products as separate normalized tables. The
runway/simulation showcase is seeded into those tables in Phase 4/5; putting
per-supplier `lane`/`on_hand_units` here would be inert, mis-shaped data. The
deterministic exposure engine (Atlas, Phase 5) matches on country + sector +
chokepoint, so this Tier-1 seed is sufficient to drive the Hormuz exposure demo.

## Designed backward from the locked demo scenarios

Each locked scenario maps to a named subset that must exist for the demo to light
up (see `docs/claude/RESEARCH-us-landscape-2026-06-12.md`):

- **Hormuz Gulf-chokepoint closure (primary demo)** -> the 9 Gulf-origin suppliers
  (AE / SA / QA / KW) plus the 28 global `ENERGY` + `CHEMICALS` suppliers that a
  Gulf oil/petrochem shock reprices.
- **Tariff regime whiplash (Section 232/301)** -> the CN (24) and DE (11) suppliers
  in `SEMICONDUCTORS` / `ELECTRONICS` / `AUTOMOTIVE` / `METALS_MINING`, plus the
  Asian semis origins (TW / KR / JP).
- **Domestic trucking capacity shock** -> the US-domestic plurality (71 suppliers,
  the single largest origin) across every sector, plus `LOGISTICS`.

Secondary eval scenarios (Red Sea diversion, DRAM allocation, hurricane
single-source, pharma API) are also covered by the CN/IN/VN, KR/TW, US-pharma, and
IN-pharma subsets respectively.

## Composition

150 rows. US is the plurality (71, ~47%) -- the largest single origin by ~3x,
reflecting a US company with significant global sourcing. Origins: US 71, CN 24,
DE 11, MX 9, JP 7, TW 5, KR 5, IN 5, SA 3, AE 3, VN 2, NL 2, QA 2, KW 1.

The **exact per-sector, per-country, and per-tier counts are pinned in
`evals/supplier-seed.test.ts`**, which is the machine-checked source of truth. The
test asserts zero `OTHER_UNMAPPED`, so a typo'd sector in the CSV (which would
silently coalesce to the escape hatch) fails loudly. To change the composition,
edit the CSV and update the pinned tallies in that test.

## How it loads

The seed flows through the **same P2.5 ingestion core** as a user upload
(`ingestSupplierCsv`): identical sanitization, canonical SHA-256 `SUP-` ID
derivation, dedup, and Zod validation. It therefore cannot drift from the upload
contract -- a schema change that breaks user uploads breaks the seed test too.

- **Demo (no DB):** upload `us-suppliers.seed.csv` via the dashboard, which posts to
  `POST /api/suppliers/upload`.
- **Local Postgres:** with `DATABASE_URL` set, run `npm run seed:suppliers` (it fails
  loudly if `DATABASE_URL` is missing, rather than silently doing nothing). It upserts
  the 150 rows by canonical primary key (last-write-wins) and never deletes or
  truncates, so re-running converges to exactly the same 150 seed rows. Note: the
  upsert *overwrites* any existing row whose canonical ID (sha256 of name+country)
  matches a seed row. By design those are the same logical supplier, but a
  user-uploaded supplier that happens to share a name+country with a seed entry would
  be refreshed to seed values on re-seed. The path is non-destructive (no
  DELETE/TRUNCATE), not conflict-free.

Loader logic: `lib/ingest/seed-suppliers.ts`. It fails loudly if any row does not
ingest cleanly, so a partial seed is impossible.
