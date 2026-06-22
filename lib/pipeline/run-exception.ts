import { buildDecisionPacket, type BuildPacketOptions } from "@/lib/pipeline/build-packet";
import {
  getDecisionPacketByIdempotencyKey,
  saveDecisionPacket
} from "@/lib/server/store";
import type { DecisionPacket } from "@/lib/schemas";
import { logger } from "@/lib/server/logger";

export type RunExceptionOptions = BuildPacketOptions & {
  idempotencyKey?: string;
};

// In-process reservation of in-flight runs keyed by idempotencyKey. This
// guarantees the expensive pipeline body (the ActionOps agent fan-out) runs at
// most once per key WITHIN a single Node instance. ACROSS instances: the DB store
// (saveDecisionPacket) now reserves the key inside the persist transaction and, on
// a conflict, rolls back + returns the winner -- so two instances on the same key
// can never persist two packets (the F2 orphan race is closed). The remaining
// cross-instance gap is double-WORK (both instances may RUN the pipeline before the
// save-time dedup), bounded by the budget cap; closing it needs a reserve-before-
// assembly row (a schema migration, post-MVP).
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
    logger.info("run-exception: coalesced onto an in-flight run for this idempotency key");
    return pending;
  }

  const promise = (async () => {
    // Double-check inside the lock: a prior run may have already persisted a
    // packet for this key in a previous (completed) request.
    const existing = await getDecisionPacketByIdempotencyKey(idempotencyKey);
    if (existing) {
      logger.info({ packetId: existing.id }, "run-exception: idempotent cache hit (existing packet)");
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
  const saved = await saveDecisionPacket(packet, { idempotencyKey });
  logger.info(
    { packetId: saved.id, packetVersion: saved.packetVersion },
    "run-exception: packet built and persisted"
  );
  return saved;
}
