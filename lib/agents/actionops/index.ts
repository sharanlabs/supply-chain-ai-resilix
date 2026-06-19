import { runActionOpsGatekeeper } from "@/lib/agents/actionops/gatekeeper";
import { runAtlas } from "@/lib/agents/actionops/atlas";
import { classifyMessagesLive, runDispatcher } from "@/lib/agents/actionops/dispatcher";
import { classifyThreatLive, runSentinel } from "@/lib/agents/actionops/sentinel";
import { runSimulator } from "@/lib/agents/actionops/simulator";
import { classifyPlaybooksLive, runStrategist } from "@/lib/agents/actionops/strategist";
import { runVerifier } from "@/lib/agents/actionops/verifier";
import { DEFAULT_BUDGET_CAP_USD } from "@/lib/agents/budget";
import {
  type BudgetContext,
  estimateLiveCallCostUsd,
  liveAiEnabled,
  resolvedGeminiModel
} from "@/lib/agents/run";
import type { ActionOpsContext, ActionOpsResult } from "@/lib/agents/actionops/types";

export type { ActionOpsContext, ActionOpsResult } from "@/lib/agents/actionops/types";

// The ActionOps 6-agent pipeline (PLAN Phases 4-7). Canonical order: Sentinel
// (threat) -> Verifier (corroboration) -> Atlas (exposure) -> Simulator (runway) ->
// Strategist (playbooks) -> Dispatcher (drafts); the gatekeeper validates the
// assembled output last. Each agent is its own module -- the SEAM that let D.2-D.7
// each replace ONE agent body with no change to this orchestration.
//
// D.9 wires the live path: Sentinel / Strategist / Dispatcher each have a SYNC
// deterministic body (run*) AND an ASYNC live LLM body (classify*Live, budget-guarded,
// firewalled). This orchestrator is now async and picks per run:
//   live === true  -> the 3 LLM bodies, threading a CUMULATIVE budget (below).
//   live === false -> the sync deterministic bodies, exactly as D.1-D.8.
// Verifier / Atlas / Simulator / gatekeeper are deterministic on BOTH paths.
//
// `live` is DOUBLE-GATED: the caller must opt in (ctx.live) AND the runtime must be
// configured (liveAiEnabled() -- flag + key). The page render passes live:false, so a
// homepage load NEVER fires a billable call even when ENABLE_LIVE_AI is globally on;
// the only path that can bill is the explicit, auth-gated /api/run-exception POST.
export async function runActionOpsAgents(ctx: ActionOpsContext): Promise<ActionOpsResult> {
  const { signals, baseDateIso } = ctx;

  const live = ctx.live === true && liveAiEnabled();
  const model = resolvedGeminiModel();

  // The CUMULATIVE budget threaded across the 3 LLM calls so the $5 cap is a PER-RUN
  // running total, not a per-call reset: each live call asserts (spent-so-far + this
  // call's upper-bound estimate) <= cap BEFORE it bills, and each completed run's real
  // costUsd is folded back into spentUsd. A breach throws inside the agent and degrades
  // THAT run to FAILED_TO_FALLBACK (costUsd 0), so the running total only ever reflects
  // spend that actually happened. budgetForNext() is read fresh per call so spentUsd is
  // current at each boundary.
  let spentUsd = 0;
  const budgetForNext = (): BudgetContext => ({
    spentUsd,
    estimatedNextUsd: estimateLiveCallCostUsd(model),
    capUsd: DEFAULT_BUDGET_CAP_USD
  });

  // Sentinel (LLM #1 when live): the injection firewall + the ONLY agent that reads raw
  // signal text. Key-OFF/live:false -> the deterministic threat (unchanged from D.1).
  const { threatCard, agentRun: sentinelRun } = live
    ? await classifyThreatLive(ctx, { budget: budgetForNext() })
    : runSentinel(ctx);
  spentUsd += sentinelRun.costUsd ?? 0;

  const { agentRun: verifierRun } = runVerifier(ctx, threatCard);
  const { exposureResults, dataGaps: atlasDataGaps, agentRun: atlasRun } = runAtlas(ctx, threatCard);
  const { simulation, dataGaps: simulatorDataGaps, agentRun: simulatorRun } = runSimulator(ctx, exposureResults);
  // Atlas's gaps (a rejected/misclassified handoff) come first, then the Simulator's
  // (Tier-1 no-inventory note). The packet's dataGaps is the union.
  const dataGaps = [...atlasDataGaps, ...simulatorDataGaps];

  // Strategist (LLM #2 when live): playbooks grounded ONLY in the structured exposures.
  const { playbooks, agentRun: strategistRun } = live
    ? await classifyPlaybooksLive(ctx, exposureResults, { budget: budgetForNext() })
    : runStrategist(ctx, exposureResults);
  spentUsd += strategistRun.costUsd ?? 0;

  // Dispatcher (LLM #3 when live): the most security-critical -- its drafts are the only
  // thing that leaves the building. threatCard + publicSignals are passed for the
  // firewall's citation root ONLY; the prompt itself sees just the structured whitelist
  // (see dispatcher.ts -- the laundering cut keeps that prose out of the prompt).
  const {
    supplierMessages,
    actionItems,
    agentRun: dispatcherRun
  } = live
    ? await classifyMessagesLive(ctx, exposureResults, simulation, {
        budget: budgetForNext(),
        threatCard,
        publicSignals: signals
      })
    : runDispatcher(ctx, exposureResults, simulation);
  spentUsd += dispatcherRun.costUsd ?? 0;

  // Assemble the runs BEFORE the gatekeeper so it can fail closed on any agent that
  // reported a validation failure (e.g. an Atlas-rejected misclassified handoff, or a
  // live agent that degraded to FAILED_TO_FALLBACK).
  const agentRuns = [sentinelRun, verifierRun, atlasRun, simulatorRun, strategistRun, dispatcherRun];

  const gatekeeper = runActionOpsGatekeeper({
    suppliers: ctx.suppliers,
    threatCard,
    exposureResults,
    supplierMessages,
    agentRuns,
    checkedAt: baseDateIso,
    // The resolvable input slices the D.4 citation check needs: claims cite
    // `simulation.horizons[0].days` and `exposureResults[i].exposureScore`, so the
    // gatekeeper must see both to walk the paths (signals included for completeness
    // -- a claim may legitimately cite publicSignals).
    publicSignals: signals,
    simulation
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
