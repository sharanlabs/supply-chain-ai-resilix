import { buildDecisionPacket, type BuildPacketOptions } from "@/lib/pipeline/build-packet";
import {
  getDecisionPacketByIdempotencyKey,
  saveDecisionPacket
} from "@/lib/server/store";
import type { DecisionPacket } from "@/lib/schemas";

export type RunExceptionOptions = BuildPacketOptions & {
  idempotencyKey?: string;
};

// In-process reservation of in-flight runs keyed by idempotencyKey. This
// guarantees the expensive pipeline body (the ActionOps agent fan-out) runs at
// most once per key WITHIN a single Node instance. Cross-instance serialization
// relies on the DB unique constraint on run_idempotency_keys plus a future
// Postgres advisory lock (post-MVP).
const inflightRuns = new Map<string, Promise<DecisionPacket>>();

export async function runExceptionPipeline(
  options: RunExceptionOptions = {}
): Promise<DecisionPacket> {
  const { idempotencyKey } = options;
  if (!idempotencyKey) {
    return executeAndSave(options);
  }

  // get -> create promise -> set must be synchronous and contiguous (no await
  // between them) so a concurrent same-key caller sees the in-flight promise.
  const pending = inflightRuns.get(idempotencyKey);
  if (pending) {
    return pending;
  }

  const promise = (async () => {
    // Double-check inside the lock: a prior run may have already persisted a
    // packet for this key in a previous (completed) request.
    const existing = await getDecisionPacketByIdempotencyKey(idempotencyKey);
    if (existing) {
      return existing;
    }
    return executeAndSave(options);
  })();
  inflightRuns.set(idempotencyKey, promise);

  try {
    return await promise;
  } finally {
    inflightRuns.delete(idempotencyKey);
  }
}

// D.1 V2 cutover: the pipeline ASSEMBLES via buildDecisionPacket (the pure
// ActionOps producer -- it owns the 6-agent fan-out, schema validation, and the
// mode taxonomy) and then PERSISTS the result. This wrapper adds ONLY the
// idempotency mutex above + the save, so assembly stays separable from
// persistence: the UI render path (app/page.tsx) calls buildDecisionPacket
// directly and never writes, while the API path persists here.
//
// The return type stays the DecisionPacket UNION, not DecisionPacketV2: a fresh
// run is always V2, but the idempotency double-check can return a previously
// stored packet of either version, so the union is the type-honest contract.
async function executeAndSave(
  options: RunExceptionOptions
): Promise<DecisionPacket> {
  const { idempotencyKey, ...buildOptions } = options;
  const packet = await buildDecisionPacket(buildOptions);
  return saveDecisionPacket(packet, { idempotencyKey });
}
