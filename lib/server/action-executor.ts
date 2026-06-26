import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
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
import { updateDecisionPacket } from "@/lib/server/store";
import { logger } from "@/lib/server/logger";
import {
  deriveGovernableActions,
  type GovernableAction
} from "@/lib/server/action-taxonomy";
import {
  defaultTransportRegistry,
  resolveTransport,
  type TransportRegistry
} from "@/lib/server/action-transport";

// ---------------------------------------------------------------------------
// Phase 5 -- the TRANSACTIONAL OUTBOX executor.
//
// The flow for one governable action (the literal outbox pattern, grill R9):
//   1. RESERVE a PENDING row inside a transaction -- the claim. The UNIQUE
//      idempotency_key serializes concurrent reservers; ON CONFLICT DO NOTHING
//      returns no row for the loser. This is "reserve/record in the SAME transaction
//      as the state change" -- the row's existence IS the state change.
//   2. Only the WINNER dispatches, OUTSIDE the transaction (never hold a DB txn
//      across a network call), via the injected transport port. The default is the
//      NoopTransport (logs, never sends), so no real outward call fires by default.
//   3. FINALIZE the row to EXECUTED (transport returned) or FAILED (transport threw
//      -- fail-closed, audited, never a silent partial).
// A duplicate caller returns the existing row WITHOUT dispatching: exactly-once
// INTENT. (Exactly-once DELIVERY needs provider idempotency keys + claim leases +
// reconciliation -- the grill R9'/NEW-4 enterprise path, documented not built.)
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

export type ExecutedActionStore = {
  reserveAction(input: ReserveActionInput): Promise<ReserveResult>;
  finalizeAction(input: FinalizeActionInput): Promise<ExecutedAction | undefined>;
  recordNonDispatched(input: RecordNonDispatchedInput): Promise<RecordResult>;
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
    const row = buildActionRecord(action, id, "PENDING", requestedAt, auditDetail);
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
    const record = buildActionRecord(action, id, "PENDING", requestedAt, auditDetail);
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

  // We won the claim. Dispatch OUTSIDE the reservation transaction.
  const transport = resolveTransport(action.channel, registry);
  try {
    const receipt = await transport.deliver({
      idempotencyKey: action.idempotencyKey,
      actionType: action.actionType,
      channel: action.channel,
      digest: action.digest
    });
    const finalized = await store.finalizeAction({
      id: reservation.action.id,
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
      action: finalized ?? { ...reservation.action, status: "EXECUTED" }
    };
  } catch (error) {
    // FAIL-CLOSED: record FAILED + the error CLASS (never error.message -- it could
    // carry sensitive text). Never re-raise as success; never leave a silent partial.
    const errorClass = error instanceof Error ? error.name : "UnknownError";
    const finalized = await store.finalizeAction({
      id: reservation.action.id,
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
      action: finalized ?? { ...reservation.action, status: "FAILED", errorClass }
    };
  }
}

export type PacketExecutionSummary = {
  packetId: string;
  approvalStatus: ApprovalStatus;
  autoExecuteReversible: boolean;
  executed: number;
  failed: number;
  pending: number;
  skipped: number;
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
      skipped: summary.skipped
    },
    "action-executor: packet execution sweep complete"
  );

  return { ok: true, summary };
}
