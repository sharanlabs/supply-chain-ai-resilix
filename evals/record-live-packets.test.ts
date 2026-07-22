import { describe, expect, it } from "vitest";
import { mkdirSync } from "node:fs";

import { buildDecisionPacket } from "@/lib/pipeline/build-packet";
import { ACTIONOPS_SCENARIOS } from "@/lib/data/actionops-scenarios";
import { atomicWriteFileSync } from "@/evals/_helpers/atomic-write";

// Replay-fixture recorder (D.9, gated RUN_LIVE_AI_RECORD=true -- BILLS). Runs each scenario
// live ONCE and freezes the resulting packet to evals/fixtures/live/<id>.json. "Spend once,
// replay forever": the demo + a non-billing replay eval re-render these without re-calling
// Gemini. The capture is a SNAPSHOT of real LLM output (non-deterministic id/createdAt/prose)
// -- honest replay, labelled by the packet's own createdAt + effectiveMode. NOT run in CI.

const RECORD = process.env.RUN_LIVE_AI_RECORD === "true";
const OUT_DIR = "evals/fixtures/live";

describe.skipIf(!RECORD)("record live packets per scenario (BILLS, gated)", () => {
  it(
    "freezes one live packet per scenario",
    async () => {
      mkdirSync(OUT_DIR, { recursive: true });
      const summary: Record<string, unknown>[] = [];
      for (const scenario of ACTIONOPS_SCENARIOS) {
        // Inject an in-pipeline Skeptic ACCEPT so the frozen fixtures are REPRODUCIBLE (a real
        // cross-family verdict is stochastic and could flip a scenario to NO_ACTION). The Skeptic's
        // real verdict quality is covered by actionops-skeptic-calibration; replay fixtures only
        // need a stable, valid Skeptic run.
        const packet = await buildDecisionPacket({
          scenarioId: scenario.id,
          live: true,
          skeptic: {
            generate: async () => ({
              object: { accepted: true, reason: "in-pipeline accept (recorded replay fixture)" }
            })
          }
        });
        atomicWriteFileSync(`${OUT_DIR}/${scenario.id}.json`, `${JSON.stringify(packet, null, 2)}\n`);
        const row = {
          id: scenario.id,
          eventType: packet.threatCard.eventType,
          effectiveMode: packet.effectiveMode,
          exposures: packet.exposureResults.length,
          playbooks: packet.playbooks.length,
          drafts: packet.supplierMessages.length,
          costUsd: packet.totalCostUsd,
          gatekeeper: packet.gatekeeper.status,
          modes: packet.agentRuns
            .filter((r) => ["RUN-SENTINEL", "RUN-STRATEGIST", "RUN-DISPATCHER"].includes(r.id))
            .map((r) => `${r.id.replace("RUN-", "")}=${r.mode}`)
            .join(",")
        };
        summary.push(row);
        // Each is a genuine live capture.
        expect(packet.effectiveMode).toBe("LIVE_AI");
      }
      // A compact, readable index of what was captured (the coherence eyeball + evidence).
      atomicWriteFileSync(`${OUT_DIR}/_summary.json`, `${JSON.stringify(summary, null, 2)}\n`);
    },
    600_000
  );
});
