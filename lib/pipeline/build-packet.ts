import { randomUUID } from "node:crypto";
import { runActionOpsAgents } from "@/lib/agents/actionops";
import { computeEffectiveMode, liveAiEnabled } from "@/lib/agents/run";
import { summarizeCost } from "@/lib/agents/cost-summary";
import { validateDecisionPacket } from "@/lib/agents/gatekeeper";
import { getActionOpsScenario } from "@/lib/data/actionops-scenarios";
import { ingestSeed } from "@/lib/ingest/seed-suppliers";
import { fetchPublicSignals } from "@/lib/signals/fetchers";
import type { DecisionPacketV2 } from "@/lib/schemas";

export type BuildPacketOptions = {
  scenarioId?: string;
  useLiveSignals?: boolean;
};

// Assemble a DecisionPacketV2 from the ActionOps agents -- PURE: no persistence,
// no idempotency. This is the seam the cutover needs in two places: the read-only
// demo render (app/page.tsx calls it with cached signals, so a page load does NOT
// write a packet and does NOT hit the network), and runExceptionPipeline (which
// wraps it with saveDecisionPacket + the idempotency mutex for the API path).
// Splitting "assemble" from "persist" is what keeps the UI render side-effect-free.
export async function buildDecisionPacket(
  options: BuildPacketOptions = {}
): Promise<DecisionPacketV2> {
  const { scenarioId, useLiveSignals = false } = options;
  const scenario = getActionOpsScenario(scenarioId);
  const now = new Date().toISOString();

  const signals = await fetchPublicSignals({ useLive: useLiveSignals });
  const suppliers = ingestSeed().suppliers;

  const result = runActionOpsAgents({ scenario, signals, suppliers, baseDateIso: now });

  // requested = what the run intended; effective = what actually happened across
  // the agent runs (R4-8). Key-OFF -> both DETERMINISTIC_RULES; a replay scenario
  // requests REPLAY. computeEffectiveMode never invents a live label.
  const requestedMode =
    scenario.requestedMode ?? (liveAiEnabled() ? "LIVE_AI" : "DETERMINISTIC_RULES");
  const effectiveMode = computeEffectiveMode(result.agentRuns, requestedMode);

  // Packet-level cost summary (D.8, R4-10): the Success_Criteria "<=$5 total LLM
  // spend" number, summed from the agent runs. Key-OFF every run is deterministic
  // (costUsd 0) -> totalCostUsd 0 with a stamped pricingVersion; key-ON it is the real
  // sum the budget cap defends.
  const cost = summarizeCost(result.agentRuns);

  const packet: DecisionPacketV2 = {
    packetVersion: 2,
    id: `DP-${randomUUID()}`,
    threatCard: result.threatCard,
    publicSignals: result.publicSignals,
    exposureResults: result.exposureResults,
    simulation: result.simulation,
    dataTier: scenario.dataTier,
    dataGaps: result.dataGaps,
    playbooks: result.playbooks,
    supplierMessages: result.supplierMessages,
    actionItems: result.actionItems,
    gatekeeper: result.gatekeeper,
    agentRuns: result.agentRuns,
    totalCostUsd: cost.totalCostUsd,
    pricingVersion: cost.pricingVersion,
    requestedMode,
    effectiveMode,
    approvalStatus: "PENDING",
    auditTrail: [
      {
        at: now,
        actor: "system",
        action: "SCENARIO_RUN",
        detail: `Scenario ${scenario.name} executed with ${
          useLiveSignals ? "live signal fetchers" : "cached signals"
        }.`
      },
      {
        at: now,
        actor: "gatekeeper",
        action: result.gatekeeper.status,
        detail: `${result.gatekeeper.failures.length} failures and ${result.gatekeeper.warnings.length} warnings.`
      }
    ],
    createdAt: now,
    updatedAt: now
  };

  const parsed = validateDecisionPacket(packet);
  if (!parsed.success) {
    throw new Error(`Decision packet failed schema validation: ${parsed.error.message}`);
  }
  // parsed.data is the validated union; packetVersion is the literal 2 here.
  return parsed.data as DecisionPacketV2;
}
