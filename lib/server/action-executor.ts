import { randomUUID } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { executedActions } from "@/db/schema";
import type {
  ApprovalStatus,
  AuditTrailEntry,
  DecisionPacket,
  ExecutedAction,
  ExecutedActionStatus
} from "@/lib/schemas";
import { ExecutedActionSchema } from "@/lib/schemas";
import { getDatabaseUrl, getDb } from "@/lib/server/db";
import { updateDecisionPacket, listDecisionPackets } from "@/lib/server/store";
import { logger } from "@/lib/server/logger";
import {
  deriveGovernableActions,
  type GovernableAction
} from "@/lib/server/action-taxonomy";
import {
  defaultTransportRegistry,
  transportRegistryFromEnv,
  resolveTransport,
  type TransportRegistry
} from "@/lib/server/action-transport";

// ---------------------------------------------------------------------------
// Phase 5 -- the TRANSACTIONAL OUTBOX executor.
//
// The flow for one governable action (the literal outbox pattern, grill R9):
//   1. RESERVE a DISPATCHING row inside a transaction -- the claim/lease. The UNIQUE
//      idempotency_key serializes concurrent reservers; ON CONFLICT DO NOTHING
//      returns no row for the loser. This is "reserve/record in the SAME transaction
//      as the state change" -- the row's existence IS the state change. The DISPATCHING
//      status marks "a dispatch attempt is in flight" -- distinct from a human-gated
//      outward PENDING row, so a crash-stranded attempt is unambiguously identifiable.
//   2. Only the WINNER dispatches, OUTSIDE the transaction (never hold a DB txn
//      across a network call), via the injected transport port. The default is the
//      NoopTransport (logs, never sends), so no real outward call fires by default.
//   3. FINALIZE the row to EXECUTED (transport returned) or FAILED (transport threw
//      -- fail-closed, audited, never a silent partial).
// A duplicate caller returns the existing row WITHOUT dispatching: exactly-once
// INTENT.
//
// CRASH RECOVERY (Codex P5 closure #2): a process that dies between (1) and (3) leaves
// a stranded DISPATCHING row; a naive retry would dedupe on it and NEVER dispatch.
// `reconcileStrandedDispatches` closes that gap -- it re-derives the action from the
// packet (the digest is deliberately NOT persisted) and re-drives the stranded row
// through (2)+(3). It re-drives ONLY reversible/internal actions; a human-gated outward
// action is never auto-driven by reconcile (the governance moat holds on recovery too).
// Exactly-once DELIVERY across a re-drive still needs the transport's own provider
// idempotency key (carried as `idempotencyKey` in every TransportMessage) -- the
// enterprise/real-transport responsibility; inert under the default NoopTransport.
//
// Two stores mirror lib/server/store.ts: an in-memory store (the authless demo +
// the suite) and a Postgres store (db.transaction over the pg Pool).
// ---------------------------------------------------------------------------

export type ReserveActionInput = {
  action: GovernableAction;
  requestedAt: string;
  auditDetail: string;
};

export type ReserveResult =
  // We won the claim -- proceed to dispatch + finalize.
  | { outcome: "RESERVED"; action: ExecutedAction }
  // Already reserved by another caller -- do NOT dispatch; return the existing row.
  | { outcome: "DUPLICATE"; action: ExecutedAction };

export type FinalizeActionInput = {
  id: string;
  status: Extract<ExecutedActionStatus, "EXECUTED" | "FAILED">;
  executedAt: string;
  auditDetail: string;
  errorClass: string | null;
};

export type RecordNonDispatchedInput = {
  action: GovernableAction;
  status: Extract<ExecutedActionStatus, "PENDING" | "SKIPPED">;
  requestedAt: string;
  auditDetail: string;
};

// `created` distinguishes a freshly-recorded row from an idempotent hit on a prior
// row -- the orchestrator audits only NEWLY-processed actions, so a re-run does not
// duplicate audit-trail entries.
export type RecordResult = { created: boolean; action: ExecutedAction };

// The atomic recovery claim (Codex P5 closure #2, finding 2): re-claim a stranded
// DISPATCHING row ONLY if it is still DISPATCHING AND its claim is strictly older than
// `cutoffIso` (i.e. truly past the lease, not a live in-flight dispatch). The winner gets
// the row with `requestedAt` bumped to `nowIso` (so a CONCURRENT reconcile loses the
// compare-and-set and cannot double-drive); a loser gets undefined. This is the CAS that
// makes concurrent reconcile sweeps re-drive each row at most once.
export type ReclaimForReconcileInput = {
  id: string;
  cutoffIso: string;
  nowIso: string;
};

