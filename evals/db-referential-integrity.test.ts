import { randomUUID, createHash } from "node:crypto";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { runExceptionPipeline } from "@/lib/pipeline/run-exception";
import { getPacketStoreMode } from "@/lib/server/store";
import { getDb } from "@/lib/server/db";
import {
  decisionPackets,
  decisionPacketAgentRuns,
  decisionPacketAuditEvents,
  executedActions,
  runIdempotencyKeys
} from "@/db/schema";

// B-14 (2026-07-16 re-review) BEHAVIORAL proof, against a REAL Postgres. The schema declares
// audit-bearing packet children ON DELETE RESTRICT and derived children ON DELETE CASCADE; a
// `grep` proves the SOURCE and `information_schema` proves the migrated CONSTRAINT, but only a
// real delete against a real engine proves the BEHAVIOR: that RESTRICT actually refuses and
// CASCADE actually cascades.
//
// A fact this test pins that the wrap record under-named: the normal pipeline writes
// `decision_packet_agent_runs` PROVENANCE for every packet, and that FK is RESTRICT too -- so a
// packet produced the normal way CANNOT be deleted at all until its audit trail is explicitly
// cleared. That is the intended "the record of what the agents did cannot silently vanish"
// guarantee, not just the executed_actions outbox the record happened to name.
//
// Gated identically to the other DB integration suites -- runs when RUN_DB_INTEGRATION_TESTS=true
// AND DATABASE_URL is set (CI's ephemeral Postgres, or a local cluster), skips cleanly otherwise
// so the keyless `verify` chain is unaffected.
const shouldRun =
  process.env.RUN_DB_INTEGRATION_TESTS === "true" &&
  Boolean(process.env.DATABASE_URL?.trim());

const describeDb = shouldRun ? describe : describe.skip;

describeDb("Postgres referential integrity — B-14 packet-child ON DELETE posture", () => {
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

  // Deleting a packet's audit-bearing children is the ONLY way past RESTRICT -- the deliberate,
  // explicit teardown the constraint is designed to force.
  async function clearAuditChildren(packetId: string) {
    const db = getDb();
    await db.delete(executedActions).where(eq(executedActions.packetId, packetId));
    await db.delete(decisionPacketAgentRuns).where(eq(decisionPacketAgentRuns.packetId, packetId));
    await db.delete(decisionPacketAuditEvents).where(eq(decisionPacketAuditEvents.packetId, packetId));
  }

  // pg surfaces a foreign_key_violation as SQLSTATE 23503. drizzle-orm wraps the driver error in a
  // DrizzleQueryError, so the real code sits on `.cause` -- read BOTH levels so the assertion is
  // robust to whether a future drizzle version wraps or not.
  function pgCode(err: unknown): string | undefined {
    const e = err as { code?: string; cause?: { code?: string } };
    return e?.code ?? e?.cause?.code;
  }
  async function deleteThrewFkViolation(packetId: string): Promise<boolean> {
    const db = getDb();
    try {
      await db.delete(decisionPackets).where(eq(decisionPackets.id, packetId));
      return false;
    } catch (err) {
      return pgCode(err) === "23503";
    }
  }
  async function packetExists(packetId: string): Promise<boolean> {
    const rows = await getDb()
      .select({ id: decisionPackets.id })
      .from(decisionPackets)
      .where(eq(decisionPackets.id, packetId));
    return rows.length === 1;
  }

  it("a packet with audit-bearing children FAILS CLOSED on delete (RESTRICT); the audit survives", async () => {
    expect(getPacketStoreMode()).toBe("postgres");
    const db = getDb();
    const idempotencyKey = `ri-${randomUUID()}`;

    // The real pipeline writes the packet AND its agent-run provenance (audit-bearing).
    const packet = await runExceptionPipeline({ useLiveSignals: false, idempotencyKey });
    const runsBefore = await db
      .select()
      .from(decisionPacketAgentRuns)
      .where(eq(decisionPacketAgentRuns.packetId, packet.id));
    expect(runsBefore.length).toBeGreaterThan(0); // there IS an audit trail to protect

    // A packet the pipeline produced cannot be deleted -- its provenance blocks it (SQLSTATE 23503).
    expect(await deleteThrewFkViolation(packet.id)).toBe(true);
    expect(await packetExists(packet.id)).toBe(true); // refusal is atomic

    // Prove the executed_actions outbox specifically restricts too: clear the OTHER audit children,
    // add an executed row, and the delete is STILL refused -- by executed_actions this time.
    await db.delete(decisionPacketAgentRuns).where(eq(decisionPacketAgentRuns.packetId, packet.id));
    await db.delete(decisionPacketAuditEvents).where(eq(decisionPacketAuditEvents.packetId, packet.id));
    const execId = `EXA-${randomUUID()}`;
    await db.insert(executedActions).values({
      id: execId,
      packetId: packet.id,
      actionType: "ERP_CASE",
      channel: "n8n",
      reversibility: "IRREVERSIBLE",
      status: "EXECUTED",
      idempotencyKey: `exec-${randomUUID()}`,
      payloadHash: createHash("sha256").update("b14-proof").digest("hex"),
      requestedAt: new Date(),
      executedAt: new Date(),
      auditDetail: "synthetic B-14 referential-integrity proof",
      createdAt: new Date()
    });
    expect(await deleteThrewFkViolation(packet.id)).toBe(true);
    const survivingExec = await db
      .select()
      .from(executedActions)
      .where(eq(executedActions.id, execId));
    expect(survivingExec).toHaveLength(1);

    // Explicit teardown -- the only path past the gate.
    await clearAuditChildren(packet.id);
    await db.delete(decisionPackets).where(eq(decisionPackets.id, packet.id));
    expect(await packetExists(packet.id)).toBe(false);
  });

  it("a derived child (run_idempotency_keys) CASCADE-deletes with its packet", async () => {
    const db = getDb();
    const idempotencyKey = `ri-${randomUUID()}`;
    const packet = await runExceptionPipeline({ useLiveSignals: false, idempotencyKey });

    // The derived dedup row exists -- regenerable, and meaningless without its packet.
    const before = await db
      .select()
      .from(runIdempotencyKeys)
      .where(eq(runIdempotencyKeys.idempotencyKey, idempotencyKey));
    expect(before).toHaveLength(1);

    // Clear the audit-bearing children (RESTRICT) so the packet is deletable, then delete it:
    // the DERIVED child must follow it out without any explicit delete of its own.
    await clearAuditChildren(packet.id);
    await db.delete(decisionPackets).where(eq(decisionPackets.id, packet.id));

    const after = await db
      .select()
      .from(runIdempotencyKeys)
      .where(eq(runIdempotencyKeys.idempotencyKey, idempotencyKey));
    expect(after).toHaveLength(0);
    expect(await packetExists(packet.id)).toBe(false);
  });
});
