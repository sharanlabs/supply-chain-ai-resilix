import {
  MAX_CSV_BYTES,
  ingestSupplierCsv
} from "@/lib/ingest/supplier-csv";
import { apiError, noStoreJson, rateLimited } from "@/lib/server/http";
import { verifyApprovalToken } from "@/lib/server/security";
import { enforceMutationRateLimit } from "@/lib/server/rate-limit";
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

  // (1b) Rate limit AFTER auth (so unauthorized 401/503 callers never consume a
  // bucket) but BEFORE any body read/parse work -- a flood is braked before it
  // can cost CPU. Single-instance brake; distributed limiting is the prod path.
  const rate = enforceMutationRateLimit("suppliers-upload", request);
  if (!rate.allowed) {
    return rateLimited(rate.retryAfterSeconds);
  }

  // (2a) Byte cap via Content-Length FIRST: reject an over-cap upload without
  // reading or parsing the body at all.
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_CSV_BYTES) {
    return tooLarge();
  }

  // (2b) STREAM the body with the byte cap enforced DURING the read (2026-07-16
  // re-review, B-06): `await request.text()` would fully materialize a body whose
  // Content-Length is absent or lies before any cap check ran — a memory-exhaustion
  // path. Count bytes as chunks arrive, cancel the moment the cap is crossed, and
  // only then decode the bounded buffer.
  const reader = request.body?.getReader();
  if (!reader) {
    return apiError("EMPTY_UPLOAD", "Upload body is empty; expected CSV content", 400);
  }
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedBytes += value.byteLength;
    if (receivedBytes > MAX_CSV_BYTES) {
      await reader.cancel();
      return tooLarge();
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder("utf-8").decode(merged);

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
