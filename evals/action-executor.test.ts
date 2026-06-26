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
  getExecutedActionStore
} from "@/lib/server/action-executor";
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
