import type { AgentRun, ExposureResult, Playbook } from "@/lib/schemas";
import { makeAgentRun } from "@/lib/agents/actionops/agent-run";
import type { ActionOpsContext } from "@/lib/agents/actionops/types";

// Strategist (D.1: deterministic template). Produces role playbooks grounded in
// Atlas's exposure ids (groundedClaimIds). Steps are prose with NO bare numerals
// -- every figure a playbook surfaces must trace to a claim, and D.6 (the LLM
// Strategist) plus the playbook-numeral grader own that. Keeping D.1 steps
// numeral-free means the citation contract holds trivially while the seam is wired.
// Zero exposures -> no playbook (nothing to ground a plan in).
export function runStrategist(
  ctx: ActionOpsContext,
  exposureResults: ExposureResult[]
): { playbooks: Playbook[]; agentRun: AgentRun } {
  const { baseDateIso } = ctx;
  const groundedClaimIds = exposureResults.slice(0, 3).map((e) => e.id);

  const playbooks: Playbook[] =
    exposureResults.length === 0
      ? []
      : [
          {
            id: "PB-PROCUREMENT",
            role: "Procurement",
            summary: "Secure alternate routing and backup capacity for the exposed suppliers.",
            steps: [
              "Confirm current lead times and backup capacity with the most exposed suppliers.",
              "Issue contingency RFQs on alternate, non-affected lanes.",
              "Hold a qualified-backup decision ahead of the next review."
            ],
            groundedClaimIds
          }
        ];

  const agentRun = makeAgentRun({
    id: "RUN-STRATEGIST",
    agentName: "Strategist",
    input: { exposureCount: exposureResults.length },
    output: playbooks,
    summary: `${playbooks.length} playbook(s) grounded in ${groundedClaimIds.length} exposure claim(s).`,
    createdAt: baseDateIso
  });

  return { playbooks, agentRun };
}
