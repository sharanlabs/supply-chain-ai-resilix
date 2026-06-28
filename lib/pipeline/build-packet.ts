import { randomUUID } from "node:crypto";
import { type InvestigatorDeps, runActionOpsAgents, type SkepticInjection } from "@/lib/agents/actionops";
import {
  assertConfiguredModelAvailable,
  computeEffectiveMode,
  listGeminiModels,
  liveAiEnabled
} from "@/lib/agents/run";
import { summarizeCost } from "@/lib/agents/cost-summary";
import { validateDecisionPacket } from "@/lib/agents/gatekeeper";
import { getActionOpsScenario, type ActionOpsScenario } from "@/lib/data/actionops-scenarios";
import { ingestSeed } from "@/lib/ingest/seed-suppliers";
import { fetchPublicSignals } from "@/lib/signals/fetchers";
import type { DecisionPacketV2, Supplier } from "@/lib/schemas";

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
  // Test/DI seam (Phase 7 -- NEVER set in production), mirroring the `skeptic` seam above. The
  // scenario registry (getActionOpsScenario) is a closed set of CURATED scenarios, so it cannot
  // hold the ADVERSARIAL, GDELT-shaped inputs the indirect-injection red-team must push through the
  // FULL deterministic assemble+validate path. These overrides let a red-team test run a poisoned
  // scenario / supplier set through buildDecisionPacket key-OFF (no network) and assert the
  // lethal-trifecta cut end to end. Production calls pass scenarioId (resolved from the registry)
  // and let suppliers come from the seed -- both overrides stay undefined.
  scenarioOverride?: ActionOpsScenario;
  suppliersOverride?: Supplier[];
  // Phase 3 test/DI seam (NEVER set in production -- production routes to the Investigator
  // loop via ENABLE_AGENT_LOOP). Injecting a model here drives the tool-using loop through the
  // FULL assemble+validate path with NO network, so a parity / quarantine / budget test can
  // prove the loop's packet against the waterfall's. Threaded straight into runActionOpsAgents.
  investigator?: InvestigatorDeps;
};

// Assemble a DecisionPacketV2 from the ActionOps agents -- PURE: no persistence,
// no idempotency. The cutover uses it where a live or recorded packet is built: the live-AI
// recorder (evals/record-live-packets.test.ts) and runExceptionPipeline (the /api/run-exception
// POST -- it wraps this with saveDecisionPacket + the idempotency mutex). NOTE: the read-only
// homepage (app/page.tsx) renders a FROZEN recorded packet via loadReplayPacket(), so a page load
// does NOT call this, write a packet, or hit the network. Splitting "assemble" from "persist" is
// what keeps the render side-effect-free.
export async function buildDecisionPacket(
  options: BuildPacketOptions = {}
): Promise<DecisionPacketV2> {
  const { scenarioId, useLiveSignals = false, live = false, skeptic, scenarioOverride, suppliersOverride, investigator } =
    options;

  // DI-seam enforcement (Codex independent-gate, defense-in-depth). skeptic / scenarioOverride /
  // suppliersOverride / investigator are TEST-ONLY injection seams the exported type inherits. The
  // page render and the /api/run-exception route never set them, but harden the contract HERE.
  // NODE_ENV==="test" (vitest) EXEMPTS the in-test injections -- the gated live suites legitimately
  // inject a deterministic-ACCEPT skeptic on a LIVE run (record-live-packets / actionops-live-real)
  // so their LIVE_AI assertions do not flake on the Skeptic's stochastic verdict. Outside tests
  // (prod = "production", dev = "development") the seams are rejected:
  //   - `investigator` (the model seam) routes the agent LOOP even on a NON-live call, so it is
  //     rejected UNCONDITIONALLY -- it must never be honored outside a test.
  //   - the others only subvert a BILLED run, so they are rejected on a LIVE invocation.
  if (process.env.NODE_ENV !== "test") {
    if (investigator) {
      throw new Error(
        "buildDecisionPacket: the `investigator` DI seam is test-only and must never be set outside tests."
      );
    }
    if (live && (skeptic || scenarioOverride || suppliersOverride)) {
      throw new Error(
        "buildDecisionPacket: a test/DI override (skeptic/scenarioOverride/suppliersOverride) was " +
          "passed on a LIVE run -- these seams are test-only and must never bill."
      );
    }
  }
  // scenarioOverride is the test/DI red-team seam (above); production resolves from the registry.
  const scenario = scenarioOverride ?? getActionOpsScenario(scenarioId);
  const now = new Date().toISOString();

  // Replay path (the demo + the live-AI showcase): the scenario's OWN dated signals, so
  // the live Sentinel classifies THIS scenario's disruption -- a generic global board would
  // misclassify (e.g. read a sample earthquake instead of the Hormuz closure). Live-signals
  // path: the real GDELT/NWS fetch (scenario-agnostic, with its own CACHED fallback).
  // useLiveSignals governs signal FETCHING; `live` governs whether the LLM agents run.
  const signals = useLiveSignals
    ? await fetchPublicSignals({ useLive: true })
    : scenario.replaySignals;
  // suppliersOverride is the test/DI red-team seam (an adversarial supplier set ingested from a
  // poisoned CSV); production uses the in-memory seed.
  const suppliers = suppliersOverride ?? ingestSeed().suppliers;

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
    { skeptic, investigator }
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
    // The cross-family Skeptic gate outcome -- present only on a genuine cross-family run
    // (ACCEPTED / ANNOTATED / VETOED). CONDITIONALLY spread (Codex P2) so a key-OFF deterministic
    // packet has NO `skepticGateOutcome` OWN KEY at all (not merely undefined) -- the field is truly
    // ABSENT, so byte-parity AND strict-shape parity with pre-Skeptic V2 fixtures hold (an own
    // `undefined` key survives Zod parse and would break a strict round-trip / Object.hasOwn check).
    ...(result.skepticGateOutcome !== undefined
      ? { skepticGateOutcome: result.skepticGateOutcome }
      : {}),
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
