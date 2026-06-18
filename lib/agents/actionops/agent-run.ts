import type { AgentRun } from "@/lib/schemas";
import { stableHash } from "@/lib/utils";

// A compact token estimate (chars / 4) -- a stand-in until the real cost ledger
// (D.8) records API-reported token counts. Same heuristic the legacy pipeline used.
function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 4);
}

// Build the audit record for one agent step. D.1 agents are all deterministic, so
// model defaults to "deterministic-rules", mode DETERMINISTIC_RULES, latency 0.
// The LLM agents (D.5-D.7) pass mode "LIVE_AI" plus the resolved model id -- which
// is single-sourced from the model config built in D.5, never hard-coded here.
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
    validationStatus = "PASS"
  } = args;
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
    createdAt
  };
}
