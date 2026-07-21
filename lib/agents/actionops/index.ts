import { makeAgentRun } from "@/lib/agents/actionops/agent-run";
import { runActionOpsGatekeeper } from "@/lib/agents/actionops/gatekeeper";
import { runAtlas } from "@/lib/agents/actionops/atlas";
import { classifyMessagesLive, runDispatcher } from "@/lib/agents/actionops/dispatcher";
import {
  capUncorroboratedLiveConfidence,
  decideRecommendation
} from "@/lib/agents/actionops/recommendation";
import { buildRecoveryOptions } from "@/lib/agents/actionops/recovery";
import { classifyThreatLive, runSentinel } from "@/lib/agents/actionops/sentinel";
import { runSimulator } from "@/lib/agents/actionops/simulator";
import {
  applySkepticGate,
  challengeFindingLive,
  findingStrength,
  runSkeptic,
  type SkepticInjection
} from "@/lib/agents/actionops/skeptic";
import { classifyPlaybooksLive, runStrategist } from "@/lib/agents/actionops/strategist";
import { runVerifier } from "@/lib/agents/actionops/verifier";
import { type InvestigatorDeps, runInvestigatorLoop } from "@/lib/agents/actionops/investigator";
import { DEFAULT_BUDGET_CAP_USD } from "@/lib/agents/budget";
import {
  type BudgetContext,
  estimateLiveCallCostUsd,
  liveAiEnabled,
  makeRetryReserve,
  resolvedGeminiModel
} from "@/lib/agents/run";
import { agentLoopEnabled } from "@/lib/server/env-flags";
import type { ActionItem, AgentRun, Playbook, RecoveryOption, SupplierMessageDraft } from "@/lib/schemas";
import type { ActionOpsContext, ActionOpsResult } from "@/lib/agents/actionops/types";

export type { ActionOpsContext, ActionOpsResult } from "@/lib/agents/actionops/types";
export type { SkepticInjection } from "@/lib/agents/actionops/skeptic";
export type { InvestigatorDeps } from "@/lib/agents/actionops/investigator";

