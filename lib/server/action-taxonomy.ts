import { createHash } from "node:crypto";
import {
  type ActionChannel,
  type DecisionPacket,
  type GovernableActionType,
  type Reversibility,
  ThreatEventTypeSchema
} from "@/lib/schemas";
import { sanitizeText } from "@/lib/signals/sanitize";

// Digest-string hardening (Codex/security [Med], 2026-06-26): a digest is documented as
// IDs/enums/numbers only, but some packet fields are LLM-classified (threatCard.eventType)
// or LLM-authored (actionItem.owner) free strings -- an indirect-injection vector the moment
// a REAL transport is wired (NoopTransport never delivers the digest, so it is inert today).
// Make the quarantine a CODE INVARIANT at the seam, not a producer convention:
//   - eventType is coerced to the CLOSED ThreatEventType vocab (unknown -> OTHER_UNMAPPED);
//   - every other packet string is control-stripped + length-capped before it enters a digest.
function safeEventType(raw: string): string {
  return ThreatEventTypeSchema.safeParse(raw).success ? raw : "OTHER_UNMAPPED";
}
function boundedDigestString(raw: string): string {
  return sanitizeText(raw, 64);
}

// ---------------------------------------------------------------------------
// Phase 5 -- the CODE-OWNED action taxonomy + reversibility classifier.
//
// THE GOVERNANCE MOAT (the one rule this module exists to enforce): whether a
// governed action may auto-fire is decided HERE, in code, keyed on the action
// TYPE -- NEVER on a packet-supplied field. A packet's RecoveryOption carries its
// own `reversibility` / `approvalRequired` for display, but trusting those to gate
// execution would let a mis-stamped (or indirect-injection-shaped) packet auto-send
// an OUTWARD action. Classification is fail-closed: an outward channel is human-
// gated regardless of any payload claim.
//
// Graduated autonomy (three-tier-HITL / EU AI Act Art. 14): REVERSIBLE/internal
// actions are auto-fire ELIGIBLE (still behind the default-OFF config flag at the
// call site); IRREVERSIBLE/OUTWARD actions ALWAYS require explicit human approval.
// ---------------------------------------------------------------------------

// The single source of truth: every governable action type -> its reversibility +
// the transport channel it routes to. RFQ_DISPATCH / ERP_CASE are classified here
// (later phases derive them from a chosen alternate / an n8n case); Phase 5 derives
// the other four from V2 packet content.
const ACTION_TAXONOMY: Record<
  GovernableActionType,
  { reversibility: Reversibility; channel: ActionChannel }
> = {
  // Reversible / internal -- auto-fire eligible.
  ROLE_OWNER_ALERT: { reversibility: "REVERSIBLE", channel: "SLACK" },
  AUDIT_LOG: { reversibility: "REVERSIBLE", channel: "INTERNAL" },
  TICKET_DRAFT: { reversibility: "REVERSIBLE", channel: "TICKET" },
  // Irreversible / outward -- ALWAYS human-gated; never auto-sent.
  SUPPLIER_EMAIL_SEND: { reversibility: "IRREVERSIBLE", channel: "EMAIL" },
  RFQ_DISPATCH: { reversibility: "IRREVERSIBLE", channel: "EMAIL" },
  ERP_CASE: { reversibility: "IRREVERSIBLE", channel: "N8N" }
};

export type ActionClassification = {
  reversibility: Reversibility;
  channel: ActionChannel;
  // Auto-fire is permitted ONLY for reversible actions (and even then only when the
  // call site's config flag is ON). Irreversible/outward => false, always.
  autoFireEligible: boolean;
};

// Pure classifier. Total over the closed GovernableActionType set -- the compiler
// (via the Record above) guarantees every type is mapped, so a new action type
// cannot be added without a deliberate reversibility decision.
export function classifyAction(
  actionType: GovernableActionType
): ActionClassification {
  const entry = ACTION_TAXONOMY[actionType];
  return {
    reversibility: entry.reversibility,
    channel: entry.channel,
    autoFireEligible: entry.reversibility === "REVERSIBLE"
  };
}

