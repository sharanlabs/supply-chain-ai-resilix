import type { AgentRun } from "@/lib/schemas";
import { stableHash } from "@/lib/utils";
import { PRICING_VERSION, costUsd } from "@/lib/agents/pricing";

// A compact token estimate (chars / 4) -- a rough relative-size proxy kept for the UI
// and existing readers. The D.8 cost ledger (inputTokens/outputTokens/costUsd, below)
// carries the REAL provider-reported counts and the dollar cost; this heuristic is no
// longer the cost signal, just a cheap size hint.
function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 4);
}

// The API-reported usage a live call threads in. Every field is optional because the
// AI SDK reports each usage number as `number | undefined` -- a successful call may
// still leave one absent. The deterministic path passes no usage at all (0 tokens).
export type AgentRunUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  finishReason?: string | null;
};

// Build the audit record for one agent step. D.1 agents are all deterministic, so
// model defaults to "deterministic-rules", mode DETERMINISTIC_RULES, latency 0.
// The LLM agents (D.5-D.7) pass mode "LIVE_AI" plus the resolved model id -- which
// is single-sourced from the model config built in D.5, never hard-coded here.
//
// D.8 cost ledger: every run is stamped with a cost. The DETERMINISTIC path (no
// `usage` passed) costs $0 and is marked finishReason "deterministic" -- it stamps
// costUsd: 0 DIRECTLY and NEVER calls costUsd("deterministic-rules", ...), so the
// pricing table's fail-loud-on-unknown-model guard stays a REAL guard (it fires only
// on a typo'd/retired LIVE id, not on every deterministic run). The LIVE path passes
// `usage`, and costUsd(model, in, out) computes the real dollar cost from the pinned
// price list. errorClass marks a degraded attempt (null on a healthy run). pricingVersion
// is stamped on every run so a re-price is an explicit migration, never silent.
export function makeAgentRun(args: {
  id: string;
  agentName: string;
  input: unknown;
  output: unknown;
  summary: string;
  createdAt: string;
  model?: string;
  mode?: AgentRun["mode"];
  latencyMs?: number;
  validationStatus?: AgentRun["validationStatus"];
  usage?: AgentRunUsage;
  errorClass?: string | null;
}): AgentRun {
  const {
    id,
    agentName,
    input,
    output,
    summary,
    createdAt,
    model = "deterministic-rules",
    mode = "DETERMINISTIC_RULES",
    latencyMs = 0,
    validationStatus = "PASS",
    usage,
    errorClass = null
  } = args;

  // Cost: the deterministic path (no usage) is $0 with finishReason "deterministic"
  // -- stamped directly, the table is NOT consulted. A live path passes usage, so the
  // real ids + reported tokens flow through costUsd (which fails loud on an unknown
  // live model). A live call that reports no usage prices at $0 (0 coerced tokens) but
  // still records its model + pricingVersion, so the run is auditable, not invisible.
  const isLive = usage !== undefined;
  const inputTokens = usage?.inputTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? 0;
  const totalTokens = usage?.totalTokens ?? inputTokens + outputTokens;
  const finishReason = isLive ? (usage?.finishReason ?? null) : "deterministic";
  const computedCostUsd = isLive ? costUsd(model, inputTokens, outputTokens) : 0;

  return {
    id,
    agentName,
    model,
    mode,
    latencyMs,
    tokenEstimate: estimateTokens(input) + estimateTokens(output),
    inputHash: stableHash(input),
    outputHash: stableHash(output),
    validationStatus,
    summary,
    createdAt,
    inputTokens,
    outputTokens,
    totalTokens,
    finishReason,
    errorClass,
    pricingVersion: PRICING_VERSION,
    costUsd: computedCostUsd
  };
}