export type ExecutedActionStore = {
  reserveAction(input: ReserveActionInput): Promise<ReserveResult>;
  finalizeAction(input: FinalizeActionInput): Promise<ExecutedAction | undefined>;
  recordNonDispatched(input: RecordNonDispatchedInput): Promise<RecordResult>;
  reclaimForReconcile(
    input: ReclaimForReconcileInput
  ): Promise<ExecutedAction | undefined>;
  getActionByIdempotencyKey(key: string): Promise<ExecutedAction | undefined>;
  listActionsForPacket(packetId: string): Promise<ExecutedAction[]>;
};

// Build the PENDING (or non-dispatched) domain record from a derived action.
function buildActionRecord(
  action: GovernableAction,
  id: string,
  status: ExecutedActionStatus,
  requestedAt: string,
  auditDetail: string
): ExecutedAction {
  return {
    id,
    packetId: action.packetId,
    actionType: action.actionType,
    channel: action.channel,
    reversibility: action.reversibility,
    status,
    idempotencyKey: action.idempotencyKey,
    payloadHash: action.payloadHash,
    requestedAt,
    executedAt: null,
    auditDetail,
    errorClass: null
  };
}

// ---- in-memory store -------------------------------------------------------
// Single-threaded JS: each method body runs to completion with no interleaving
// await between the read and the write, so the reserve check -> set is atomic and
// two concurrent same-key callers cannot both reserve.
const memoryActions = new Map<string, ExecutedAction>(); // keyed by idempotencyKey
const memoryActionIdIndex = new Map<string, string>(); // id -> idempotencyKey

const memoryStore: ExecutedActionStore = {
  async reserveAction({ action, requestedAt, auditDetail }) {
    const existing = memoryActions.get(action.idempotencyKey);
    if (existing) {
      return { outcome: "DUPLICATE", action: existing };
    }
    const id = `EXA-${randomUUID()}`;
    // DISPATCHING = the in-flight claim/lease; finalizeAction moves it terminal, or a
    // crash leaves it for reconcileStrandedDispatches to re-drive.
    const row = buildActionRecord(action, id, "DISPATCHING", requestedAt, auditDetail);
    memoryActions.set(action.idempotencyKey, row);
    memoryActionIdIndex.set(id, action.idempotencyKey);
    return { outcome: "RESERVED", action: row };
  },

  async finalizeAction({ id, status, executedAt, auditDetail, errorClass }) {
    const key = memoryActionIdIndex.get(id);
    if (!key) {
      return undefined;
    }
    const current = memoryActions.get(key);
    if (!current) {
      return undefined;
    }
    const updated: ExecutedAction = {
      ...current,
      status,
      executedAt,
      auditDetail,
      errorClass
    };
    memoryActions.set(key, updated);
    return updated;
  },

  async recordNonDispatched({ action, status, requestedAt, auditDetail }) {
    const existing = memoryActions.get(action.idempotencyKey);
    if (existing) {
      return { created: false, action: existing };
    }
    const id = `EXA-${randomUUID()}`;
    const row = buildActionRecord(action, id, status, requestedAt, auditDetail);
    memoryActions.set(action.idempotencyKey, row);
    memoryActionIdIndex.set(id, action.idempotencyKey);
    return { created: true, action: row };
  },

  async reclaimForReconcile({ id, cutoffIso, nowIso }) {
    // Single-threaded JS: this read-check-write runs atomically (no await between),
    // so two concurrent reconcile sweeps cannot both win the claim for one row.
    const key = memoryActionIdIndex.get(id);
    if (!key) {
      return undefined;
    }
    const current = memoryActions.get(key);
    if (!current || current.status !== "DISPATCHING") {
      return undefined;
    }
    // STRICT older-than-cutoff: a row whose claim is at/after the cutoff is either still
    // in-lease (live) or already re-claimed by a concurrent sweep that bumped it -> lose.
    if (Date.parse(current.requestedAt) >= Date.parse(cutoffIso)) {
      return undefined;
    }
    const reclaimed: ExecutedAction = { ...current, requestedAt: nowIso };
    memoryActions.set(key, reclaimed);
    return reclaimed;
  },

  async getActionByIdempotencyKey(key) {
    return memoryActions.get(key);
  },

  async listActionsForPacket(packetId) {
    return [...memoryActions.values()].filter((a) => a.packetId === packetId);
  }
};

// ---- Postgres store --------------------------------------------------------
function toRow(record: ExecutedAction) {
  return {
    id: record.id,
    packetId: record.packetId,
    actionType: record.actionType,
    channel: record.channel,
    reversibility: record.reversibility,
    status: record.status,
    idempotencyKey: record.idempotencyKey,
    payloadHash: record.payloadHash,
    requestedAt: new Date(record.requestedAt),
    executedAt: record.executedAt ? new Date(record.executedAt) : null,
    auditDetail: record.auditDetail,
    errorClass: record.errorClass,
    createdAt: new Date()
  };
}

