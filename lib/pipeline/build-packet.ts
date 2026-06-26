import { randomUUID } from "node:crypto";
import { runActionOpsAgents, type SkepticInjection } from "@/lib/agents/actionops";
import {
  assertConfiguredModelAvailable,
  computeEffectiveMode,
  listGeminiModels,
  liveAiEnabled
} from "@/lib/agents/run";
import { summarizeCost } from "@/lib/agents/cost-summary";
import { validateDecisionPacket } from "@/lib/agents/gatekeeper";
import { getActionOpsScenario } from "@/lib/data/actionops-scenarios";
import { ingestSeed } from "@/lib/ingest/seed-suppliers";
import { fetchPublicSignals } from "@/lib/signals/fetchers";
import type { DecisionPacketV2 } from "@/lib/schemas";

export type BuildPacketOptions = {
  scenarioId?: string;
  useLiveSignals?: boolean;
  // Per-invocation live-AI opt-in (default false). Threaded into runActionOpsAgents,
  // where it is AND-gated with liveAiEnabled() before any LLM agent bills. Distinct
  // from useLiveSignals (which only governs live vs cached signal FETCHING, never the
  // LLM). The page render leaves this false; only the authenticated POST sets it true.
  live?: boolean;
  // Optional injection seam for the cross-family Skeptic critic (test/DI only -- never billed).
  // Production leaves this unset; the Skeptic then gates on its own Groq key on the `live` path.
  // Threaded so a test can drive the Skeptic gate through the FULL assemble+validate path (proving
  // the NO_ACTION withhold and the schema superRefine hold end-to-end) with NO network.
  skeptic?: SkepticInjection;
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
  const { scenarioId, useLiveSignals = false, live = false, skeptic } = options;
  const scenario = getActionOpsScenario(scenarioId);
  const now = new Date().toISOString();

  // Replay path (the demo + the live-AI showcase): the scenario's OWN dated signals, so
  // the live Sentinel classifies THIS scenario's disruption -- a generic global board would
  // misclassify (e.g. read a sample earthquake instead of the Hormuz closure). Live-signals
  // path: the real GDELT/NWS fetch (scenario-agnostic, with its own CACHED fallback).
  // useLiveSignals governs signal FETCHING; `live` governs whether the LLM agents run.
  const signals = useLiveSignals
    ? await fetchPublicSignals({ useLive: true })
    : scenario.replaySignals;
  const suppliers = ingestSeed().suppliers;

  // Preflight (LIVE runs only): assert the configured Gemini model is actually available
  // on this key BEFORE the agents run, and FAIL LOUD (listing what IS available) if not.
  // WHY here: a Google retirement otherwise surfaces as a silent mid-run 404 -> fallback,
  // mislabeling a config defect as a degraded run. The `enabled` predicate is the SAME
  // (live && liveAiEnabled()) gate the orchestrator bills on, so a page render (live:false)
  // makes NO ListModels call and never touches the network -- the preflight self-guards.
  await assertConfiguredModelAvailable({
    listModels: listGeminiModels,
    enabled: () => live && liveAiEnabled()
  });

  const result = await runActionOpsAgents(
    { scenario, signals, suppliers, baseDateIso: now, live },
    { skeptic }
  );

  // requested = what the run intended; effective = what actually happened across the
  // agent runs (R4-8). requestedMode reflects THIS invocation's real intent: a live
  // request needs BOTH the per-call opt-in (live) AND the runtime config (liveAiEnabled)
  // -- so a page render (live:false) requests DETERMINISTIC_RULES even when the global
  // flag is on, and only the genuine live POST requests LIVE_AI. A replay scenario still
  // requests REPLAY. computeEffectiveMode never invents a live label.
  // An EXPLICIT live invocation takes precedence over a scenario's default requestedMode: a
  // billable live run must audit as requestedMode LIVE_AI even for a scenario tagged REPLAY
  // (e.g. hurricane), or the intent/audit layer would mislabel a real live run as replay. When
  // NOT live, honor the scenario's requestedMode (REPLAY for replay-only scenarios) else
  // DETERMINISTIC_RULES.
  const requestedMode =
    live && liveAiEnabled() ? "LIVE_AI" : (scenario.requestedMode ?? "DETERMINISTIC_RULES");
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
    // The act/refuse decision + (on NO_ACTION) the missing-evidence list. Stamped on
    // every packet; readers treat an absent recommendation as ACT (back-compat).
    recommendation: result.recommendation,
    missingEvidence: result.missingEvidence,
    playbooks: result.playbooks,
    recoveryOptions: result.recoveryOptions,
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
