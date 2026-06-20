import { makeAgentRun } from "@/lib/agents/actionops/agent-run";
import { runActionOpsGatekeeper } from "@/lib/agents/actionops/gatekeeper";
import { runAtlas } from "@/lib/agents/actionops/atlas";
import { classifyMessagesLive, runDispatcher } from "@/lib/agents/actionops/dispatcher";
import { decideRecommendation } from "@/lib/agents/actionops/recommendation";
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
import type { ActionItem, AgentRun, Playbook, SupplierMessageDraft } from "@/lib/schemas";
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

  const { checks: verifierChecks, agentRun: verifierRun } = runVerifier(ctx, threatCard);
  const { exposureResults, dataGaps: atlasDataGaps, agentRun: atlasRun } = runAtlas(ctx, threatCard);
  const { simulation, dataGaps: simulatorDataGaps, agentRun: simulatorRun } = runSimulator(ctx, exposureResults);
  // Atlas's gaps (a rejected/misclassified handoff) come first, then the Simulator's
  // (Tier-1 no-inventory note). The packet's dataGaps is the union.
  const dataGaps = [...atlasDataGaps, ...simulatorDataGaps];

  // The act / refuse gate (deterministic). NO_ACTION = refuse to draft outbound action
  // on a lone uncorroborated, low-confidence source -- the refusal itself is the output,
  // not an error. Drives off the Verifier's corroboration, the threat's own confidence,
  // and whether a real-sector exposure exists (decideRecommendation owns the rule).
  const { recommendation, missingEvidence } = decideRecommendation({
    corroborated: verifierChecks.corroborated,
    confidence: threatCard.confidence,
    exposureResults
  });

  // The outbound agents (Strategist -> playbooks, Dispatcher -> drafts) are the action.
  // ACT runs them; NO_ACTION WITHHOLDS them. On a withhold the exposure + runway already
  // computed stay in the packet but are flagged CONTINGENT (situational awareness while
  // the analyst corroborates, never an endorsed assessment). Each agent still emits an
  // audit run -- mode DETERMINISTIC_RULES, $0, validationStatus PASS -- so the six-run
  // trail stays complete AND a live NO_ACTION run (Sentinel LIVE_AI, these deterministic)
  // resolves to effectiveMode LIVE_AI, never mislabeled FAILED_TO_FALLBACK.
  let playbooks: Playbook[];
  let supplierMessages: SupplierMessageDraft[];
  let actionItems: ActionItem[];
  let strategistRun: AgentRun;
  let dispatcherRun: AgentRun;

  if (recommendation === "NO_ACTION") {
    playbooks = [];
    supplierMessages = [];
    actionItems = [];
    strategistRun = makeAgentRun({
      id: "RUN-STRATEGIST",
      agentName: "Strategist",
      input: { recommendation },
      output: { withheld: true },
      summary: "Withheld: NO_ACTION -- no playbook drafted until the disruption is corroborated.",
      createdAt: baseDateIso
    });
    dispatcherRun = makeAgentRun({
      id: "RUN-DISPATCHER",
      agentName: "Dispatcher",
      input: { recommendation },
      output: { withheld: true },
      summary:
        "Withheld: NO_ACTION -- no outbound supplier message drafted until the disruption is corroborated.",
      createdAt: baseDateIso
    });
    dataGaps.push(
      "NO_ACTION: outbound action is withheld pending corroboration. The exposure and runway below are shown for situational awareness only -- they are contingent on the disruption being confirmed, not an endorsed assessment."
    );
  } else {
    // Strategist (LLM #2 when live): playbooks grounded ONLY in the structured exposures.
    const strat = live
      ? await classifyPlaybooksLive(ctx, exposureResults, { budget: budgetForNext() })
      : runStrategist(ctx, exposureResults);
    playbooks = strat.playbooks;
    strategistRun = strat.agentRun;
    spentUsd += strategistRun.costUsd ?? 0;

    // Dispatcher (LLM #3 when live): the most security-critical -- its drafts are the only
    // thing that leaves the building. threatCard + publicSignals are passed for the
    // firewall's citation root ONLY; the prompt itself sees just the structured whitelist
    // (see dispatcher.ts -- the laundering cut keeps that prose out of the prompt).
    const disp = live
      ? await classifyMessagesLive(ctx, exposureResults, simulation, {
          budget: budgetForNext(),
          threatCard,
          publicSignals: signals
        })
      : runDispatcher(ctx, exposureResults, simulation);
    supplierMessages = disp.supplierMessages;
    actionItems = disp.actionItems;
    dispatcherRun = disp.agentRun;
    spentUsd += dispatcherRun.costUsd ?? 0;
  }

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
    recommendation,
    missingEvidence,
    playbooks,
    supplierMessages,
    actionItems,
    gatekeeper,
    agentRuns
  };
}
