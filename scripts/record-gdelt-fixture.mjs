#!/usr/bin/env node
// Capture a real GDELT DOC 2.0 artlist into a dated fixture under data/signals/.
// The replay layer (lib/signals/cached.ts) maps these through the live mapper, so a
// fresh capture is how the replay set is refreshed -- never by hand-authoring signals.
//
//   npm run record:signals -- ['<query>'] [timespan] [maxrecords]
//
// Pure Node (no TS), fail-loud: a non-200, non-JSON, or empty response exits 1
// instead of writing a broken fixture. GDELT throttles to one request / 5s, so a 429
// is reported with that guidance rather than silently retried.
import { renameSync, writeFileSync } from "node:fs";

// EV-11 (2026-07-16 re-review): stage-then-atomic-replace, so an interrupted write never
// leaves a truncated fixture on disk (mirrors evals/_helpers/atomic-write.ts; inlined here
// because this is a plain-Node .mjs script that cannot import the TS helper).
function atomicWriteFileSync(path, contents) {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, contents);
  renameSync(tmp, path);
}

const GDELT_DOC_URL = "https://api.gdeltproject.org/api/v2/doc/doc";

const [queryArg, timespanArg, maxArg] = process.argv.slice(2);
const query = (queryArg ?? '"supply chain" disruption').slice(0, 200);
const timespan = /^\d{1,3}[smhdw]$/i.test(timespanArg ?? "") ? timespanArg : "3d";
const maxRecords = Math.min(50, Math.max(1, Number.parseInt(maxArg ?? "25", 10) || 25));

const url =
  `${GDELT_DOC_URL}?query=${encodeURIComponent(query)}` +
  `&mode=artlist&maxrecords=${maxRecords}&format=json&timespan=${encodeURIComponent(timespan)}`;

const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const outPath = `data/signals/gdelt-artlist-sample-${stamp}.json`;

function fail(message) {
  console.error(`[record:signals] ${message}`);
  process.exit(1);
}

async function main() {
  console.log(`[record:signals] GET ${url}`);
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 429) {
    fail("GDELT 429 (throttled). Limit is one request / 5s -- wait and retry.");
  }
  if (!res.ok) {
    fail(`GDELT ${res.status} ${res.statusText}`);
  }
  let body;
  try {
    body = await res.json();
  } catch {
    fail("response was not JSON (GDELT serves HTML when throttled/erroring).");
  }
  if (!body || !Array.isArray(body.articles) || body.articles.length === 0) {
    fail("no articles in response; refusing to write an empty fixture.");
  }
  atomicWriteFileSync(outPath, `${JSON.stringify({ articles: body.articles })}\n`);
  console.log(`[record:signals] wrote ${body.articles.length} article(s) -> ${outPath}`);
  console.log(
    "[record:signals] to adopt as replay: point lib/signals/cached.ts at the new dated file"
  );
  console.log(
    "[record:signals] and update the CAPTURE date in evals/cached-signals.test.ts."
  );
}

main().catch((err) => {
  fail(`failed: ${err instanceof Error ? err.message : String(err)}`);
});
