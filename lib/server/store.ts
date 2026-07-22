import { and, eq } from "drizzle-orm";
import {
  decisionPacketAgentRuns,
  decisionPacketAuditEvents,
  decisionPackets,
  processedApprovalEvents,
  runIdempotencyKeys
} from "@/db/schema";
import { computeEffectiveMode } from "@/lib/agents/run";
import type {
  AgentRun,
  ApprovalStatus,
  DecisionPacket,
  RequestedMode
} from "@/lib/schemas";
import { DecisionPacketSchema, gatekeeperClearsApproval } from "@/lib/schemas";
import { getDatabaseUrl, getDb } from "@/lib/server/db";
import { stableHash } from "@/lib/utils";

export type TransitionApprovalInput = {
  packetId: string;
  approvalStatus: Exclude<ApprovalStatus, "PENDING">;
  reason: string;
  actor: string;
  auditAction: "HUMAN_APPROVAL" | "N8N_APPROVAL_CALLBACK";
  eventId?: string;
};

export type TransitionApprovalResult =
  | { status: "UPDATED"; packet: DecisionPacket }
  | { status: "IDEMPOTENT"; packet: DecisionPacket }
  | { status: "NOT_FOUND" }
  | { status: "BLOCKED"; packet: DecisionPacket; message: string }
  | { status: "CONFLICT"; packet: DecisionPacket; message: string }
  | { status: "EVENT_CONFLICT"; packet?: DecisionPacket; message: string };

export type PacketStore = {
  saveDecisionPacket(
    packet: DecisionPacket,
    options?: { idempotencyKey?: string }
  ): Promise<DecisionPacket>;
  getDecisionPacket(id: string): Promise<DecisionPacket | undefined>;
  getDecisionPacketByIdempotencyKey(
    idempotencyKey: string
  ): Promise<DecisionPacket | undefined>;
  updateDecisionPacket(
    id: string,
    updater: (packet: DecisionPacket) => DecisionPacket
  ): Promise<DecisionPacket | undefined>;
  listDecisionPackets(): Promise<DecisionPacket[]>;
  getProcessedApprovalEvent(eventId: string): Promise<string | undefined>;
  markApprovalEventProcessed(eventId: string, packetId: string): Promise<void>;
  // Atomic PENDING -> APPROVED/REJECTED compare-and-set. The gatekeeper-block
  // check, event-already-processed check, status CAS, audit append, and
  // mark-processed all happen inside one atomic unit (no TOCTOU window).
  transitionApproval(
    input: TransitionApprovalInput
  ): Promise<TransitionApprovalResult>;
};

function applyApprovalToPacket(
  packet: DecisionPacket,
  input: TransitionApprovalInput
): DecisionPacket {
  const now = new Date().toISOString();
  const auditTrail = [
    ...packet.auditTrail,
    {
      at: now,
      actor: input.actor,
      action: input.auditAction,
      detail: `${input.approvalStatus}: ${input.reason}`
    }
  ];

  if (packet.packetVersion === 1) {
    // V1 mirrors approval state onto the embedded launch exception.
    return {
      ...packet,
      approvalStatus: input.approvalStatus,
      approvalReason: input.reason,
      updatedAt: now,
      exception: {
        ...packet.exception,
        status: input.approvalStatus
      },
      auditTrail
    };
  }

  // V2 (ActionOps) has no embedded exception; approvalStatus is the single
  // source of truth for the transition.
  return {
    ...packet,
    approvalStatus: input.approvalStatus,
    approvalReason: input.reason,
    updatedAt: now,
    auditTrail
  };
}

const memoryPackets = new Map<string, DecisionPacket>();
const memoryRunIdempotencyIndex = new Map<string, string>();
const memoryProcessedApprovalEvents = new Map<string, string>();

