import { describe, expect, it } from "vitest";
import {
  applyPlaybookFirewall,
  classifyPlaybooksLive,
  runStrategist,
  type StrategistLlmResult
} from "@/lib/agents/actionops/strategist";
import { runAtlas } from "@/lib/agents/actionops/atlas";
import { runSentinel } from "@/lib/agents/actionops/sentinel";
import { gradeCitationCoverage } from "@/lib/evals/graders";
import { getActionOpsScenario } from "@/lib/data/actionops-scenarios";
import { ingestSeed } from "@/lib/ingest/seed-suppliers";
import { hormuz } from "@/evals/golden/scenarios";
import type { ActionOpsContext } from "@/lib/agents/actionops/types";
import type { ExposureResult } from "@/lib/schemas";

// D.6 Strategist (the SECOND LLM agent, key-OFF, NO network in any test here).
// Four things are proven:
//   (a) the deterministic FALLBACK -- key-OFF runStrategist emits the D.1 playbook as a
//       DETERMINISTIC_RULES / PASS run, byte-stable, and its steps are numeral-free so
//       the new playbook-numeral contract holds trivially.
//   (b) the OUTPUT-VALIDATION FIREWALL -- a hand-built "LLM result" carrying (i) a step
//       with a fabricated numeral and (ii) an off-exposure groundedClaimId is REJECTED,
//       so a plan with an invented figure / ungrounded claim cannot cross. Each
//       assertion bites: the clean variant of the same input PASSES.
//   (c) key-OFF NO-network -- classifyPlaybooksLive short-circuits to the fallback and the
//       injected generate fixture is never called (the flag never flips).
//   (d) the live CLEAN path crosses as a LIVE_AI run.
// The "LLM result" is HAND-BUILT (never a live call), so determinism holds and the
// firewall is graded against adversarial input the way the graders are. Real exposures
// are DERIVED via runSentinel -> runAtlas (never hand-typed), so the grounded ids cannot
// drift from the canonical ids the pipeline produces.

const BASE_DATE = "2026-06-18T12:00:00.000Z";

function hormuzContext(): ActionOpsContext {
  return {
    scenario: getActionOpsScenario(),
    signals: [],
    suppliers: ingestSeed().suppliers,
    baseDateIso: BASE_DATE
  };
}

// The real Hormuz exposures, derived through the pipeline so the grounded ids are the
// canonical ones (not hand-typed literals that could drift from the producer).
function hormuzExposures(): ExposureResult[] {
  const ctx = hormuzContext();
  const { threatCard } = runSentinel(ctx);
  const { exposureResults } = runAtlas(ctx, threatCard);
  return exposureResults;
}