// Parse the stored row back through the Zod contract -- so a corrupt/unknown value
// fails loudly here (the same fail-loud discipline as parseStoredPacket), rather
// than flowing on as an untyped string.
function fromRow(row: typeof executedActions.$inferSelect): ExecutedAction {
  return ExecutedActionSchema.parse({
    id: row.id,
    packetId: row.packetId,
    actionType: row.actionType,
    channel: row.channel,
    reversibility: row.reversibility,
    status: row.status,
    idempotencyKey: row.idempotencyKey,
    payloadHash: row.payloadHash,
    requestedAt: row.requestedAt.toISOString(),
    executedAt: row.executedAt ? row.executedAt.toISOString() : null,
    auditDetail: row.auditDetail,
    errorClass: row.errorClass
  });
}

const postgresStore: ExecutedActionStore = {
  async reserveAction({ action, requestedAt, auditDetail }) {
    const db = getDb();
    const id = `EXA-${randomUUID()}`;
    // DISPATCHING = the in-flight claim/lease (see the memory store + the module header):
    // distinct from a human-gated outward PENDING row, so a crash-stranded attempt is
    // re-drivable by reconcileStrandedDispatches and a held outward action never is.
    const record = buildActionRecord(action, id, "DISPATCHING", requestedAt, auditDetail);
    // The reservation is a single INSERT, wrapped in a transaction to make the
    // "reserve in the SAME txn as the state change" explicit (and future-proof if a
    // co-written audit projection is added). ON CONFLICT (idempotency_key) DO NOTHING
    // returns no row for the loser of the unique-constraint race.
    const inserted = await db.transaction(async (tx) =>
      tx
        .insert(executedActions)
        .values(toRow(record))
        .onConflictDoNothing({ target: executedActions.idempotencyKey })
        .returning({ id: executedActions.id })
    );

    if (inserted.length > 0) {
      return { outcome: "RESERVED", action: record };
    }

    // Lost the claim race: the winning row is committed and now visible. Re-read it.
    const existing = await this.getActionByIdempotencyKey(action.idempotencyKey);
    if (!existing) {
      // Seen-as-taken but unreadable (the winner rolled back between our conflict and
      // our read -- vanishingly rare). Fail loud rather than dispatch a second time.
      throw new Error(
        `executed_actions: reservation conflict for ${action.idempotencyKey} but the winning row is not readable`
      );
    }
    return { outcome: "DUPLICATE", action: existing };
  },

  async finalizeAction({ id, status, executedAt, auditDetail, errorClass }) {
    const db = getDb();
    const [row] = await db
      .update(executedActions)
      .set({
        status,
        executedAt: new Date(executedAt),
        auditDetail,
        errorClass
      })
      .where(eq(executedActions.id, id))
      .returning();
    return row ? fromRow(row) : undefined;
  },

  async recordNonDispatched({ action, status, requestedAt, auditDetail }) {
    const db = getDb();
    const id = `EXA-${randomUUID()}`;
    const record = buildActionRecord(action, id, status, requestedAt, auditDetail);
    const inserted = await db
      .insert(executedActions)
      .values(toRow(record))
      .onConflictDoNothing({ target: executedActions.idempotencyKey })
      .returning();
    if (inserted.length > 0) {
      return { created: true, action: fromRow(inserted[0]) };
    }
    const existing = await this.getActionByIdempotencyKey(action.idempotencyKey);
    if (!existing) {
      throw new Error(
        `executed_actions: non-dispatched record conflict for ${action.idempotencyKey} but the winning row is not readable`
      );
    }
    return { created: false, action: existing };
  },

  async reclaimForReconcile({ id, cutoffIso, nowIso }) {
    const db = getDb();
    // Atomic compare-and-set: the row-level UPDATE...WHERE...RETURNING is the claim. The
    // predicate (status DISPATCHING AND requestedAt strictly < cutoff) + the bump to nowIso
    // mean a CONCURRENT reconcile's UPDATE matches zero rows (the winner moved requestedAt
    // past the cutoff), so a stranded row is re-driven by at most one sweep.
    const [row] = await db
      .update(executedActions)
      .set({ requestedAt: new Date(nowIso) })
      .where(
        and(
          eq(executedActions.id, id),
          eq(executedActions.status, "DISPATCHING"),
          lt(executedActions.requestedAt, new Date(cutoffIso))
        )
      )
      .returning();
    return row ? fromRow(row) : undefined;
  },

  async getActionByIdempotencyKey(key) {
    const db = getDb();
    const [row] = await db
      .select()
      .from(executedActions)
      .where(eq(executedActions.idempotencyKey, key))
      .limit(1);
    return row ? fromRow(row) : undefined;
  },

  async listActionsForPacket(packetId) {
    const db = getDb();
    const rows = await db
      .select()
      .from(executedActions)
      .where(eq(executedActions.packetId, packetId));
    return rows.map(fromRow);
  }
};

