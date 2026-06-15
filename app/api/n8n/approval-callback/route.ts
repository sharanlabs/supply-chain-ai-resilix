import { z } from "zod";
import {
  applyApprovalDecision,
  approvalHttpStatus
} from "@/lib/server/decision-packet-service";
import { apiError, noStoreJson, parseJsonRequest } from "@/lib/server/http";
import {
  validateRecentIsoTimestamp,
  verifyN8nCallbackSecret
} from "@/lib/server/security";

const CallbackSchema = z.object({
  decisionPacketId: z.string().min(1).max(120),
  approvalStatus: z.enum(["APPROVED", "REJECTED"]),
  approver: z.string().min(1).max(120).default("n8n-approval-workflow"),
  reason: z.string().min(1).max(500).default("Updated from n8n approval callback"),
  callbackEventId: z.string().min(8).max(120).optional(),
  callbackSentAt: z.string().datetime().optional()
});

export async function POST(request: Request) {
  const callbackAuth = verifyN8nCallbackSecret(request);
  if (!callbackAuth.ok) {
    return noStoreJson(
      {
        error: "UNAUTHORIZED_CALLBACK",
        detail: "n8n callback secret is missing or invalid"
      },
      { status: 401 }
    );
  }

  const parsed = await parseJsonRequest(request, CallbackSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  if (callbackAuth.mode === "SECRET_REQUIRED") {
    if (!parsed.data.callbackEventId || !parsed.data.callbackSentAt) {
      return apiError(
        "CALLBACK_REPLAY_PROTECTION_REQUIRED",
        "Protected callbacks must include callbackEventId and callbackSentAt",
        400
      );
    }

    if (!validateRecentIsoTimestamp(parsed.data.callbackSentAt)) {
      return apiError(
        "STALE_CALLBACK",
        "Protected callback timestamp is outside the accepted freshness window",
        401
      );
    }
  }

  const result = await applyApprovalDecision({
    packetId: parsed.data.decisionPacketId,
    approvalStatus: parsed.data.approvalStatus,
    reason: parsed.data.reason,
    actor: parsed.data.approver,
    auditAction: "N8N_APPROVAL_CALLBACK",
    eventId: parsed.data.callbackEventId
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