// The ActionOps pipeline (PLAN Phases 4-7 + the Phase-4 agentic-rework Skeptic). Canonical order:
// Sentinel (threat) -> Verifier (corroboration) -> Atlas (exposure) -> Simulator (runway) ->
// Skeptic (cross-family adversarial challenge) -> [decideRecommendation gate] -> Strategist
// (playbooks) -> Dispatcher (drafts); the gatekeeper validates the assembled output last. Each
// agent is its own module -- the SEAM that let D.2-D.7 each replace ONE agent body, and that let
// the Skeptic slot in BEFORE the act/refuse gate with no change to the others. Seven agent runs
// are emitted (the six original + the Skeptic), so the audit trail carries the cross-family
// challenge.
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
export async function runActionOpsAgents(
  ctx: ActionOpsContext,
  // Optional injection seam for the cross-family Skeptic (the test/DI path -- never billed).
  // Production passes nothing; the Skeptic then runs its live body only on the billable `live`
  // path and gates on its OWN Groq key. Threading it here is what lets a test drive the gate
  // end-to-end with a controlled verdict and NO network.
  deps: { skeptic?: SkepticInjection; investigator?: InvestigatorDeps } = {}
): Promise<ActionOpsResult> {
  const { signals, baseDateIso } = ctx;

  const live = ctx.live === true && liveAiEnabled();

  // DI-seam enforcement (Codex independent-gate, defense-in-depth). Production routes through
  // buildDecisionPacket (which guards the seams above), but this is the lower export, so harden it
  // too. BOTH DI seams are test-only at THIS layer (the production path -- run-exception ->
  // buildDecisionPacket -- never passes either): the `investigator` model seam routes the LOOP with
  // a caller-supplied model, and the `skeptic` generate seam injects a caller-supplied critic
  // (forcing the live body even on a non-live ctx). Reject BOTH outside the test env (vitest pins
  // NODE_ENV=test; prod="production"/dev="development" do not) -- a tighter backstop than the
  // packet's live-only skeptic guard, catching a non-live injected critic the upper layer allows.
  if (process.env.NODE_ENV !== "test" && (deps.investigator || deps.skeptic)) {
    throw new Error(
      "runActionOpsAgents: the `investigator`/`skeptic` DI seams are test-only and must never be set outside tests."
    );
  }

  // PHASE 3 ROUTING (the agentic-rework capstone). Route to the tool-using Investigator LOOP
  // when ENABLE_AGENT_LOOP is on AND the run is live, OR when a test injects a model (the DI
  // seam, NEVER set in production). Otherwise fall through to the UNCHANGED deterministic
  // waterfall below -- a flag-OFF run is byte-for-byte the pre-Phase-3 behavior, so the whole
  // existing suite stays green. The loop AND-gates on `live` because a flag-ON but key-OFF run
  // has no model to drive the loop, and the waterfall is the right (billing-free) path there.
  if ((agentLoopEnabled() && live) || deps.investigator?.model) {
    return runInvestigatorLoop(ctx, {
      model: deps.investigator?.model,
      initialSpentUsd: deps.investigator?.initialSpentUsd,
      // The Skeptic DI seam: prefer an investigator-scoped injection, else the top-level one
      // (the waterfall's seam), so a caller threading `skeptic` reaches the loop's critic too.
      skeptic: deps.investigator?.skeptic ?? deps.skeptic
    });
  }

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

  // The SHARED run-level retry reserve (the "+2 reserve"): ONE pool the three LLM agents
  // draw from when an output fails its firewall/parse, so a stochastic slip costs a re-ask
  // (keeping the run all-LIVE) without three agents each retrying and blowing the
  // "3 (+2 reserve)" = 5-call ceiling. Threaded into each live agent below.
  const retryReserve = makeRetryReserve();

  // Sentinel (LLM #1 when live): the injection firewall + the ONLY agent that reads raw
  // signal text. Key-OFF/live:false -> the deterministic threat (unchanged from D.1).
  const { threatCard: classifiedThreat, agentRun: sentinelRun } = live
    ? await classifyThreatLive(ctx, { budget: budgetForNext(), retry: retryReserve })
    : runSentinel(ctx);
  spentUsd += sentinelRun.costUsd ?? 0;

  // Evidence-bound corroboration, LIVE only (2026-07-16 re-review, A-02a): a live fetch
  // returns signals about MANY world events, so counting distinct outlets across the whole
  // set would let two unrelated articles "corroborate" this threat. Live corroboration
  // therefore counts only the signals Sentinel actually cited as this threat's evidence
  // (evidenceUrls, already allowlist-validated by the firewall). Deterministic/replay runs
  // keep the whole scenario-bound set — byte-identical to the frozen fixtures.
  const verifierCtx = live
    ? { ...ctx, signals: ctx.signals.filter((s) => classifiedThreat.evidenceUrls.includes(s.sourceUrl)) }
    : ctx;
  const { checks: verifierChecks, agentRun: verifierRun } = runVerifier(verifierCtx, classifiedThreat);

  // Deterministic confidence cap, LIVE only (A-01/D-01): the live classifier authors its own
  // confidence, and an overstated value on an UNCORROBORATED signal would bypass the refusal
  // gate — the one place a model-authored number could flip a decision. When the deterministic
  // corroboration check says single-source, confidence is capped below the action floor, making
  // the refusal trigger deterministic. Corroborated findings keep the model's (clamped) value;
  // deterministic/replay runs never enter this branch.
  const threatCard = capUncorroboratedLiveConfidence(classifiedThreat, {
    live,
    corroborated: verifierChecks.corroborated
  });
  const { exposureResults, dataGaps: atlasDataGaps, agentRun: atlasRun } = runAtlas(ctx, threatCard);
  const { simulation, dataGaps: simulatorDataGaps, agentRun: simulatorRun } = runSimulator(ctx, exposureResults);
  // Atlas's gaps (a rejected/misclassified handoff) come first, then the Simulator's
  // (Tier-1 no-inventory note). The packet's dataGaps is the union.
  const dataGaps = [...atlasDataGaps, ...simulatorDataGaps];

  // Skeptic (Phase 4: the cross-family critic). AFTER the deterministic findings and BEFORE the
  // act/refuse gate, an INDEPENDENT non-Gemini model adversarially challenges the finding. Its
  // verdict is a boolean GATE: a non-accept HOLDS the finding (the recommendation is forced to
  // NO_ACTION below). Live body when live (or when a test injects a generate); the deterministic
  // affirmative pass otherwise. It runs on its OWN Groq key (skepticEnabled), so a Gemini-only live
  // run short-circuits to the affirmative pass with NO network -- never a 4th billed Gemini call and
  // never depleting the 3-call reserve. The Skeptic is fed ONLY the structured finding (quarantine):
  // never threatCard.summary or any signal/exposure prose.
  const runSkepticLive = live || deps.skeptic?.generate != null;
  const { verdict: skepticVerdict, agentRun: skepticRun } = runSkepticLive
    ? await challengeFindingLive(ctx, threatCard, verifierChecks, exposureResults, {
        budget: budgetForNext(),
        retry: retryReserve,
        enabled: deps.skeptic?.enabled,
        generate: deps.skeptic?.generate
      })
    : runSkeptic(ctx, threatCard, verifierChecks, exposureResults);
  spentUsd += skepticRun.costUsd ?? 0;

  // The act / refuse gate (deterministic). NO_ACTION = refuse to draft outbound action
  // on a lone uncorroborated, low-confidence source -- the refusal itself is the output,
  // not an error. Drives off the Verifier's corroboration, the threat's own confidence,
  // and whether a real-sector exposure exists (decideRecommendation owns the rule).
  //
  // The Skeptic gate is layered ON TOP: a Skeptic non-accept (a live REJECT or a fail-closed HOLD)
  // forces NO_ACTION regardless of the deterministic verdict, appending a templated, numeral-free
  // Skeptic-hold missingEvidence item (authoritative-binding -- nothing numeric is bound from the
  // critic's prose). A Skeptic ACCEPT lets decideRecommendation stand as today.
  const baseDecision = decideRecommendation({
    corroborated: verifierChecks.corroborated,
    confidence: threatCard.confidence,
    exposureResults
  });
  // The strength signal (deterministic) the gate uses to DOWNGRADE a live REJECT on an independently
  // strong finding to a recorded caution (ANNOTATED -> ACT stands) instead of a hard
  // veto -- the "scope the gate" fix for the live Skeptic false-vetoing a sound flagship finding.
  const strength = findingStrength(verifierChecks, threatCard.confidence, exposureResults);
  const {
    recommendation,
    missingEvidence,
    outcome: skepticGateOutcomeRaw
  } = applySkepticGate(baseDecision, skepticVerdict, strength);
  // Surface the gate outcome on the packet ONLY when a GENUINE cross-family Skeptic ran (a real model
  // id, not the deterministic affirmative pass) -- so a key-OFF deterministic packet stays byte-
  // identical to before (the flag-off no-op + the parity moat hold). Same ran-live test the UI uses.
  const skepticRanLiveCrossFamily = !!skepticRun.model && skepticRun.model !== "deterministic-rules";
  const skepticGateOutcome = skepticRanLiveCrossFamily ? skepticGateOutcomeRaw : undefined;

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
  // Scored recovery options (deterministic; recovery.ts). Like playbooks/drafts they are
  // outbound mitigation -- WITHHELD on a NO_ACTION refusal, produced on ACT.
  let recoveryOptions: RecoveryOption[];
  let strategistRun: AgentRun;
  let dispatcherRun: AgentRun;

  if (recommendation === "NO_ACTION") {
    playbooks = [];
    supplierMessages = [];
    actionItems = [];
    recoveryOptions = [];
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
      ? await classifyPlaybooksLive(ctx, exposureResults, {
          budget: budgetForNext(),
          retry: retryReserve
        })
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
          retry: retryReserve,
          threatCard,
          publicSignals: signals
        })
      : runDispatcher(ctx, exposureResults, simulation);
    supplierMessages = disp.supplierMessages;
    actionItems = disp.actionItems;
    dispatcherRun = disp.agentRun;
    spentUsd += dispatcherRun.costUsd ?? 0;

    // Scored recovery options, bound DETERMINISTICALLY from the Atlas exposures + the
    // Simulator runway (never from agent prose -- authoritative-binding). Produced only
    // on ACT; the NO_ACTION branch above withholds them.
    recoveryOptions = buildRecoveryOptions(exposureResults, simulation);
  }

  // Assemble the runs BEFORE the gatekeeper so it can fail closed on any agent that
  // reported a validation failure (e.g. an Atlas-rejected misclassified handoff, or a
  // live agent that degraded to FAILED_TO_FALLBACK).
  // The Skeptic run sits in canonical order right after the Simulator (the order it executed in).
  const agentRuns = [
    sentinelRun,
    verifierRun,
    atlasRun,
    simulatorRun,
    skepticRun,
    strategistRun,
    dispatcherRun
  ];

  const gatekeeper = runActionOpsGatekeeper({
    suppliers: ctx.suppliers,
    threatCard,
    exposureResults,
    supplierMessages,
    agentRuns,
    checkedAt: baseDateIso,
    // The resolvable input slices the D.4 citation check needs: an impact-assessment claim
    // cites `simulation.horizons[0].days` (the internal exposureScore is Dispatcher-forbidden
    // now), but exposureResults stays in the root for citation-resolution compatibility and
    // the supplier-binding check (signals included for completeness
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
    skepticGateOutcome,
    playbooks,
    recoveryOptions,
    supplierMessages,
    actionItems,
    gatekeeper,
    agentRuns
  };
}
