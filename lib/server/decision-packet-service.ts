import type { ApprovalStatus, DecisionPacket } from "@/lib/schemas";
import { transitionApproval } from "@/lib/server/store";

type ApprovalMutationInput = {
  packetId: string;
  approvalStatus: Exclude<ApprovalStatus, "PENDING">;
  reason: string;
  actor: string;
  auditAction: "HUMAN_APPROVAL" | "N8N_APPROVAL_CALLBACK";
  eventId?: string;
};

export type ApprovalMutationResult =
  | { status: "UPDATED"; packet: DecisionPacket }
  | { status: "IDEMPOTENT"; packet: DecisionPacket }
  | { status: "NOT_FOUND" }
  | { status: "BLOCKED"; packet: DecisionPacket; message: string }
  | { status: "CONFLICT"; packet: DecisionPacket; message: string }
  | { status: "EVENT_CONFLICT"; packet?: DecisionPacket; message: string };

export async function applyApprovalDecision(
  input: ApprovalMutationInput
): Promise<ApprovalMutationResult> {
  // The PENDING -> APPROVED/REJECTED transition is delegated to the packet
  // store, which performs every check (gatekeeper block, event-already-
  // processed, status compare-and-set, audit append, mark-processed) as one
  // atomic unit. This removes the previous check-then-write TOCTOU window
  // where two concurrent calls could both observe PENDING and both write.
  return transitionApproval(input);
}

export function approvalHttpStatus(result: ApprovalMutationResult) {
  switch (result.status) {
    case "UPDATED":
    case "IDEMPOTENT":
      return 200;
    case "NOT_FOUND":
      return 404;
    case "BLOCKED":
      return 422;
    case "CONFLICT":
    case "EVENT_CONFLICT":
      return 409;
  }
}