export function getExecutedActionStore(): ExecutedActionStore {
  return getDatabaseUrl() ? postgresStore : memoryStore;
}

// Test-only: clear in-memory executed-action state so it cannot leak across `it`
// blocks in the same file (vitest isolates module state per FILE, not per test).
export function __resetExecutedActionsForTest(): void {
  memoryActions.clear();
  memoryActionIdIndex.clear();
}

// ---- dispatch + orchestration ---------------------------------------------

export type DispatchDeps = {
  store?: ExecutedActionStore;
  registry?: TransportRegistry;
  // Injectable ISO clock so tests can pin timestamps deterministically.
  now?: () => string;
};

// Reserve -> (winner only) dispatch via the transport port -> finalize EXECUTED /
// FAILED. A duplicate caller returns the existing row WITHOUT dispatching, so the
// transport runs at most once per logical action (exactly-once intent). The public
// wrapper returns just the row; the detailed variant also reports `created` (whether
// THIS call won the claim) so the orchestrator audits only newly-processed actions.
//
// THE MOAT AT THE PRIMITIVE (Codex P5 closure #2, finding 1): this is an AUTO-dispatch
// path -- it fails closed for any non-REVERSIBLE action. An IRREVERSIBLE/outward action is
// NEVER auto-sent here, even via this exported function; outward execution is a separate,
// explicit, human-approved entry point (intentionally not built here). So the governance
// moat does not rest only on the orchestrator filtering before the call -- the primitive
// itself refuses.
export async function dispatchGovernableAction(
  action: GovernableAction,
  deps: DispatchDeps = {}
): Promise<ExecutedAction> {
  return (await dispatchGovernableActionDetailed(action, deps)).action;
}

async function dispatchGovernableActionDetailed(
  action: GovernableAction,
  deps: DispatchDeps = {}
): Promise<RecordResult> {
  // Fail-closed moat (see above): auto-dispatch is for REVERSIBLE/internal actions only.
  if (action.reversibility !== "REVERSIBLE") {
    throw new Error(
      `action-executor: refusing to auto-dispatch a non-reversible action (${action.actionType}); outward execution is a separate human-gated path`
    );
  }

  const store = deps.store ?? getExecutedActionStore();
  const registry = deps.registry ?? defaultTransportRegistry();
  const clock = deps.now ?? (() => new Date().toISOString());

  const reservation = await store.reserveAction({
    action,
    requestedAt: clock(),
    auditDetail: `Reserved ${action.actionType} (${action.channel}) for dispatch`
  });

  if (reservation.outcome === "DUPLICATE") {
    return { created: false, action: reservation.action };
  }

  // We won the claim. Dispatch OUTSIDE the reservation transaction, then finalize.
  return dispatchAndFinalize(reservation.action, action, store, registry, clock);
}

// Shared dispatch + finalize: deliver via the transport port, then move the claimed
// (DISPATCHING) row to a terminal EXECUTED / FAILED. This is the SINGLE place the
// transport is called and the row is finalized -- used by both the first-attempt path
// (dispatchGovernableActionDetailed) and the crash-recovery sweep
// (reconcileStrandedDispatches), so the fail-closed + no-prose-leak discipline lives
// in exactly one moat point. `reservedRow` is the already-claimed DISPATCHING row.
async function dispatchAndFinalize(
  reservedRow: ExecutedAction,
  action: GovernableAction,
  store: ExecutedActionStore,
  registry: TransportRegistry,
  clock: () => string
): Promise<RecordResult> {
  const transport = resolveTransport(action.channel, registry);
  try {
    const receipt = await transport.deliver({
      idempotencyKey: action.idempotencyKey,
      actionType: action.actionType,
      channel: action.channel,
      digest: action.digest
    });
    const finalized = await store.finalizeAction({
      id: reservedRow.id,
      status: "EXECUTED",
      executedAt: clock(),
      // Audit carries the transport name + provider ref + delivered flag -- NOT any
      // message body (no prose leak).
      auditDetail: `Dispatched via ${receipt.transport} (delivered=${receipt.delivered}, ref=${receipt.providerRef})`,
      errorClass: null
    });
    // Golden-signal observability (R12): a redacted execution event -- IDs/enums only,
    // never message prose. The logger also redacts secrets by construction.
    logger.info(
      {
        event: "action.executed",
        actionType: action.actionType,
        channel: action.channel,
        idempotencyKey: action.idempotencyKey,
        transport: receipt.transport,
        delivered: receipt.delivered
      },
      "action-executor: action EXECUTED"
    );
    return {
      created: true,
      action: finalized ?? { ...reservedRow, status: "EXECUTED" }
    };
  } catch (error) {
    // FAIL-CLOSED: record FAILED + the error CLASS (never error.message -- it could
    // carry sensitive text). Never re-raise as success; never leave a silent partial.
    const errorClass = error instanceof Error ? error.name : "UnknownError";
    const finalized = await store.finalizeAction({
      id: reservedRow.id,
      status: "FAILED",
      executedAt: clock(),
      auditDetail: `Transport ${action.channel} failed; recorded FAILED (fail-closed)`,
      errorClass
    });
    // The error SIGNAL an operator alerts on (the failed/stuck-action metric, R12).
    logger.warn(
      {
        event: "action.dispatch_failed",
        actionType: action.actionType,
        channel: action.channel,
        idempotencyKey: action.idempotencyKey,
        errorClass
      },
      "action-executor: transport failed; recorded FAILED (fail-closed)"
    );
    return {
      created: true,
      action: finalized ?? { ...reservedRow, status: "FAILED", errorClass }
    };
  }
}