const memoryStore: PacketStore = {
  async saveDecisionPacket(packet, options = {}) {
    memoryPackets.set(packet.id, packet);
    if (options.idempotencyKey) {
      memoryRunIdempotencyIndex.set(options.idempotencyKey, packet.id);
    }
    return packet;
  },

  async getDecisionPacket(id) {
    return memoryPackets.get(id);
  },

  async getDecisionPacketByIdempotencyKey(idempotencyKey) {
    const packetId = memoryRunIdempotencyIndex.get(idempotencyKey);
    if (!packetId) {
      return undefined;
    }
    return memoryPackets.get(packetId);
  },

  async updateDecisionPacket(id, updater) {
    const existing = memoryPackets.get(id);
    if (!existing) {
      return undefined;
    }
    const updated = updater(existing);
    memoryPackets.set(id, updated);
    return updated;
  },

  async listDecisionPackets() {
    return [...memoryPackets.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  },

  async getProcessedApprovalEvent(eventId) {
    return memoryProcessedApprovalEvents.get(eventId);
  },

  async markApprovalEventProcessed(eventId, packetId) {
    memoryProcessedApprovalEvents.set(eventId, packetId);
  },

  async transitionApproval(input) {
    // Single-threaded JS: the body below runs to completion with no `await`,
    // so the status read -> mutation is atomic and two concurrent callers
    // cannot both observe PENDING and both write.
    if (input.eventId) {
      const processedPacketId = memoryProcessedApprovalEvents.get(input.eventId);
      if (processedPacketId) {
        const processedPacket = memoryPackets.get(processedPacketId);
        if (processedPacketId !== input.packetId) {
          return {
            status: "EVENT_CONFLICT",
            packet: processedPacket,
            message: `Approval event ${input.eventId} was already used for packet ${processedPacketId}`
          };
        }
        return processedPacket
          ? { status: "IDEMPOTENT", packet: processedPacket }
          : {
              status: "EVENT_CONFLICT",
              message: `Approval event ${input.eventId} references a packet that is no longer available`
            };
      }
    }

    const existing = memoryPackets.get(input.packetId);
    if (!existing) {
      return { status: "NOT_FOUND" };
    }

    // S-01 approval boundary: the ONE shared predicate (boolean AND status AND failures),
    // so a tampered/incoherent stored report cannot be approved on the boolean alone.
    if (!gatekeeperClearsApproval(existing.gatekeeper)) {
      return {
        status: "BLOCKED",
        packet: existing,
        message: "Decision packet is blocked by gatekeeper and cannot be approved"
      };
    }

    if (existing.approvalStatus !== "PENDING") {
      if (existing.approvalStatus === input.approvalStatus) {
        if (input.eventId) {
          memoryProcessedApprovalEvents.set(input.eventId, existing.id);
        }
        return { status: "IDEMPOTENT", packet: existing };
      }

      return {
        status: "CONFLICT",
        packet: existing,
        message: `Decision packet is already ${existing.approvalStatus} and cannot be changed to ${input.approvalStatus}`
      };
    }

    const updated = applyApprovalToPacket(existing, input);
    memoryPackets.set(updated.id, updated);
    if (input.eventId) {
      memoryProcessedApprovalEvents.set(input.eventId, updated.id);
    }
    return { status: "UPDATED", packet: updated };
  }
};

// Thrown INSIDE the transaction callback when a concurrent transaction has
// already reserved the same eventId. Drizzle rolls the transaction back on any
// throw (undoing this transaction's packet UPDATE) and rethrows; the OUTER
// catch recognizes this sentinel and converts it to EVENT_CONFLICT. A bare
// Error would be ambiguous with a real DB/connection failure, so the catch
// rethrows anything that is not this exact type.
class EventReservationConflict extends Error {
  readonly eventId: string;
  constructor(eventId: string) {
    super(`Approval event ${eventId} was concurrently reserved by another transaction`);
    this.name = "EventReservationConflict";
    this.eventId = eventId;
  }
}

// Thrown INSIDE saveDecisionPacket's transaction when a concurrent instance has already
// committed this idempotency key. Drizzle rolls the transaction back on the throw (undoing
// THIS instance's packet write -- so no orphaned packet), and the outer catch converts it into
// "return the winner". Mirrors EventReservationConflict; a bare Error would be ambiguous with a
// real DB/connection failure, so the catch rethrows anything that is not this exact type.
class IdempotencyKeyConflict extends Error {
  readonly idempotencyKey: string;
  constructor(idempotencyKey: string) {
    super(`Idempotency key ${idempotencyKey} was concurrently reserved by another transaction`);
    this.name = "IdempotencyKeyConflict";
    this.idempotencyKey = idempotencyKey;
  }
}

const postgresStore: PacketStore = {
  async saveDecisionPacket(packet, options = {}) {
    const db = getDb();
    // All projections (packet upsert, idempotency-key insert, audit, agent-run)
    // run inside ONE transaction so a failure after the agents ran cannot leave
    // partial state that would enable a double-spend retry. Either every write
    // commits or none do.
    try {
      await db.transaction(async (tx) => {
        await tx
          .insert(decisionPackets)
          .values(toDecisionPacketRow(packet))
          .onConflictDoUpdate({
            target: decisionPackets.id,
            set: {
              payload: packet,
              approvalStatus: packet.approvalStatus,
              updatedAt: new Date(packet.updatedAt)
            }
          });

        if (options.idempotencyKey) {
          // Cross-instance idempotency guard. The packet row is written first (it is the FK
          // parent of run_idempotency_keys.packet_id), then we RESERVE the key. onConflictDoNothing
          // + returning(): an EMPTY result means another instance already committed this key
          // (Postgres serialized us on the PK). Throw to roll the WHOLE transaction back -- so this
          // instance's just-written packet is undone and never left orphaned -- and let the outer
          // catch return the winner. This closes the F2 race (two instances, same key -> two
          // persisted packets, one orphaned) with NO schema change.
          //
          // It does NOT stop both instances from RUNNING the pipeline before this point;
          // cross-instance double-WORK is bounded by the budget cap and remains the post-MVP item.
          // Eliminating it needs a reserve-BEFORE-assembly row, which run_idempotency_keys.packet_id
          // being NOT NULL would require a migration (nullable packetId or a separate reservation
          // table) to allow.
          const reserved = await tx
            .insert(runIdempotencyKeys)
            .values({
              idempotencyKey: options.idempotencyKey,
              packetId: packet.id,
              createdAt: new Date()
            })
            .onConflictDoNothing()
            .returning({ key: runIdempotencyKeys.idempotencyKey });
          if (reserved.length === 0) {
            throw new IdempotencyKeyConflict(options.idempotencyKey);
          }
        }

        await persistAuditProjectionTx(tx, packet);
        await persistAgentRunProjectionTx(tx, packet);
      });
      return packet;
    } catch (error) {
      if (error instanceof IdempotencyKeyConflict) {
        // The transaction rolled back (no orphaned packet). Return the packet the winning
        // instance persisted under this key -- the single canonical result for the key.
        const winner = await this.getDecisionPacketByIdempotencyKey(error.idempotencyKey);
        if (winner) {
          return winner;
        }
        // Key seen as taken but no packet readable (the winner rolled back between our conflict
        // and our read -- vanishingly rare). Fail loud rather than return nothing.
        throw error;
      }
      throw error;
    }
  },

  async getDecisionPacket(id) {
    const row = await getDecisionPacketRow(id);
    return row ? parseStoredPacket(row.payload) : undefined;
  },

  async getDecisionPacketByIdempotencyKey(idempotencyKey) {
    const db = getDb();
    const [row] = await db
      .select({ packetId: runIdempotencyKeys.packetId })
      .from(runIdempotencyKeys)
      .where(eq(runIdempotencyKeys.idempotencyKey, idempotencyKey))
      .limit(1);

    if (!row) {
      return undefined;
    }

    return this.getDecisionPacket(row.packetId);
  },

  async updateDecisionPacket(id, updater) {
    const existing = await this.getDecisionPacket(id);
    if (!existing) {
      return undefined;
    }
    const updated = updater(existing);
    return this.saveDecisionPacket(updated);
  },

  async listDecisionPackets() {
    const db = getDb();
    const rows = await db
      .select({ payload: decisionPackets.payload })
      .from(decisionPackets);

    return rows
      .map((row) => parseStoredPacket(row.payload))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getProcessedApprovalEvent(eventId) {
    const db = getDb();
    const [row] = await db
      .select({ packetId: processedApprovalEvents.packetId })
      .from(processedApprovalEvents)
      .where(eq(processedApprovalEvents.eventId, eventId))
      .limit(1);

    return row?.packetId;
  },

  async markApprovalEventProcessed(eventId, packetId) {
    const db = getDb();
    await db
      .insert(processedApprovalEvents)
      .values({
        eventId,
        packetId,
        createdAt: new Date()
      })
      .onConflictDoNothing();
  },

  async transitionApproval(input) {
    const db = getDb();
    // All checks and the status compare-and-set run inside ONE transaction
    // (READ COMMITTED is sufficient; this does NOT rely on SERIALIZABLE
    // isolation). SELECT ... FOR UPDATE locks the packet row so concurrent
    // transactions queue rather than both observing PENDING; the conditional
    // UPDATE ... WHERE approval_status = 'PENDING' is the atomic guard for the
    // packet status. For eventId-carrying calls, the unique processed_approval_
    // events(event_id) insert is the additional atomic guard that prevents one
    // eventId from committing two different packet transitions (see EventReser-
    // vationConflict). The outer try/catch turns that conflict into EVENT_CONFLICT.
    try {
      return await db.transaction(async (tx) => {
        if (input.eventId) {
          const [processed] = await tx
            .select({ packetId: processedApprovalEvents.packetId })
            .from(processedApprovalEvents)
            .where(eq(processedApprovalEvents.eventId, input.eventId))
            .limit(1);

          if (processed) {
            const processedRow = await readPacketForUpdate(tx, processed.packetId);
            if (processed.packetId !== input.packetId) {
              return {
                status: "EVENT_CONFLICT" as const,
                packet: processedRow?.packet,
                message: `Approval event ${input.eventId} was already used for packet ${processed.packetId}`
              };
            }
            return processedRow
              ? { status: "IDEMPOTENT" as const, packet: processedRow.packet }
              : {
                  status: "EVENT_CONFLICT" as const,
                  message: `Approval event ${input.eventId} references a packet that is no longer available`
                };
          }
        }

        const existing = await readPacketForUpdate(tx, input.packetId);
        if (!existing) {
          return { status: "NOT_FOUND" as const };
        }

        // S-01 approval boundary: same shared predicate as the memory path (P3.1 -- one
        // helper, both routes; the DB payload is as tamperable as any stored JSON).
        if (!gatekeeperClearsApproval(existing.packet.gatekeeper)) {
          return {
            status: "BLOCKED" as const,
            packet: existing.packet,
            message:
              "Decision packet is blocked by gatekeeper and cannot be approved"
          };
        }

        const updated = applyApprovalToPacket(existing.packet, input);
        const result = await tx
          .update(decisionPackets)
          .set({
            payload: updated,
            approvalStatus: updated.approvalStatus,
            updatedAt: new Date(updated.updatedAt)
          })
          .where(
            and(
              eq(decisionPackets.id, input.packetId),
              eq(decisionPackets.approvalStatus, "PENDING")
            )
          )
          .returning({ id: decisionPackets.id });

        if (result.length === 0) {
          // The packet is no longer PENDING. Decide CONFLICT vs IDEMPOTENT from
          // the approval_status COLUMN (the atomic guard), NOT the jsonb payload,
          // because the column is the source of truth that the conditional
          // UPDATE matched against.
          const currentStatus = existing.statusColumn;
          if (currentStatus === input.approvalStatus) {
            if (input.eventId) {
              await markApprovalEventProcessedTx(tx, input.eventId, existing.packet.id);
            }
            return { status: "IDEMPOTENT" as const, packet: existing.packet };
          }
          return {
            status: "CONFLICT" as const,
            packet: existing.packet,
            message: `Decision packet is already ${currentStatus} and cannot be changed to ${input.approvalStatus}`
          };
        }

        // The conditional UPDATE claimed this packet. Now reserve the eventId
        // atomically: the unique constraint on event_id serializes concurrent
        // inserts. If our insert returns NO row, a concurrent transaction
        // already committed a transition for this same eventId on a different
        // packet, so this transition must NOT commit -> throw the sentinel to
        // roll back our packet UPDATE. The catch re-reads the winner.
        if (input.eventId) {
          const [claimed] = await tx
            .insert(processedApprovalEvents)
            .values({
              eventId: input.eventId,
              packetId: updated.id,
              createdAt: new Date()
            })
            .onConflictDoNothing()
            .returning({ eventId: processedApprovalEvents.eventId });

          if (!claimed) {
            throw new EventReservationConflict(input.eventId);
          }
        }

        await persistAuditProjectionTx(tx, updated);
        return { status: "UPDATED" as const, packet: updated };
      });
    } catch (error) {
      // Only the eventId-reservation race is converted to EVENT_CONFLICT. Any
      // other failure (DB/connection error) must propagate unchanged so a real
      // fault is never silently masked as a benign conflict.
      if (!(error instanceof EventReservationConflict)) {
        throw error;
      }

      // The reservation insert only unblocked because the winning transaction
      // committed, so the winner row is now visible OUTSIDE the rolled-back
      // transaction. Re-read it to report which packet actually won.
      const winnerPacketId = await this.getProcessedApprovalEvent(error.eventId);
      const winnerPacket = winnerPacketId
        ? await this.getDecisionPacket(winnerPacketId)
        : undefined;
      return {
        status: "EVENT_CONFLICT" as const,
        packet: winnerPacket,
        message: `Approval event ${error.eventId} was already used for packet ${winnerPacketId ?? "unknown"}`
      };
    }
  }
};

type PgTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

// Returns the parsed packet AND the authoritative approval_status COLUMN value.
// The column (not the jsonb payload) is the atomic guard for the conditional
// UPDATE, so callers that decide CONFLICT-vs-IDEMPOTENT must read the column.
async function readPacketForUpdate(
  tx: PgTransaction,
  id: string
): Promise<
  { packet: DecisionPacket; statusColumn: ApprovalStatus } | undefined
> {
  const [row] = await tx
    .select({
      payload: decisionPackets.payload,
      approvalStatus: decisionPackets.approvalStatus
    })
    .from(decisionPackets)
    .where(eq(decisionPackets.id, id))
    .limit(1)
    .for("update");
  if (!row) {
    return undefined;
  }
  return {
    packet: parseStoredPacket(row.payload),
    statusColumn: row.approvalStatus
  };
}

async function markApprovalEventProcessedTx(
  tx: PgTransaction,
  eventId: string,
  packetId: string
) {
  await tx
    .insert(processedApprovalEvents)
    .values({
      eventId,
      packetId,
      createdAt: new Date()
    })
    .onConflictDoNothing();
}

async function persistAuditProjectionTx(
  tx: PgTransaction,
  packet: DecisionPacket
) {
  if (packet.auditTrail.length === 0) {
    return;
  }

  await tx
    .insert(decisionPacketAuditEvents)
    .values(
      packet.auditTrail.map((entry) => ({
        id: `AUD-${stableHash({ packetId: packet.id, ...entry })}`,
        packetId: packet.id,
        at: new Date(entry.at),
        actor: entry.actor,
        action: entry.action,
        detail: entry.detail,
        payload: entry,
        createdAt: new Date()
      }))
    )
    .onConflictDoNothing();
}

export function getPacketStore() {
  return getDatabaseUrl() ? postgresStore : memoryStore;
}

export function getPacketStoreMode() {
  return getDatabaseUrl() ? "postgres" : "memory";
}

export async function saveDecisionPacket(
  packet: DecisionPacket,
  options: { idempotencyKey?: string } = {}
) {
  return getPacketStore().saveDecisionPacket(packet, options);
}

export async function getDecisionPacket(id: string) {
  return getPacketStore().getDecisionPacket(id);
}

export async function getDecisionPacketByIdempotencyKey(idempotencyKey: string) {
  return getPacketStore().getDecisionPacketByIdempotencyKey(idempotencyKey);
}

export async function updateDecisionPacket(
  id: string,
  updater: (packet: DecisionPacket) => DecisionPacket
) {
  return getPacketStore().updateDecisionPacket(id, updater);
}

export async function listDecisionPackets() {
  return getPacketStore().listDecisionPackets();
}

export async function getProcessedApprovalEvent(eventId: string) {
  return getPacketStore().getProcessedApprovalEvent(eventId);
}

export async function markApprovalEventProcessed(eventId: string, packetId: string) {
  await getPacketStore().markApprovalEventProcessed(eventId, packetId);
}

export async function transitionApproval(input: TransitionApprovalInput) {
  return getPacketStore().transitionApproval(input);
}

async function getDecisionPacketRow(id: string) {
  const db = getDb();
  const [row] = await db
    .select({ payload: decisionPackets.payload })
    .from(decisionPackets)
    .where(eq(decisionPackets.id, id))
    .limit(1);
  return row;
}

// Exported for unit testing: the V2 exceptionId derivation guards a NOT NULL
// column and is otherwise only exercised on the gated Postgres path.
export function toDecisionPacketRow(packet: DecisionPacket) {
  return {
    id: packet.id,
    // exception_id is a NOT NULL column. V1 keys it off the launch exception;
    // V2 (ActionOps) has no exception, so it keys off the threat card — the
    // disruption event the packet is about. Without this branch a V2 insert
    // would write null into a NOT NULL column and fail.
    exceptionId:
      packet.packetVersion === 1 ? packet.exception.id : packet.threatCard.id,
    payload: packet,
    approvalStatus: packet.approvalStatus,
    createdAt: new Date(packet.createdAt),
    updatedAt: new Date(packet.updatedAt)
  };
}

async function persistAgentRunProjectionTx(
  tx: PgTransaction,
  packet: DecisionPacket
) {
  if (packet.agentRuns.length === 0) {
    return;
  }

  await tx
    .insert(decisionPacketAgentRuns)
    .values(
      packet.agentRuns.map((run) => ({
        id: `${packet.id}:${run.id}`,
        packetId: packet.id,
        agentRunId: run.id,
        agentName: run.agentName,
        model: run.model,
        mode: run.mode,
        validationStatus: run.validationStatus,
        payload: run,
        createdAt: new Date(run.createdAt)
      }))
    )
    .onConflictDoNothing();
}

export function parseStoredPacket(value: unknown) {
  return DecisionPacketSchema.parse(normalizeStoredPacketForVersion(value));
}

// Read-side compatibility normalizer (P2.3 — supersedes the P2.2 mode shim).
//
// Only LEGACY (pre-P2.3) payloads are upgraded, and the legacy signal is the
// ABSENCE of `packetVersion`. Every version-less payload is a LaunchOps V1
// packet (V2 never existed before P2.3), and it may also predate the P2.2
// taxonomy split, so the legacy branch folds in the old mode shim: remap the
// retired 'DETERMINISTIC_FALLBACK' run value and derive requested/effectiveMode
// when missing, then stamp the V1 discriminant.
//
// An ALREADY-versioned payload (V1 or V2) is passed straight through to Zod with
// no rewrite. This is deliberate: the normalizer's job is legacy upgrade, not
// general repair — a malformed versioned packet (e.g. a V2 missing its mode
// fields or carrying a retired run value) must FAIL the schema loudly rather
// than be silently patched into validity. Pure + shallow.
function normalizeStoredPacketForVersion(value: unknown): unknown {
  if (typeof value !== "object" || value === null) {
    return value;
  }
  const raw = value as Record<string, unknown>;

  // Already-versioned packet -> let Zod validate it as-is (fail loudly if bad).
  if (raw.packetVersion !== undefined) {
    return value;
  }

  // Version-less legacy payload: a V1 packet that may also predate P2.2.
  const agentRuns = Array.isArray(raw.agentRuns) ? raw.agentRuns : undefined;

  // Map every retired run mode 'DETERMINISTIC_FALLBACK' -> 'FAILED_TO_FALLBACK'
  // (conservative: the old "fallback" was the degraded case).
  const normalizedAgentRuns = agentRuns?.map((run) => {
    if (
      typeof run === "object" &&
      run !== null &&
      (run as Record<string, unknown>).mode === "DETERMINISTIC_FALLBACK"
    ) {
      return { ...(run as Record<string, unknown>), mode: "FAILED_TO_FALLBACK" };
    }
    return run;
  });

  // requestedMode can never be a failure: if any normalized run was a live
  // success the run intended LIVE_AI, otherwise deterministic rules.
  const requestedMode: RequestedMode =
    raw.requestedMode !== undefined
      ? (raw.requestedMode as RequestedMode)
      : normalizedAgentRuns?.some(
            (run) =>
              typeof run === "object" &&
              run !== null &&
              (run as Record<string, unknown>).mode === "LIVE_AI"
          )
        ? "LIVE_AI"
        : "DETERMINISTIC_RULES";

  const effectiveMode =
    raw.effectiveMode !== undefined
      ? raw.effectiveMode
      : computeEffectiveMode(
          (normalizedAgentRuns ?? []) as AgentRun[],
          requestedMode
        );

  return {
    ...raw,
    ...(normalizedAgentRuns ? { agentRuns: normalizedAgentRuns } : {}),
    requestedMode,
    effectiveMode,
    packetVersion: 1
  };
}
