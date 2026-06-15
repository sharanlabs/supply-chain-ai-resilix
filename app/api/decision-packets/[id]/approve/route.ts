import { z } from "zod";
import {
  applyApprovalDecision,
  approvalHttpStatus
} from "@/lib/server/decision-packet-service";
import { apiError, noStoreJson, parseJsonRequest } from "@/lib/server/http";

const ApprovalRequestSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  reason: z.string().min(1).max(500),
  approvalEventId: z.string().min(8).max(120).optional()
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsed = await parseJsonRequest(request, ApprovalRequestSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  const result = await applyApprovalDecision({
    packetId: id,
    approvalStatus: parsed.data.status,
    reason: parsed.data.reason,
    actor: "human-approver",
    auditAction: "HUMAN_APPROVAL",
    eventId: parsed.data.approvalEventId
  });

  if (result.status === "UPDATED" || result.status === "IDEMPOTENT") {
    return noStoreJson({ packet: result.packet, mutationStatus: result.status });
  }

  return apiError(
    result.status,
    result.status === "NOT_FOUND" ? "Decision packet was not found" : result.message,
    approvalHttpStatus(result)
  );
}
