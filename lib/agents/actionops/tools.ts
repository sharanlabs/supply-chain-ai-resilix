import { tool } from "ai";
import { z } from "zod";
import type { AgentRun, ExposureResult, Simulation, ThreatCard } from "@/lib/schemas";
import type { ActionOpsContext } from "@/lib/agents/actionops/types";
import type { VerifierChecks } from "@/lib/agents/actionops/verifier";
import { runVerifier } from "@/lib/agents/actionops/verifier";
import { runAtlas } from "@/lib/agents/actionops/atlas";
import { runSimulator } from "@/lib/agents/actionops/simulator";
import { buildRecoveryOptions } from "@/lib/agents/actionops/recovery";
import {
  challengeFindingLive,
  type SkepticInjection,
  type SkepticVerdict
} from "@/lib/agents/actionops/skeptic";
import type { BudgetContext, RetryReserve } from "@/lib/agents/run";

// ---------------------------------------------------------------------------
// THE INVESTIGATOR TOOL LAYER (Phase 3 -- the authoritative-binding moat, INPUT side).
//
// These are the read-only INVESTIGATION tools the tool-using Investigator loop
// (investigator.ts) orchestrates. The load-bearing property: an LLM may decide WHICH of
// these to call and in WHAT ORDER, but it can NEVER be the source of an authoritative
// number OR of an off-context tool input. Two structural guarantees enforce that:
//
//   OUTPUT side -- every tool BODY calls the SAME deterministic agent function the
//   waterfall calls (runVerifier / runAtlas / runSimulator / buildRecoveryOptions /
//   runSkeptic|challengeFindingLive) and returns its REAL result. The loop captures the
//   authoritative slice from that tool RESULT (into the closure-bound `state`), never from
//   the model's prose. There is deliberately NO "set the exposure score" tool: the model
//   cannot author a figure, only ask for one to be computed.
//
//   INPUT side -- the heavy authoritative inputs (the threatCard, the matched supplier
//   set, the exposure results) are CLOSURE-BOUND on `ctx` + `state`; they are NOT tool
//   parameters. The model literally cannot hand `assessExposure` a forged supplier set or
//   feed Atlas the wrong threat -- the only thing it controls is which tool name to invoke.
//   The ONE place the model supplies a value -- the drill-down supplierId on
//   getSupplierExposureDetail -- is VALIDATED in code against the already-matched set: an
//   off-context id is REJECTED (throws), so the model cannot pivot the investigation onto a
//   supplier this run never flagged. This closes the exact gap the moat memo names: "every
//   number traces to a source" can be satisfied even when the model fed Atlas the wrong
//   supplier set, so we guard BOTH ends.
//
//   QUARANTINE -- no tool argument or return value carries raw signal PROSE. The tools
//   work only on structured, validated slices (counts, ISO countries, scores, booleans);
//   `ctx.signals[].summary` is never serialized into a tool result, so the Dual-LLM
//   boundary the Sentinel established is not re-opened by the loop.
// ---------------------------------------------------------------------------

// Thrown when the model supplies a tool input that is NOT in this run's authoritative set
// (the input-side moat). A distinct type so the loop -- and the test -- can name the moat
// breach precisely (not a generic failure). The loop wraps generateText in try/catch and
// completes the finding deterministically on any throw, so this never crashes a run; it is
// the LAST-LINE guard proving the model cannot drive an off-context investigation step.
export class OffContextToolInputError extends Error {
  readonly toolName: string;
  readonly received: string;
  constructor(toolName: string, received: string, allowed: string[]) {
    super(
      `Investigator tool "${toolName}" rejected off-context input "${received}": not in this run's ` +
        `matched set [${allowed.join(", ") || "(empty)"}]. The model may orchestrate WHICH step ` +
        `runs, never feed a tool an input outside the authoritative set (input-side moat).`
    );
    this.name = "OffContextToolInputError";
    this.toolName = toolName;
    this.received = received;
  }
}

