import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Real-socket e2e for POST /api/suppliers/upload. The P2.5 route tests exercise
// the handler IN-PROCESS (calling POST() directly); this is the missing leg:
// a CSV POSTed over a REAL TCP socket to the running `next dev` server, proving
// the route works end-to-end through Next's request pipeline (security headers,
// body decoding, JSON serialization) -- not just the handler function.
//
// DETERMINISM under a reused dev server:
//   - The in-memory supplier store PERSISTS across specs and re-runs, so a fixed
//     supplier name flips MATCHED -> MATCHED_OVERWRITE on the 2nd run. We use a
//     per-run-unique name and accept either outcome.
//   - The mutation routes now have a module-level rate limiter keyed by client.
//     We send a per-run-unique x-forwarded-for so each run gets a fresh IP bucket
//     and never collides with another spec/run or the shared demo bucket.
//   - The dev server runs AUTHLESS (no DATABASE_URL / live AI / opt-in), which is
//     the disclosed demo posture, so no bearer token is needed.
// ---------------------------------------------------------------------------

const CSV_HEADER = "name,country,region,risk_tier,sector,standard_lead_time_days";

// Unique per test run so the in-memory store / rate-limit buckets never collide.
const runTag = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

function uniqueForwardedFor(): string {
  // A syntactically valid, run-unique client IP for the limiter's IP-key path.
  const a = Math.floor(Math.random() * 254) + 1;
  const b = Math.floor(Math.random() * 254) + 1;
  return `198.51.${a}.${b}`;
}

test.describe("real-HTTP /api/suppliers/upload", () => {
  test("ingests a CSV over a real socket and returns the matched/unmatched report", async ({
    request
  }) => {
    const supplierName = `E2E Supplier ${runTag} A`;
    const body = [
      CSV_HEADER,
      `${supplierName},US,West,HIGH,SEMICONDUCTORS,30`,
      // An UNMATCHED row (bad country) so the report exercises both buckets.
      `Bad Row ${runTag},ZZZ-not-a-country,West,HIGH,SEMICONDUCTORS,30`
    ].join("\n");

    const res = await request.post("/api/suppliers/upload", {
      headers: {
        "content-type": "text/csv",
        "x-forwarded-for": uniqueForwardedFor()
      },
      data: body
    });

    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toBe("no-store");

    const json = await res.json();
    // Report shape: one matched Tier-1 supplier + one unmatched row.
    expect(json.report.dataTier).toBe("TIER_1");
    expect(json.report.matched).toBeGreaterThanOrEqual(1);
    expect(json.report.unmatched).toBe(1);
    expect(Array.isArray(json.report.rows)).toBe(true);

    // The matched row is either a first insert or an overwrite (store persists in
    // the reused dev server) -- both prove the round-trip succeeded.
    const matchedRow = json.report.rows.find(
      (r: { outcome: string }) => r.outcome === "MATCHED" || r.outcome === "MATCHED_OVERWRITE"
    );
    expect(matchedRow).toBeTruthy();
    expect(matchedRow.supplierId).toMatch(/^SUP-/);

    // The unmatched row carries a specific reason (never a silent drop).
    const unmatchedRow = json.report.rows.find(
      (r: { outcome: string }) => r.outcome === "UNMATCHED"
    );
    expect(unmatchedRow).toBeTruthy();
    expect(typeof unmatchedRow.reason).toBe("string");
  });

  test("sanitizes a formula-injection cell in the round-trip (no leading =)", async ({
    request
  }) => {
    // A leading "=" makes a spreadsheet treat the cell as a formula. The route
    // must neutralize it (apostrophe-prefix) before it is echoed in the report.
    const body = [
      CSV_HEADER,
      `=cmd()Inject ${runTag},US,West,HIGH,SEMICONDUCTORS,30`
    ].join("\n");

    const res = await request.post("/api/suppliers/upload", {
      headers: {
        "content-type": "text/csv",
        "x-forwarded-for": uniqueForwardedFor()
      },
      data: body
    });

    expect(res.status()).toBe(200);
    const json = await res.json();

    const row = json.report.rows.find(
      (r: { outcome: string }) => r.outcome === "MATCHED" || r.outcome === "MATCHED_OVERWRITE"
    );
    expect(row).toBeTruthy();
    // Neutralized: the echoed name starts with the text-literal apostrophe, not "=".
    expect(row.supplierName.startsWith("'=")).toBe(true);
    expect(row.supplierName.startsWith("=")).toBe(false);
  });

  test("rejects an over-cap body (>2 MB) with 413", async ({ request }) => {
    // A REAL over-2MB body (not a spoofed Content-Length): the route must reject
    // it via the byte-size check before ingestion.
    const oneRow = "Acme,US,West,HIGH,SEMICONDUCTORS,30\n";
    const big = `${CSV_HEADER}\n` + oneRow.repeat(70_000); // ~2.4 MB
    expect(Buffer.byteLength(big, "utf8")).toBeGreaterThan(2 * 1024 * 1024);

    const res = await request.post("/api/suppliers/upload", {
      headers: {
        "content-type": "text/csv",
        "x-forwarded-for": uniqueForwardedFor()
      },
      data: big
    });

    expect(res.status()).toBe(413);
    const json = await res.json();
    expect(json.error).toBe("REQUEST_TOO_LARGE");
  });
});