describe("Strategist deterministic fallback (D.6, key-OFF)", () => {
  it("emits the D.1 playbook as a DETERMINISTIC_RULES / PASS run, with numeral-free steps", () => {
    const ctx = hormuzContext();
    const exposures = hormuzExposures();
    const { playbooks, agentRun } = runStrategist(ctx, exposures);

    // The fallback is the D.1 template, byte-stable (the pipeline/golden suites assert
    // against it): one Procurement playbook grounded in the top-3 exposure ids.
    expect(playbooks).toHaveLength(1);
    const pb = playbooks[0];
    expect(pb.id).toBe("PB-PROCUREMENT");
    expect(pb.role).toBe("Procurement");
    expect(pb.groundedClaimIds).toEqual(exposures.slice(0, 3).map((e) => e.id));
    // Every grounded id is a real exposure id (no dangle).
    const exposureIds = new Set(exposures.map((e) => e.id));
    for (const id of pb.groundedClaimIds) expect(exposureIds.has(id)).toBe(true);

    expect(agentRun.mode).toBe("DETERMINISTIC_RULES");
    expect(agentRun.validationStatus).toBe("PASS");
    expect(agentRun.model).toBe("deterministic-rules");

    // The new playbook-numeral contract: the fallback steps carry NO sourceable
    // numeral -- the firewall over the fallback finds nothing to reject.
    const clean = applyPlaybookFirewall(
      { playbooks: playbooks.map((p) => ({ role: p.role, summary: p.summary, steps: p.steps, groundedClaimIds: p.groundedClaimIds })) },
      exposures
    );
    expect(clean.ok).toBe(true);
  });

  it("emits NO playbook for a zero-exposure run (nothing to ground a plan in)", () => {
    const ctx = hormuzContext();
    const { playbooks, agentRun } = runStrategist(ctx, []);
    expect(playbooks).toEqual([]);
    expect(agentRun.mode).toBe("DETERMINISTIC_RULES");
    expect(agentRun.validationStatus).toBe("PASS");
  });

  it("classifyPlaybooksLive key-OFF short-circuits to the same fallback with NO network", async () => {
    const ctx = hormuzContext();
    const exposures = hormuzExposures();
    let generateCalled = false;
    const { playbooks, agentRun } = await classifyPlaybooksLive(ctx, exposures, {
      enabled: () => false,
      // If the live path were taken key-OFF, this would flip the flag (and a real run
      // would hit the network) -- so asserting it was never called proves the no-network
      // key-OFF contract structurally, not just by trusting liveAiEnabled().
      generate: async () => {
        generateCalled = true;
        return { object: {} };
      }
    });

    expect(generateCalled).toBe(false);
    expect(playbooks).toHaveLength(1);
    expect(playbooks[0].id).toBe("PB-PROCUREMENT");
    expect(agentRun.mode).toBe("DETERMINISTIC_RULES");
    expect(agentRun.validationStatus).toBe("PASS");
  });

  it("does NOT fire the LLM key-ON when there are zero exposures (no input to ground)", async () => {
    const ctx = hormuzContext();
    let generateCalled = false;
    const { playbooks, agentRun } = await classifyPlaybooksLive(ctx, [], {
      enabled: () => true,
      generate: async () => {
        generateCalled = true;
        return { object: { playbooks: [] } };
      }
    });
    // No exposures -> no playbook and the model is never called (no network, no spend).
    expect(generateCalled).toBe(false);
    expect(playbooks).toEqual([]);
    expect(agentRun.mode).toBe("DETERMINISTIC_RULES");
  });
});

