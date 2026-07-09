import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildDecisionPacket } from "@/lib/pipeline/build-packet";
import type { DecisionPacketV2 } from "@/lib/schemas";
import { deriveGovernableActions, type GovernableAction } from "@/lib/server/action-taxonomy";
import {
  defaultTransportRegistry,
  NoopTransport,
  resolveTransport
} from "@/lib/server/action-transport";
import {
  __resetExecutedActionsForTest,
  dispatchGovernableAction,
  executeApprovedPacketActions,
  getExecutedActionStore,
  reconcileStrandedDispatches,
  reconcileAllStrandedDispatches
} from "@/lib/server/action-executor";
import type { DecisionPacket } from "@/lib/schemas";
import { FakeTransport } from "@/evals/_helpers/fake-transport";

// ---------------------------------------------------------------------------
// Phase 5 -- the transactional-outbox executor, in-memory. Mirrors the dependency-
// injection + reset discipline of the existing eval suites. NO DATABASE_URL => the
// in-memory store is used; NO real network -- every transport is a fake or the Noop.
// ---------------------------------------------------------------------------

let basePacket: DecisionPacketV2; // PENDING, as built
let savedDatabaseUrl: string | undefined;

function approvedClone(): DecisionPacketV2 {
  return { ...basePacket, approvalStatus: "APPROVED" };
}

function findReversibleAction(packet: DecisionPacketV2): GovernableAction {
  const action = deriveGovernableActions(packet).find(
    (a) => a.actionType === "AUDIT_LOG"
  );
  if (!action) {
    throw new Error("expected an AUDIT_LOG (reversible) action on the packet");
  }
  return action;
}

beforeAll(async () => {
  basePacket = await buildDecisionPacket({ useLiveSignals: false });
});

beforeEach(() => {
  // Force the in-memory store (no Postgres) + a clean executed-action map per test.
  savedDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  __resetExecutedActionsForTest();
});

afterEach(() => {
  if (savedDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = savedDatabaseUrl;
  }
});

describe("idempotency -- a same-key double-execute runs the transport exactly once", () => {
  it("sequential double-dispatch: one EXECUTED row, transport called once, same row id", async () => {
    const fake = new FakeTransport();
    const action = findReversibleAction(approvedClone());

    const first = await dispatchGovernableAction(action, {
      registry: { INTERNAL: fake }
    });
    const second = await dispatchGovernableAction(action, {
      registry: { INTERNAL: fake }
    });

    expect(fake.callCount).toBe(1);
    expect(first.id).toBe(second.id);
    expect(first.status).toBe("EXECUTED");

    const rows = await getExecutedActionStore().listActionsForPacket(action.packetId);
    expect(
      rows.filter((r) => r.idempotencyKey === action.idempotencyKey)
    ).toHaveLength(1);
  });

  it("concurrent double-dispatch: exactly one EXECUTED row, transport called once", async () => {
    const fake = new FakeTransport();
    const action = findReversibleAction(approvedClone());

    const [a, b] = await Promise.all([
      dispatchGovernableAction(action, { registry: { INTERNAL: fake } }),
      dispatchGovernableAction(action, { registry: { INTERNAL: fake } })
    ]);

    expect(fake.callCount).toBe(1);
    expect(a.id).toBe(b.id);

    const stored = await getExecutedActionStore().getActionByIdempotencyKey(
      action.idempotencyKey
    );
    expect(stored?.status).toBe("EXECUTED");
  });
});

describe("fail-closed -- a transport throw records FAILED, audited, no partial", () => {
  it("a throwing transport yields a FAILED row with the error class, called once", async () => {
    const throwing = new FakeTransport("internal-throw", "throw");
    const action = findReversibleAction(approvedClone());

    const result = await dispatchGovernableAction(action, {
      registry: { INTERNAL: throwing }
    });

    expect(result.status).toBe("FAILED");
    expect(result.errorClass).toBe("FakeTransportError");
    expect(result.executedAt).not.toBeNull();
    expect(throwing.callCount).toBe(1);

    const stored = await getExecutedActionStore().getActionByIdempotencyKey(
      action.idempotencyKey
    );
    expect(stored?.status).toBe("FAILED");
    // No prose leak: the audit carries the channel + a fixed template, not error text.
    expect(stored?.auditDetail).not.toContain("simulated transport failure");
  });
});

