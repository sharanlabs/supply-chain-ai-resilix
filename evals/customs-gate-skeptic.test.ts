// D4 suite -- counsel gate (no export without approval) + skeptic re-verification
// (accepts every honest golden outcome; objects to tampering).
import { describe, expect, it } from "vitest";

import { CUSTOMS_GOLDEN_CASES } from "@/evals/golden/customs/cases";
import { findCell } from "@/lib/agents/customsdesk/edge-case-matrix";
import { generateCase } from "@/lib/agents/customsdesk/synthetic-entries";
import { runCustomsDefenseCase } from "@/lib/agents/customsdesk/pipeline";
import { approve, exportPacket, intoReview, reject } from "@/lib/agents/customsdesk/counsel-gate";
import { skepticReview } from "@/lib/agents/customsdesk/skeptic-check";

function firstOutcome() {
  const goldenCase = CUSTOMS_GOLDEN_CASES[0];
  const generated = generateCase(findCell(goldenCase.matrixCellId)!, goldenCase.seed);
  return { generated, outcome: runCustomsDefenseCase(generated) };
}

describe("counsel gate (D4) -- no outward artifact without approval", () => {
  it("export from PENDING throws; export after approval carries the approval line", () => {
    const { outcome } = firstOutcome();
    const pending = intoReview(outcome.packet);
    expect(() => exportPacket(pending)).toThrow(/DEFENSE_PACKET_EXPORT blocked/);
    const approved = approve(pending, "Trade Counsel (demo)", "2026-07-03");
    const artifact = exportPacket(approved);
    expect(artifact).toContain("Approved for export by Trade Counsel (demo)");
  });

  it("rejected packets can never be exported; transitions are single-shot", () => {
    const { outcome } = firstOutcome();
    const rejected = reject(intoReview(outcome.packet), "Trade Counsel (demo)", "2026-07-03", "insufficient basis");
    expect(() => exportPacket(rejected)).toThrow(/blocked/);
    expect(() => approve(rejected, "x", "2026-07-03")).toThrow(/cannot approve/);
  });

  it("approval requires a named reviewer; rejection requires a reason", () => {
    const { outcome } = firstOutcome();
    expect(() => approve(intoReview(outcome.packet), "  ", "2026-07-03")).toThrow(/named reviewer/);
    expect(() => reject(intoReview(outcome.packet), "c", "2026-07-03", "")).toThrow(/reason/);
  });
});

describe("skeptic re-verification (D4) -- maker != judge", () => {
  it("accepts every honest golden outcome (24/24)", () => {
    for (const goldenCase of CUSTOMS_GOLDEN_CASES) {
      const generated = generateCase(findCell(goldenCase.matrixCellId)!, goldenCase.seed);
      const outcome = runCustomsDefenseCase(generated);
      const verdict = skepticReview(generated, outcome);
      expect(verdict.objections, goldenCase.id).toEqual([]);
      expect(verdict.accepted).toBe(true);
    }
  });

  it("objects to a tampered disposition (refusal flipped to proceed)", () => {
    const refuseCase = CUSTOMS_GOLDEN_CASES.find((c) => c.oracle.disposition === "REFUSE")!;
    const generated = generateCase(findCell(refuseCase.matrixCellId)!, refuseCase.seed);
    const outcome = runCustomsDefenseCase(generated);
    const tampered = { ...outcome, disposition: "PROCEED" as const };
    const verdict = skepticReview(generated, tampered);
    expect(verdict.accepted).toBe(false);
    expect(verdict.objections.some((o) => o.includes("contradicts re-derived REFUSE"))).toBe(true);
  });

  it("objects to a tampered cited figure (silent value edit)", () => {
    const { generated, outcome } = firstOutcome();
    const tamperedFigures = outcome.packet.citedFigures.map((c) =>
      c.sourceRef === "entry-scoper#entryCount" ? { ...c, value: c.value + 1 } : c
    );
    const tampered = { ...outcome, packet: { ...outcome.packet, citedFigures: tamperedFigures } };
    const verdict = skepticReview(generated, tampered);
    expect(verdict.accepted).toBe(false);
    expect(verdict.objections.some((o) => o.includes("entry-scoper#entryCount"))).toBe(true);
  });

  it("objects to a quarantine breach (exhibit body pasted into the packet)", () => {
    const { generated, outcome } = firstOutcome();
    const leaked = {
      ...outcome,
      packetText: `${outcome.packetText}\n${generated.exhibits[0].body}`,
    };
    const verdict = skepticReview(generated, leaked);
    expect(verdict.accepted).toBe(false);
    expect(verdict.objections.some((o) => o.includes("quarantine breach"))).toBe(true);
  });
});
