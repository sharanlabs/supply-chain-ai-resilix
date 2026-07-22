// Pure formatting/derivation helpers for the deck view -- PORTED verbatim from
// components/action-packet-view.tsx (the shipped briefing), not re-invented, so
// the deck binds every figure through the exact logic the packet view proved
// (risk R3: the invariant bindings move with their code). The originals stay in
// place because that file remains the unit-tested V2 view; these copies are the
// deck's private module (the packet view does not export its helpers, and
// action-packet-view.tsx is out of scope for edits this increment).

import type {
  AgentMode,
  AgentRun,
  DecisionPacketV2,
  Recommendation,
  RecoveryOption,
  SkepticGateOutcome
} from "@/lib/schemas";

export type Severity = DecisionPacketV2["threatCard"]["severity"];

// Plain-English label for ONE agent step's run mode in the deliberation trail
// (ported): a recorded replay reads "Recorded", a degraded fallback "Degraded",
// a by-design rules step "Rules", a live model call "Live AI". NEVER the raw
// enum on the glass.
export function agentModeLabel(mode: AgentMode): string {
  switch (mode) {
    case "LIVE_AI":
      return "Live AI";
    case "DETERMINISTIC_RULES":
      return "Rules";
    case "FAILED_TO_FALLBACK":
      return "Degraded";
    case "REPLAY":
    default:
      return "Recorded";
  }
}

// The auditor's hover form (ported) -- carries the raw enum, but NEVER as the
// bare token, so no bare-enum text ever reaches the glass.
export function agentModeTitle(mode: AgentMode): string {
  switch (mode) {
    case "LIVE_AI":
      return "Live AI call (LIVE_AI)";
    case "DETERMINISTIC_RULES":
      return "Deterministic rules (DETERMINISTIC_RULES)";
    case "FAILED_TO_FALLBACK":
      return "Degraded fallback (FAILED_TO_FALLBACK)";
    case "REPLAY":
    default:
      return "Recorded replay (REPLAY)";
  }
}

// The recovery action type in lead-facing words (ported; the raw enum never
// reaches the glass).
export function recoveryActionLabel(actionType: RecoveryOption["actionType"]): string {
  switch (actionType) {
    case "EXPEDITE":
      return "Expedite";
    case "REALLOCATE":
      return "Reallocate";
    case "SUBSTITUTE":
      return "Substitute";
    case "SPLIT_SHIPMENT":
      return "Split shipment";
    case "SUPPLIER_ESCALATION":
      return "Escalate";
    case "LAUNCH_PRIORITIZATION":
      return "Prioritize";
    default:
      return humanizeToken(actionType);
  }
}

// Reversibility -> the GOVERNANCE read (ported). The harder a move is to undo,
// the more it needs a human's sign-off.
export function reversibilityLabel(r: RecoveryOption["reversibility"]): string {
  switch (r) {
    case "HIGH":
      return "Easily reversible";
    case "MEDIUM":
      return "Partly reversible";
    case "LOW":
    default:
      return "Hard to reverse";
  }
}

// The cross-family Skeptic's verdict, distilled to a single on-glass state
// (ported verbatim -- see action-packet-view.tsx for the full rationale).
// Returns null (render nothing) when there is no Skeptic run OR when the only
// run is the deterministic affirmative placeholder: claiming "a second AI
// challenged this" there would overclaim. The held-vs-on-hold read keys off
// the PACKET RECOMMENDATION, never the run's validationStatus.
export type SkepticState = "cleared" | "annotated" | "held-back" | "degraded";

