import { describe, expect, it } from "vitest";
import { makeDemoPacket } from "@/lib/data/demo-packet";
import { DecisionPacketSchema } from "@/lib/schemas";

// The demo packet renders on the homepage as the defensive fallback (app/page.tsx) when the
// frozen replay fails to load. It is hand-authored illustrative data, but it must be
// INTERNALLY CONSISTENT with the contracts it showcases -- a system whose pitch is "every
// number is traceable" cannot ship a primary-screen fixture that contradicts its own
// runout-anchored revenue model. This test gives the demo simulation the arithmetic coverage
// it previously lacked (makeDemoPacket was only ever schema-parsed, so a wrong-but-nonnegative
// number slipped through -- the acceptance-gate blind spot).
describe("demo packet internal consistency", () => {
  const packet = makeDemoPacket();

  it("is a valid canonical DecisionPacket", () => {
    const parsed = DecisionPacketSchema.safeParse(packet);
    expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("the simulation is runout-anchored: revenue is 0 until the survival buffer is gone", () => {
    const sim = packet.simulation;
    expect(sim).toBeDefined();
    if (!sim) return;
    expect(sim.survivalDays).not.toBeNull();
    expect(sim.survivalDays).not.toBeUndefined();
    const survivalDays = sim.survivalDays as number;

    // survivalDays must equal the EARLIEST product runout measured from the run instant --
    // the point the revenue-loss clock starts.
    const baseMs = Date.parse(packet.createdAt);
    const earliestRunoutMs = Math.min(
      ...sim.productRunouts.map((r) => Date.parse(`${r.runoutDate}T00:00:00.000Z`))
    );
    const runoutDays = Math.round((earliestRunoutMs - baseMs) / 86_400_000);
    expect(runoutDays, "survivalDays must match the earliest runout").toBe(survivalDays);

    // Runout-anchored: no revenue (and no margin) accrues while inventory still covers
    // demand; loss only after the buffer is exhausted.
    for (const h of sim.horizons) {
      if (h.days <= survivalDays) {
        expect(h.revenueAtRiskUsd, `${h.days}d must be covered (<= survivalDays)`).toBe(0);
        expect(h.marginAtRiskUsd ?? 0, `${h.days}d margin must be 0`).toBe(0);
      } else {
        expect(h.revenueAtRiskUsd, `${h.days}d must show loss (> survivalDays)`).toBeGreaterThan(0);
      }
    }

    // Margin is a single, consistent fraction of revenue across the lossy horizons (a real
    // contribution rate, not numbers bolted on after the fact).
    const lossy = sim.horizons.filter((h) => h.revenueAtRiskUsd > 0);
    expect(lossy.length).toBeGreaterThan(0);
    const ratios = lossy.map((h) => (h.marginAtRiskUsd ?? 0) / h.revenueAtRiskUsd);
    for (const r of ratios) {
      expect(Math.abs(r - ratios[0]), "margin/revenue ratio must be constant").toBeLessThan(0.001);
    }
  });

  it("withholds nothing improperly: an ACT demo packet carries its scored recovery options", () => {
    // The demo is an ACT packet (no refusal), so the P1 scored recovery options must be
    // present and score-ranked -- the reference showcases the win it claims.
    expect(packet.recommendation ?? "ACT").toBe("ACT");
    const opts = packet.recoveryOptions ?? [];
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.map((o) => o.score)).toEqual([...opts.map((o) => o.score)].sort((a, b) => b - a));
    // No outbound supplier draft leaks the internal exposure score (the P1 fix, in the fixture).
    for (const msg of packet.supplierMessages) {
      expect(msg.body).not.toMatch(/exposure score/i);
      expect(msg.claims.every((c) => !/exposureScore/.test(c.sourcePath))).toBe(true);
    }
  });
});
