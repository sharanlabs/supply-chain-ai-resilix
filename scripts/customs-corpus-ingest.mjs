#!/usr/bin/env node
// D0.1 -- customs-defense corpus ingestion over the MACHINE DOORS ONLY (plan §4 C17).
// Doors here: Federal Register API, OpenSanctions (UFLPA), USITC HTS REST, CourtListener.
// 403-only surfaces (cbp.gov dashboards, EAPA PDFs, FOIA reading room) are the OWNER
// BROWSER QUEUE by design -- this script must never scrape around them or fake their data.
//
//   npm run customs:ingest -- [door ...]        doors: fr opensanctions hts courtlistener
//   npm run customs:ingest                      (all doors)
//
// Raw responses cache under data/customs/cache/<door>/ (gitignored, re-fetchable).
// The committed record is data/customs/corpus-manifest.json: per-door status, count,
// source URL, and as-of timestamp (verify-over-memory, plan §4 C18). Fail-loud: a door
// that errors is recorded as such and the process exits 1 -- a broken fetch never
// silently becomes "data".
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

const CACHE_ROOT = path.join(process.cwd(), "data", "customs", "cache");
const MANIFEST_PATH = path.join(process.cwd(), "data", "customs", "corpus-manifest.json");
const STAMP = new Date().toISOString();
const DAY = STAMP.slice(0, 10);

const UA = { "user-agent": "resilix-corpus-ingest/0.1 (research prototype; public-data only)" };

function log(msg) {
  console.log(`[customs:ingest] ${msg}`);
}

