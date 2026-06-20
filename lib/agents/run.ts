import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { buildRecoveryOptions } from "@/lib/engine/impact";
import { validateDecisionInputs } from "@/lib/agents/gatekeeper";
import { liveAiEnabled } from "@/lib/server/env-flags";
import type {
  AgentMode,
  AgentRun,
  ExecutionDraft,
  ImpactReport,
  PublicSignal,
  RecoveryOption,
  RequestedMode
} from "@/lib/schemas";
import { ExecutionDraftSchema } from "@/lib/schemas";
import { stableHash } from "@/lib/utils";
import type { AgentRunUsage } from "@/lib/agents/actionops/agent-run";
import { assertWithinBudget, DEFAULT_BUDGET_CAP_USD, LIVE_RETRY_RESERVE } from "@/lib/agents/budget";
import { costUsd } from "@/lib/agents/pricing";

// Default GA Gemini model. gemini-2.5-flash is the GA best-value model ON THE KEY
// -- a live ListModels against this project's key (2026-06-18) tops out at the 2.5
// lineup; no 3.x is enabled, so the prior "gemini-3.5-flash" default would 404 at
// the first live call. 2.5-flash is the quality-per-cost pick for agentic work;
// gemini-2.5-flash-lite is the budget floor. Override per deployment with
// GEMINI_MODEL (empty/whitespace falls back here). The preflight check below turns
// a future Google retirement of this id into a one-line config bump, not a silent
// mid-run fallback.
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

// The configured model id, resolved once: an explicit GEMINI_MODEL override (trimmed)
// wins, else the GA default. Single source so the preflight check, the live call, and
// the AgentRun model field all name the SAME model -- no drift.
export function resolvedGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

