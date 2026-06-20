import { describe, expect, it } from "vitest";

import { loadReplayPacket } from "@/lib/pipeline/replay-packet";
import { DecisionPacketSchema } from "@/lib/schemas";

// The landing-surface REPLAY loader. This is the DRIFT GUARD: loadReplayPacket parses the
// frozen evals/fixtures/live/SCN-HORMUZ.json through the canonical DecisionPacketSchema and throws on
// any drift, so a fixture that no longer matches the schema fails HERE (in npm test), not
// silently in production. It also pins the replay-honesty contract (Success_Criteria
// "Replay mode rendering ... never labeled live").

describe("loadReplayPacket -- the landing-surface frozen REPLAY", () => {
  // NOTE: the negative paths of loadReplayPacket's guards -- a schema-drifted fixture, or a
  // non-live (deterministic/degraded) fixture -- are NOT exercised here, because the loader
  // reads a static import, not an injected packet (testing them would need a malformed fixture
  // file or a DI refactor). The guards are simple fail-loud throws (low silent-no-op risk); the
  // happy path below confirms the REAL fixture passes both. Add DI if the reject path needs proof.
  it("loads + re-validates the frozen packet (fails loud on fixture drift)", () => {
    const packet = loadReplayPacket();
    // The transformed output must itself be a valid V2 packet.
    const parsed = DecisionPacketSchema.safeParse(packet);
    expect(
      parsed.success,
      parsed.success ? "" : JSON.stringify(parsed.error?.issues, null, 2)
    ).toBe(true);
    expect(packet.packetVersion).toBe(2);
  });

  it("is relabeled REPLAY end-to-end and NEVER claims live or cost", () => {
    const packet = loadReplayPacket();
    expect(packet.requestedMode).toBe("REPLAY");
    expect(packet.effectiveMode).toBe("REPLAY");
    expect(packet.totalCostUsd).toBe(0);
    // No agent run claims live, and none carries a (replay) cost.
    expect(packet.agentRuns.every((r) => r.mode === "REPLAY")).toBe(true);
    expect(packet.agentRuns.some((r) => r.mode === "LIVE_AI")).toBe(false);
    expect(packet.agentRuns.every((r) => (r.costUsd ?? 0) === 0)).toBe(true);
  });

  it("preserves the rich live-quality content (why we serve a captured packet)", () => {
    const packet = loadReplayPacket();
    // The whole point: a fuller packet than the deterministic fallback would produce.
    expect(packet.exposureResults.length).toBeGreaterThan(0);
    expect(packet.playbooks.length).toBeGreaterThan(0);
    expect(packet.supplierMessages.length).toBeGreaterThan(0);
    // Hormuz is an ACT scenario (corroborated, high confidence) -- not a refusal.
    expect(packet.recommendation ?? "ACT").toBe("ACT");
  });

  it("carries a dated capture so the surface can show it, never a live fetch", () => {
    const packet = loadReplayPacket();
    // The signals are recorded (CACHED), never LIVE -- the masthead reads the capture date
    // off these, so a viewer is never shown replay as a live fetch.
    expect(packet.publicSignals.length).toBeGreaterThan(0);
    expect(packet.publicSignals.every((s) => s.status !== "LIVE")).toBe(true);
    expect(packet.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // The replay-served audit entry is appended.
    expect(packet.auditTrail.some((e) => e.action === "REPLAY_SERVED")).toBe(true);
  });
});
