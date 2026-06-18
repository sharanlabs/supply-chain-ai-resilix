import type {
  ActionItem,
  AgentRun,
  Claim,
  ExposureResult,
  Simulation,
  SupplierMessageDraft
} from "@/lib/schemas";
import { makeAgentRun } from "@/lib/agents/actionops/agent-run";
import type { ActionOpsContext } from "@/lib/agents/actionops/types";

// Dispatcher (D.1: deterministic template). Drafts a supplier message for the top
// exposed suppliers, capped at five, each carrying a claims[] entry for EVERY
// numeral in the body -- so the bidirectional citation contract holds (a numeral
// with no claim, or a claim whose sourcePath does not resolve, fails the
// gatekeeper/grader). The Dispatcher NEVER sees raw signal text: it receives
// structured, validated fields only. D.7 replaces the template with the LLM
// drafter under the same whitelist + claims contract. Nothing leaves draft state
// without human approval (approvalRequired stays true).
const MAX_DRAFTS = 5;

export function runDispatcher(
  ctx: ActionOpsContext,
  exposureResults: ExposureResult[],
  simulation?: Simulation
): {
  supplierMessages: SupplierMessageDraft[];
  actionItems: ActionItem[];
  agentRun: AgentRun;
} {
  const { baseDateIso } = ctx;
  const windowDays =
    simulation != null && simulation.horizons.length > 0 ? simulation.horizons[0].days : null;

  // slice(0, MAX_DRAFTS) keeps the first N exposures in order, so message index i
  // maps to exposureResults[i] in the final packet -- the sourcePath the claim cites.
  const supplierMessages: SupplierMessageDraft[] = exposureResults
    .slice(0, MAX_DRAFTS)
    .map((e, i) => {
      const claims: Claim[] = [
        {
          value: e.exposureScore,
          unit: "score",
          sourcePath: `exposureResults[${i}].exposureScore`
        }
      ];
      let body =
        "We are contacting you about a supply-chain disruption affecting your inbound lanes. " +
        `Your exposure score for this event is ${e.exposureScore}.`;
      if (windowDays != null) {
        claims.push({ value: windowDays, unit: "days", sourcePath: "simulation.horizons[0].days" });
        body += ` We are assessing impact over an initial ${windowDays}-day window and will confirm contingency routing after review.`;
      } else {
        body += " We are reviewing contingency options and will confirm next steps after review.";
      }
      return {
        id: `MSG-${e.supplierId}`,
        supplierId: e.supplierId,
        channel: "email",
        subject: "Supply-chain disruption: contingency review",
        body,
        claims,
        approvalRequired: true
      };
    });

  const actionItems: ActionItem[] =
    exposureResults.length === 0
      ? []
      : [
          {
            id: "AI-CONTINGENCY",
            title: "Confirm backup capacity for the most exposed lane",
            owner: "Procurement",
            status: "OPEN"
          },
          {
            id: "AI-REVIEW",
            title: "Review contingency drafts and approve outbound messages",
            owner: "Operations",
            status: "OPEN"
          }
        ];

  const agentRun = makeAgentRun({
    id: "RUN-DISPATCHER",
    agentName: "Dispatcher",
    input: { exposureCount: exposureResults.length, hasSimulation: simulation != null },
    output: { supplierMessages, actionItems },
    summary: `${supplierMessages.length} draft(s) queued for approval; ${actionItems.length} action item(s).`,
    createdAt: baseDateIso
  });

  return { supplierMessages, actionItems, agentRun };
}
