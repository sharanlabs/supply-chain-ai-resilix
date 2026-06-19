import type { AgentRun } from "@/lib/schemas";
import { PRICING_VERSION } from "@/lib/agents/pricing";

// summarizeCost: roll the per-run cost ledger up into the PACKET-level cost summary
// (D.8, R4-10). Pure. The Success_Criteria "<=$5 total LLM spend" number lives here:
// totalCostUsd is the sum of every agent run's costUsd; pricingVersion is the pinned
// price-list those costs were computed against (PRICING_VERSION -- one source, no drift).
//
// A run with an absent costUsd (a pre-D.8 stored run threaded through, should that ever
// happen) contributes 0, never NaN -- the summary never silently corrupts on a partial
// run. Key-OFF every run is deterministic (costUsd 0) -> total 0 with a stamped version.
export function summarizeCost(agentRuns: AgentRun[]): {
  totalCostUsd: number;
  pricingVersion: string;
} {
  const totalCostUsd = agentRuns.reduce((sum, run) => {
    const cost = run.costUsd;
    return sum + (typeof cost === "number" && Number.isFinite(cost) ? cost : 0);
  }, 0);
  return { totalCostUsd, pricingVersion: PRICING_VERSION };
}
