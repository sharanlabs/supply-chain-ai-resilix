import {
  MAX_CSV_BYTES,
  ingestSupplierCsv
} from "@/lib/ingest/supplier-csv";
import { apiError, noStoreJson } from "@/lib/server/http";
import { verifyApprovalToken } from "@/lib/server/security";
import { getSupplierStore } from "@/lib/server/supplier-store";

// ---------------------------------------------------------------------------
// P2.5 dedicated supplier CSV upload endpoint (R4-5/6). This handler is a thin
// ADAPTER over the framework-free ingestion core (lib/ingest/supplier-csv.ts):
//   1. no-op auth chokepoint (P2.7 flips it on; see security.ts)
//   2. byte cap (<=2 MB) enforced on the RAW body BEFORE parse -- a huge file is
//      rejected without parsing it (DoS posture). Content-Length is checked first
//      (rejects without reading the body at all), then the actually-read byte size
//      is re-checked because Content-Length may be absent or untrustworthy.
//   3. core ingest (row cap, sanitize, canonical-ID quarantine, dedup, tier, report)
//   4. persist Tier-1 suppliers via the dual-store port (pg or in-memory)
//   5. return the per-row report + retention disclosure (no-store)
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  // (1) Auth chokepoint. Currently a permissive no-op; P2.7 (R4-4) makes it
  // fail-closed. Gating on `ok` here means P2.7 needs no change at this call site.
  const auth = verifyApprovalToken(request);
  if (!auth.ok) {
    return apiError(auth.code, auth.message, auth.status);
  }

  // (2a) Byte cap via Content-Length FIRST: reject an over-cap upload without
  // reading or parsing the body at all.
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_CSV_BYTES) {
    return tooLarge();
  }

  // Read the raw body as text. We then re-check the actual byte size BEFORE
  // parsing, because Content-Length can be absent or lie.
  const text = await request.text();

  // (2b) Byte cap on the actually-read body, BEFORE parse. new Blob([]).size is
  // the UTF-8 byte length (a multibyte char must not slip past a char-count cap).
  if (new Blob([text]).size > MAX_CSV_BYTES) {
    return tooLarge();
  }

  if (text.trim().length === 0) {
    return apiError("EMPTY_UPLOAD", "Upload body is empty; expected CSV content", 400);
  }

  // (3) Core ingest. The row cap is enforced INSIDE here via papaparse step+abort,
  // so an unbounded row array is never materialized.
  const { suppliers, report, aborted, abortReason } = ingestSupplierCsv(text);

  // A well-formed but content-empty CSV (header only, or all rows rejected) is NOT
  // an error -- the per-row report explains it (zero-match-impossible: every row
  // carries a reason). Persist whatever matched (possibly nothing).

  // (4) Persist Tier-1 suppliers via the dual store (pg or in-memory).
  const persistedCount = await getSupplierStore().upsertSuppliers(suppliers);

  // (5) Return the report. `truncated` surfaces the row-cap abort so the caller
  // knows trailing rows were not ingested.
  return noStoreJson({
    report,
    persistedCount,
    truncated: aborted,
    truncationReason: abortReason
  });
}

function tooLarge() {
  return apiError(
    "REQUEST_TOO_LARGE",
    `CSV upload must be ${MAX_CSV_BYTES} bytes or smaller`,
    413
  );
}
