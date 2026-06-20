import { describe, expect, it } from "vitest";
import { PRODUCT_MASTER } from "@/lib/data/product-master";
import { KNOWN_PRODUCT_IDS } from "@/evals/golden/seed-ids";
import { ProductSchema } from "@/lib/schemas";
import { ACTIONOPS_SCENARIOS } from "@/lib/data/actionops-scenarios";
import { GOLDEN_SCENARIOS } from "@/evals/golden/scenarios";
import { makeDemoPacket } from "@/lib/data/demo-packet";

// The product master is the existence-grader allowlist (KNOWN_PRODUCT_IDS). These
// are its real teeth: the catalog must COVER every product any demo scenario can
// emit (else a legitimate run's runout would fail as "fabricated"), while STILL
// excluding the deliberate-corruption id (else the anti-fabrication grader loses its
// bite). We enumerate the scenario sources programmatically, so adding a scenario
// product without adding it to the master fails HERE, not silently downstream.

describe("product master (the existence-grader allowlist)", () => {
  it("every entry is a valid Product and ids are unique", () => {
    expect(PRODUCT_MASTER.length).toBeGreaterThan(0);
    for (const product of PRODUCT_MASTER) {
      expect(() => ProductSchema.parse(product)).not.toThrow();
    }
    expect(new Set(PRODUCT_MASTER.map((p) => p.id)).size).toBe(PRODUCT_MASTER.length);
  });

  it("KNOWN_PRODUCT_IDS is exactly the master's id set", () => {
    expect([...KNOWN_PRODUCT_IDS].sort()).toEqual(PRODUCT_MASTER.map((p) => p.id).sort());
  });

  it("covers every productId every demo scenario can emit (live + golden + demo packet)", () => {
    // Gather the union of product references across ALL three sources the pipeline
    // and evals draw from, not just one -- a missing source is how a catalog silently
    // drifts behind the scenarios it authorizes.
    const referenced = new Set<string>();
    for (const scenario of ACTIONOPS_SCENARIOS) {
      for (const item of scenario.simulation?.inventory ?? []) {
        referenced.add(item.productId);
      }
    }
    for (const scenario of GOLDEN_SCENARIOS) {
      // The built golden packet's runouts ARE what the existence grader checks against
      // knownProductIds -- the most faithful source for "what this scenario emits".
      for (const runout of scenario.packet.simulation?.productRunouts ?? []) {
        referenced.add(runout.productId);
      }
    }
    for (const runout of makeDemoPacket().simulation?.productRunouts ?? []) {
      referenced.add(runout.productId);
    }

    // Non-vacuous: if this ever drops to zero the test would pass trivially.
    expect(referenced.size).toBeGreaterThan(0);
    const missing = [...referenced].filter((id) => !KNOWN_PRODUCT_IDS.has(id));
    expect(missing, `scenario products absent from the master: ${missing.join(", ")}`).toEqual([]);
  });

  it("excludes the deliberate-corruption id so the existence grader keeps its bite", () => {
    // golden/corruptions.ts injects PROD-FAKE as a fabricated runout; the existence
    // grader must fail it. If the master ever contained PROD-FAKE, that corruption
    // would pass and the grader would be toothless.
    expect(KNOWN_PRODUCT_IDS.has("PROD-FAKE")).toBe(false);
  });
});
