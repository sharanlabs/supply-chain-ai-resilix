import { describe, expect, it } from "vitest";
import { buildRecoveryOptions } from "@/lib/agents/actionops/recovery";
import { buildDecisionPacket } from "@/lib/pipeline/build-packet";
import { makeDemoPacket } from "@/lib/data/demo-packet";
import { DecisionPacketSchema, RecoveryOptionSchema } from "@/lib/schemas";
import type { ExposureResult, Simulation } from "@/lib/schemas";

// P1 scored recovery options: a DETERMINISTIC, structured mitigation set bound from the
// Atlas exposures + Simulator runway (never from agent prose -- authoritative-binding).
// Three things are proven: (a) the producer's conditioning + deterministic scoring,
// (b) the Hormuz integration anchor (hand-pinned scores), and (c) the structural refusal
// invariant -- a NO_ACTION packet may not carry recovery options.

function exposure(over: Partial<ExposureResult>): ExposureResult {
  return {
    id: "EXP-X",
    supplierId: "SUP-X",
    supplierName: "Supplier X",
    country: "US",
    sector: "CHEMICALS",
    exposureScore: 50,
    rationale: "HIGH risk tier; 44-day lead time; single-source (no qualified backup).",
    singleSource: true,
    recoveryDays: 50,
    evidenceIds: ["THR-X"],
    ...over
  };
}

const SIM: Simulation = {
  horizons: [
    { days: 7, revenueAtRiskUsd: 0, marginAtRiskUsd: 0 },
    { days: 30, revenueAtRiskUsd: 450_000, marginAtRiskUsd: 153_000 }
  ],
  productRunouts: [{ productId: "PROD-X", runoutDate: "2026-07-12" }],
  survivalDays: 25,
  generatedAt: "2026-06-18T12:00:00.000Z"
};

describe("Recovery options producer (P1, deterministic)", () => {
  it("emits NO options when there is no exposure (nothing to recover)", () => {
    expect(buildRecoveryOptions([], SIM)).toEqual([]);
  });

  it("conditions the option set on the data (single-source vs covered, sim vs no-sim)", () => {
    const single = exposure({ id: "EXP-S", singleSource: true });
    const covered = exposure({ id: "EXP-C", singleSource: false, recoveryDays: 40 });

    // Both cohorts + a simulation -> all four action types apply.
    const both = buildRecoveryOptions([single, covered], SIM).map((o) => o.actionType);
    expect(new Set(both)).toEqual(
      new Set(["EXPEDITE", "REALLOCATE", "SUBSTITUTE", "SUPPLIER_ESCALATION"])
    );

    // Covered-only + sim -> no ESCALATE (no single-source lane to escalate).
    const coveredOnly = buildRecoveryOptions([covered], SIM).map((o) => o.actionType);
    expect(coveredOnly).toContain("SUBSTITUTE");
    expect(coveredOnly).not.toContain("SUPPLIER_ESCALATION");

    // Single-source + NO simulation -> no REALLOCATE (no runway to move), no SUBSTITUTE.
    const noSim = buildRecoveryOptions([single], undefined).map((o) => o.actionType);
    expect(noSim).toContain("EXPEDITE");
    expect(noSim).toContain("SUPPLIER_ESCALATION");
    expect(noSim).not.toContain("REALLOCATE");
    expect(noSim).not.toContain("SUBSTITUTE");
  });

  it("is deterministic, schema-valid, score-ranked, and carries reversibility", () => {
    const exposures = [
      exposure({ id: "EXP-A", singleSource: true, recoveryDays: 60 }),
      exposure({ id: "EXP-B", singleSource: false, recoveryDays: 40 })
    ];
    const a = buildRecoveryOptions(exposures, SIM);
    const b = buildRecoveryOptions(exposures, SIM);
    expect(a).toEqual(b); // same inputs -> identical output (no randomness)

    for (const opt of a) {
      expect(RecoveryOptionSchema.safeParse(opt).success, opt.id).toBe(true);
      expect(["LOW", "MEDIUM", "HIGH"]).toContain(opt.reversibility); // the governance dial
      expect(opt.score).toBeGreaterThanOrEqual(0);
      expect(opt.score).toBeLessThanOrEqual(100);
    }
    // Ranked by score descending.
    expect(a.map((o) => o.score)).toEqual([...a.map((o) => o.score)].sort((x, y) => y - x));
  });
});

describe("Recovery options -- Hormuz integration anchor (hand-pinned)", () => {
  it("the live Hormuz ACT packet carries the four scored options in rank order", async () => {
    const packet = await buildDecisionPacket({ scenarioId: "SCN-HORMUZ", live: false });
    expect(packet.recommendation ?? "ACT").toBe("ACT");
    const opts = packet.recoveryOptions ?? [];

    // Hand-derived from peakRevenue 450_000, worstRecoveryDays 63 (Al Energy 49 + 14),
    // survivalDays 25:
    //   EXPEDITE   score 67 (HIGH)   SUBSTITUTE score 55 (MEDIUM)
    //   REALLOCATE score 48 (HIGH)   ESCALATE   score 30 (LOW)
    expect(opts.map((o) => o.id)).toEqual([
      "REC-EXPEDITE",
      "REC-SUBSTITUTE",
      "REC-REALLOCATE",
      "REC-ESCALATE"
    ]);
    expect(opts.map((o) => o.score)).toEqual([67, 55, 48, 30]);
    expect(opts.map((o) => o.reversibility)).toEqual(["HIGH", "MEDIUM", "HIGH", "LOW"]);
  });
});

describe("Recovery options -- the NO_ACTION refusal invariant (structural)", () => {
  it("a NO_ACTION packet that carries recovery options FAILS canonical validation", () => {
    const base = makeDemoPacket();
    const refusalWithOptions = {
      ...base,
      recommendation: "NO_ACTION" as const,
      missingEvidence: [
        { requirement: "Independent corroboration", detail: "single source", wouldFlipIf: "a second source" }
      ],
      playbooks: [],
      supplierMessages: [],
      actionItems: [],
      recoveryOptions: [
        {
          id: "REC-EXPEDITE",
          title: "Expedite",
          actionType: "EXPEDITE" as const,
          summary: "x",
          estimatedCostUsd: 1000,
          speedGainDays: 5,
          riskReductionPct: 50,
          confidence: "HIGH" as const,
          reversibility: "HIGH" as const,
          score: 67,
          evidenceIds: ["EXP-078"],
          approvalRequired: true
        }
      ]
    };
    expect(DecisionPacketSchema.safeParse(refusalWithOptions).success).toBe(false);

    // The SAME refusal with recovery options WITHHELD validates -- proving the gate is
    // specifically the non-empty recovery set, not some unrelated failure.
    const refusalWithheld = { ...refusalWithOptions, recoveryOptions: [] };
    expect(DecisionPacketSchema.safeParse(refusalWithheld).success).toBe(true);
  });
});