// The mutable accumulator the loop and the tools share. Each investigation slice is a
// nested object set ONCE when its tool (or the post-loop deterministic completion) runs.
// Presence is tracked by the slice being DEFINED -- NOT by an array length -- so a genuine
// zero-exposure result (`results: []`) still reads as "exposure assessed" and the loop does
// not spin re-asking for it (the empty-array footgun).
export type InvestigationState = {
  // Set pre-loop in CODE (the Sentinel trust boundary runs first, never a model choice).
  threatCard: ThreatCard;
  verifier?: { checks: VerifierChecks; run: AgentRun };
  exposure?: { results: ExposureResult[]; dataGaps: string[]; run: AgentRun };
  // `simulation` may be undefined for a Tier-1 run, but the slice (with its run + dataGaps)
  // is still set once the Simulator has executed -- so presence means "simulated", not
  // "has a simulation object".
  simulation?: { simulation?: Simulation; dataGaps: string[]; run: AgentRun };
  skeptic?: { verdict: SkepticVerdict; run: AgentRun };
};

// What the tools need from the loop: the running budget context (so the Skeptic's hard-stop
// accounts for spend already incurred this run), the shared retry reserve, the Skeptic DI seam
// (test/live -- the cross-family challenge self-gates on its own Groq key + this injection, so
// no `live` flag is needed here), and a callback to fold a completed run's real cost into the
// run total.
export type InvestigatorToolDeps = {
  budgetForNext: () => BudgetContext;
  retry?: RetryReserve;
  skeptic?: SkepticInjection;
  foldCost: (run: AgentRun) => void;
  // Called when the input-side moat rejects an off-context tool input, BEFORE the throw.
  // The AI SDK converts a tool's thrown error into a `tool-error` result and CONTINUES the
  // loop (it does not reject generateText), so the loop's outer catch may never see it (Codex
  // P3 Med). Setting this flag in the tool body is what lets the loop mark its run degraded
  // regardless of whether the SDK threw or converted -- the breach is recorded either way.
  onBreach?: () => void;
};

// A prose-free, model-facing view of one exposure. The internal exposureScore IS included
// (it is an authoritative tool RESULT the model may read to reason about WHERE to dig --
// it just may never AUTHOR one); the free-text `rationale` is omitted so no templated prose
// rides into the model context. supplierName is structured seed data, not news prose.
function exposureView(e: ExposureResult) {
  return {
    exposureId: e.id,
    supplierId: e.supplierId,
    supplierName: e.supplierName,
    country: e.country,
    sector: e.sector,
    exposureScore: e.exposureScore,
    singleSource: e.singleSource,
    recoveryDays: e.recoveryDays
  };
}

