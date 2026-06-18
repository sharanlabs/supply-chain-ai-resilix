import { runActionOpsGatekeeper } from "@/lib/agents/actionops/gatekeeper";
import { runAtlas } from "@/lib/agents/actionops/atlas";
import { runDispatcher } from "@/lib/agents/actionops/dispatcher";
import { runSentinel } from "@/lib/agents/actionops/sentinel";
import { runSimulator } from "@/lib/agents/actionops/simulator";
import { runStrategist } from "@/lib/agents/actionops/strategist";
import { runVerifier } from "@/lib/agents/actionops/verifier";
import type { ActionOpsContext, ActionOpsResult } from "@/lib/agents/actionops/types";

export type { ActionOpsContext, ActionOpsResult } from "@/lib/agents/actionops/types";

// The ActionOps 6-agent pipeline (PLAN Phases 4-7), deterministic in D.1.
// Canonical order: Sentinel (threat) -> Verifier (corroboration) -> Atlas
// (exposure) -> Simulator (runway) -> Strategist (playbooks) -> Dispatcher
// (drafts); the gatekeeper validates the assembled output last. Each agent is its
// own module -- the SEAM: D.2-D.7 each replace ONE agent body (Atlas's real scoring
// model; the Sentinel / Strategist / Dispatcher LLM versions) with no change to
// this orchestration. Every step records an AgentRun; D.1 runs are all
// DETERMINISTIC_RULES (no live AI), so the packet is never mislabeled live.
export function runActionOpsAgents(ctx: ActionOpsContext): ActionOpsResult {
  const { signals, baseDateIso } = ctx;

  const { threatCard, agentRun: sentinelRun } = runSentinel(ctx);
  const { agentRun: verifierRun } = runVerifier(ctx, threatCard);
  const { exposureResults, dataGaps: atlasDataGaps, agentRun: atlasRun } = runAtlas(ctx, threatCard);
  const { simulation, dataGaps: simulatorDataGaps, agentRun: simulatorRun } = runSimulator(ctx, exposureResults);
  // Atlas's gaps (a rejected/misclassified handoff) come first, then the Simulator's
  // (Tier-1 no-inventory note). The packet's dataGaps is the union.
  const dataGaps = [...atlasDataGaps, ...simulatorDataGaps];
  const { playbooks, agentRun: strategistRun } = runStrategist(ctx, exposureResults);
  const {
    supplierMessages,
    actionItems,
    agentRun: dispatcherRun
  } = runDispatcher(ctx, exposureResults, simulation);

  // Assemble the runs BEFORE the gatekeeper so it can fail closed on any agent that
  // reported a validation failure (e.g. an Atlas-rejected misclassified handoff).
  const agentRuns = [sentinelRun, verifierRun, atlasRun, simulatorRun, strategistRun, dispatcherRun];

  const gatekeeper = runActionOpsGatekeeper({
    suppliers: ctx.suppliers,
    threatCard,
    exposureResults,
    supplierMessages,
    agentRuns,
    checkedAt: baseDateIso
  });

  return {
    threatCard,
    publicSignals: signals,
    exposureResults,
    simulation,
    dataGaps,
    playbooks,
    supplierMessages,
    actionItems,
    gatekeeper,
    agentRuns
  };
}