// Google's ListModels returns ids as "models/gemini-2.5-flash"; the AI-SDK + our
// config use the bare "gemini-2.5-flash". Normalize both sides to the bare id before
// comparing so a present model is never falsely reported retired (a "models/" prefix
// mismatch would be a false retirement alarm -- the opposite of this check's intent).
function bareModelId(id: string): string {
  return id.replace(/^models\//, "").trim();
}

// The Gemini model handle, keyed on OUR env var. CRITICAL: the @ai-sdk/google default
// `google` provider reads GOOGLE_GENERATIVE_AI_API_KEY, but this app gates + stores the
// key as GEMINI_API_KEY (liveAiEnabled / .env.example). Without this explicit apiKey,
// a key in GEMINI_API_KEY would leave the SDK unauthenticated -> every live call throws
// -> every agent silently degrades to FAILED_TO_FALLBACK and the "live" showcase is a
// fallback in disguise. Resolved at CALL time (not module load) so a key set after import
// -- a script or a test that assigns process.env before the first call -- is still picked
// up. One construction point so the live path and the legacy path can never drift on the key.
function geminiModel(modelId: string) {
  const provider = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
  return provider(modelId);
}

// listGeminiModels: the preflight's ListModels, over the REST endpoint. @ai-sdk/google
// v2 exposes no model-listing method, so we hit the documented REST surface directly
// (GET /v1beta/models). Returns the raw ids ("models/gemini-2.5-flash"); the preflight
// normalizes the "models/" prefix before comparing. Throws (fail loud) on a missing key
// or a non-2xx -- a preflight that swallows an auth/quota error is not a preflight.
export async function listGeminiModels(): Promise<string[]> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error("listGeminiModels: GEMINI_API_KEY is not set; cannot preflight models.");
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`
  );
  if (!res.ok) {
    throw new Error(
      `listGeminiModels: ListModels request failed (${res.status} ${res.statusText}). ` +
        `Check the key is valid and the Generative Language API is enabled on the project.`
    );
  }
  const data = (await res.json()) as { models?: Array<{ name?: string }> };
  return (data.models ?? [])
    .map((m) => m.name)
    .filter((name): name is string => typeof name === "string");
}

// Preflight: at live-AI startup ONLY, assert the configured model is actually
// available on the key, and FAIL LOUD (listing what IS available) if not. WHY: a
// Google retirement otherwise surfaces as a silent mid-run 404 -> deterministic
// fallback, mislabeling a config defect as a healthy run. Failing loud at startup
// makes it a one-line GEMINI_MODEL bump instead. Guarded by liveAiEnabled() so it
// NEVER runs (or fetches) key-OFF. listModels is injected so a fixture proves both
// the pass and the fail-loud path with no network call.
export async function assertConfiguredModelAvailable({
  listModels,
  enabled = liveAiEnabled,
  model = resolvedGeminiModel
}: {
  listModels: () => Promise<string[]>;
  enabled?: () => boolean;
  model?: () => string;
}): Promise<void> {
  if (!enabled()) {
    // Live AI disabled by config -> the live path never runs, so there is nothing to
    // preflight. Skip entirely (no fetch), preserving the key-OFF no-network contract.
    return;
  }

  const wanted = bareModelId(model());
  const available = (await listModels()).map(bareModelId);
  if (!available.includes(wanted)) {
    throw new Error(
      `Configured Gemini model "${wanted}" is not available on this key. ` +
        `Available models: ${available.join(", ") || "(none returned)"}. ` +
        `Set GEMINI_MODEL to one of these or update DEFAULT_GEMINI_MODEL.`
    );
  }
}

// The live-call result a classify* path threads into makeAgentRun: the parsed-ready
// object PLUS the provider-reported usage (token counts + finishReason). The usage
// drives costUsd; the object is firewall-validated by the agent. Both come back from
// ONE place (liveGenerateObject), which is also the budget hard-stop boundary.
export type LiveGenerateResult = {
  object: unknown;
  usage: AgentRunUsage;
};

// The budget context a live call carries: how much has been spent so far this run, an
// upper-bound estimate of THIS call's cost, and the cap. Threaded as a param (not a
// global) so the guard is pure + DI-testable. Defaulted so a key-OFF/no-budget caller
// is unaffected -- the guard only ever fires on a real live call that would breach.
export type BudgetContext = {
  spentUsd: number;
  estimatedNextUsd: number;
  capUsd?: number;
};

// The hard output-token ceiling on every live structured-output call. Bounding the output is
// what makes the pre-call cost ESTIMATE a true upper bound (and thus the $5 hard-stop a real
// guarantee, not a hope): without it, generateObject could emit far more than the estimated
// envelope and overshoot the cap, which is asserted BEFORE the call. Sized with headroom for the
// LARGEST agent output -- the Dispatcher's top-5 supplier drafts (subject + body + claims each):
// too tight TRUNCATES the structured JSON mid-object and the parse throws. Kept in lockstep with
// estimateLiveCallCostUsd's output envelope so the estimate can never under-price a real call.
const MAX_LIVE_OUTPUT_TOKENS = 8_000;

// liveGenerateObject: the SINGLE live-call boundary for the ActionOps LLM agents.
// Two jobs, in order:
//   1. BUDGET HARD-STOP (fail-closed): assertWithinBudget(spent, estimatedNext, cap)
//      runs BEFORE generateObject, so a would-breach call THROWS and never bills.
//      Key-OFF this code is never reached (the agent short-circuits earlier), so the
//      no-network contract holds; key-ON under cap it proceeds.
//   2. Call generateObject and return the object PLUS the reported usage, so the agent
//      can thread real token counts into makeAgentRun for costUsd. generateObject's
//      usage fields are `number | undefined`; they pass straight through (pricing
//      coerces). model + schema are injected so the call is provider-bound in ONE place.
// Injected `generate` (the raw SDK call) keeps this unit-reachable without network.
export async function liveGenerateObject(args: {
  model: string;
  schema: z.ZodTypeAny;
  prompt: string;
  budget: BudgetContext;
  generate?: (a: {
    model: string;
    schema: z.ZodTypeAny;
    prompt: string;
  }) => Promise<{ object: unknown; usage?: AgentRunUsage }>;
}): Promise<LiveGenerateResult> {
  const { model, schema, prompt, budget } = args;

  // Fail-closed BEFORE the billable call: a breach throws here, so generateObject is
  // never invoked and cannot bill. This is the cap as a guard, not a hope.
  assertWithinBudget(
    budget.spentUsd,
    budget.estimatedNextUsd,
    budget.capUsd ?? DEFAULT_BUDGET_CAP_USD
  );

  const generate =
    args.generate ??
    (async (a: { model: string; schema: z.ZodTypeAny; prompt: string }) => {
      const result = await generateObject({
        model: geminiModel(a.model),
        schema: a.schema,
        prompt: a.prompt,
        // Bound the output so the pre-call estimate is a TRUE ceiling (the $5 hard-stop checks
        // the estimate BEFORE this call; without a cap the model could overshoot it).
        maxOutputTokens: MAX_LIVE_OUTPUT_TOKENS
      });
      return {
        object: result.object,
        usage: {
          inputTokens: result.usage?.inputTokens,
          outputTokens: result.usage?.outputTokens,
          totalTokens: result.usage?.totalTokens,
          finishReason: result.finishReason ?? null
        } satisfies AgentRunUsage
      };
    });

  const out = await generate({ model, schema, prompt });
  return { object: out.object, usage: out.usage ?? {} };
}

// A RUN-LEVEL retry reserve: a SHARED pool of extra live attempts the agents draw from when
// an output fails its firewall/parse. tryConsume() decrements and returns true while attempts
// remain, false when the pool is empty. One object is threaded to all three LLM agents, so the
// total retries -- and thus the worst-case billed call count -- is bounded run-wide, never
// per-agent (which would let three agents each retry and blow the call-count ceiling).
export type RetryReserve = { tryConsume: () => boolean };

export function makeRetryReserve(total: number = LIVE_RETRY_RESERVE): RetryReserve {
  let remaining = Math.max(0, Math.floor(total));
  return {
    tryConsume: () => {
      if (remaining > 0) {
        remaining -= 1;
        return true;
      }
      return false;
    }
  };
}

// The caller's validation of a raw live object: a clean parse + firewall pass yields the typed
// value; a failure names the reason + class and whether it is worth a retry. A stochastic slip
// (a numeral in a numeral-free field, a unit off the whitelist) IS retryable; a structural
// problem is not. The errorClass flows straight into the agent's FAILED_TO_FALLBACK ledger.
export type LiveValidateResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string; errorClass: string; retryable: boolean };

// liveGenerateValidated: liveGenerateObject + the caller's validate(), with a BOUNDED retry on
// a RETRYABLE validation failure, drawn from a SHARED run-level reserve. Why: a live agent
// occasionally emits a stochastic slip the firewall rightly rejects; a single re-ask usually
// clears it, keeping the run all-LIVE instead of degrading to FAILED_TO_FALLBACK. Bounded:
// each retry consumes from the shared reserve (so the three agents cannot each retry and blow
// the "3 (+2 reserve)" call ceiling), and the cumulative spend rises by the per-call estimate
// each attempt so the budget hard-stop still fires across retries. A THROW (a budget breach or
// a failed call) is NOT retried -- it propagates to the caller's catch, which classifies
// BUDGET_EXCEEDED vs LIVE_CALL_THREW exactly as before. Returns the AGGREGATE usage across all
// attempts (the resolved one plus any billed-but-rejected retries), so AgentRun.costUsd and the
// packet's totalCostUsd are the EXACT gross spend, not a lower bound. (A budget breach or thrown
// call is the one path that does not bill -- the caller's catch-path fallback records it 0-token.)
export async function liveGenerateValidated<T>(args: {
  model: string;
  schema: z.ZodTypeAny;
  prompt: string;
  budget: BudgetContext;
  validate: (object: unknown) => LiveValidateResult<T>;
  retry?: RetryReserve;
  generate?: (a: {
    model: string;
    schema: z.ZodTypeAny;
    prompt: string;
  }) => Promise<{ object: unknown; usage?: AgentRunUsage }>;
}): Promise<
  | { ok: true; value: T; usage: AgentRunUsage }
  | { ok: false; reason: string; errorClass: string; usage: AgentRunUsage }
> {
  const { model, schema, prompt, budget, validate, retry, generate } = args;
  const perCallEstimate = estimateLiveCallCostUsd(model);

  // Aggregate the provider-reported usage across EVERY attempt (the resolved one PLUS any
  // billed-but-rejected retries) so the returned usage -> AgentRun.costUsd is the EXACT gross
  // spend, not just the final attempt. This closes the retry ledger undercount: a packet's
  // totalCostUsd and the orchestrator's running spend then reflect what every attempt billed.
  // (The caller's catch-path fallback -- a budget breach or thrown call -- stays 0-token: a
  // breach is blocked BEFORE it bills, so nothing was spent on the call that threw.)
  let agg: AgentRunUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, finishReason: null };
  const fold = (u: AgentRunUsage) => {
    agg = {
      inputTokens: (agg.inputTokens ?? 0) + (u.inputTokens ?? 0),
      outputTokens: (agg.outputTokens ?? 0) + (u.outputTokens ?? 0),
      totalTokens: (agg.totalTokens ?? 0) + (u.totalTokens ?? 0),
      // The latest attempt's finish reason is the operative one for the emitted run.
      finishReason: u.finishReason ?? agg.finishReason ?? null
    };
  };

  // Cumulative spend across THIS agent's attempts so attempt N's hard-stop accounts for the
  // earlier (billed) attempts -- a retry can never silently overshoot the cap.
  let retrySpent = 0;
  // Defensive per-agent attempt ceiling (1 base + the reserve) even if a mis-wired reserve
  // never reports empty. The real bound in normal operation is retry.tryConsume() going false.
  for (let attempt = 0; attempt <= LIVE_RETRY_RESERVE; attempt++) {
    const { object, usage } = await liveGenerateObject({
      model,
      schema,
      prompt,
      budget: { ...budget, spentUsd: budget.spentUsd + retrySpent },
      generate
    });
    fold(usage ?? {});
    retrySpent += perCallEstimate;

    const result = validate(object);
    if (result.ok) {
      return { ok: true, value: result.value, usage: agg };
    }
    // A retryable slip: re-ask only if the SHARED reserve still has an attempt; else fall back.
    if (result.retryable && retry?.tryConsume()) {
      continue;
    }
    return { ok: false, reason: result.reason, errorClass: result.errorClass, usage: agg };
  }
  // Unreachable in normal operation (the reserve goes empty first); a fail-safe so a mis-wired
  // reserve degrades to fallback rather than looping.
  return {
    ok: false,
    reason: "Live AI exceeded the retry reserve without a clean result.",
    errorClass: "RETRY_EXHAUSTED",
    usage: agg
  };
}

// estimateLiveCallCostUsd: a conservative upper-bound dollar estimate for a single
// live call, used as `estimatedNextUsd` for the budget pre-check (we cannot know the
// real cost until AFTER the call). Prices a fixed token envelope at the call's model;
// the envelope is deliberately generous so the guard errs toward blocking, not toward
// overspending. Pure; reuses the pinned price table.
export function estimateLiveCallCostUsd(
  model: string,
  envelope: { inputTokens: number; outputTokens: number } = {
    inputTokens: 8_000,
    // Locked to the live output cap: the estimate must never under-price what a call can emit.
    outputTokens: MAX_LIVE_OUTPUT_TOKENS
  }
): number {
  return costUsd(model, envelope.inputTokens, envelope.outputTokens);
}

type AgentContext = {
  publicSignals: PublicSignal[];
  impactReport: ImpactReport;
};

type GeneratedResult<T> = {
  value: T;
  mode: AgentMode;
  latencyMs: number;
  blockedReason?: string;
};

const AgentAnalysisSchema = z.object({
  summary: z.string().min(1),
  keyFindings: z.array(z.string().min(1)).min(1).max(5),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"])
});

const PlannerDecisionSchema = z.object({
  recommendedOptionId: z.string().min(1),
  summary: z.string().min(1),
  optionRationales: z
    .array(
      z.object({
        optionId: z.string().min(1),
        rationale: z.string().min(1)
      })
    )
    .length(3)
});

type AgentAnalysis = z.infer<typeof AgentAnalysisSchema>;
type PlannerDecision = z.infer<typeof PlannerDecisionSchema>;

export async function runLaunchOpsAgents(context: AgentContext): Promise<{
  options: RecoveryOption[];
  recommendedOptionId: string;
  executionDraft: ExecutionDraft;
  agentRuns: AgentRun[];
}> {
  const createdAt = new Date().toISOString();
  const agentRuns: AgentRun[] = [];

  const signalAnalysis = await analyzeSignals(context.publicSignals);
  agentRuns.push(
    createAgentRun({
      id: "RUN-SIGNAL-ANALYST",
      agentName: "Signal Analyst",
      input: context.publicSignals,
      output: signalAnalysis.value,
      summary: summarizeAnalysis(signalAnalysis.value, signalAnalysis.blockedReason),
      createdAt,
      mode: signalAnalysis.mode,
      latencyMs: signalAnalysis.latencyMs
    })
  );

  const impactAnalysis = await analyzeImpact(context.impactReport);
  agentRuns.push(
    createAgentRun({
      id: "RUN-IMPACT-ANALYST",
      agentName: "Impact Analyst",
      input: context.impactReport,
      output: impactAnalysis.value,
      summary: summarizeAnalysis(impactAnalysis.value, impactAnalysis.blockedReason),
      createdAt,
      mode: impactAnalysis.mode,
      latencyMs: impactAnalysis.latencyMs
    })
  );

  const options = buildRecoveryOptions(context.impactReport);
  const plannerDecision = await planResolution({
    impactReport: context.impactReport,
    options
  });
  const recommendedOptionId = plannerDecision.value.recommendedOptionId;
  const recommendedOption = options.find((option) => option.id === recommendedOptionId) ?? options[0];
  agentRuns.push(
    createAgentRun({
      id: "RUN-RESOLUTION-PLANNER",
      agentName: "Resolution Planner",
      input: { impactReport: context.impactReport, options },
      output: plannerDecision.value,
      summary: plannerDecision.blockedReason
        ? `${plannerDecision.blockedReason} Recommended ${recommendedOption.title}.`
        : plannerDecision.value.summary,
      createdAt,
      mode: plannerDecision.mode,
      latencyMs: plannerDecision.latencyMs,
      validationStatus: plannerDecision.blockedReason ? "FAIL" : "PASS"
    })
  );

  const gatekeeper = validateDecisionInputs({
    publicSignals: context.publicSignals,
    impactReport: context.impactReport,
    options,
    recommendedOptionId
  });
  agentRuns.push(
    createAgentRun({
      id: "RUN-DECISION-GATEKEEPER",
      agentName: "Decision Gatekeeper",
      input: { publicSignals: context.publicSignals, impactReport: context.impactReport, options },
      output: gatekeeper,
      summary: `${gatekeeper.status}: ${gatekeeper.failures.length} failures, ${gatekeeper.warnings.length} warnings.`,
      createdAt,
      validationStatus: gatekeeper.status === "BLOCKED" ? "FAIL" : "PASS"
    })
  );

  const executionDraft = await draftExecutionMessages({
    impactReport: context.impactReport,
    option: recommendedOption,
    publicSignals: context.publicSignals
  });
  agentRuns.push(
    createAgentRun({
      id: "RUN-EXECUTION-DRAFTER",
      agentName: "Execution Drafter",
      input: { impactReport: context.impactReport, option: recommendedOption },
      output: executionDraft.value,
      summary: executionDraft.blockedReason
        ? `${executionDraft.blockedReason} Drafted fallback execution messages.`
        : "Drafted supplier, carrier, internal, and customer messages.",
      createdAt,
      mode: executionDraft.mode,
      latencyMs: executionDraft.latencyMs
    })
  );

  return {
    options,
    recommendedOptionId,
    executionDraft: executionDraft.value,
    agentRuns
  };
}

async function analyzeSignals(signals: PublicSignal[]): Promise<GeneratedResult<AgentAnalysis>> {
  return generateStructuredOrFallback({
    schema: AgentAnalysisSchema,
    fallback: () => deterministicSignalAnalysis(signals),
    prompt:
      "You are the Signal Analyst for a supply-continuity exception. " +
      "Summarize only the supplied public signals. Do not invent sources, IDs, severity, dates, or locations. " +
      "Return concise findings suitable for an operations analyst.\n\n" +
      JSON.stringify({ publicSignals: signals }, null, 2)
  });
}

async function analyzeImpact(impactReport: ImpactReport): Promise<GeneratedResult<AgentAnalysis>> {
  return generateStructuredOrFallback({
    schema: AgentAnalysisSchema,
    fallback: () => deterministicImpactAnalysis(impactReport),
    prompt:
      "You are the Impact Analyst for a launch-critical supply exception. " +
      "Use only the supplied deterministic impact report. Do not calculate new values or invent IDs. " +
      "Explain the operational meaning of the existing calculations.\n\n" +
      JSON.stringify({ impactReport }, null, 2)
  });
}

async function planResolution({
  impactReport,
  options
}: {
  impactReport: ImpactReport;
  options: RecoveryOption[];
}): Promise<GeneratedResult<PlannerDecision>> {
  return generateStructuredOrFallback({
    schema: PlannerDecisionSchema,
    fallback: () => deterministicPlannerDecision(options),
    semanticValidate: (decision) => validatePlannerDecision(decision, options),
    prompt:
      "You are the Resolution Planner for a launch-critical supply exception. " +
      "Use only the supplied deterministic recovery options and impact report. " +
      "Do not create new options, IDs, costs, dates, scores, or calculations. " +
      `The recommendedOptionId must stay the top-scored deterministic option: ${options[0].id}. ` +
      "Return rationales for the supplied option IDs only.\n\n" +
      JSON.stringify({ impactReport, options }, null, 2)
  });
}

async function draftExecutionMessages({
  impactReport,
  option,
  publicSignals
}: {
  impactReport: ImpactReport;
  option: RecoveryOption;
  publicSignals: PublicSignal[];
}): Promise<GeneratedResult<ExecutionDraft>> {
  return generateStructuredOrFallback({
    schema: ExecutionDraftSchema,
    fallback: () => deterministicExecutionDraft(impactReport, option, publicSignals),
    prompt:
      "Draft concise supply-chain execution messages from this validated decision packet context. " +
      "Do not invent numbers, IDs, suppliers, or dates. Use only supplied data.\n\n" +
      JSON.stringify({ impactReport, option, publicSignals }, null, 2)
  });
}

function deterministicExecutionDraft(
  impactReport: ImpactReport,
  option: RecoveryOption,
  publicSignals: PublicSignal[]
): ExecutionDraft {
  const supplier = impactReport.affectedSuppliers[0];
  const component = impactReport.affectedComponents[0];
  const signal = publicSignals[0];
  return {
    supplierMessage:
      `Please confirm recovery commitment for ${component.componentName} tied to ${impactReport.launchId}. ` +
      `Current validated plan is ${option.title}. We need revised allocation, ship date, and risk confirmation within 24 hours.`,
    carrierMessage:
      `Request expedited routing quote and confirmed capacity for launch-critical component flow. ` +
      `Target speed gain is ${option.speedGainDays} days; approved option reference ${option.id}.`,
    internalMessage:
      `LaunchOps review: ${supplier.supplierName} / ${component.componentName} is driving ` +
      `${impactReport.launchRiskScore}/100 launch risk with ${impactReport.inventoryDaysRemaining} inventory days. ` +
      `Recommended action: ${option.title}. Human approval required before execution.`,
    customerMessage:
      `We are actively protecting launch availability for priority orders. Current mitigation is in approval review, ` +
      `and customer-impact updates will follow after operational confirmation. External signal monitored: ${signal.source}.`
  };
}

async function generateStructuredOrFallback<T>({
  fallback
}: {
  schema: z.ZodType<T>;
  prompt: string;
  fallback: () => T;
  semanticValidate?: (value: T) => string | undefined;
}): Promise<GeneratedResult<T>> {
  // LEGACY V1 path (runLaunchOpsAgents), retained ONLY to build the V1 back-compat oracle
  // fixture -- which is deterministic by design. It NO LONGER calls live AI: the V1 path
  // predates the budget hard-stop AND the per-invocation `live` opt-in, so billing it on the
  // global liveAiEnabled() flag was an uncapped, opt-out-by-default footgun (Codex D.9 #5).
  // The ONLY live engine is the V2 ActionOps pipeline (runActionOpsAgents), which is
  // explicitly opt-in (`live`) and budget-guarded. This stays deterministic by construction;
  // `schema` / `prompt` / `semanticValidate` are accepted for call-site compatibility, unused.
  return {
    value: fallback(),
    mode: "DETERMINISTIC_RULES",
    latencyMs: 0
  };
}

// liveAiEnabled now lives in the dependency-free env-flags module (shared with the
// fail-closed auth check in lib/server/security.ts -- single source of truth, no
// drift). Re-exported here so existing importers (run-exception, evals) stay stable.
export { liveAiEnabled };

// Derives the packet-level effective mode from the agent runs (R4-8).
// Precedence, highest first:
//   any FAILED_TO_FALLBACK -> FAILED_TO_FALLBACK (degraded; the badge case)
//   else any LIVE_AI       -> LIVE_AI            (a live success outranks replay)
//   else any REPLAY        -> REPLAY             (served from recorded fixtures)
//   else (no runs)         -> requestedMode      (nothing to derive from)
//   else                   -> DETERMINISTIC_RULES (healthy; AI disabled by config)
// requestedMode cannot itself be FAILED_TO_FALLBACK (RequestedMode narrows it).
export function computeEffectiveMode(
  agentRuns: AgentRun[],
  requestedMode: RequestedMode
): AgentMode {
  if (agentRuns.some((run) => run.mode === "FAILED_TO_FALLBACK")) {
    return "FAILED_TO_FALLBACK";
  }
  if (agentRuns.some((run) => run.mode === "LIVE_AI")) {
    return "LIVE_AI";
  }
  if (agentRuns.some((run) => run.mode === "REPLAY")) {
    return "REPLAY";
  }
  if (agentRuns.length === 0) {
    return requestedMode;
  }
  return "DETERMINISTIC_RULES";
}

function deterministicSignalAnalysis(signals: PublicSignal[]): AgentAnalysis {
  const live = signals.filter((signal) => signal.status === "LIVE").length;
  const highest = signals.reduce<PublicSignal["severity"]>((current, signal) => {
    const order = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
    return order.indexOf(signal.severity) > order.indexOf(current)
      ? signal.severity
      : current;
  }, "LOW");
  const fallback = signals.filter((signal) => signal.status !== "LIVE").length;
  return {
    summary: `${live}/${signals.length} live public signals ingested; highest severity ${highest}.`,
    keyFindings: [
      `${signals.length} public sources normalized into the common PublicSignal shape.`,
      `${fallback} source${fallback === 1 ? "" : "s"} currently disclose cached or failed fallback status.`,
      `Highest observed public-signal severity is ${highest}.`
    ],
    confidence: fallback === 0 ? "HIGH" : "MEDIUM"
  };
}

function deterministicImpactAnalysis(impactReport: ImpactReport): AgentAnalysis {
  return {
    summary:
      `Risk ${impactReport.launchRiskScore}/100; ` +
      `${impactReport.inventoryDaysRemaining} inventory days; ` +
      `${impactReport.shipmentDelayDays} delay days; ` +
      `$${impactReport.revenueAtRisk.toLocaleString()} revenue at risk.`,
    keyFindings: [
      `${impactReport.affectedComponents[0]?.componentName ?? "Affected component"} is required for launch.`,
      `${impactReport.slaRiskOrders} customer order${impactReport.slaRiskOrders === 1 ? "" : "s"} are at SLA risk.`,
      `Projected stockout date is ${impactReport.projectedStockoutDate}.`
    ],
    confidence: "HIGH"
  };
}

function deterministicPlannerDecision(options: RecoveryOption[]): PlannerDecision {
  return {
    recommendedOptionId: options[0].id,
    summary: `Generated ${options.length} ranked recovery options; recommended ${options[0].title}.`,
    optionRationales: options.map((option) => ({
      optionId: option.id,
      rationale:
        `${option.score}/100 score with ${option.riskReductionPct}% risk reduction, ` +
        `${option.speedGainDays} days speed gain, and $${option.estimatedCostUsd.toLocaleString()} estimated cost.`
    }))
  };
}

function validatePlannerDecision(decision: PlannerDecision, options: RecoveryOption[]) {
  const optionIds = new Set(options.map((option) => option.id));
  const rationaleIds = new Set(decision.optionRationales.map((item) => item.optionId));

  if (decision.recommendedOptionId !== options[0].id) {
    return `Planner output blocked: recommended ${decision.recommendedOptionId}, expected deterministic top option ${options[0].id}.`;
  }

  if (rationaleIds.size !== options.length) {
    return "Planner output blocked: option rationale IDs were duplicated or incomplete.";
  }

  for (const id of rationaleIds) {
    if (!optionIds.has(id)) {
      return `Planner output blocked: unknown option ID ${id}.`;
    }
  }

  return undefined;
}

function summarizeAnalysis(analysis: AgentAnalysis, blockedReason?: string) {
  if (blockedReason) {
    return `${blockedReason} ${analysis.summary}`;
  }
  return analysis.summary;
}

function createAgentRun({
  id,
  agentName,
  input,
  output,
  summary,
  createdAt,
  validationStatus = "PASS",
  mode = "DETERMINISTIC_RULES",
  latencyMs = 0
}: {
  id: string;
  agentName: string;
  input: unknown;
  output: unknown;
  summary: string;
  createdAt: string;
  validationStatus?: AgentRun["validationStatus"];
  mode?: AgentRun["mode"];
  latencyMs?: number;
}): AgentRun {
  return {
    id,
    agentName,
    model: mode === "LIVE_AI" ? resolvedGeminiModel() : "deterministic-rules",
    mode,
    latencyMs,
    tokenEstimate: estimateTokens(input) + estimateTokens(output),
    inputHash: stableHash(input),
    outputHash: stableHash(output),
    validationStatus,
    summary,
    createdAt
  };
}

function estimateTokens(value: unknown) {
  return Math.ceil(JSON.stringify(value).length / 4);
}
