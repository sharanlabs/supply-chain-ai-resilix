import { afterEach, describe, expect, it } from "vitest";
import { POST as uploadSuppliers } from "@/app/api/suppliers/upload/route";
import { RETENTION_DISCLOSURE } from "@/lib/ingest/supplier-csv";
import { __resetMemorySuppliersForTest } from "@/lib/server/supplier-store";
import { __resetRateLimitForTest } from "@/lib/server/rate-limit";

const HEADER = "name,country,region,risk_tier,sector,standard_lead_time_days";

function uploadRequest(
  body: string,
  init: { contentLength?: string; contentType?: string } = {}
): Request {
  const headers: Record<string, string> = {
    "content-type": init.contentType ?? "text/csv"
  };
  if (init.contentLength !== undefined) {
    headers["content-length"] = init.contentLength;
  }
  return new Request("http://localhost/api/suppliers/upload", {
    method: "POST",
    headers,
    body
  });
}

describe("P2.5 POST /api/suppliers/upload", () => {
  afterEach(() => {
    __resetMemorySuppliersForTest();
    // The mutation routes now flow through a module-level rate limiter; reset it
    // between cases so this file's call volume cannot accumulate into a 429.
    __resetRateLimitForTest();
  });

  it("ingests a valid Tier-1 CSV and returns a matched report", async () => {
    const response = await uploadSuppliers(
      uploadRequest(`${HEADER}\nAcme Components,US,West,HIGH,SEMICONDUCTORS,30`)
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.report.matched).toBe(1);
    expect(body.report.dataTier).toBe("TIER_1");
    expect(body.report.retention).toBe(RETENTION_DISCLOSURE);
    expect(body.persistedCount).toBe(1);
  });

  it("rejects an oversize file via Content-Length BEFORE parsing", async () => {
    // Claim a Content-Length over the cap; the route must reject on the header
    // alone, without reading/parsing the (here small) body.
    const response = await uploadSuppliers(
      uploadRequest(`${HEADER}\nAcme,US,West,HIGH,SEMICONDUCTORS,30`, {
        contentLength: String(2 * 1024 * 1024 + 1)
      })
    );
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toBe("REQUEST_TOO_LARGE");
  });

  it("rejects an oversize body even when Content-Length is absent (byte count)", async () => {
    // No Content-Length header; the route must still enforce the cap by counting
    // bytes of the read body, BEFORE handing it to the parser.
    const big = `${HEADER}\n` + "Acme,US,West,HIGH,SEMICONDUCTORS,30\n".repeat(70_000);
    expect(new Blob([big]).size).toBeGreaterThan(2 * 1024 * 1024);
    const response = await uploadSuppliers(uploadRequest(big));
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toBe("REQUEST_TOO_LARGE");
  });

  it("reports truncation when the row cap is exceeded", async () => {
    const rows = Array.from(
      { length: 2050 },
      (_, i) => `Supplier ${i},US,West,HIGH,SEMICONDUCTORS,30`
    );
    const response = await uploadSuppliers(
      uploadRequest([HEADER, ...rows].join("\n"))
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.report.totalRows).toBeLessThanOrEqual(2000);
    expect(body.truncated).toBe(true);
  });

  it("rejects an empty body with a specific error", async () => {
    const response = await uploadSuppliers(uploadRequest(""));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("EMPTY_UPLOAD");
  });

  it("persists the canonical-ID supplier through the store (queryable by ID, not raw name)", async () => {
    await uploadSuppliers(
      uploadRequest(`${HEADER}\n=cmd()Acme,US,West,HIGH,SEMICONDUCTORS,30`)
    );
    // Read back via the store to confirm the persisted name is sanitized.
    const { getSupplierStore } = await import("@/lib/server/supplier-store");
    const stored = await getSupplierStore().listSuppliers();
    expect(stored).toHaveLength(1);
    expect(stored[0].name).not.toMatch(/^=/);
    expect(stored[0].id).toMatch(/^SUP-/);
    expect(stored[0].id).not.toContain("cmd");
  });
});