describe("classification -- graduated autonomy on an APPROVED packet", () => {
  it("flag ON: reversible auto-fire; irreversible/outward stays PENDING (never sent)", async () => {
    const slack = new FakeTransport("slack");
    const internal = new FakeTransport("internal");
    const ticket = new FakeTransport("ticket");
    const email = new FakeTransport("email");

    const result = await executeApprovedPacketActions({
      packet: approvedClone(),
      autoExecuteReversible: true,
      deps: { registry: { SLACK: slack, INTERNAL: internal, TICKET: ticket, EMAIL: email } }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");

    for (const row of result.summary.actions) {
      if (row.reversibility === "REVERSIBLE") {
        expect(row.status).toBe("EXECUTED");
      } else {
        // Irreversible/outward is recorded PENDING and NEVER dispatched.
        expect(row.status).toBe("PENDING");
      }
    }

    // The OUTWARD transport was never called even though it was configured + the flag
    // was ON -- the core safety property.
    expect(email.callCount).toBe(0);
    // Reversible transports were exercised (AUDIT_LOG -> INTERNAL is always present).
    expect(internal.callCount).toBeGreaterThan(0);
    expect(result.summary.executed).toBeGreaterThan(0);
  });

  it("flag OFF: reversible actions are SKIPPED (no transport call); outward PENDING", async () => {
    const internal = new FakeTransport("internal");
    const email = new FakeTransport("email");

    const result = await executeApprovedPacketActions({
      packet: approvedClone(),
      autoExecuteReversible: false,
      deps: { registry: { INTERNAL: internal, EMAIL: email } }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");

    for (const row of result.summary.actions) {
      expect(row.status).toBe(row.reversibility === "REVERSIBLE" ? "SKIPPED" : "PENDING");
    }
    // Nothing dispatched at all when autonomy is disabled.
    expect(internal.callCount).toBe(0);
    expect(email.callCount).toBe(0);
    expect(result.summary.executed).toBe(0);
  });
});

describe("auth / preconditions", () => {
  it("an unapproved packet is rejected: NOT_APPROVED, no rows written", async () => {
    const result = await executeApprovedPacketActions({
      packet: basePacket, // PENDING
      autoExecuteReversible: true
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.reason).toBe("NOT_APPROVED");

    const rows = await getExecutedActionStore().listActionsForPacket(basePacket.id);
    expect(rows).toHaveLength(0);
  });
});

describe("NO real network -- the default transport is the Noop", () => {
  it("defaultTransportRegistry is empty and every channel resolves to Noop", () => {
    expect(Object.keys(defaultTransportRegistry())).toHaveLength(0);
    expect(resolveTransport("EMAIL")).toBe(NoopTransport);
    expect(resolveTransport("SLACK")).toBe(NoopTransport);
  });

  it("with no injected registry, reversible auto-fire goes through the Noop (delivered=false)", async () => {
    const result = await executeApprovedPacketActions({
      packet: approvedClone(),
      autoExecuteReversible: true
      // no deps.registry -> default Noop
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");

    const executed = result.summary.actions.filter((r) => r.status === "EXECUTED");
    expect(executed.length).toBeGreaterThan(0);
    for (const row of executed) {
      // The Noop logs but does not send: the audit records delivered=false.
      expect(row.auditDetail).toContain("noop");
      expect(row.auditDetail).toContain("delivered=false");
    }
  });
});

// ---------------------------------------------------------------------------
// Crash recovery (Codex P5 closure #2): a process that dies between reserve and
// finalize strands a DISPATCHING row. reconcileStrandedDispatches re-drives it.
// We simulate the crash by reserving a claim and NEVER finalizing it.
// ---------------------------------------------------------------------------
const STRAND_AT = "2026-06-27T00:00:00.000Z";

function findOutwardAction(packet: DecisionPacketV2): GovernableAction {
  const action = deriveGovernableActions(packet).find(
    (a) => a.actionType === "SUPPLIER_EMAIL_SEND"
  );
  if (!action) {
    throw new Error("expected a SUPPLIER_EMAIL_SEND (outward) action on the packet");
  }
  return action;
}

describe("crash recovery -- reconcileStrandedDispatches", () => {
  it("the GAP: a retry dedupes on a stranded DISPATCHING row WITHOUT dispatching; reconcile re-drives it to EXECUTED", async () => {
    const approved = approvedClone();
    const action = findReversibleAction(approved);
    const store = getExecutedActionStore();

    // Simulate a crash: claim the action (DISPATCHING) but never dispatch/finalize.
    const reservation = await store.reserveAction({
      action,
      requestedAt: STRAND_AT,
      auditDetail: "simulated crash: reserved, never finalized"
    });
    expect(reservation.outcome).toBe("RESERVED");
    expect(reservation.action.status).toBe("DISPATCHING");

    // The naive bug a plain retry hits: it dedupes on the DISPATCHING row and the
    // transport is NEVER called -- the action is stranded forever.
    const naiveRetryTransport = new FakeTransport();
    const retry = await dispatchGovernableAction(action, {
      registry: { INTERNAL: naiveRetryTransport }
    });
    expect(retry.status).toBe("DISPATCHING");
    expect(naiveRetryTransport.callCount).toBe(0);

    // Reconcile closes the gap: it re-drives the stranded claim through the transport.
    const fake = new FakeTransport();
    const res = await reconcileStrandedDispatches({
      packet: approved,
      deps: { registry: { INTERNAL: fake } },
      options: { leaseMs: 0 } // not testing the lease here; treat any DISPATCHING as stranded
    });
    expect(res.reconciled).toBe(1);
    expect(res.reExecuted).toBe(1);
    expect(res.reFailed).toBe(0);
    expect(fake.callCount).toBe(1);

    const stored = await store.getActionByIdempotencyKey(action.idempotencyKey);
    expect(stored?.status).toBe("EXECUTED");
    expect(stored?.executedAt).not.toBeNull();
  });

  it("re-drive is FAIL-CLOSED: a throwing transport records FAILED + the error class, never a silent partial", async () => {
    const approved = approvedClone();
    const action = findReversibleAction(approved);
    const store = getExecutedActionStore();
    await store.reserveAction({
      action,
      requestedAt: STRAND_AT,
      auditDetail: "strand"
    });

    const throwing = new FakeTransport("internal", "throw");
    const res = await reconcileStrandedDispatches({
      packet: approved,
      deps: { registry: { INTERNAL: throwing } },
      options: { leaseMs: 0 }
    });
    expect(res.reconciled).toBe(1);
    expect(res.reFailed).toBe(1);
    expect(throwing.callCount).toBe(1);

    const stored = await store.getActionByIdempotencyKey(action.idempotencyKey);
    expect(stored?.status).toBe("FAILED");
    expect(stored?.errorClass).toBe("FakeTransportError");
  });

  it("THE MOAT on recovery: reconcile NEVER auto-drives a non-reversible/outward action, even if one is stranded DISPATCHING", async () => {
    const approved = approvedClone();
    const outward = findOutwardAction(approved);
    expect(outward.reversibility).toBe("IRREVERSIBLE");
    const store = getExecutedActionStore();

    // Anomalously claim an OUTWARD action into DISPATCHING (normal flow never does this --
    // outward actions are recorded PENDING via recordNonDispatched, never reserved). The
    // moat must hold anyway.
    await store.reserveAction({
      action: outward,
      requestedAt: STRAND_AT,
      auditDetail: "anomalous outward claim"
    });

    const email = new FakeTransport("email");
    const res = await reconcileStrandedDispatches({
      packet: approved,
      deps: { registry: { EMAIL: email } },
      options: { leaseMs: 0 }
    });

    // Refused, not re-driven; the outward transport was NEVER called.
    expect(res.skippedNonReversible).toBe(1);
    expect(res.reconciled).toBe(0);
    expect(email.callCount).toBe(0);

    // The row is left untouched for a human (still DISPATCHING, never sent).
    const stored = await store.getActionByIdempotencyKey(outward.idempotencyKey);
    expect(stored?.status).toBe("DISPATCHING");
  });

  it("respects the lease window: a freshly-claimed DISPATCHING row is left alone, an old one is re-driven", async () => {
    const approved = approvedClone();
    const action = findReversibleAction(approved);
    const store = getExecutedActionStore();
    await store.reserveAction({
      action,
      requestedAt: STRAND_AT,
      auditDetail: "claim"
    });

    const fake = new FakeTransport();
    // 60s lease, clock only 1s past the claim -> still in-lease -> skip (likely live).
    const inLease = await reconcileStrandedDispatches({
      packet: approved,
      deps: { registry: { INTERNAL: fake }, now: () => "2026-06-27T00:00:01.000Z" },
      options: { leaseMs: 60_000 }
    });
    expect(inLease.skippedInLease).toBe(1);
    expect(inLease.reconciled).toBe(0);
    expect(fake.callCount).toBe(0);

    // 1h past the claim -> past the lease -> re-driven.
    const expired = await reconcileStrandedDispatches({
      packet: approved,
      deps: { registry: { INTERNAL: fake }, now: () => "2026-06-27T01:00:00.000Z" },
      options: { leaseMs: 60_000 }
    });
    expect(expired.reconciled).toBe(1);
    expect(fake.callCount).toBe(1);
  });

  it("no-op when the packet is not APPROVED (defense in depth) or there are no stranded rows", async () => {
    // Not approved: a DISPATCHING row is NOT re-driven.
    const pending = basePacket; // approvalStatus PENDING, as built
    const action = findReversibleAction(pending);
    const store = getExecutedActionStore();
    await store.reserveAction({
      action,
      requestedAt: STRAND_AT,
      auditDetail: "strand on an unapproved packet"
    });
    const fake = new FakeTransport();
    const notApproved = await reconcileStrandedDispatches({
      packet: pending,
      deps: { registry: { INTERNAL: fake } }
    });
    expect(notApproved.reconciled).toBe(0);
    expect(fake.callCount).toBe(0);
    expect(
      (await store.getActionByIdempotencyKey(action.idempotencyKey))?.status
    ).toBe("DISPATCHING");

    // Approved but nothing stranded: a clean no-op.
    __resetExecutedActionsForTest();
    const clean = await reconcileStrandedDispatches({
      packet: approvedClone(),
      deps: { registry: {} }
    });
    expect(clean.reconciled).toBe(0);
    expect(clean.actions).toHaveLength(0);
  });

  it("a second sweep is idempotent: the re-driven row is terminal, so the transport is not called again", async () => {
    const approved = approvedClone();
    const action = findReversibleAction(approved);
    const store = getExecutedActionStore();
    await store.reserveAction({
      action,
      requestedAt: STRAND_AT,
      auditDetail: "strand"
    });

    const fake = new FakeTransport();
    const first = await reconcileStrandedDispatches({
      packet: approved,
      deps: { registry: { INTERNAL: fake } },
      options: { leaseMs: 0 }
    });
    expect(first.reconciled).toBe(1);

    const second = await reconcileStrandedDispatches({
      packet: approved,
      deps: { registry: { INTERNAL: fake } },
      options: { leaseMs: 0 }
    });
    expect(second.reconciled).toBe(0);
    expect(fake.callCount).toBe(1);
  });

  it("concurrent sweeps re-drive a stranded row EXACTLY ONCE (atomic reclaim, no double-send)", async () => {
    const approved = approvedClone();
    const action = findReversibleAction(approved);
    const store = getExecutedActionStore();
    await store.reserveAction({
      action,
      requestedAt: STRAND_AT,
      auditDetail: "strand"
    });

    const fake = new FakeTransport();
    const reconNow = "2026-06-27T12:00:00.000Z";
    const runSweep = () =>
      reconcileStrandedDispatches({
        packet: approved,
        deps: { registry: { INTERNAL: fake }, now: () => reconNow },
        options: { leaseMs: 0 }
      });

    const [a, b] = await Promise.all([runSweep(), runSweep()]);

    // The transport fired exactly once; one sweep won the reclaim, the other saw it raced.
    expect(fake.callCount).toBe(1);
    expect(a.reconciled + b.reconciled).toBe(1);
    expect(a.skippedRaced + b.skippedRaced).toBe(1);

    const stored = await store.getActionByIdempotencyKey(action.idempotencyKey);
    expect(stored?.status).toBe("EXECUTED");
  });

  it("refuses an INTEGRITY MISMATCH: a stored row that disagrees with the re-derived action is not re-driven", async () => {
    const approved = approvedClone();
    const real = findReversibleAction(approved);
    const store = getExecutedActionStore();
    // Same idempotencyKey, tampered payloadHash (a hash-prefix collision / tampered row).
    const tampered: GovernableAction = { ...real, payloadHash: "0".repeat(64) };
    await store.reserveAction({
      action: tampered,
      requestedAt: STRAND_AT,
      auditDetail: "tampered row"
    });

    const fake = new FakeTransport();
    const res = await reconcileStrandedDispatches({
      packet: approved,
      deps: { registry: { INTERNAL: fake } },
      options: { leaseMs: 0 }
    });

    expect(res.skippedIntegrityMismatch).toBe(1);
    expect(res.reconciled).toBe(0);
    expect(fake.callCount).toBe(0);
    // Left untouched for an operator (still DISPATCHING, never re-driven with a bad payload).
    expect(
      (await store.getActionByIdempotencyKey(real.idempotencyKey))?.status
    ).toBe("DISPATCHING");
  });

  it("the execution summary COUNTS a stranded DISPATCHING row (it never hides)", async () => {
    const approved = approvedClone();
    const action = findReversibleAction(approved); // AUDIT_LOG (reversible)
    const store = getExecutedActionStore();
    // Strand a reversible action as a prior crashed run would (reserve, never finalize).
    await store.reserveAction({
      action,
      requestedAt: STRAND_AT,
      auditDetail: "strand from a prior crashed run"
    });

    // Re-run the normal sweep: the stranded action is a DUPLICATE hit -> stays DISPATCHING
    // (the normal sweep does NOT re-drive it; reconcile is what clears it). The summary
    // must still surface it.
    const result = await executeApprovedPacketActions({
      packet: approved,
      autoExecuteReversible: true,
      deps: {
        registry: {
          INTERNAL: new FakeTransport("internal"),
          EMAIL: new FakeTransport("email"),
          SLACK: new FakeTransport("slack"),
          TICKET: new FakeTransport("ticket")
        }
      }
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");

    expect(result.summary.dispatching).toBe(1);
    const stranded = result.summary.actions.filter((r) => r.status === "DISPATCHING");
    expect(stranded).toHaveLength(1);
    expect(stranded[0].idempotencyKey).toBe(action.idempotencyKey);
  });
});

// ---------------------------------------------------------------------------
// First-attempt moat (Codex P5 closure #2, finding 1): the exported auto-dispatch
// primitive itself fails closed for outward actions -- the moat does not rest only
// on the orchestrator filtering before the call.
// ---------------------------------------------------------------------------
describe("first-attempt moat -- the auto-dispatch primitive refuses outward actions", () => {
  it("dispatchGovernableAction THROWS on a non-reversible/outward action and never touches the transport", async () => {
    const approved = approvedClone();
    const outward = findOutwardAction(approved);
    expect(outward.reversibility).toBe("IRREVERSIBLE");

    const email = new FakeTransport("email");
    await expect(
      dispatchGovernableAction(outward, { registry: { EMAIL: email } })
    ).rejects.toThrow(/non-reversible/i);

    // Fail-closed BEFORE any side effect: no transport call, no reserved row.
    expect(email.callCount).toBe(0);
    const store = getExecutedActionStore();
    expect(
      await store.getActionByIdempotencyKey(outward.idempotencyKey)
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// S6 -- the STARTUP reconcile sweep (reconcileAllStrandedDispatches), the recorded
// 2026-06-27 forward-guardrail wired to instrumentation.ts. Enumerates persisted
// packets and reconciles each; the governance moat holds, and it is fail-safe.
// ---------------------------------------------------------------------------
describe("S6 startup sweep -- reconcileAllStrandedDispatches (boot guardrail)", () => {
  it("recovers a stranded REVERSIBLE dispatch across the whole packet set", async () => {
    const approved = approvedClone();
    const action = findReversibleAction(approved);
    const store = getExecutedActionStore();
    await store.reserveAction({ action, requestedAt: STRAND_AT, auditDetail: "crash strand" });

    const fake = new FakeTransport();
    // Inject the packet list (the sweep would otherwise read the persisted store);
    // reconcile with leaseMs:0 so the strand is eligible immediately.
    const summary = await reconcileAllStrandedDispatches({
      listPackets: async () => [approved as unknown as DecisionPacket],
      reconcile: (input) =>
        reconcileStrandedDispatches({ ...input, deps: { registry: { INTERNAL: fake } }, options: { leaseMs: 0 } })
    });

    expect(summary.packetsScanned).toBe(1);
    expect(summary.reExecuted).toBe(1);
    expect(summary.reFailed).toBe(0);
    expect(fake.callCount).toBe(1);
    const stored = await store.getActionByIdempotencyKey(action.idempotencyKey);
    expect(stored?.status).toBe("EXECUTED");
  });

  it("THE MOAT at boot: the startup sweep NEVER auto-fires an outward/IRREVERSIBLE action", async () => {
    const approved = approvedClone();
    const outward = findOutwardAction(approved); // SUPPLIER_EMAIL_SEND -> EMAIL, IRREVERSIBLE
    const store = getExecutedActionStore();
    await store.reserveAction({ action: outward, requestedAt: STRAND_AT, auditDetail: "anomalous outward strand" });

    // Wire the transport for the outward action's OWN channel, so channel-routing is NOT
    // what stops it -- the reversibility guard is the sole gate under test. (Disabling that
    // guard would make this EMAIL transport fire; callCount 0 has real teeth.)
    const outwardTransport = new FakeTransport("email");
    const summary = await reconcileAllStrandedDispatches({
      listPackets: async () => [approved as unknown as DecisionPacket],
      reconcile: (input) =>
        reconcileStrandedDispatches({ ...input, deps: { registry: { EMAIL: outwardTransport } }, options: { leaseMs: 0 } })
    });

    // Scanned, but the outward transport was NEVER called -- boot can't fire an outward action.
    expect(summary.packetsScanned).toBe(1);
    expect(summary.reExecuted).toBe(0);
    expect(outwardTransport.callCount).toBe(0);
    const stored = await store.getActionByIdempotencyKey(outward.idempotencyKey);
    expect(stored?.status).toBe("DISPATCHING"); // left for a human
  });

  it("is FAIL-SAFE: a listing failure returns a zero summary and never throws (boot must not crash)", async () => {
    const summary = await reconcileAllStrandedDispatches({
      listPackets: async () => {
        throw new Error("store unavailable at boot");
      }
    });
    expect(summary).toEqual({ packetsScanned: 0, reExecuted: 0, reFailed: 0, errored: 0 });
  });

  it("one packet's reconcile failure never aborts the sweep (best-effort across packets)", async () => {
    const approved = approvedClone();
    let calls = 0;
    const summary = await reconcileAllStrandedDispatches({
      listPackets: async () => [approved, approved] as unknown as DecisionPacket[],
      reconcile: async () => {
        calls += 1;
        if (calls === 1) throw new Error("packet 1 blew up");
        return {
          packetId: approved.id,
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
      }
    });
    expect(summary.packetsScanned).toBe(2);
    expect(summary.errored).toBe(1);
    expect(calls).toBe(2); // continued past the failure
  });
});
