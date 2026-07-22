import { describe, expect, it } from "vitest";
import { mkdirSync } from "node:fs";

import { buildDecisionPacket } from "@/lib/pipeline/build-packet";
import { atomicWriteFileSync } from "@/evals/_helpers/atomic-write";

// S-L loop-trajectory recorder (gated RUN_LIVE_LOOP_RECORD=true -- BILLS ~$0.005).
// Records ONE flagship scenario through the REAL Investigator loop with the REAL
// cross-family Skeptic -- no injected verdict: the whole point of the replay
// exhibit is showing the genuine machinery, so a faked ACCEPT here would be a
// dishonest fixture. Writes to evals/fixtures/loop/ -- a NEW path: the frozen
// evals/fixtures/live/SCN-* captures (incl. the homepage moat-coupled Hormuz
// packet) stay byte-untouched; re-capturing THOSE is a separately owner-gated
// step (plan § Deferred). "Spend once, replay forever," same as the D.9 recorder.
//
// Fail-loud contract: a keyless or flag-off run must FAIL this recorder, never
// quietly write a waterfall packet labelled as a loop trajectory.

const RECORD = process.env.RUN_LIVE_LOOP_RECORD === "true";
const OUT_DIR = "evals/fixtures/loop";
const SCENARIO = "SCN-HORMUZ";

describe.skipIf(!RECORD)("record one REAL loop trajectory (BILLS, gated)", () => {
  it(
    "freezes a live Investigator-loop run with the real cross-family Skeptic",
    async () => {
      mkdirSync(OUT_DIR, { recursive: true });
      const packet = await buildDecisionPacket({ scenarioId: SCENARIO, live: true });

      // Genuine live capture, not a fallback that would replay as a fake.
      expect(packet.effectiveMode).toBe("LIVE_AI");

      // The LOOP actually drove it: the Investigator audit run exists, ran live,
      // and its summary carries the model-driven tool-call order the replay renders.
      const investigator = packet.agentRuns.find((r) => r.agentName === "Investigator");
      expect(investigator?.mode).toBe("LIVE_AI");
      expect(investigator?.summary).toMatch(/\[.+->.+\]/);

      // The REAL cross-family Skeptic ran (a genuine model, never the deterministic
      // pass and never an injected verdict), and the gate outcome was bound in code.
      const skeptic = packet.agentRuns.find((r) => r.agentName === "Skeptic");
      expect(skeptic).toBeDefined();
      expect(skeptic?.model).toBeTruthy();
      expect(skeptic?.model).not.toBe("deterministic-rules");
      expect(packet.skepticGateOutcome).toBeDefined();

      atomicWriteFileSync(`${OUT_DIR}/LOOP-${SCENARIO.replace("SCN-", "")}.json`, `${JSON.stringify(packet, null, 2)}\n`);
      atomicWriteFileSync(
        `${OUT_DIR}/_summary.json`,
        `${JSON.stringify(
          [
            {
              id: `LOOP-${SCENARIO.replace("SCN-", "")}`,
              recordedFrom: SCENARIO,
              effectiveMode: packet.effectiveMode,
              recommendation: packet.recommendation ?? "ACT",
              skepticGateOutcome: packet.skepticGateOutcome ?? null,
              skepticModel: skeptic?.model ?? null,
              investigatorSummary: investigator?.summary ?? null,
              exposures: packet.exposureResults.length,
              drafts: packet.supplierMessages.length,
              costUsd: packet.totalCostUsd,
              gatekeeper: packet.gatekeeper.status
            }
          ],
          null,
          2
        )}\n`
      );
    },
    600_000
  );
});