export type ReconcileOptions = {
  // A DISPATCHING row is treated as STRANDED only when its claim (requestedAt) is older
  // than this many ms -- the lease window. The point is to NEVER grab a dispatch that is
  // legitimately in flight; only a claim older than the window is a true strand.
  // Default = 60_000 (60s): safe even if this is mis-run during live traffic (a normal
  // transport call completes in well under 60s), AND correct for the primary STARTUP-sweep
  // use case (strands left by a dead prior process always have an old requestedAt). Raise
  // it for a deployment with slower transports; pass 0 only for a sweep you KNOW runs with
  // no dispatch concurrently in flight. Belt to this suspenders: exactly-once DELIVERY
  // across any re-drive is the transport's provider-idempotency-key responsibility.
  leaseMs?: number;
};

// Conservative default lease window (ms). See ReconcileOptions.leaseMs.
const DEFAULT_RECONCILE_LEASE_MS = 60_000;

export type ReconcileResult = {
  packetId: string;
  // Stranded DISPATCHING rows this sweep re-drove through the transport.
  reconciled: number;
  reExecuted: number;
  reFailed: number;
  // DISPATCHING rows still inside the lease window (likely a live in-flight dispatch,
  // not a strand) -- left for a later sweep.
  skippedInLease: number;
  // DISPATCHING rows whose action the packet no longer derives (content changed since the
  // claim) -- left untouched + surfaced for an operator, never fabricated.
  skippedUnmatched: number;
  // DISPATCHING rows that classify NON-reversible -- refused (the governance moat). This
  // is 0 in normal flow (outward actions are recorded PENDING, never reserved); >0 means
  // an anomalous row was correctly NOT auto-sent.
  skippedNonReversible: number;
  // DISPATCHING rows whose STORED fields (payloadHash/actionType/channel/reversibility)
  // disagree with the re-derived action -- a tampered row or a hash-prefix collision.
  // Refused as an integrity mismatch (never re-driven with a mismatched payload).
  skippedIntegrityMismatch: number;
  // DISPATCHING rows a CONCURRENT reconcile sweep claimed first (lost the atomic reclaim).
  // The other sweep re-drove it; this one correctly did not double-send.
  skippedRaced: number;
  actions: ExecutedAction[];
};

