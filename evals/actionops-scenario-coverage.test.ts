import { describe, expect, it } from "vitest";

import { buildDecisionPacket } from "@/lib/pipeline/build-packet";
import { ACTIONOPS_SCENARIOS } from "@/lib/data/actionops-scenarios";
import { DecisionPacketV2Schema } from "@/lib/schemas";

// Production scenario coverage (Success_Criteria "scenario coverage 6 of 6"). Every
// registered scenario builds a schema-valid V2 packet through the DETERMINISTIC pipeline
// (live:false -> the scenario's own replay signals, no live AI, no network), with the
// tier / simulation / exposure shape its config implies. This is the coverage proof AND the
// guard that a new scenario's match + sim config is wired correctly BEFORE any live spend.
// Seven scenarios, eight records: the six disruption-coverage scenarios (the zero-exposure
// + off-taxonomy controls are the two halves of scenario 6) PLUS the thin-evidence refusal
// control (scenario 7), which proves the NO_ACTION path.

const EXPECTED_IDS = [
  "SCN-HORMUZ",
  "SCN-TARIFF",
  "SCN-REDSEA",
  "SCN-HURRICANE",
  "SCN-BANKRUPTCY",
  "SCN-ZERO-EXPOSURE",
  "SCN-OFF-TAXONOMY",
  "SCN-THIN-EVIDENCE"
];

describe("ActionOps production scenarios: deterministic coverage", () => {
  it("registers all seven scenarios (eight records, flagship first)", () => {
    expect(ACTIONOPS_SCENARIOS.map((s) => s.id)).toEqual(EXPECTED_IDS);
  });

  for (const scenario of ACTIONOPS_SCENARIOS) {
    it(`${scenario.id} builds a schema-valid, healthy deterministic packet`, async () => {
      const packet = await buildDecisionPacket({ scenarioId: scenario.id, live: false });

      const parsed = DecisionPacketV2Schema.safeParse(packet);
      expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error?.issues, null, 2)).toBe(
        true
      );
      expect(packet.packetVersion).toBe(2);

      // A deterministic run is NEVER mislabeled live or degraded.
      expect(packet.effectiveMode).toBe("DETERMINISTIC_RULES");

      // Tier + simulation shape follow the scenario config.
      expect(packet.dataTier).toBe(scenario.dataTier);
      if (scenario.simulation) {
        expect(packet.simulation).toBeDefined();
      } else {
        expect(packet.simulation).toBeUndefined();
      }

      // The packet's signals are the scenario's own replay set (coherent input).
      expect(packet.publicSignals.length).toBe(scenario.replaySignals.length);

      // A valid deterministic packet is never gatekeeper-BLOCKED.
      expect(packet.gatekeeper.status).not.toBe("BLOCKED");
    });
  }

  it("zero-exposure control: no exposures, a no-direct-exposure gap, no drafts", async () => {
    const packet = await buildDecisionPacket({ scenarioId: "SCN-ZERO-EXPOSURE", live: false });
    expect(packet.exposureResults).toEqual([]);
    expect(packet.dataGaps.join(" ")).toMatch(/no direct exposure/i);
    expect(packet.supplierMessages).toEqual([]);
  });

  it("off-taxonomy control: every matched exposure held as OTHER_UNMAPPED (never force-fit)", async () => {
    const packet = await buildDecisionPacket({ scenarioId: "SCN-OFF-TAXONOMY", live: false });
    expect(packet.exposureResults.length).toBeGreaterThan(0);
    expect(packet.exposureResults.every((e) => e.sector === "OTHER_UNMAPPED")).toBe(true);
  });

  it("thin-evidence control: NO_ACTION with a real-but-contingent exposure, no drafts", async () => {
    const packet = await buildDecisionPacket({ scenarioId: "SCN-THIN-EVIDENCE", live: false });
    // A lone low-confidence source on a real-sector exposure -> the pipeline REFUSES.
    expect(packet.recommendation).toBe("NO_ACTION");
    // The exposure is real (US logistics), kept for situational awareness...
    expect(packet.exposureResults.length).toBeGreaterThan(0);
    // ...but every outbound draft is withheld, and the gap is stated.
    expect(packet.supplierMessages).toEqual([]);
    expect(packet.playbooks).toEqual([]);
    expect(packet.dataGaps.join(" ")).toMatch(/withheld pending corroboration/i);
  });

  it("single-source scenarios match exactly one supplier (the declarative region/tier filter)", async () => {
    const hurricane = await buildDecisionPacket({ scenarioId: "SCN-HURRICANE", live: false });
    expect(hurricane.exposureResults.length).toBe(1);
    const bankruptcy = await buildDecisionPacket({ scenarioId: "SCN-BANKRUPTCY", live: false });
    expect(bankruptcy.exposureResults.length).toBe(1);
  });

  it("Hormuz flagship matches the nine Gulf ENERGY/CHEMICALS suppliers", async () => {
    const packet = await buildDecisionPacket({ scenarioId: "SCN-HORMUZ", live: false });
    expect(packet.exposureResults.length).toBe(9);
  });
});