describe("Strategist output-validation firewall (D.6)", () => {
  it("REJECTS a step carrying a fabricated numeral (zero-independent-estimates cut)", () => {
    const exposures = hormuzExposures();
    const groundedClaimIds = exposures.slice(0, 3).map((e) => e.id);
    // A hand-built "LLM result" whose step smuggles a sourceable figure the model would
    // have had to INVENT (steps ground via ids, not inline claims), plus a dollar amount.
    const fabricated: StrategistLlmResult = {
      playbooks: [
        {
          role: "Procurement",
          summary: "Secure alternate routing for the exposed suppliers.",
          steps: [
            "Confirm backup capacity with the most exposed suppliers.",
            "Stage 5000 backup units within 30 days to absorb the disruption."
          ],
          groundedClaimIds
        }
      ]
    };

    const outcome = applyPlaybookFirewall(fabricated, exposures);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toMatch(/ungrounded numeral/i);
    }
  });

  it("REJECTS an off-exposure groundedClaimId (a plan grounded in nothing real)", () => {
    const exposures = hormuzExposures();
    const realIds = exposures.slice(0, 2).map((e) => e.id);
    // The grounding mixes a real id with an INVENTED one -- evidence the plan is
    // fabricated. The firewall fails closed, it does not silently drop the bad id.
    const offExposure: StrategistLlmResult = {
      playbooks: [
        {
          role: "Procurement",
          summary: "Secure alternate routing.",
          steps: ["Confirm backup capacity with the most exposed suppliers."],
          groundedClaimIds: [...realIds, "EXP-does-not-exist"]
        }
      ]
    };

    const outcome = applyPlaybookFirewall(offExposure, exposures);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toMatch(/off-exposure id/i);
      expect(outcome.reason).toContain("EXP-does-not-exist");
    }
  });

  it("REJECTS a playbook that grounds in no exposure at all (ungrounded plan)", () => {
    const exposures = hormuzExposures();
    const ungrounded: StrategistLlmResult = {
      playbooks: [
        {
          role: "Procurement",
          summary: "Secure alternate routing.",
          steps: ["Confirm backup capacity."],
          groundedClaimIds: []
        }
      ]
    };
    const outcome = applyPlaybookFirewall(ungrounded, exposures);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toMatch(/grounds in no exposure/i);
    }
  });

  it("ACCEPTS the same shape once the step is numeral-free and the ids are real (the teeth bite)", () => {
    const exposures = hormuzExposures();
    const groundedClaimIds = exposures.slice(0, 3).map((e) => e.id);
    // The control for the two reject tests above: identical structure, but the
    // offending numeral and the bad id are gone. It must CROSS -- otherwise the rejects
    // would be vacuous (rejecting everything proves nothing).
    const clean: StrategistLlmResult = {
      playbooks: [
        {
          role: "Procurement",
          summary: "Secure alternate routing for the exposed suppliers.",
          steps: [
            "Confirm backup capacity with the most exposed suppliers.",
            "Stage backup units on alternate lanes to absorb the disruption."
          ],
          groundedClaimIds
        }
      ]
    };
    const outcome = applyPlaybookFirewall(clean, exposures);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.playbooks).toHaveLength(1);
      expect(outcome.playbooks[0].id).toBe("PB-LLM-0");
      expect(outcome.playbooks[0].groundedClaimIds).toEqual(groundedClaimIds);
    }
  });

  it("end-to-end: a firewall reject in classifyPlaybooksLive degrades to FAILED_TO_FALLBACK", async () => {
    const ctx = hormuzContext();
    const exposures = hormuzExposures();
    const groundedClaimIds = exposures.slice(0, 3).map((e) => e.id);
    // The injected "LLM" returns a plan with an invented numeral in a step. The live
    // path must funnel it through the firewall, reject it, and emit the deterministic
    // playbook with a degraded (FAILED_TO_FALLBACK / FAIL) run.
    const { playbooks, agentRun } = await classifyPlaybooksLive(ctx, exposures, {
      enabled: () => true,
      generate: async () => ({
        object: {
          playbooks: [
            {
              role: "Procurement",
              summary: "Secure routing.",
              steps: ["Stage 5000 units within 30 days."],
              groundedClaimIds
            }
          ]
        }
      })
    });

    expect(agentRun.mode).toBe("FAILED_TO_FALLBACK");
    expect(agentRun.validationStatus).toBe("FAIL");
    // The emitted plan is the clean deterministic playbook -- the invented figure is gone.
    expect(playbooks).toHaveLength(1);
    expect(playbooks[0].id).toBe("PB-PROCUREMENT");
  });

  it("end-to-end: a clean LLM result crosses as a LIVE_AI run", async () => {
    const ctx = hormuzContext();
    const exposures = hormuzExposures();
    const groundedClaimIds = exposures.slice(0, 3).map((e) => e.id);
    const { playbooks, agentRun } = await classifyPlaybooksLive(ctx, exposures, {
      enabled: () => true,
      generate: async () => ({
        object: {
          playbooks: [
            {
              role: "Procurement",
              summary: "Secure alternate routing for the Gulf-exposed suppliers.",
              steps: [
                "Confirm current lead times and backup capacity with the most exposed suppliers.",
                "Issue contingency RFQs on alternate, non-affected lanes."
              ],
              groundedClaimIds
            }
          ]
        }
      })
    });

    expect(agentRun.mode).toBe("LIVE_AI");
    expect(agentRun.validationStatus).toBe("PASS");
    expect(playbooks).toHaveLength(1);
    expect(playbooks[0].role).toBe("Procurement");
    expect(playbooks[0].groundedClaimIds).toEqual(groundedClaimIds);
  });
});

describe("Strategist playbook-numeral grading (D.6, shared module)", () => {
  it("the clean Hormuz golden packet passes gradeCitationCoverage (numeral-free playbook)", () => {
    // The new playbook-numeral check rides inside gradeCitationCoverage. The shipped
    // Hormuz golden playbook is numeral-free, so the grader stays clean over it -- the
    // contract does not break the existing golden record.
    const result = gradeCitationCoverage(hormuz.packet);
    expect(result.pass, result.failures.join(" | ")).toBe(true);
  });

  it("a playbook step with a fabricated numeral FAILS gradeCitationCoverage (grade-time teeth)", () => {
    // Corrupt a copy of the Hormuz golden: smuggle a sourceable figure into a playbook
    // step. The grader (the merge-time gate) must catch it -- the same definition the
    // Strategist firewall enforces at produce-time.
    const corrupted = structuredClone(hormuz.packet);
    corrupted.playbooks[0].steps.push("Reserve 12000 units of backup inventory immediately.");
    const result = gradeCitationCoverage(corrupted);
    expect(result.pass).toBe(false);
    expect(result.failures.some((f) => /ungrounded numeral 12000/i.test(f))).toBe(true);
  });
});