// Crash-recovery sweep (Codex P5 closure #2). A process that dies between reserve and
// finalize leaves a stranded DISPATCHING row that a naive retry would dedupe on and never
// dispatch. This re-drives those rows so a reserved-but-never-sent action is no longer
// stuck forever.
//
// SAFETY: the action is RE-DERIVED from the packet (deterministic -- the digest is
// deliberately not persisted), and the sweep re-drives ONLY code-classified
// REVERSIBLE/internal actions. A human-gated outward action is NEVER auto-driven by
// reconcile -- the governance moat holds on recovery exactly as on first dispatch. Only an
// APPROVED packet is eligible (defense in depth, mirroring executeApprovedPacketActions).
// Inert under the default NoopTransport; exactly-once DELIVERY across a re-drive is the
// transport's provider-idempotency-key responsibility (carried in every TransportMessage).
export async function reconcileStrandedDispatches(input: {
  packet: DecisionPacket;
  deps?: DispatchDeps;
  options?: ReconcileOptions;
}): Promise<ReconcileResult> {
  const { packet } = input;
  const deps = input.deps ?? {};
  const store = deps.store ?? getExecutedActionStore();
  const registry = deps.registry ?? defaultTransportRegistry();
  const clock = deps.now ?? (() => new Date().toISOString());
  const leaseMs = input.options?.leaseMs ?? DEFAULT_RECONCILE_LEASE_MS;

  const result: ReconcileResult = {
    packetId: packet.id,
    reconciled: 0,
    reExecuted: 0,
    reFailed: 0,
    skippedInLease: 0,
    skippedUnmatched: 0,
    skippedNonReversible: 0,
    skippedIntegrityMismatch: 0,
    skippedRaced: 0,
    actions: []
  };

  // Defense in depth: only an APPROVED packet may (re-)execute.
  if (packet.approvalStatus !== "APPROVED") {
    return result;
  }

  const dispatching = (await store.listActionsForPacket(packet.id)).filter(
    (r) => r.status === "DISPATCHING"
  );
  if (dispatching.length === 0) {
    return result;
  }

  // Re-derive the actions DETERMINISTICALLY -> recover each digest (not persisted) + the
  // code-owned reversibility, keyed by the stable idempotencyKey.
  const actionsByKey = new Map(
    deriveGovernableActions(packet).map((a) => [a.idempotencyKey, a])
  );
  const nowIso = clock();
  const nowMs = Date.parse(nowIso);
  const cutoffMs = nowMs - leaseMs;
  const cutoffIso = new Date(cutoffMs).toISOString();

  for (const row of dispatching) {
    // A claim at/after the cutoff is within the lease window -- likely a LIVE in-flight
    // dispatch, not a strand. Leave it for a later sweep. (The atomic reclaim below also
    // enforces strictly-older-than-cutoff, so this is a fast-path count, not the gate.)
    if (Date.parse(row.requestedAt) >= cutoffMs) {
      result.skippedInLease += 1;
      continue;
    }

    const action = actionsByKey.get(row.idempotencyKey);
    if (!action) {
      // The packet no longer derives this action -- do NOT fabricate a dispatch.
      logger.warn(
        {
          event: "action.reconcile_unmatched",
          packetId: packet.id,
          idempotencyKey: row.idempotencyKey,
          actionType: row.actionType
        },
        "action-executor: stranded DISPATCHING row has no matching derived action; left for operator"
      );
      result.skippedUnmatched += 1;
      continue;
    }

    // THE MOAT, on recovery too: reconcile re-drives ONLY reversible/internal actions,
    // keyed on the CODE-owned classification (action.reversibility), never on the stored
    // row. An outward action is never auto-driven -- in normal flow it is never DISPATCHING
    // (outward actions are recorded PENDING via recordNonDispatched), so this guard fires
    // only on an anomaly, and fail-closed leaves it for a human.
    if (action.reversibility !== "REVERSIBLE") {
      logger.warn(
        {
          event: "action.reconcile_outward_refused",
          packetId: packet.id,
          idempotencyKey: row.idempotencyKey,
          actionType: row.actionType
        },
        "action-executor: refusing to auto-reconcile a non-reversible action (governance moat)"
      );
      result.skippedNonReversible += 1;
      continue;
    }

    // INTEGRITY (finding 3): the stored row must agree with the re-derived action on every
    // execution-binding field, not just the idempotencyKey (which embeds only a 64-bit hash
    // prefix). A tampered row or a hash-prefix collision is refused -- never re-driven with a
    // mismatched payload, never finalized as the stored row.
    if (
      row.payloadHash !== action.payloadHash ||
      row.actionType !== action.actionType ||
      row.channel !== action.channel ||
      row.reversibility !== action.reversibility
    ) {
      logger.warn(
        {
          event: "action.reconcile_integrity_mismatch",
          packetId: packet.id,
          idempotencyKey: row.idempotencyKey,
          actionType: row.actionType
        },
        "action-executor: stranded row disagrees with the re-derived action; refused (integrity mismatch)"
      );
      result.skippedIntegrityMismatch += 1;
      continue;
    }

    // ATOMIC RECLAIM (finding 2): only the winner of a concurrent sweep re-drives. The CAS
    // bumps requestedAt past the cutoff, so a parallel reconcile loses the claim and cannot
    // double-send. A loser (or a row another sweep already moved) is counted, not re-driven.
    const claimed = await store.reclaimForReconcile({ id: row.id, cutoffIso, nowIso });
    if (!claimed) {
      result.skippedRaced += 1;
      continue;
    }

    const redriven = await dispatchAndFinalize(claimed, action, store, registry, clock);
    result.reconciled += 1;
    if (redriven.action.status === "EXECUTED") {
      result.reExecuted += 1;
    } else if (redriven.action.status === "FAILED") {
      result.reFailed += 1;
    }
    result.actions.push(redriven.action);
  }

  // Sweep golden signal: counts only, no prose. reFailed > 0 or a persistent
  // skippedUnmatched is the operator-alert surface.
  logger.info(
    {
      event: "action.reconcile_sweep",
      packetId: result.packetId,
      reconciled: result.reconciled,
      reExecuted: result.reExecuted,
      reFailed: result.reFailed,
      skippedInLease: result.skippedInLease,
      skippedUnmatched: result.skippedUnmatched,
      skippedNonReversible: result.skippedNonReversible,
      skippedIntegrityMismatch: result.skippedIntegrityMismatch,
      skippedRaced: result.skippedRaced
    },
    "action-executor: stranded-dispatch reconcile sweep complete"
  );

  return result;
}