export function skepticChallengeState(
  run: AgentRun | undefined,
  recommendation: Recommendation,
  gateOutcome: SkepticGateOutcome | undefined
): SkepticState | null {
  if (!run) return null;
  const ranLiveCrossFamily = !!run.model && run.model !== "deterministic-rules";
  if (!ranLiveCrossFamily) return null;
  if (run.mode === "FAILED_TO_FALLBACK" || run.validationStatus === "FAIL") {
    return "degraded";
  }
  // ANNOTATED requires recommendation ACT (ported defense-in-depth): the
  // annotated copy says "action proceeds", so a malformed ANNOTATED+NO_ACTION
  // packet must never reach it.
  if (gateOutcome === "ANNOTATED" && recommendation === "ACT") {
    return "annotated";
  }
  return recommendation === "NO_ACTION" ? "held-back" : "cleared";
}

// The single source of truth for a supplier row's risk tier: the leading token of
// the Atlas rationale ("CRITICAL risk tier; 47-day lead time."). The exposureScore
// alone CANNOT recover the tier -- base+lead ranges overlap -- so a score
// threshold would mislabel real packets. (Ported from action-packet-view.tsx.)
export function tierFromRationale(rationale: string): Severity | null {
  const match = /^\s*(LOW|MEDIUM|HIGH|CRITICAL)\b/i.exec(rationale);
  return match ? (match[1].toUpperCase() as Severity) : null;
}

// Plain-English confidence word; the "low" boundary matches the refusal logic's
// ACTION_CONFIDENCE_FLOOR via the caller (see deck-view). (Ported.)
export function confidenceWord(pct: number, floorPct: number) {
  if (pct >= 85) return "high";
  if (pct >= 65) return "moderate";
  if (pct >= floorPct) return "limited";
  return "low";
}

// Defense-in-depth: only http(s) reaches the DOM (Law 11: untrusted external
// data is never trusted at the sink). (Ported.)
export function safeHref(url: string): string {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:" ? url : "#";
  } catch {
    return "#";
  }
}

// Date-only + full ISO datetimes pinned to UTC so a date renders as its true
// calendar date, identically on server and client (no hydration drift). (Ported.)
export function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
}

// Pinned to UTC so the compiled-at time is identical on server and client (no
// hydration drift); the packet timestamps are already UTC ISO strings. (Ported.)
export function shortTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC"
  });
}

// Plain-English audit labels (ported), so the provenance log reads "Approved" /
// "Served from recorded data", not the raw enum a non-technical reviewer would
// have to decode. The enum stays the stored value; this is presentation only.
// Any unmapped action degrades to a title-cased form of its code, never a blank.
export function auditActionLabel(action: string): string {
  switch (action) {
    case "HUMAN_APPROVAL":
      return "Approved";
    case "HUMAN_REJECTION":
      return "Returned for revision";
    case "REPLAY_SERVED":
      return "Served from recorded data";
    case "N8N_APPROVAL_CALLBACK":
      return "Approval confirmed";
    case "SCENARIO_RUN":
    case "PIPELINE_RUN":
      return "Plan compiled";
    default:
      return action
        .toLowerCase()
        .split(/[_\s]+/)
        .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
        .join(" ");
  }
}

// "procurement-reviewer" -> "Procurement reviewer". (Ported.)
export function auditActorLabel(actor: string): string {
  const spaced = actor.replace(/[-_]/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : actor;
}

// The deck's compact "26 JUN" stamp/rocard form -- same UTC pin as shortDate.
export function stampDate(iso: string) {
  return new Date(iso)
    .toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" })
    .toUpperCase()
    .split(" ")
    .reverse()
    .join(" ");
}

export function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// A claim's machine sourcePath -> plain-English provenance phrase. (Ported.)
export function humanSource(sourcePath: string): string {
  const root = sourcePath.split(/[.[]/, 1)[0];
  switch (root) {
    case "exposureResults":
      return "from this supplier's exposure result";
    case "simulation":
      return "from the runway simulation";
    case "threatCard":
      return "from the threat assessment";
    case "publicSignals":
      return "from a recorded source signal";
    default:
      return "from the underlying data";
  }
}

// "TEXTILES_APPAREL" -> "Textiles Apparel": raw enum tokens never reach the
// glass as CONSTANTS. (Ported.)
export function humanizeToken(token: string): string {
  return token
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}
