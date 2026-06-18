import { google } from "@ai-sdk/google";
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
  schema,
  prompt,
  fallback,
  semanticValidate
}: {
  schema: z.ZodType<T>;
  prompt: string;
  fallback: () => T;
  semanticValidate?: (value: T) => string | undefined;
}): Promise<GeneratedResult<T>> {
  if (!liveAiEnabled()) {
    // Config chose no live AI: a by-design deterministic run. Healthy, NOT degraded.
    return {
      value: fallback(),
      mode: "DETERMINISTIC_RULES",
      latencyMs: 0
    };
  }

  const startedAt = Date.now();
  try {
    const result = await generateObject({
      model: google(resolvedGeminiModel()),
      schema,
      prompt
    });
    const value = schema.parse(result.object);
    const semanticFailure = semanticValidate?.(value);
    if (semanticFailure) {
      // Live AI returned but its output was semantically rejected -> degraded.
      return {
        value: fallback(),
        mode: "FAILED_TO_FALLBACK",
        latencyMs: Date.now() - startedAt,
        blockedReason: semanticFailure
      };
    }

    return {
      value,
      mode: "LIVE_AI",
      latencyMs: Date.now() - startedAt
    };
  } catch {
    // Live AI was attempted and threw -> degraded fallback.
    return {
      value: fallback(),
      mode: "FAILED_TO_FALLBACK",
      latencyMs: Date.now() - startedAt,
      blockedReason: "Live AI call failed or returned invalid structured output; deterministic fallback used."
    };
  }
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