// S6 -- the STARTUP reconcile sweep (the recorded 2026-06-27 forward-guardrail).
// reconcileStrandedDispatches recovers ONE packet's stranded dispatches; nothing
// called it at process start, so a crash that stranded a REVERSIBLE dispatch was
// never recovered until a request happened to touch that packet. This wires it to
// the boot path (instrumentation.ts): enumerate persisted packets and reconcile
// each. The governance moat holds unchanged -- reconcile re-drives ONLY REVERSIBLE
// actions on APPROVED packets and NEVER an outward/IRREVERSIBLE one (ERP_CASE/n8n
// included), so a boot sweep can never auto-fire an outbound webhook.
//
// Fail-SAFE by construction: it is best-effort, never throws into the caller
// (a strand-recovery failure must not crash the server boot), and is inert under
// the in-memory demo store (no packets persist across a restart, so there is
// nothing stranded to recover) -- it earns its keep only on a persistent (DB)
// production deploy.
export async function reconcileAllStrandedDispatches(deps?: {
  listPackets?: () => Promise<DecisionPacket[]>;
  reconcile?: typeof reconcileStrandedDispatches;
  registry?: TransportRegistry;
  now?: () => string;
}): Promise<{ packetsScanned: number; reExecuted: number; reFailed: number; errored: number }> {
  const listPackets = deps?.listPackets ?? (async () => (await listDecisionPackets()) as DecisionPacket[]);
  // Final-gate Codex MED: the boot sweep uses CONFIGURED transports so a recovered
  // REVERSIBLE action reaches the transport an operator set (empty {} -> all-Noop for
  // the keyless demo, unchanged). The moat is intact: reconcile re-drives only
  // REVERSIBLE actions, never the outward ERP_CASE/n8n path.
  const registry = deps?.registry ?? transportRegistryFromEnv();
  const reconcile =
    deps?.reconcile ?? ((input) => reconcileStrandedDispatches({ ...input, deps: { registry } }));
  const summary = { packetsScanned: 0, reExecuted: 0, reFailed: 0, errored: 0 };

  let packets: DecisionPacket[];
  try {
    packets = await listPackets();
  } catch (e) {
    logger.warn(
      { event: "action.boot_reconcile_list_failed", error: e instanceof Error ? e.message : String(e) },
      "action-executor: boot reconcile could not list packets; skipping sweep (non-fatal)"
    );
    return summary;
  }

  for (const packet of packets) {
    summary.packetsScanned += 1;
    try {
      const res = await reconcile({ packet });
      summary.reExecuted += res.reExecuted;
      summary.reFailed += res.reFailed;
    } catch (e) {
      // One packet's failure never aborts the sweep or the boot.
      summary.errored += 1;
      logger.warn(
        {
          event: "action.boot_reconcile_packet_failed",
          packetId: packet.id,
          error: e instanceof Error ? e.message : String(e)
        },
        "action-executor: boot reconcile failed for one packet; continuing"
      );
    }
  }

  logger.info(
    { event: "action.boot_reconcile_complete", ...summary },
    "action-executor: startup stranded-dispatch reconcile sweep complete"
  );
  return summary;
}

export type PacketExecutionSummary = {
  packetId: string;
  approvalStatus: ApprovalStatus;
  autoExecuteReversible: boolean;
  executed: number;
  failed: number;
  pending: number;
  skipped: number;
  // A row left DISPATCHING (claimed, not yet finalized). In the normal sweep this is 0 --
  // each dispatch finalizes synchronously. It is >0 only when this sweep RE-RAN over a row
  // a prior crashed run stranded (the duplicate hit returns the stranded DISPATCHING row);
  // reconcileStrandedDispatches is what clears it. Counted so a stranded row never hides.
  dispatching: number;
  actions: ExecutedAction[];
};

export type ExecutePacketResult =
  | { ok: false; reason: "NOT_APPROVED" }
  | { ok: true; summary: PacketExecutionSummary };

