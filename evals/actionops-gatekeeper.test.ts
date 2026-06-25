import { describe, expect, it } from "vitest";
import { buildDecisionPacket } from "@/lib/pipeline/build-packet";
import { runActionOpsGatekeeper } from "@/lib/agents/actionops/gatekeeper";
import { ingestSeed } from "@/lib/ingest/seed-suppliers";
import type { DecisionPacketV2 } from "@/lib/schemas";

// D.4 gatekeeper: the FULL bidirectional claims[] <-> numeral <-> sourcePath check
// is now enforced at PRODUCE-time, through the SAME shared function the grader runs
// (collectCitationFailures). A packet the gatekeeper clears for human review
// provably satisfies the citation-coverage contract, not just "every claim has a
// non-empty sourcePath".
//
// The teeth here are INDEPENDENT and HAND-CONSTRUCTED (not generated): a known-good
// live Hormuz packet PASSES; then three minimal, distinct corruptions each BLOCK,
// and each is asserted on its SPECIFIC failure string -- a bare BLOCKED could be
// satisfied by any unrelated check, so the specific message proves THIS check bit.
//
// CRITICAL test discipline (the false-green trap): buildDecisionPacket returns a
// packet whose `gatekeeper` field was computed from the CLEAN slices. Mutating
// packet.supplierMessages and reading packet.gatekeeper would read a STALE report
// and test nothing. So every corruption re-runs runActionOpsGatekeeper on the
// MUTATED slices. The PASS case reads packet.gatekeeper directly -- there it is the
// real run over the clean slices, which is exactly what we want to assert.

const SUPPLIERS = ingestSeed().suppliers;

// Re-run the gatekeeper over a packet's slices (so a mutation to those slices is
// actually exercised). Mirrors what lib/agents/actionops/index.ts passes -- the
// same resolvable input roots the D.4 citation check walks.
function gatekeeperOver(packet: DecisionPacketV2) {
  return runActionOpsGatekeeper({
    suppliers: SUPPLIERS,
    threatCard: packet.threatCard,
    exposureResults: packet.exposureResults,
    supplierMessages: packet.supplierMessages,
    agentRuns: packet.agentRuns,
    checkedAt: packet.createdAt,
    publicSignals: packet.publicSignals,
    simulation: packet.simulation
  });
}

// A structural deep clone so a corruption cannot leak across tests. structuredClone
// is sufficient here (the packet is plain JSON data -- no functions, no Dates).
function clonePacket(packet: DecisionPacketV2): DecisionPacketV2 {
  return structuredClone(packet);
}

describe("ActionOps gatekeeper -- full citation enforcement (D.4, key-OFF, deterministic)", () => {
  it("CLEARS the live Hormuz packet for human review (the control)", async () => {
    // useLiveSignals: false -> cached signals, no network, deterministic, key-OFF.
    // The Dispatcher's claims are correct by construction (the impact-assessment draft
    // cites only the sim horizon it states), so the rigorous check must ACCEPT them --
    // otherwise the gatekeeper would block the very packets it is meant to pass.
    const packet = await buildDecisionPacket({ useLiveSignals: false });

    // packet.gatekeeper IS the real run over the clean slices -- read it directly.
    expect(packet.gatekeeper.status).not.toBe("BLOCKED");
    expect(packet.gatekeeper.approvedForHumanReview).toBe(true);
    // And re-running over the same slices is identically clean (the control the
    // corruption tests perturb from).
    const rerun = gatekeeperOver(packet);
    expect(rerun.status).toBe("PASS");
    expect(rerun.failures).toEqual([]);
  });

  it("BLOCKS a WRONG-CONTEXT number: claim value no longer matches its sourcePath", async () => {
    const packet = clonePacket(await buildDecisionPacket({ useLiveSignals: false }));
    // P1: the deterministic draft (impact-assessment request) carries ONE claim -- the
    // shared assessment window, citing simulation.horizons[0].days (=7). Repoint it at
    // simulation.horizons[1].days (=30): the path still RESOLVES and is a valid input root,
    // but the resolved value (30) no longer equals the claimed value (7). That is a
    // right-value/wrong-context citation, which must fail -- a draft asserting a 7-day
    // window must cite the 7-day horizon, not the 30-day one.
    const claim = packet.supplierMessages[0].claims[0];
    expect(claim.sourcePath).toBe("simulation.horizons[0].days"); // guard: the fixture is what we think
    claim.sourcePath = "simulation.horizons[1].days";

    const report = gatekeeperOver(packet);
    expect(report.status).toBe("BLOCKED");
    expect(report.approvedForHumanReview).toBe(false);
    expect(report.failures.some((f) => /wrong-context number/.test(f))).toBe(true);
  });

  it("BLOCKS an UNSOURCED prose numeral: a figure in the body with no backing claim", async () => {
    const packet = clonePacket(await buildDecisionPacket({ useLiveSignals: false }));
    // Append a bare figure to the body that no claim backs. 45 is chosen so it does
    // not collide with any real claim value (the scores are 69/68/.. and the window
    // is 7), so it is a genuinely unsourced assertion, not a value coincidence.
    const msg = packet.supplierMessages[0];
    expect(msg.body).not.toMatch(/\b45\b/); // guard: 45 is not already present
    msg.body += " Estimated additional impact is 45 units.";

    const report = gatekeeperOver(packet);
    expect(report.status).toBe("BLOCKED");
    expect(report.approvedForHumanReview).toBe(false);
    expect(report.failures.some((f) => /unsourced numeral 45/.test(f))).toBe(true);
  });

  it("BLOCKS a claim citing a NON-INPUT root (the Dispatcher's own output)", async () => {
    const packet = clonePacket(await buildDecisionPacket({ useLiveSignals: false }));
    // Repoint the claim at the message's OWN claims array: resolvable, but circular
    // self-grounding -- it satisfies both citation directions while proving nothing.
    // A claim must trace to a structured INPUT (threat/signals/exposure/simulation),
    // never to supplierMessages.
    packet.supplierMessages[0].claims[0].sourcePath = "supplierMessages[0].claims[0].value";

    const report = gatekeeperOver(packet);
    expect(report.status).toBe("BLOCKED");
    expect(report.approvedForHumanReview).toBe(false);
    // Assert the SPECIFIC non-input failure. Note this corruption ALSO yields an
    // unsourced-numeral failure (the rejected claim's value 69 never enters the
    // backing set, so the prose "69" goes unbacked) -- so we assert the distinctive
    // non-input string, NOT failures.length, which would be brittle.
    expect(report.failures.some((f) => /cites non-input "supplierMessages"/.test(f))).toBe(true);
  });
});
