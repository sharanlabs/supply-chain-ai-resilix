import { z } from "zod";
import {
  applyApprovalDecision,
  approvalHttpStatus
} from "@/lib/server/decision-packet-service";
import { apiError, noStoreJson, parseJsonRequest, rateLimited } from "@/lib/server/http";
import { verifyApprovalToken } from "@/lib/server/security";
import { enforceMutationRateLimit } from "@/lib/server/rate-limit";

const ApprovalRequestSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  // Trim-then-validate (2026-07-16 re-review, B-02): a whitespace-only reason passed
  // min(1) and persisted an empty-in-substance audit reason on a terminal decision.
  reason: z
    .string()
    .max(500)
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, "reason must be non-blank"),
  approvalEventId: z.string().min(8).max(120).optional()
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // P2.7 (R4-4): fail-closed auth on this mutation surface. Terminal packet
  // approval was previously UNGATED -- in secure mode it now requires the token.
  const auth = verifyApprovalToken(request);
  if (!auth.ok) {
    return apiError(auth.code, auth.message, auth.status);
  }

  // Rate limit after auth, before any work (single-instance brake; see rate-limit.ts).
  const rate = enforceMutationRateLimit("packet-approve", request);
  if (!rate.allowed) {
    return rateLimited(rate.retryAfterSeconds);
  }

  const { id } = await params;
  const parsed = await parseJsonRequest(request, ApprovalRequestSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  const result = await applyApprovalDecision({
    packetId: id,
    approvalStatus: parsed.data.status,
    reason: parsed.data.reason,
    // Demo actor label (B-02, recorded posture): this surface has no per-user identity —
    // the bearer token authorizes the mutation, and the audit actor is the generic demo
    // reviewer. Deriving a verified named human requires SSO/per-user auth (enterprise
    // path, docs/enterprise_readiness.md), deliberately out of the showcase scope.
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
