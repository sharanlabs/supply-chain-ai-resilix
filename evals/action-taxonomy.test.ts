import { beforeAll, describe, expect, it } from "vitest";
import { buildDecisionPacket } from "@/lib/pipeline/build-packet";
import type { DecisionPacket, DecisionPacketV2, GovernableActionType } from "@/lib/schemas";
import {
  classifyAction,
  deriveGovernableActions,
  sha256Hex
} from "@/lib/server/action-taxonomy";

// ---------------------------------------------------------------------------
// Phase 5 -- the action taxonomy + reversibility classifier. These tests fix the
// GOVERNANCE CONTRACT: classification is code-owned and never reads a packet field.
// ---------------------------------------------------------------------------

describe("classifyAction -- code-owned reversibility taxonomy", () => {
  const reversibleInternal: GovernableActionType[] = [
    "ROLE_OWNER_ALERT",
    "AUDIT_LOG",
    "TICKET_DRAFT"
  ];
  const irreversibleOutward: GovernableActionType[] = [
    "SUPPLIER_EMAIL_SEND",
    "RFQ_DISPATCH",
    "ERP_CASE"
  ];

  it.each(reversibleInternal)(
    "%s is REVERSIBLE and auto-fire eligible",
    (actionType) => {
      const c = classifyAction(actionType);
      expect(c.reversibility).toBe("REVERSIBLE");
      expect(c.autoFireEligible).toBe(true);
    }
  );

  it.each(irreversibleOutward)(
    "%s is IRREVERSIBLE and NEVER auto-fire eligible",
    (actionType) => {
      const c = classifyAction(actionType);
      expect(c.reversibility).toBe("IRREVERSIBLE");
      expect(c.autoFireEligible).toBe(false);
    }
  );

  it("routes outward sends to outward channels (EMAIL / N8N), internal to in-app", () => {
    expect(classifyAction("SUPPLIER_EMAIL_SEND").channel).toBe("EMAIL");
    expect(classifyAction("ERP_CASE").channel).toBe("N8N");
    expect(classifyAction("AUDIT_LOG").channel).toBe("INTERNAL");
  });
});

describe("deriveGovernableActions -- deterministic packet -> actions", () => {
  let actPacket: DecisionPacketV2;

  beforeAll(async () => {
    // The deterministic flagship packet (offline, cached signals, no live AI). It is
    // an ACT packet with supplier-message drafts + action items.
    actPacket = await buildDecisionPacket({ useLiveSignals: false });
  });

  it("derives an AUDIT_LOG plus a ROLE_OWNER_ALERT for an ACT packet", () => {
    const actions = deriveGovernableActions(actPacket);
    const types = actions.map((a) => a.actionType);
    expect(types).toContain("AUDIT_LOG");
    expect(types).toContain("ROLE_OWNER_ALERT");
  });

  it("maps every supplier-message draft to one IRREVERSIBLE SUPPLIER_EMAIL_SEND", () => {
    const actions = deriveGovernableActions(actPacket);
    const emails = actions.filter((a) => a.actionType === "SUPPLIER_EMAIL_SEND");
    expect(emails.length).toBe(actPacket.supplierMessages.length);
    for (const email of emails) {
      expect(email.reversibility).toBe("IRREVERSIBLE");
      expect(email.channel).toBe("EMAIL");
    }
  });

  it("maps every action item to one REVERSIBLE TICKET_DRAFT", () => {
    const actions = deriveGovernableActions(actPacket);
    const tickets = actions.filter((a) => a.actionType === "TICKET_DRAFT");
    expect(tickets.length).toBe(actPacket.actionItems.length);
    for (const ticket of tickets) {
      expect(ticket.reversibility).toBe("REVERSIBLE");
    }
  });

  it("is deterministic: the same packet yields the same idempotency keys", () => {
    const a = deriveGovernableActions(actPacket).map((x) => x.idempotencyKey);
    const b = deriveGovernableActions(actPacket).map((x) => x.idempotencyKey);
    expect(b).toEqual(a);
    // Keys are unique within the packet (no collision across the action set).
    expect(new Set(a).size).toBe(a.length);
  });

  it("MOAT: a packet-supplied governance flag never downgrades an outward action", () => {
    // A supplier-message draft that (falsely) claims approvalRequired:false must STILL
    // classify as IRREVERSIBLE -- the gate keys on the code-owned action type, never
    // the packet field.
    if (actPacket.supplierMessages.length === 0) {
      return; // nothing outward to assert on; covered by the EMAIL test above
    }
    const tampered: DecisionPacketV2 = {
      ...actPacket,
      supplierMessages: actPacket.supplierMessages.map((m) => ({
        ...m,
        approvalRequired: false
      }))
    };
    const emails = deriveGovernableActions(tampered).filter(
      (a) => a.actionType === "SUPPLIER_EMAIL_SEND"
    );
    expect(emails.length).toBeGreaterThan(0);
    for (const email of emails) {
      expect(email.reversibility).toBe("IRREVERSIBLE");
    }
  });

  it("HARDENING [Med]: poisoned packet strings are coerced/bounded out of the action digest", () => {
    // The digest is documented IDs/enums/numbers-only, but eventType is LLM-classified and
    // owner is LLM-authored -- an indirect-injection vector into a future real transport.
    // The seam coerces eventType to the closed vocab + bounds the rest (code invariant).
    const poisoned: DecisionPacketV2 = {
      ...actPacket,
      threatCard: { ...actPacket.threatCard, eventType: "NOT_A_REAL_EVENT raw injection" },
      actionItems: [{ id: "AI-X", title: "Task", owner: "P".repeat(120), status: "OPEN" }]
    };
    const actions = deriveGovernableActions(poisoned);
    const alert = actions.find((a) => a.actionType === "ROLE_OWNER_ALERT");
    // eventType coerced -> the raw label never enters the digest.
    expect((alert?.digest as { eventType?: string }).eventType).toBe("OTHER_UNMAPPED");
    // owner bounded to the 64-char cap (unbounded prose cannot ride into the digest).
    const ticket = actions.find((a) => a.actionType === "TICKET_DRAFT");
    expect(((ticket?.digest as { owner?: string }).owner ?? "").length).toBeLessThanOrEqual(64);
  });

  it("a NO_ACTION packet derives ONLY the audit log (withholds all outbound)", () => {
    const refusal: DecisionPacketV2 = {
      ...actPacket,
      recommendation: "NO_ACTION",
      playbooks: [],
      supplierMessages: [],
      actionItems: [],
      recoveryOptions: []
    };
    const actions = deriveGovernableActions(refusal);
    expect(actions.map((a) => a.actionType)).toEqual(["AUDIT_LOG"]);
  });

  it("a legacy V1 packet yields no governed actions", () => {
    const v1 = { packetVersion: 1 } as unknown as DecisionPacket;
    expect(deriveGovernableActions(v1)).toEqual([]);
  });

  it("payloadHash is a SHA-256 hex digest that changes with content", () => {
    expect(sha256Hex({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex({ a: 1 })).not.toBe(sha256Hex({ a: 2 }));
    // Key order does not change the hash (canonical JSON).
    expect(sha256Hex({ a: 1, b: 2 })).toBe(sha256Hex({ b: 2, a: 1 }));
  });
});
