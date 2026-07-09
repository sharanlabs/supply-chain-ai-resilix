import { apiError, noStoreJson, rateLimited } from "@/lib/server/http";
import { verifyApprovalToken } from "@/lib/server/security";
import { envBool } from "@/lib/server/env-flags";
import { enforceMutationRateLimit } from "@/lib/server/rate-limit";
import { getDecisionPacket } from "@/lib/server/store";
import { executeApprovedPacketActions } from "@/lib/server/action-executor";
import { transportRegistryFromEnv } from "@/lib/server/action-transport";

// ---------------------------------------------------------------------------
// Phase 5 -- the authenticated execution entry point. CLOSES THE LOOP after a
// human approves a decision packet: it classifies each governable action and, with
// graduated autonomy, auto-fires the reversible/internal ones via the transactional
// outbox (behind the default-OFF ENABLE_REVERSIBLE_AUTO_EXECUTE flag) while leaving
// the irreversible/OUTWARD ones PENDING for an explicit human-approved execution.
//
// Auth posture matches the approve route exactly (P2.7): fail-closed bearer
// APPROVAL_TOKEN in secure mode, then rate-limited. Only an APPROVED packet may be
// executed.
//
// Transport wiring (final-gate Codex MED): the route uses transportRegistryFromEnv()
// so a CONFIGURED transport is actually used -- closing the silent-Noop trap where a
// stranded reversible action could be marked EXECUTED without reaching the transport
// an operator configured. With NO transport env set (the demo/replay-only deploy) it
// returns {} -> every channel resolves to Noop, so the surface is byte-identical to
// the prior all-Noop default. The governance moat is unchanged: outward/IRREVERSIBLE
// actions stay PENDING here regardless of registry; only REVERSIBLE/internal ones
// (audit log, owner alert, ticket) can auto-fire, and only when the operator has both
// set the transport env AND enabled ENABLE_REVERSIBLE_AUTO_EXECUTE.
// ---------------------------------------------------------------------------
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Fail-closed auth on this mutation surface (same gate as approve).
  const auth = verifyApprovalToken(request);
  if (!auth.ok) {
    return apiError(auth.code, auth.message, auth.status);
  }

  // Rate limit after auth, before any work.
  const rate = enforceMutationRateLimit("packet-execute", request);
  if (!rate.allowed) {
    return rateLimited(rate.retryAfterSeconds);
  }

  const { id } = await params;
  const packet = await getDecisionPacket(id);
  if (!packet) {
    return apiError("NOT_FOUND", "Decision packet was not found", 404);
  }

  // Only an APPROVED packet can be executed. An unapproved (PENDING/REJECTED) packet
  // is rejected here -- execution is what happens strictly AFTER human approval.
  if (packet.approvalStatus !== "APPROVED") {
    return apiError(
      "NOT_APPROVED",
      "Only an APPROVED decision packet can be executed",
      422
    );
  }

  const result = await executeApprovedPacketActions({
    packet,
    // Reversible auto-fire is OFF unless the operator explicitly enables it. Even ON,
    // it only auto-fires REVERSIBLE/internal actions; outward actions stay PENDING.
    autoExecuteReversible: envBool("ENABLE_REVERSIBLE_AUTO_EXECUTE"),
    // Use configured transports (empty {} -> all-Noop for the keyless demo).
    deps: { registry: transportRegistryFromEnv() }
  });

  if (!result.ok) {
    // Defense in depth: the executor re-validates the APPROVED snapshot it was handed (a
    // second guard against a caller reaching it on a non-approved packet) -- NOT a fresh
    // transactional read, so not real TOCTOU protection. It is sound here because APPROVED
    // is forward-terminal (the PENDING-only compare-and-set) and there is no un-approve or
    // post-approval content-mutation path. Reported as the same 422 contract.
    return apiError(
      "NOT_APPROVED",
      "Only an APPROVED decision packet can be executed",
      422
    );
  }

  return noStoreJson({ execution: result.summary });
}
