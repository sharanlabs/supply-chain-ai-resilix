import { describe, expect, it } from "vitest";
import { buildDecisionPacket } from "@/lib/pipeline/build-packet";
import { getActionOpsScenario } from "@/lib/data/actionops-scenarios";
import { ingestSeed } from "@/lib/ingest/seed-suppliers";
import { runGraders } from "@/lib/evals/run-graders";
import { KNOWN_PRODUCT_IDS } from "@/evals/golden/seed-ids";
import type { ScenarioGroundTruth } from "@/lib/evals/graders";
import { DecisionPacketV2Schema } from "@/lib/schemas";

// D.1 cutover: the live deterministic pipeline (key-OFF) emits a schema-valid V2
// packet that the F contract accepts. HONEST SCOPE: with deterministic placeholders
// whose ground truth is derived the same way the producer derives it, runGraders
// here proves WIRING / schema / the injection-quarantine MECHANISM -- NOT arithmetic
// correctness or adversarial robustness. The real teeth are the golden corruptions
// (evals/golden-tasks.test.ts); this guards that the live packet flows through the
// graders clean, which is what the cutover must guarantee.

const GULF_COUNTRIES = new Set(["SA", "AE", "QA", "KW"]);

describe("D.1 -- ActionOps pipeline emits a valid V2 packet (key-OFF, deterministic)", () => {
  it("assembles a schema-valid DecisionPacketV2 for the Hormuz scenario", async () => {
    const packet = await buildDecisionPacket({ useLiveSignals: false });

    expect(DecisionPacketV2Schema.safeParse(packet).success).toBe(true);
    expect(packet.packetVersion).toBe(2);
    // Six ActionOps agents ran, all deterministic -> never mislabeled live.
    expect(packet.agentRuns).toHaveLength(6);
    expect(packet.effectiveMode).toBe("DETERMINISTIC_RULES");
    expect(packet.agentRuns.every((r) => r.mode === "DETERMINISTIC_RULES")).toBe(true);
    // Hormuz matches exactly the nine Gulf-origin seed suppliers.
    expect(packet.exposureResults).toHaveLength(9);
    expect(packet.supplierMessages.length).toBeGreaterThan(0);
    expect(packet.simulation).toBeDefined();
    expect(packet.gatekeeper.status).toBe("PASS");
  });

  it("passes every F grader over the live output (wiring/quarantine, not arithmetic)", async () => {
    const packet = await buildDecisionPacket({ useLiveSignals: false });
    const scenario = getActionOpsScenario();
    const suppliers = ingestSeed().suppliers;

    // Ground truth derived from the run's OWN inputs (the organ-8 seam): the seed
    // ids, the same Gulf filter Atlas matched on, and the run's fetched evidence.
    const knownSupplierIds = new Set(suppliers.map((s) => s.id));
    const expectedAffectedSupplierIds = new Set(
      suppliers.filter((s) => GULF_COUNTRIES.has(s.country)).map((s) => s.id)
    );
    const evidenceAllowlist = new Set<string>([
      ...packet.threatCard.evidenceUrls,
      ...packet.publicSignals.map((s) => s.sourceUrl)
    ]);
    const gt: ScenarioGroundTruth = {
      knownSupplierIds,
      knownProductIds: KNOWN_PRODUCT_IDS as Set<string>,
      expectedAffectedSupplierIds,
      evidenceAllowlist,
      untrustedRawStrings: [],
      offTaxonomyExpected: scenario.offTaxonomy,
      simInputs: scenario.simulation
        ? {
            baseDateIso: packet.simulation!.generatedAt,
            durationDays: scenario.simulation.durationDays,
            affected: packet.exposureResults.map((e) => ({
              supplierId: e.supplierId,
              dailyRevenueUsd: scenario.simulation!.dailyRevenueUsdPerSupplier
            })),
            horizonDays: scenario.simulation.horizonDays,
            inventory: scenario.simulation.inventory
          }
        : undefined
    };

    const report = runGraders(packet, gt);
    expect(report.blocked, report.results.flatMap((r) => r.failures).join("; ")).toBe(false);
  });

  it("runGraders is the LIVE-OUTPUT GATE: a corrupted live packet BLOCKS (the D.9 gate role)", async () => {
    // The gate role made explicit (not duplicated): runGraders over the assembled live V2
    // packet is the SAME F contract that will gate D.9's real LLM output, and `blocked` is
    // its hard signal -- ANY grader failure blocks. The clean-packet assertion above proves
    // the gate PASSES a valid run; this proves it has TEETH as a gate by feeding it a packet
    // whose exposure set no longer matches ground truth -> it must BLOCK. (The full
    // corruption matrix lives in golden-tasks.test.ts; this is the single positive-control
    // that the live-output path is genuinely gated, not waved through.)
    const packet = await buildDecisionPacket({ useLiveSignals: false });
    const suppliers = ingestSeed().suppliers;

    const knownSupplierIds = new Set(suppliers.map((s) => s.id));
    const evidenceAllowlist = new Set<string>([
      ...packet.threatCard.evidenceUrls,
      ...packet.publicSignals.map((s) => s.sourceUrl)
    ]);
    // Ground truth that DISAGREES with the run's exposure set: expect an affected id the
    // packet does not contain -> gradeExposureControl must fail -> the gate blocks.
    const gtMismatch: ScenarioGroundTruth = {
      knownSupplierIds,
      // Valid product allowlist: the ONLY disagreement with the run is the phantom
      // affected supplier below, so the block is unambiguously the exposure control.
      knownProductIds: KNOWN_PRODUCT_IDS as Set<string>,
      expectedAffectedSupplierIds: new Set([...knownSupplierIds, "SUP-PHANTOM-NOT-IN-RUN"]),
      evidenceAllowlist,
      untrustedRawStrings: [],
      offTaxonomyExpected: false,
      simInputs: undefined
    };

    const blockedReport = runGraders(packet, gtMismatch);
    expect(blockedReport.blocked).toBe(true);
    expect(blockedReport.failureCount).toBeGreaterThan(0);
  });
});
