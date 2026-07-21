// Counsel-approval gate (plan §5 D4) -- the human gate, as a pure state machine.
// A packet is BORN pending review; the ONLY path to an exportable artifact runs
// through an explicit approval carrying the reviewer's identity and timestamp.
// Export of anything not approved throws -- there is no bypass parameter.

import { createHash } from "node:crypto";
import type { CustomsDefensePacket } from "./defense-packet";
import { renderPacketText } from "./defense-packet";
import { gradeCustomsCitationCoverage } from "./packet-graders";

// Content binding (2026-07-16 re-review, C-02): an approval is FOR a specific packet
// text, not for whatever object happens to share the reference at export time. approve()
// stamps the sha256 of the rendered packet; exportPacket re-renders and compares, so a
// packet mutated after approval — or an approval grafted onto a different packet — fails
// closed instead of exporting as "reviewed".
function packetSha256(packet: CustomsDefensePacket): string {
  return createHash("sha256").update(renderPacketText(packet)).digest("hex");
}

export type ApprovalState =
  | { state: "PENDING_COUNSEL_REVIEW" }
  | {
      state: "APPROVED_FOR_EXPORT";
      reviewer: string;
      approvedOn: string;
      packetSha256: string;
      note?: string;
    }
  | { state: "REJECTED"; reviewer: string; rejectedOn: string; reason: string };

export interface ReviewablePacket {
  packet: CustomsDefensePacket;
  approval: ApprovalState;
}

export function intoReview(packet: CustomsDefensePacket): ReviewablePacket {
  return { packet, approval: { state: "PENDING_COUNSEL_REVIEW" } };
}

export function approve(
  reviewable: ReviewablePacket,
  reviewer: string,
  approvedOn: string,
  note?: string
): ReviewablePacket {
  if (reviewable.approval.state !== "PENDING_COUNSEL_REVIEW") {
    throw new Error(`cannot approve from state ${reviewable.approval.state}`);
  }
  if (!reviewer.trim()) throw new Error("approval requires a named reviewer");
  return {
    packet: reviewable.packet,
    approval: {
      state: "APPROVED_FOR_EXPORT",
      reviewer,
      approvedOn,
      packetSha256: packetSha256(reviewable.packet),
      note
    }
  };
}

export function reject(
  reviewable: ReviewablePacket,
  reviewer: string,
  rejectedOn: string,
  reason: string
): ReviewablePacket {
  if (reviewable.approval.state !== "PENDING_COUNSEL_REVIEW") {
    throw new Error(`cannot reject from state ${reviewable.approval.state}`);
  }
  if (!reason.trim()) throw new Error("rejection requires a reason");
  return { packet: reviewable.packet, approval: { state: "REJECTED", reviewer, rejectedOn, reason } };
}

// The ONLY outward door. DEFENSE_PACKET_EXPORT is the irreversible action class --
// it exists solely behind an APPROVED state.
export function exportPacket(reviewable: ReviewablePacket): string {
  const approval = reviewable.approval;
  if (approval.state !== "APPROVED_FOR_EXPORT") {
    throw new Error(
      `DEFENSE_PACKET_EXPORT blocked: approval state is ${approval.state} (no outward artifact without explicit counsel approval)`
    );
  }
  // Codex D6 #2: never trust the SHAPE of the approval object -- a hand-built
  // `{ state: "APPROVED_FOR_EXPORT" }` must not export with an undefined reviewer.
  // An approved state is only honored when it carries what approve() would have set.
  const reviewerOk = typeof approval.reviewer === "string" && approval.reviewer.trim().length > 0;
  const dateOk = typeof approval.approvedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(approval.approvedOn);
  if (!reviewerOk || !dateOk) {
    throw new Error(
      "DEFENSE_PACKET_EXPORT blocked: approved state lacks a named reviewer and ISO approval date (forged or malformed approval object)"
    );
  }
  // Content binding (C-02): the approval must be FOR this exact packet content. A missing
  // digest is a hand-built approval; a mismatched one means the packet changed after review.
  const digestOk =
    typeof approval.packetSha256 === "string" &&
    approval.packetSha256 === packetSha256(reviewable.packet);
  if (!digestOk) {
    throw new Error(
      "DEFENSE_PACKET_EXPORT blocked: approval is not bound to this packet content (missing or mismatched packet digest — the packet was mutated after approval, or the approval object was forged)"
    );
  }
  const artifact =
    renderPacketText(reviewable.packet) +
    `\n\n-- Approved for export by ${approval.reviewer} on ${approval.approvedOn} --`;
  // Codex D6 #3, outward-door leg: grade the EXACT final artifact. Free-text
  // reviewer digits ("Counsel 999") would otherwise smuggle an uncited numeral past
  // the produce-time guard, which graded the packet before the approval line existed.
  const grade = gradeCustomsCitationCoverage({
    sections: [{ heading: "EXPORTED_ARTIFACT", text: artifact }],
    citedFigures: reviewable.packet.citedFigures,
  });
  if (grade.blocked) {
    throw new Error(`DEFENSE_PACKET_EXPORT blocked by citation guard: ${grade.violations.join(" | ")}`);
  }
  return artifact;
}
