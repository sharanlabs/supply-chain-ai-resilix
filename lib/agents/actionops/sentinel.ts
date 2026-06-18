import type { AgentRun, ThreatCard } from "@/lib/schemas";
import { makeAgentRun } from "@/lib/agents/actionops/agent-run";
import type { ActionOpsContext } from "@/lib/agents/actionops/types";

// Sentinel (D.1: deterministic). Emits the threat card from the resolved scenario.
// It is the ONLY agent that will touch raw signal text once D.5 replaces this with
// the LLM classifier (closed-vocab eventType + OTHER_UNMAPPED escape hatch, with
// evidence urls drawn only from the fetched set). Downstream agents receive the
// validated ThreatCard and ids -- never raw article text -- which is the
// prompt-injection firewall: an instruction smuggled into a news item cannot reach
// the drafting step.
export function runSentinel(ctx: ActionOpsContext): {
  threatCard: ThreatCard;
  agentRun: AgentRun;
} {
  const { scenario, signals, baseDateIso } = ctx;

  const threatCard: ThreatCard = {
    id: `THR-${scenario.id}`,
    eventType: scenario.threat.eventType,
    severity: scenario.threat.severity,
    location: scenario.threat.location,
    summary: scenario.threat.summary,
    evidenceUrls: scenario.threat.evidenceUrls,
    confidence: scenario.threat.confidence,
    createdAt: baseDateIso
  };

  const agentRun = makeAgentRun({
    id: "RUN-SENTINEL",
    agentName: "Sentinel",
    input: { signalCount: signals.length, scenarioId: scenario.id },
    output: threatCard,
    summary: `Classified threat ${threatCard.eventType} at ${threatCard.severity} severity.`,
    createdAt: baseDateIso
  });

  return { threatCard, agentRun };
}
