// D4 suite -- counsel gate (no export without approval) + skeptic re-verification
// (accepts every honest golden outcome; objects to tampering).
import { describe, expect, it } from "vitest";

import { CUSTOMS_GOLDEN_CASES } from "@/evals/golden/customs/cases";
import { findCell } from "@/lib/agents/customsdesk/edge-case-matrix";
import { generateCase } from "@/lib/agents/customsdesk/synthetic-entries";
import { runCustomsDefenseCase } from "@/lib/agents/customsdesk/pipeline";
import { approve, exportPacket, intoReview, reject } from "@/lib/agents/customsdesk/counsel-gate";
import { renderPacketText } from "@/lib/agents/customsdesk/defense-packet";
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

  // Codex D6 #1 teeth: an internally-consistent packet with tampered PENALTY
  // figures must not survive -- the Skeptic re-derives the exposure itself.
  it("objects to a tampered penalty figure (inflated caught.max, packet self-consistent)", () => {
    const { generated, outcome } = firstOutcome();
    const tamperedFigures = outcome.packet.citedFigures.map((c) =>
      c.sourceRef === "penalty-exposure#caught.max" ? { ...c, value: c.value * 10 } : c
    );
    const tampered = { ...outcome, packet: { ...outcome.packet, citedFigures: tamperedFigures } };
    const verdict = skepticReview(generated, tampered);
    expect(verdict.accepted).toBe(false);
    expect(verdict.objections.some((o) => o.includes("penalty-exposure#caught.max"))).toBe(true);
  });

  // Codex D6 R3 teeth: a tampered packet SECTION over a stale-but-clean packetText
  // (export renders from the packet, so the stale text is what every other check saw).
  it("objects when packetText is not a fresh render of the packet", () => {
    const { generated, outcome } = firstOutcome();
    const tamperedSections = outcome.packet.sections.map((s, i) =>
      i === 0 ? { ...s, text: s.text.replace(/\./, " (amended).") } : s
    );
    const tampered = { ...outcome, packet: { ...outcome.packet, sections: tamperedSections } };
    const verdict = skepticReview(generated, tampered);
    expect(verdict.accepted).toBe(false);
    expect(verdict.objections.some((o) => o.includes("fresh render"))).toBe(true);
  });

  // Codex D6 R4 teeth: a CONSISTENT tamper (sections edited AND packetText
  // re-rendered from the tampered packet) whose added numeral collides with a
  // legitimately-cited value -- every per-value check passes; only the full
  // deterministic re-derivation catches it.
  it("objects to a value-collision tamper that every per-value check would pass", () => {
    const { generated, outcome } = firstOutcome();
    const tamperedSections = outcome.packet.sections.map((s, i) =>
      i === 2 ? { ...s, text: `${s.text} An additional penalty of $365 applies.` } : s
    );
    const tamperedPacket = { ...outcome.packet, sections: tamperedSections };
    const tampered = {
      ...outcome,
      packet: tamperedPacket,
      packetText: renderPacketText(tamperedPacket),
    };
    const verdict = skepticReview(generated, tampered);
    expect(verdict.accepted).toBe(false);
    expect(verdict.objections.some((o) => o.includes("full deterministic re-derivation"))).toBe(true);
  });

  // Codex D6 R5 teeth: the backstop compares the whole OUTCOME -- a tampered
  // top-level namedGaps (what the surface reads) over an untouched packet must fail.
  it("objects to a tampered top-level namedGaps over an untouched packet", () => {
    const refuseCase = CUSTOMS_GOLDEN_CASES.find((c) => c.oracle.disposition === "REFUSE")!;
    const generated = generateCase(findCell(refuseCase.matrixCellId)!, refuseCase.seed);
    const outcome = runCustomsDefenseCase(generated);
    const tampered = { ...outcome, namedGaps: [...outcome.namedGaps, "MISSING:FABRICATED_EXTRA_GAP"] };
    const verdict = skepticReview(generated, tampered);
    expect(verdict.accepted).toBe(false);
    expect(verdict.objections.some((o) => o.includes("full deterministic re-derivation"))).toBe(true);
  });

  // Codex D6 R2 #1 teeth: an INJECTED figure with a made-up sourceRef (so citation
  // grading passes and every expected ref still matches) must be rejected.
  it("objects to an injected cited figure with an unre-derivable sourceRef", () => {
    const { generated, outcome } = firstOutcome();
    const injected = {
      ...outcome,
      packet: {
        ...outcome.packet,
        citedFigures: [
          ...outcome.packet.citedFigures,
          { value: 999, sourceKind: "TOOL_RETURN" as const, sourceRef: "made-up#figure" },
        ],
      },
    };
    const verdict = skepticReview(generated, injected);
    expect(verdict.accepted).toBe(false);
    expect(verdict.objections.some((o) => o.includes("made-up#figure"))).toBe(true);
  });

  // Codex D6 R2 #2 teeth: prose date contradicting a CORRECT structured clock --
  // the grader masks dates and the structured comparison passes, so the Skeptic
  // must catch the contradiction in the rendered text itself.
  it("objects to a prose date that matches no re-derived clock (tampered in the SECTION, the text export renders)", () => {
    const clockCase = CUSTOMS_GOLDEN_CASES.find((c) => {
      const generated = generateCase(findCell(c.matrixCellId)!, c.seed);
      return c.oracle.disposition === "PROCEED" && generated.meta.enforcementSignal;
    })!;
    const generated = generateCase(findCell(clockCase.matrixCellId)!, clockCase.seed);
    const outcome = runCustomsDefenseCase(generated);
    const realDue = outcome.packet.deadlines[0].dueOn;
    // Tamper the SECTION (what renderPacketText/export actually emits) while the
    // structured deadlines stay correct; packetText left stale on purpose -- the
    // Skeptic must scan the FRESH render, not the stored string.
    const tamperedSections = outcome.packet.sections.map((s) =>
      s.text.includes(realDue) ? { ...s, text: s.text.replace(realDue, "2099-01-01") } : s
    );
    const tampered = { ...outcome, packet: { ...outcome.packet, sections: tamperedSections } };
    const verdict = skepticReview(generated, tampered);
    expect(verdict.accepted).toBe(false);
    expect(verdict.objections.some((o) => o.includes("2099-01-01"))).toBe(true);
    expect(verdict.objections.some((o) => o.includes(realDue))).toBe(true);
  });

  it("objects to a tampered deadline date (dates are masked from the citation grader)", () => {
    const clockCase = CUSTOMS_GOLDEN_CASES.find((c) => {
      const generated = generateCase(findCell(c.matrixCellId)!, c.seed);
      return c.oracle.disposition === "PROCEED" && generated.meta.enforcementSignal;
    })!;
    const generated = generateCase(findCell(clockCase.matrixCellId)!, clockCase.seed);
    const outcome = runCustomsDefenseCase(generated);
    expect(outcome.packet.deadlines.length).toBeGreaterThan(0);
    const tamperedDeadlines = outcome.packet.deadlines.map((d, i) =>
      i === 0 ? { ...d, dueOn: "2099-01-01" } : d
    );
    const tampered = { ...outcome, packet: { ...outcome.packet, deadlines: tamperedDeadlines } };
    const verdict = skepticReview(generated, tampered);
    expect(verdict.accepted).toBe(false);
    expect(verdict.objections.some((o) => o.includes("2099-01-01"))).toBe(true);
  });
});

describe("export door hardening (Codex D6 #2/#3)", () => {
  it("refuses a forged approval object lacking reviewer/date", () => {
    const { outcome } = firstOutcome();
    const forged = {
      packet: outcome.packet,
      approval: { state: "APPROVED_FOR_EXPORT" },
    } as unknown as Parameters<typeof exportPacket>[0];
    expect(() => exportPacket(forged)).toThrow(/forged or malformed approval/);
  });

  it("refuses an export whose approval line would smuggle an uncited numeral", () => {
    const { outcome } = firstOutcome();
    const approved = approve(intoReview(outcome.packet), "Counsel 999", "2026-07-03");
    expect(() => exportPacket(approved)).toThrow(/blocked by citation guard/);
    // A digit-free reviewer exports cleanly through the same door.
    const clean = approve(intoReview(outcome.packet), "Trade Counsel (demo)", "2026-07-03");
    expect(exportPacket(clean)).toContain("Approved for export by Trade Counsel (demo)");
  });
});