// makeInvestigatorTools: build the closure-bound tool set for ONE run. Every tool closes
// over THIS run's ctx + state + deps, so a tool cannot be invoked against another run's
// context or with an attacker-controlled input. Returned as a plain object so the loop
// passes it straight to generateText({ tools }).
export function makeInvestigatorTools(
  ctx: ActionOpsContext,
  state: InvestigationState,
  deps: InvestigatorToolDeps
) {
  // Ensure exposure has been assessed; returns the slice or a guidance result the model can
  // act on. Used by the tools that DEPEND on the matched set (simulate / challenge / drill /
  // recovery). Read-only -- it never runs Atlas itself (assessExposure owns that), so the
  // dependency order the trajectory DAG encodes is enforced in code, not left to the model.
  const needExposure = () => state.exposure;

  return {
    // corroborate (Verifier): count independent corroborating sources for the threat. No
    // model input -- it works over THIS run's signals (closure-bound). Idempotent: a second
    // call returns the captured result rather than re-running.
    checkCorroboration: tool({
      description:
        "Count independent corroborating sources for the disruption (recency, source count, " +
        "geo agreement). Call this to judge whether the finding is corroborated. Takes no input.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!state.verifier) {
          const { checks, agentRun } = runVerifier(ctx, state.threatCard);
          state.verifier = { checks, run: agentRun };
        }
        const c = state.verifier.checks;
        return {
          sourceCount: c.sourceCount,
          corroborated: c.corroborated,
          geoAgrees: c.geoAgrees,
          freshestMinutes: c.freshestMinutes
        };
      }
    }),

    // assess-exposure (Atlas): match the buyer's suppliers to the disruption and score each
    // from real supplier attributes. No model input -- the supplier set + the match rule are
    // closure-bound (the model cannot forge them). Idempotent + fail-closed-respecting: a
    // second call returns the captured result, so a terminal Atlas REJECT is never re-invoked.
    assessExposure: tool({
      description:
        "Match this buyer's suppliers to the disruption and score each one's exposure from its " +
        "risk tier and lead time. Call this to find WHO is exposed. Takes no input -- the " +
        "supplier set is fixed for this run; you cannot choose it.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!state.exposure) {
          const { exposureResults, dataGaps, agentRun } = runAtlas(ctx, state.threatCard);
          state.exposure = { results: exposureResults, dataGaps, run: agentRun };
        }
        const ex = state.exposure;
        return {
          matchedCount: ex.results.length,
          rejected: ex.run.validationStatus === "FAIL",
          exposures: ex.results.map(exposureView)
        };
      }
    }),

    // drill-down (the INPUT-SIDE MOAT tool): fetch one matched supplier's exposure detail.
    // This is the ONE tool the model supplies a value to -- and that value is VALIDATED in
    // code against the matched set. An off-context supplierId is REJECTED (throws
    // OffContextToolInputError), so the model cannot pivot onto a supplier this run never
    // flagged. Requires assessExposure to have run (the matched set must exist first).
    getSupplierExposureDetail: tool({
      description:
        "Fetch the full exposure detail for ONE already-matched supplier. The supplierId MUST " +
        "be one returned by assessExposure; any other id is rejected. Call assessExposure first.",
      inputSchema: z.object({
        supplierId: z.string().describe("A supplierId from the assessExposure result -- nothing else.")
      }),
      execute: async ({ supplierId }) => {
        const ex = needExposure();
        if (!ex) {
          return { error: "Call assessExposure first; there is no matched set to drill into yet." };
        }
        const id = supplierId.trim();
        const match = ex.results.find((e) => e.supplierId === id);
        if (!match) {
          // The input-side moat: a supplierId outside the matched set is an off-context input.
          // Flag the breach (so the loop records a degraded run even though the SDK turns this
          // throw into a tool-error and continues), then FAIL CLOSED -- never compute exposure
          // for a supplier the run did not flag.
          deps.onBreach?.();
          throw new OffContextToolInputError(
            "getSupplierExposureDetail",
            id,
            ex.results.map((e) => e.supplierId)
          );
        }
        // Prose-free return (Codex P3 Low): only the structured exposure view -- the templated
        // `rationale` (which carries a lead-time numeral) is deliberately omitted so NO prose of
        // any kind rides into the model context.
        return { exposure: exposureView(match) };
      }
    }),

    // simulate (Simulator): compute runway / revenue-at-risk over the matched exposures.
    // No model input. Requires assessExposure first (the matched set is its input); a
    // Tier-1 run with no inventory legitimately returns simulated:false. Idempotent.
    simulateRunway: tool({
      description:
        "Compute survival days (runway) and revenue/margin at risk over the matched exposures. " +
        "Call assessExposure first. Takes no input. Returns simulated:false for a no-inventory run.",
      inputSchema: z.object({}),
      execute: async () => {
        const ex = needExposure();
        if (!ex) {
          return { error: "Call assessExposure first; the runway is simulated over the matched set." };
        }
        if (!state.simulation) {
          const { simulation, dataGaps, agentRun } = runSimulator(ctx, ex.results);
          state.simulation = { simulation, dataGaps, run: agentRun };
        }
        const sim = state.simulation.simulation;
        if (!sim) {
          return { simulated: false };
        }
        return {
          simulated: true,
          survivalDays: sim.survivalDays,
          horizons: sim.horizons.map((h) => ({
            days: h.days,
            revenueAtRiskUsd: h.revenueAtRiskUsd,
            marginAtRiskUsd: h.marginAtRiskUsd
          })),
          productRunoutCount: sim.productRunouts.length
        };
      }
    }),

    // challenge (Skeptic): an INDEPENDENT cross-family adversarial critic challenges the
    // finding. Fed ONLY the structured finding (buildSkepticFinding inside challengeFindingLive
    // omits all prose), so the quarantine holds. Requires corroborate + assess-exposure first
    // (the finding needs both). Live body when the run is live; the deterministic affirmative
    // pass otherwise. The verdict is a BOOLEAN gate -- nothing numeric is bound from its prose.
    challengeFinding: tool({
      description:
        "Ask an independent cross-family critic whether the finding is sound enough to act on " +
        "(catches over-trigger, misclassification, thin evidence). Call checkCorroboration and " +
        "assessExposure first. Takes no input. Returns whether the critic accepts.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!state.verifier || !state.exposure) {
          return {
            error: "Call checkCorroboration AND assessExposure before challengeFinding -- the critic needs the full finding."
          };
        }
        if (!state.skeptic) {
          // ALWAYS the cross-family challengeFindingLive -- it SELF-GATES: key-OFF with no
          // injected generate it short-circuits to the deterministic affirmative pass (byte-equal
          // to runSkeptic), and key-ON (Groq key) or with an injected generate it runs the live
          // critic. So a live run always gets the live critic; a deterministic run is unchanged;
          // and a test can drive the live critic with an injected generate (no `deps.live` branch
          // that would skip it). The Skeptic gates on its OWN Groq key, independent of the Gemini
          // live flag -- exactly as the waterfall does.
          const { verdict, agentRun } = await challengeFindingLive(
            ctx,
            state.threatCard,
            state.verifier.checks,
            state.exposure.results,
            {
              budget: deps.budgetForNext(),
              retry: deps.retry,
              enabled: deps.skeptic?.enabled,
              generate: deps.skeptic?.generate
            }
          );
          deps.foldCost(agentRun);
          state.skeptic = { verdict, run: agentRun };
        }
        return { accepted: state.skeptic.verdict.accepted, errored: state.skeptic.verdict.errored };
      }
    }),

    // recovery options (read-only investigation): the scored EXPEDITE / REALLOCATE /
    // SUBSTITUTE / SUPPLIER_ESCALATION options, bound DETERMINISTICALLY from the matched
    // exposures + the runway. Informational for the model's situational awareness during the
    // investigation; the packet's FINAL recoveryOptions are RE-DERIVED in post-loop code (and
    // withheld on a NO_ACTION refusal), so this tool can never leak options past the gate.
    getRecoveryOptions: tool({
      description:
        "List the scored recovery options (expedite, reallocate, substitute, escalate) for the " +
        "matched exposures. Read-only situational awareness. Call assessExposure first. No input.",
      inputSchema: z.object({}),
      execute: async () => {
        const ex = needExposure();
        if (!ex) {
          return { error: "Call assessExposure first; recovery options are scored over the matched set." };
        }
        const options = buildRecoveryOptions(ex.results, state.simulation?.simulation);
        return {
          options: options.map((o) => ({
            id: o.id,
            actionType: o.actionType,
            score: o.score,
            reversibility: o.reversibility,
            approvalRequired: o.approvalRequired
          }))
        };
      }
    })
  };
}

export type InvestigatorTools = ReturnType<typeof makeInvestigatorTools>;