// Orchestrate the post-approval execution sweep over a packet's governable actions.
// Graduated autonomy:
//   - REVERSIBLE + autoExecuteReversible ON  -> auto-fire via the outbox.
//   - REVERSIBLE + autoExecuteReversible OFF -> recorded SKIPPED (config-disabled).
//   - IRREVERSIBLE/OUTWARD (any flag)        -> recorded PENDING; NEVER auto-sent.
export async function executeApprovedPacketActions(input: {
  packet: DecisionPacket;
  autoExecuteReversible: boolean;
  deps?: DispatchDeps;
}): Promise<ExecutePacketResult> {
  const { packet, autoExecuteReversible } = input;
  const deps = input.deps ?? {};

  // Defense in depth: only an APPROVED packet may execute (the route also gates).
  if (packet.approvalStatus !== "APPROVED") {
    return { ok: false, reason: "NOT_APPROVED" };
  }

  const store = deps.store ?? getExecutedActionStore();
  const registry = deps.registry ?? defaultTransportRegistry();
  const clock = deps.now ?? (() => new Date().toISOString());
  const resolvedDeps: DispatchDeps = { store, registry, now: clock };

  const actions = deriveGovernableActions(packet);
  const processed: RecordResult[] = [];

  for (const action of actions) {
    if (action.reversibility === "REVERSIBLE" && autoExecuteReversible) {
      processed.push(await dispatchGovernableActionDetailed(action, resolvedDeps));
    } else if (action.reversibility === "REVERSIBLE") {
      processed.push(
        await store.recordNonDispatched({
          action,
          status: "SKIPPED",
          requestedAt: clock(),
          auditDetail:
            "Reversible auto-execute disabled by config (ENABLE_REVERSIBLE_AUTO_EXECUTE off)"
        })
      );
    } else {
      // IRREVERSIBLE/OUTWARD: recorded PENDING, awaiting an explicit human-approved
      // execution. The per-action human-approved execution (content-hash-checked,
      // grill R10) is a separate owner-gated entry point -- intentionally NOT wired
      // here, so this route can never auto-send an outward action.
      processed.push(
        await store.recordNonDispatched({
          action,
          status: "PENDING",
          requestedAt: clock(),
          auditDetail:
            "Irreversible/outward action requires explicit human-approved execution; never auto-sent"
        })
      );
    }
  }

  const rows = processed.map((p) => p.action);

  // Audit the sweep onto the packet's auditTrail -- the SAME surface human approval
  // writes to (so an execution shows up where the approval does). On Postgres,
  // saveDecisionPacket re-projects these into decision_packet_audit_events (append-
  // only, deterministic id + onConflictDoNothing), so the execution audit is queryable
  // alongside approvals. The detail is IDs/enums only -- no message prose.
  //
  // The executed_actions table remains the AUTHORITATIVE, race-safe per-action audit
  // (its idempotency_key dedup is the exactly-once guarantee). This packet-trail append
  // is the human-facing summary; under a pathological concurrent double-submit its
  // read-modify-write could drop a redundant entry, but never a real dispatch.
  //
  // Only NEWLY-processed actions are audited (created === true), so a re-run of an
  // already-executed packet does not duplicate audit-trail entries.
  const newlyProcessed = processed.filter((p) => p.created).map((p) => p.action);
  if (newlyProcessed.length > 0) {
    const at = clock();
    const executionEntries: AuditTrailEntry[] = newlyProcessed.map((row) => ({
      at,
      actor: "action-executor",
      action: "ACTION_EXECUTION",
      detail: `${row.actionType} ${row.status} via ${row.channel}`
    }));
    await updateDecisionPacket(packet.id, (current) => ({
      ...current,
      updatedAt: at,
      auditTrail: [...current.auditTrail, ...executionEntries]
    }));
  }

  const summary: PacketExecutionSummary = {
    packetId: packet.id,
    approvalStatus: packet.approvalStatus,
    autoExecuteReversible,
    executed: rows.filter((r) => r.status === "EXECUTED").length,
    failed: rows.filter((r) => r.status === "FAILED").length,
    pending: rows.filter((r) => r.status === "PENDING").length,
    skipped: rows.filter((r) => r.status === "SKIPPED").length,
    dispatching: rows.filter((r) => r.status === "DISPATCHING").length,
    actions: rows
  };

  // The execution-sweep golden signal (traffic + errors + saturation): counts only,
  // no prose. A FAILED count > 0 or a growing PENDING backlog is the alert surface.
  logger.info(
    {
      event: "action.execution_sweep",
      packetId: summary.packetId,
      autoExecuteReversible,
      executed: summary.executed,
      failed: summary.failed,
      pending: summary.pending,
      skipped: summary.skipped,
      dispatching: summary.dispatching
    },
    "action-executor: packet execution sweep complete"
  );

  return { ok: true, summary };
}