async function getJson(url) {
  const res = await fetch(url, { headers: UA, cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

function cacheWrite(door, name, data) {
  const dir = path.join(CACHE_ROOT, door);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${DAY}-${name}.json`);
  writeFileSync(file, `${JSON.stringify(data, null, 1)}\n`);
  return path.relative(process.cwd(), file);
}

// --- Door: Federal Register API (rule-tracking layer + EO 14411 primary doc) ---------
async function doorFr() {
  const eoNumber = "2026-11595"; // EO 14411 publication, primary-verified in the portfolio
  const eoDoc = await getJson(
    `https://www.federalregister.gov/api/v1/documents/${eoNumber}.json`
  );
  const cbpDocs = await getJson(
    "https://www.federalregister.gov/api/v1/documents.json?per_page=100&order=newest" +
      "&conditions[agencies][]=u-s-customs-and-border-protection" +
      "&fields[]=document_number&fields[]=title&fields[]=type&fields[]=publication_date" +
      "&fields[]=abstract&fields[]=html_url"
  );
  const eapaDocs = await getJson(
    "https://www.federalregister.gov/api/v1/documents.json?per_page=100&order=newest" +
      "&conditions[term]=%22Enforce%20and%20Protect%20Act%22" +
      "&fields[]=document_number&fields[]=title&fields[]=type&fields[]=publication_date" +
      "&fields[]=abstract&fields[]=html_url"
  );
  const files = [
    cacheWrite("fr", "eo-14411-doc", eoDoc),
    cacheWrite("fr", "cbp-documents", cbpDocs),
    cacheWrite("fr", "eapa-term-documents", eapaDocs),
  ];
  const count = 1 + (cbpDocs.results?.length ?? 0) + (eapaDocs.results?.length ?? 0);
  if (count < 3) throw new Error("suspiciously empty Federal Register result set");
  return {
    count,
    files,
    source: "https://www.federalregister.gov/api/v1/",
    note: "EO 14411 primary doc + latest CBP agency docs + EAPA-term docs",
  };
}

// --- Door: OpenSanctions (UFLPA entity list) -----------------------------------------
// The dataset slug is looked up from the live index, never trusted from memory.
async function doorOpensanctions() {
  const index = await getJson("https://data.opensanctions.org/datasets/latest/index.json");
  const datasets = index.datasets ?? [];
  const uflpa = datasets.find(
    (d) => /uflpa/i.test(d.name ?? "") || /uyghur forced labor/i.test(d.title ?? "")
  );
  if (!uflpa) throw new Error("no UFLPA dataset found in the OpenSanctions index");
  const entitiesUrl = (uflpa.resources ?? []).find((r) =>
    /entities\.ftm\.json$/.test(r.name ?? r.path ?? "")
  )?.url;
  if (!entitiesUrl) throw new Error(`UFLPA dataset '${uflpa.name}' has no entities resource`);
  const res = await fetch(entitiesUrl, { headers: UA, cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} fetching ${entitiesUrl}`);
  const text = await res.text(); // newline-delimited JSON
  const lines = text.split("\n").filter(Boolean);
  if (lines.length === 0) throw new Error("UFLPA entities file was empty");
  const dir = path.join(CACHE_ROOT, "opensanctions");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${DAY}-uflpa-entities.ftm.ndjson`);
  writeFileSync(file, text.endsWith("\n") ? text : `${text}\n`);
  return {
    count: lines.length,
    files: [path.relative(process.cwd(), file)],
    source: entitiesUrl,
    note: `dataset '${uflpa.name}' resolved from the live index`,
  };
}

// --- Door: USITC HTS REST (tariff schedule slices) -----------------------------------
async function doorHts() {
  // /reststop/search is the endpoint that actually answers (exportList 400s as of 2026-07-02).
  // Representative keyword slices prove the door; targeted pulls come later as cases need them.
  const keywords = ["solar", "electric motor"]; // AD/CVD- and EAPA-heavy product areas
  const files = [];
  let count = 0;
  for (const keyword of keywords) {
    const url = `https://hts.usitc.gov/reststop/search?keyword=${encodeURIComponent(keyword)}`;
    const rows = await getJson(url);
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error(`HTS search returned no rows for '${keyword}'`);
    }
    count += rows.length;
    files.push(cacheWrite("hts", `search-${keyword.replace(/\s+/g, "-")}`, rows));
  }
  return {
    count,
    files,
    source: "https://hts.usitc.gov/reststop/search?keyword=<term>",
    note: `keyword slices: ${keywords.join(", ")}`,
  };
}

// --- Door: CourtListener (CIT/CAFC customs opinions) ----------------------------------
async function doorCourtlistener() {
  const url =
    "https://www.courtlistener.com/api/rest/v4/search/?type=o&q=%22Enforce%20and%20Protect%20Act%22&court=cit%20cafc&order_by=dateFiled%20desc";
  const data = await getJson(url);
  const rows = data.results ?? [];
  if (rows.length === 0) throw new Error("CourtListener search returned no results");
  const files = [cacheWrite("courtlistener", "eapa-opinions-search", data)];
  return {
    count: rows.length,
    files,
    source: url,
    note: "EAPA-related CIT/CAFC opinion search page 1",
  };
}

const DOORS = {
  fr: doorFr,
  opensanctions: doorOpensanctions,
  hts: doorHts,
  courtlistener: doorCourtlistener,
};

async function main() {
  const requested = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const names = requested.length > 0 ? requested : Object.keys(DOORS);
  const unknown = names.filter((n) => !DOORS[n]);
  if (unknown.length > 0) {
    console.error(`[customs:ingest] unknown door(s): ${unknown.join(", ")}`);
    console.error(`[customs:ingest] valid doors: ${Object.keys(DOORS).join(", ")}`);
    process.exit(1);
  }

  const manifest = existsSync(MANIFEST_PATH)
    ? JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
    : { note: "Per-door corpus record. Cache files are gitignored; this manifest is the committed as-of trail (plan §4 C18).", doors: {} };

  let failed = 0;
  for (const name of names) {
    log(`door '${name}' ...`);
    try {
      const result = await DOORS[name]();
      manifest.doors[name] = { status: "ok", asOf: STAMP, ...result };
      log(`  ok -- ${result.count} record(s) -> ${result.files.join(", ")}`);
    } catch (err) {
      failed += 1;
      manifest.doors[name] = {
        status: "error",
        asOf: STAMP,
        error: String(err?.message ?? err),
      };
      console.error(`[customs:ingest]   FAILED -- ${err?.message ?? err}`);
    }
  }

  mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  log(`manifest updated -> ${path.relative(process.cwd(), MANIFEST_PATH)}`);
  if (failed > 0) {
    console.error(`[customs:ingest] ${failed} door(s) failed; see manifest for the honest record.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[customs:ingest] fatal: ${err?.stack ?? err}`);
  process.exit(1);
});