// A derived, ready-to-execute governable action. The digest is the SANITIZED,
// model-/transport-safe projection (IDs, enums, numbers only) -- never raw supplier
// or news prose (the Dual-LLM quarantine extends to transports + traces, grill NEW-1).
export type GovernableAction = {
  idempotencyKey: string;
  packetId: string;
  actionType: GovernableActionType;
  channel: ActionChannel;
  reversibility: Reversibility;
  payloadHash: string;
  digest: Record<string, string | number>;
};

type GovernableActionDraft = {
  actionType: GovernableActionType;
  digest: Record<string, string | number>;
};

// SHA-256 hex over a key-sorted canonical JSON, so the content-hash is stable
// regardless of object key order (grill R12: SHA-256-backed audit/content hashing,
// not the weak 32-bit stableHash).
export function sha256Hex(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeys(v)])
    );
  }
  return value;
}

// Map a decision packet -> its governable actions, DETERMINISTICALLY. The
// reversibility/channel of each action is set by the code-owned classifier, NOT by
// any packet field. Same packet content => same actions => same idempotency keys
// (so a re-run/retry dedupes to exactly-once).
export function deriveGovernableActions(
  packet: DecisionPacket
): GovernableAction[] {
  // V1 (LaunchOps legacy) has no ActionOps governed-action contract; the live
  // pipeline emits V2. A legacy V1 packet yields no governed actions.
  if (packet.packetVersion !== 2) {
    return [];
  }

  const drafts: GovernableActionDraft[] = [];

  // AUDIT_LOG is ALWAYS derived -- even a NO_ACTION refusal is logged (reversible).
  drafts.push({
    actionType: "AUDIT_LOG",
    digest: { packetId: packet.id, recommendation: packet.recommendation ?? "ACT" }
  });

  // A NO_ACTION packet withholds ALL outbound action (the schema superRefine
  // invariant), so it derives ONLY the audit log -- no alerts, tickets, or sends.
  if (packet.recommendation === "NO_ACTION") {
    return drafts.map((draft) => finalizeAction(packet.id, draft));
  }

  // ACT packet: alert the role owner (reversible/internal). eventType is the SHORT
  // classified event label, COERCED to the closed vocab so even a mis-classified label
  // cannot ride raw prose into a (future) real transport digest.
  drafts.push({
    actionType: "ROLE_OWNER_ALERT",
    digest: {
      packetId: packet.id,
      eventType: safeEventType(packet.threatCard.eventType),
      severity: packet.threatCard.severity
    }
  });

  // One internal ticket draft per action item (reversible/internal). owner/status are
  // LLM/deterministic-authored strings -> bounded before the digest.
  for (const item of packet.actionItems) {
    drafts.push({
      actionType: "TICKET_DRAFT",
      digest: {
        actionItemId: item.id,
        owner: boundedDigestString(item.owner),
        status: boundedDigestString(item.status)
      }
    });
  }

  // One OUTWARD supplier email per drafted message (IRREVERSIBLE -- never auto-sent).
  // IDs only in the digest; the message body/subject prose stays server-side; the channel
  // string is bounded.
  for (const message of packet.supplierMessages) {
    drafts.push({
      actionType: "SUPPLIER_EMAIL_SEND",
      digest: {
        messageId: message.id,
        supplierId: message.supplierId,
        draftChannel: boundedDigestString(message.channel)
      }
    });
  }

  return drafts.map((draft) => finalizeAction(packet.id, draft));
}

function finalizeAction(
  packetId: string,
  draft: GovernableActionDraft
): GovernableAction {
  const { reversibility, channel } = classifyAction(draft.actionType);
  // The content-hash binds the action to its exact payload (grill R10).
  const payloadHash = sha256Hex({
    actionType: draft.actionType,
    channel,
    ...draft.digest
  });
  // Deterministic per-action key: stable across retries of the SAME logical action
  // (a double-fire dedupes) and DISTINCT per (packet, type, content). Binding the
  // key to payloadHash means a content change yields a NEW key (a different logical
  // action) -- the approved thing must equal the executed thing.
  const idempotencyKey = `EXA:${packetId}:${draft.actionType}:${payloadHash.slice(0, 16)}`;
  return {
    idempotencyKey,
    packetId,
    actionType: draft.actionType,
    channel,
    reversibility,
    payloadHash,
    digest: draft.digest
  };
}
