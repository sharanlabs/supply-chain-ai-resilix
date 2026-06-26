import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDecisionPacket } from "@/lib/pipeline/build-packet";
import {
  getDecisionPacket,
  getPacketStoreMode,
  saveDecisionPacket
} from "@/lib/server/store";
import { deriveGovernableActions } from "@/lib/server/action-taxonomy";
import {
  dispatchGovernableAction,
  executeApprovedPacketActions,
  getExecutedActionStore
} from "@/lib/server/action-executor";
import { FakeTransport } from "@/evals/_helpers/fake-transport";

// Gated identically to evals/db-concurrency-integrity.test.ts: only runs against a
// real Postgres when RUN_DB_INTEGRATION_TESTS=true AND DATABASE_URL is set. It is the
// only exerciser of the executed_actions reserve-in-txn claim under genuine
// connection-level parallelism (Promise.all over the pg Pool gives each db.transaction
// its own pooled connection, so the UNIQUE idempotency_key race is real, not coalesced).
const shouldRun =
  process.env.RUN_DB_INTEGRATION_TESTS === "true" &&
  Boolean(process.env.DATABASE_URL?.trim());

const describeDb = shouldRun ? describe : describe.skip;

describeDb("Postgres governed-execution integrity", () => {
  const originalEnableLiveAi = process.env.ENABLE_LIVE_AI;

  beforeAll(() => {
    process.env.ENABLE_LIVE_AI = "false";
  });

  afterAll(() => {
    if (originalEnableLiveAi === undefined) {
      delete process.env.ENABLE_LIVE_AI;
    } else {
      process.env.ENABLE_LIVE_AI = originalEnableLiveAi;
    }
  });

  it("a concurrent same-key double-execute persists exactly ONE EXECUTED row, transport called once", async () => {
    expect(getPacketStoreMode()).toBe("postgres");

    // Persist the packet so the executed_actions FK parent exists.
    const packet = await buildDecisionPacket({ useLiveSignals: false });
    const saved = await saveDecisionPacket(packet);

    const action = deriveGovernableActions(saved).find(
      (a) => a.actionType === "AUDIT_LOG"
    );
    if (!action) {
      throw new Error("expected an AUDIT_LOG (reversible) action");
    }

    const fake = new FakeTransport("internal");

    // Two concurrent dispatches of the SAME logical action over the pg Pool. The
    // UNIQUE idempotency_key serializes the reservers; exactly one wins + dispatches.
    const [a, b] = await Promise.all([
      dispatchGovernableAction(action, { registry: { INTERNAL: fake } }),
      dispatchGovernableAction(action, { registry: { INTERNAL: fake } })
    ]);

    // Exactly-once intent: the transport fired once; both callers reference the same
    // row (the loser re-read the winner's row, possibly while still PENDING -- so we
    // assert same id, not that both observed EXECUTED).
    expect(fake.callCount).toBe(1);
    expect(a.id).toBe(b.id);

    // Settled state: exactly one row for the key, EXECUTED, with an immutable audit.
    const store = getExecutedActionStore();
    const stored = await store.getActionByIdempotencyKey(action.idempotencyKey);
    expect(stored?.status).toBe("EXECUTED");
    expect(stored?.executedAt).not.toBeNull();
    expect(stored?.auditDetail).toContain("fake");

    const rowsForKey = (await store.listActionsForPacket(saved.id)).filter(
      (r) => r.idempotencyKey === action.idempotencyKey
    );
    expect(rowsForKey).toHaveLength(1);
  });

  it("executeApprovedPacketActions on Postgres: reversible EXECUTED, outward PENDING, re-run idempotent", async () => {
    expect(getPacketStoreMode()).toBe("postgres");

    const packet = await buildDecisionPacket({ useLiveSignals: false });
    const approved = { ...packet, approvalStatus: "APPROVED" as const };
    await saveDecisionPacket(approved);

    const email = new FakeTransport("email");
    const registry = {
      EMAIL: email,
      INTERNAL: new FakeTransport("internal"),
      SLACK: new FakeTransport("slack"),
      TICKET: new FakeTransport("ticket")
    };

    const first = await executeApprovedPacketActions({
      packet: approved,
      autoExecuteReversible: true,
      deps: { registry }
    });
    // A retry of the WHOLE sweep must dedupe -- no new rows, no re-dispatch.
    const second = await executeApprovedPacketActions({
      packet: approved,
      autoExecuteReversible: true,
      deps: { registry }
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    // The OUTWARD transport was never called (irreversible never auto-sent).
    expect(email.callCount).toBe(0);

    const store = getExecutedActionStore();
    const rows = await store.listActionsForPacket(approved.id);
    const executed = rows.filter((r) => r.status === "EXECUTED");
    const pending = rows.filter((r) => r.status === "PENDING");

    expect(executed.length).toBeGreaterThan(0);
    // The only irreversible actions derived are the supplier emails.
    expect(pending.length).toBe(approved.supplierMessages.length);
    // Idempotent: total rows == derived action count (the re-run created no duplicates).
    expect(rows.length).toBe(deriveGovernableActions(approved).length);

    // The audit trail is also idempotent: two sweeps add exactly ONE ACTION_EXECUTION
    // entry per action (the second sweep, all duplicates, audits nothing).
    const stored = await getDecisionPacket(approved.id);
    const executionEntries =
      stored?.auditTrail.filter((e) => e.action === "ACTION_EXECUTION") ?? [];
    expect(executionEntries.length).toBe(deriveGovernableActions(approved).length);
  });
});
