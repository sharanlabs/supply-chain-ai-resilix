"use client";

import { useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { ACTION_CONFIDENCE_FLOOR } from "@/lib/agents/actionops/recommendation";
import { HttpUrlSchema } from "@/lib/schemas";
import type {
  AuditTrailEntry,
  DecisionPacketV2,
  MissingEvidence,
  PublicSignal,
  SupplierMessageDraft
} from "@/lib/schemas";
import { daysBetween, formatCurrency } from "@/lib/utils";
import {
  agentModeLabel,
  agentModeTitle,
  auditActionLabel,
  auditActorLabel,
  confidenceWord,
  hostname,
  humanSource,
  humanizeToken,
  recoveryActionLabel,
  reversibilityLabel,
  safeHref,
  shortDate,
  shortTime,
  skepticChallengeState,
  stampDate,
  tierFromRationale,
  type SkepticState
} from "@/components/deck/deck-format";
import {
  useActiveSection,
  useCountUpOnView,
  useReveal,
  useScrollProgress
} from "@/components/deck/deck-motion";

// ---------------------------------------------------------------------------
// THE DECK -- the Phase-2 `/` surface (spec of record:
// samples/2026/arc/08-deck.src.html, owner-picked 2026-07-21). Six premium
// cards on pure white that pin and stack on scroll:
//
//   hero  -- packet-derived headline + four count-up stat cards + scroll cue
//   c1    -- What we saw      (the recorded public signals, as feed rows)
//   c2    -- What it means    (the big confidence figure + the threat read)
//   c3    -- Who it touches   (every exposed supplier, scored, no-backup in red)
//   c4    -- Time we have     (survival days + the day scale + product runouts)
//   c5    -- What we recommend(the Act/Hold verdict + role playbooks / refusal)
//   c6    -- Your call        (the drafted letters, the wet stamp, the gate)
//   coda  -- trust chips
//
// NOTHING on the glass that the packet carries is hardcoded: every figure
// derives from the same DecisionPacketV2 the route already serves. Narrative
// copy is templated business-plain English; the FIGURES interpolate. The
// behavioral invariants (gatekeeper-gated approve simulation, claims
// provenance, recorded/synthetic honesty, the NO_ACTION refusal) are PORTED
// from components/action-packet-view.tsx -- moved, never re-invented (risk R3).
// ---------------------------------------------------------------------------

type Packet = DecisionPacketV2;

// The dot rail's section roster -- ids must match the sections below.
const DOT_SECTIONS = [
  { id: "dk-hero", label: "Top" },
  { id: "dk-c1", label: "Card 1 -- what we saw" },
  { id: "dk-c2", label: "Card 2 -- what it means" },
  { id: "dk-c3", label: "Card 3 -- who it touches" },
  { id: "dk-c4", label: "Card 4 -- time we have" },
  { id: "dk-c5", label: "Card 5 -- what we recommend" },
  { id: "dk-c6", label: "Card 6 -- your call" }
];

// A count-up figure (the sample's [data-count] mechanism): renders the FINAL
// value on the server and under reduced motion; eases up from 0 only when the
// element scrolls into view with motion allowed.
function DeckCount({
  target,
  prefix = "",
  suffix = "",
  durationMs = 1150,
  threshold = 0.14,
  easePow = 4
}: {
  target: number;
  prefix?: string;
  suffix?: string;
  durationMs?: number;
  threshold?: number;
  // The sample uses quartic easing for the general count-ups and CUBIC for the
  // runway numeral -- the power rides through to the shared hook.
  easePow?: number;
}) {
  const { value, elRef } = useCountUpOnView(target, durationMs, threshold, easePow);
  return (
    <span ref={elRef as React.RefObject<HTMLSpanElement>}>
      {prefix}
      {value.toLocaleString("en-US")}
      {suffix}
    </span>
  );
}

// The wet stamp (sample .wstamp) -- HELD until the packet-level approve flips
// every letter to RELEASED (the thunk animation lives in CSS, reduced-motion
// honored). The center text is packet-derived: a short plan tag while held,
// the decision date once released. Each stamp needs a unique textPath id.
function WetStamp({
  uid,
  status,
  heldMid,
  releasedMid
}: {
  uid: string;
  status: Packet["approvalStatus"];
  heldMid: string;
  releasedMid: string;
}) {
  const pathId = `dk-stamp-${uid}`;
  const ring =
    status === "APPROVED"
      ? "RELEASED · SIGNED OUT · "
      : status === "REJECTED"
        ? "HELD · RETURNED TO QUEUE · "
        : "HELD · APPROVAL REQUIRED · ";
  return (
    <svg className="dk-wstamp" viewBox="0 0 96 96" aria-hidden="true">
      <circle className="ring" cx="48" cy="48" r="43" />
      <circle className="ring" cx="48" cy="48" r="31" style={{ strokeWidth: 1.2 }} />
      <defs>
        <path
          id={pathId}
          d="M48,48 m-37,0 a37,37 0 1,1 74,0 a37,37 0 1,1 -74,0"
        />
      </defs>
      <text>
        <textPath href={`#${pathId}`}>{ring}</textPath>
      </text>
      <text className="mid" x="48" y="52" textAnchor="middle">
        {status === "APPROVED" ? releasedMid : heldMid}
      </text>
    </svg>
  );
}

// One drafted letter (card 6): the stamp, the addressee, the full draft body,
// and the claims/provenance trace -- the shipped grounding surface (value +
// plain-English provenance + the exact machine sourcePath behind a
// disclosure), ported from the packet view's draft cards.
function LetterCard({
  message,
  index,
  total,
  supplierName,
  approvalStatus,
  heldMid,
  releasedMid
}: {
  message: SupplierMessageDraft;
  index: number;
  total: number;
  supplierName: string;
  approvalStatus: Packet["approvalStatus"];
  heldMid: string;
  releasedMid: string;
}) {
  return (
    <div className={`dk-lcard${approvalStatus === "APPROVED" ? " released" : ""}`}>
      <WetStamp
        uid={message.id}
        status={approvalStatus}
        heldMid={heldMid}
        releasedMid={releasedMid}
      />
      <div className="dk-lto">
        <span>
          To {supplierName}
          {/* The draft's transport channel (ported operational field). */}
          {message.channel ? <> · {message.channel}</> : null}
        </span>
        <span>
          Draft {index + 1} of {total}
          {message.approvalRequired ? " · not sent" : null}
        </span>
      </div>
      {message.subject ? <h3>{message.subject}</h3> : null}
      <p className="dk-lbody">{message.body}</p>
      {message.claims.length > 0 ? (
        <ul className="dk-claims">
          {message.claims.map((claim, claimIndex) => (
            <li key={`${message.id}-claim-${claimIndex}`}>
              <span className="c-val">
                {String(claim.value)} {claim.unit}
              </span>{" "}
              {humanSource(claim.sourcePath)}
              {/* The exact machine trace -- kept for an auditor, tucked behind
                  a disclosure so the default glass shows only the plain-English
                  provenance, never a dotted code path. (Ported.) */}
              <details>
                <summary>
                  Source detail
                  <span className="sr-only"> for this figure</span>
                </summary>
                <span className="c-path">{claim.sourcePath}</span>
              </details>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// The cross-family Skeptic's verdict as ONE calm trust line (ported verbatim
// from action-packet-view.tsx -- the four honest states; only "cleared" reads
// in the accent seal). Renders ONLY when a genuine cross-family challenge ran:
// the homepage replay fixture predates the Skeptic, so graceful ABSENCE is the
// pinned behavior, never a fabricated second opinion.
function SkepticTrustLine({ state }: { state: SkepticState }) {
  const cleared = state === "cleared";
  return (
    <div className={`dk-skeptic${cleared ? " cleared" : ""}`}>
      <i>Second opinion</i>
      <p>
        {state === "cleared" ? (
          <>
            An independent reviewer — a different AI model — challenged this finding,
            and it held.
          </>
        ) : state === "annotated" ? (
          // The critic OBJECTED but the finding was independently strong; honest,
          // calm-neutral: name the caution AND that action proceeds. (Ported.)
          <>
            An independent reviewer — a different AI model — raised a caution about
            this finding; outbound action proceeds on its independent corroboration
            and confidence, and still requires your approval before anything is sent.
          </>
        ) : state === "held-back" ? (
          // Neutral by design (ported): never claims the Skeptic was the holder.
          <>
            An independent reviewer — a different AI model — reviewed this finding;
            outbound action is on hold (see the recommendation for why).
          </>
        ) : (
          <>
            An independent review was attempted but could not complete, so outbound
            action is held as a precaution.
          </>
        )}
      </p>
    </div>
  );
}

// The feed-row severity dot: HIGH/CRITICAL carry weight (filled red), MEDIUM
// is a neutral fill, LOW an outline -- severity-only saturation.
function feedDotClass(severity: PublicSignal["severity"]): string {
  if (severity === "HIGH" || severity === "CRITICAL") return "dk-fdot high";
  if (severity === "MEDIUM") return "dk-fdot mid";
  return "dk-fdot low";
}

function signalStatusWord(status: PublicSignal["status"]): string {
  if (status === "LIVE") return "live";
  if (status === "FAILED") return "failed";
  return "recorded";
}

export function DeckView({ packet }: { packet: Packet }) {
  // --- The approve/reject simulation, PORTED from action-packet-view.tsx ----
  // Optimistic local state: on this recorded demo the decision is a LOCAL
  // SIMULATION (nothing persists, nothing dispatches); the audit line appends
  // client-side with the same wording the shipped view records.
  const [approval, setApproval] = useState<{
    status: Packet["approvalStatus"];
    extraAudit: AuditTrailEntry[];
  }>({ status: packet.approvalStatus, extraAudit: [] });

  const { threatCard, simulation, gatekeeper } = packet;
  const degraded = packet.effectiveMode === "FAILED_TO_FALLBACK";
  const recommendation = packet.recommendation ?? "ACT";
  const isNoAction = recommendation === "NO_ACTION";
  const missingEvidence: MissingEvidence[] = packet.missingEvidence ?? [];

  // --- Packet derivations (each figure on the glass starts here) ------------
  const confidencePct = Math.round(threatCard.confidence * 100);

  const honesty = useMemo(() => {
    const live = packet.publicSignals.filter((s) => s.status === "LIVE").length;
    const cached = packet.publicSignals.filter((s) => s.status === "CACHED").length;
    return { live, cached, total: packet.publicSignals.length };
  }, [packet.publicSignals]);

  const capturedAt = packet.publicSignals.find((s) => s.status === "CACHED")?.fetchedAt;

  // WCAG 2.2 SC 4.1.3: the always-mounted live region announces a runtime mode
  // change without moving focus. (Ported.)
  const modeAnnouncement = degraded
    ? "The live data feed is down. This plan is running on recorded data; every figure still traces to a recorded source."
    : honesty.live === 0 && honesty.cached > 0
      ? "Signals are recorded (cached), not live."
      : "";

  // Evidence URLs validated at the render boundary with the SAME schema the
  // signal pipeline uses; the "traces to a named source" line derives from the
  // real result. (Ported.)
  const allowedEvidenceUrls = useMemo(
    () => threatCard.evidenceUrls.filter((url) => HttpUrlSchema.safeParse(url).success),
    [threatCard.evidenceUrls]
  );
  const evidenceAllowlistPassed =
    allowedEvidenceUrls.length === threatCard.evidenceUrls.length;

  // Exposure: every supplier, ranked by score (sort a copy, never the packet).
  const rankedSuppliers = useMemo(
    () => [...packet.exposureResults].sort((a, b) => b.exposureScore - a.exposureScore),
    [packet.exposureResults]
  );

  const supplierNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of packet.exposureResults) map.set(r.supplierId, r.supplierName);
    return map;
  }, [packet.exposureResults]);

  // P1 sourcing read (ported): single-source count is only asserted when the
  // rows actually carry the field -- an older fixture never gets a backup claim
  // it cannot prove.
  const sourcing = useMemo(() => {
    const rows = packet.exposureResults;
    const hasData = rows.some((r) => r.singleSource !== undefined);
    const noBackup = rows.filter((r) => r.singleSource === true).length;
    return { hasData, noBackup, total: rows.length };
  }, [packet.exposureResults]);

  const survivalDays = simulation?.survivalDays ?? null;

  // The cross-family Skeptic run, if one is present (ported): DATA-DRIVEN --
  // the homepage replay fixture predates the Skeptic (6 runs), so absent =>
  // no trust line, no BLUF chip, no crash.
  const skepticRun = useMemo(
    () => packet.agentRuns.find((r) => r.agentName === "Skeptic"),
    [packet.agentRuns]
  );
  const skepticState = skepticChallengeState(
    skepticRun,
    recommendation,
    packet.skepticGateOutcome
  );

  // The scored recovery options, ranked by score highest first (ported; sort a
  // copy, never the packet array). Withheld entirely on NO_ACTION.
  const rankedOptions = useMemo(
    () => [...(packet.recoveryOptions ?? [])].sort((a, b) => b.score - a.score),
    [packet.recoveryOptions]
  );

  // P1 survival read (ported): days of cover before the first stockout (TTS)
  // vs the worst exposed lane's time-to-restore (max recoveryDays). Null
  // unless both exist, so older fixtures render nothing.
  const survival = useMemo(() => {
    if (!simulation || simulation.survivalDays == null) return null;
    const recoveries = packet.exposureResults
      .map((r) => r.recoveryDays)
      .filter((d): d is number => d != null);
    if (recoveries.length === 0) return null;
    const tts = simulation.survivalDays;
    const worstTtr = Math.max(...recoveries);
    const scale = Math.max(tts, worstTtr, 1);
    return { tts, worstTtr, scale, gap: worstTtr - tts };
  }, [simulation, packet.exposureResults]);

  // Peak revenue at risk + the first horizon that reaches it (the plateau
  // honesty read, ported: equal later bars are saturation, not a bug).
  const peakRisk = useMemo(() => {
    if (!simulation || simulation.horizons.length === 0) return null;
    return Math.max(...simulation.horizons.map((h) => h.revenueAtRiskUsd));
  }, [simulation]);

  const peakDay = useMemo(() => {
    if (!simulation || peakRisk === null || peakRisk === 0) return null;
    const first = simulation.horizons.find((h) => h.revenueAtRiskUsd >= peakRisk);
    return first ? first.days : null;
  }, [simulation, peakRisk]);

  const plateau = useMemo(() => {
    if (!simulation || simulation.horizons.length < 2 || peakRisk === null) return null;
    const firstPeakIndex = simulation.horizons.findIndex(
      (h) => h.revenueAtRiskUsd >= peakRisk
    );
    const saturates = firstPeakIndex < simulation.horizons.length - 1;
    return saturates ? { day: simulation.horizons[firstPeakIndex].days } : null;
  }, [simulation, peakRisk]);

  const sortedRunouts = useMemo(() => {
    if (!simulation) return [];
    return [...simulation.productRunouts].sort((a, b) =>
      a.runoutDate.localeCompare(b.runoutDate)
    );
  }, [simulation]);

  const earliestRunout = sortedRunouts[0]?.runoutDate ?? null;

  // True while no revenue is at risk inside the covered window -- gates the
  // "nothing is lost yet / $0 while stock covers demand" copy so it can never
  // claim coverage a packet's horizons contradict.
  const coveredNow = useMemo(() => {
    if (!simulation || survivalDays === null) return false;
    return simulation.horizons
      .filter((h) => h.days <= survivalDays)
      .every((h) => h.revenueAtRiskUsd === 0);
  }, [simulation, survivalDays]);

  const where =
    threatCard.location.chokepoint ??
    threatCard.location.region ??
    threatCard.location.country ??
    "the supply route";

  // The hero headline, templated business-plain with the packet's own nouns
  // and figures: the chokepoint register reads as the sample does; any other
  // event type gets the honest generic form.
  const headlinePart1 =
    threatCard.eventType === "CHOKEPOINT_CLOSURE" && threatCard.location.chokepoint
      ? `The ${threatCard.location.chokepoint} is closing`
      : `Disruption at ${where}`;
  const headlinePart2 =
    survivalDays !== null ? `You have ${survivalDays} days` : "The clock is running";

  // The signals that carry weight (HIGH/CRITICAL) vs context rows -- drives
  // the card-1 rule note honestly from the data.
  const strongSignals = packet.publicSignals.filter(
    (s) => s.severity === "HIGH" || s.severity === "CRITICAL"
  ).length;

  // Stamp center text: a short plan tag while held, the decision date once
  // released -- both packet-derived (never a hardcoded RX code).
  const heldMid = packet.id.replace(/^DP-/, "").slice(0, 7).toUpperCase();
  const releasedMid = stampDate(packet.createdAt);

  // --- The human-approval invariant, PORTED verbatim ------------------------
  // A packet may only be approved while PENDING *and* the gatekeeper cleared
  // it for human review; a NO_ACTION packet has nothing to approve. Both the
  // control and the handler are gated, so the gate can never be bypassed.
  const canApprove =
    !isNoAction &&
    approval.status === "PENDING" &&
    gatekeeper.approvedForHumanReview === true;

  const approveBlockedReason = isNoAction
    ? "No outbound action to approve -- the disruption must be confirmed first."
    : approval.status !== "PENDING"
      ? null // already decided -- the logged line communicates this
      : gatekeeper.approvedForHumanReview
        ? null
        : gatekeeper.status === "BLOCKED"
          ? "Automatic checks blocked this plan -- resolve the failures above before approval."
          : "Automatic checks have not cleared this plan for review.";

  function decide(status: "APPROVED" | "REJECTED") {
    // Hard guard (ported): the invariant holds even if the control were
    // somehow triggered while blocked.
    if (status === "APPROVED" && !canApprove) return;
    setApproval((prev) => ({
      status,
      extraAudit: [
        ...prev.extraAudit,
        {
          at: new Date().toISOString(),
          actor: "procurement-reviewer",
          action: status === "APPROVED" ? "HUMAN_APPROVAL" : "HUMAN_REJECTION",
          detail:
            status === "APPROVED"
              ? "Plan approved (replay simulation — not persisted). Drafts remain unsent until a person dispatches them."
              : "Plan returned (replay simulation — not persisted); no drafts dispatched."
        }
      ]
    }));
  }

  const latestAudit = approval.extraAudit[approval.extraAudit.length - 1];

  // The FULL provenance log (ported): every packet audit entry merged with the
  // local simulated decision, in append order (oldest first) -- the coda's
  // "Logged — every step recorded" chip points at this, so it must be true on
  // the glass, not just the latest local line.
  const auditTrail = [...packet.auditTrail, ...approval.extraAudit];

  // --- Motion roots ---------------------------------------------------------
  const revealRoot = useReveal<HTMLDivElement>();
  const progressBar = useScrollProgress<HTMLDivElement>();
  const activeSection = useActiveSection(DOT_SECTIONS.map((s) => s.id));

  // The day scale (card 4): positions are day/maxDay percentages; endpoint
  // labels clamp so nothing overhangs the track.
  const maxDay = useMemo(() => {
    if (!simulation) return null;
    const horizonMax = Math.max(...simulation.horizons.map((h) => h.days), 0);
    return Math.max(horizonMax, survivalDays ?? 0) || null;
  }, [simulation, survivalDays]);

  const pctOf = (day: number) => (maxDay ? (day / maxDay) * 100 : 0);
  const labelTransform = (pct: number) =>
    pct <= 2 ? "none" : pct >= 98 ? "translateX(-100%)" : undefined;

  // $ callouts on the scale: the first horizon at each distinct non-zero
  // (revenue, margin) TUPLE. Deduping on the pair -- not revenue alone -- so a
  // later horizon with equal revenue but a DIFFERENT margin still gets its own
  // callout; identical tuples are deliberately not repeated on the scale (the
  // plateau note names the hold instead of printing the same figures twice).
  const dollarCallouts = useMemo(() => {
    if (!simulation) return [];
    const seen = new Set<string>();
    return simulation.horizons.filter((h) => {
      const key = `${h.revenueAtRiskUsd}|${h.marginAtRiskUsd ?? ""}`;
      if (h.revenueAtRiskUsd <= 0 || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [simulation]);

  // The scale's accessible summary, built from the same data the ticks render.
  const scaleAria = useMemo(() => {
    if (!simulation || maxDay === null) return undefined;
    const parts = [`Day 0 to ${maxDay}.`];
    if (survivalDays !== null) parts.push(`Stock out day ${survivalDays}.`);
    for (const h of dollarCallouts) {
      parts.push(`${formatCurrency(h.revenueAtRiskUsd)} at risk by day ${h.days}.`);
    }
    return parts.join(" ");
  }, [simulation, maxDay, survivalDays, dollarCallouts]);

  return (
    // data-testid carries the packet-surface contract the e2e suite pins
    // (deliberation.spec.ts scopes every behavioral assertion to it).
    <div className="dk-root" ref={revealRoot} data-testid="actionops-packet">
      {/* SC 4.1.3 live region (ported) -- announces recorded/degraded mode. */}
      <div role="status" aria-live="polite" className="sr-only" data-testid="mode-status">
        {modeAnnouncement}
      </div>

      {/* Scroll progress thread + the card index dot rail (sample chrome). */}
      <div className="dk-prg" ref={progressBar} aria-hidden="true" />
      <nav className="dk-dots" aria-label="Cards">
        {DOT_SECTIONS.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            aria-label={section.label}
            className={activeSection === section.id ? "dk-on" : undefined}
          />
        ))}
      </nav>

      {/* ============ HERO ============ */}
      <section className="dk-hero" id="dk-hero">
        <p className="dk-kick dk-rv">The morning brief nobody wants</p>
        <h1 className="dk-rv dk-d1">
          {headlinePart1}
          <span className="dk-b">.</span> {headlinePart2}
          <span className="dk-b">.</span>
        </h1>
        <p className="dk-standfirst dk-rv dk-d2">
          One crisis, followed from the first public signal to a drafted action that{" "}
          <b>no machine is allowed to send</b>. Six cards. Every number links back to
          where it came from — and the last word is yours.
        </p>
        {/* The stat row IS the BLUF (S-D.2, ported contract): verdict first,
            the load-bearing figures beside it, and the anchor to the ONE
            approve door -- card 6's decision rail (#approve-h). Never a
            second approval control, only the path to the audited one. */}
        <div className="dk-statrow dk-rv dk-d3" data-testid="bluf-bar">
          <div className="dk-stat">
            <div className="k">The call</div>
            <div className={`v${isNoAction ? "" : " act"}`}>
              {isNoAction ? "Hold" : "Act"}
            </div>
            {!isNoAction ? (
              <a className="dk-cta" href="#approve-h">
                Review &amp; approve
                <span aria-hidden="true">↓</span>
              </a>
            ) : null}
          </div>
          <div className="dk-stat">
            <div className="k">Confidence</div>
            <div className="v">
              <DeckCount target={confidencePct} suffix="%" />
            </div>
          </div>
          <div className="dk-stat">
            <div className="k">Suppliers exposed</div>
            <div className="v">
              {sourcing.total}
              {sourcing.hasData && sourcing.noBackup > 0 ? (
                <span className="dk-r"> · {sourcing.noBackup} no backup</span>
              ) : null}
            </div>
          </div>
          {survivalDays !== null ? (
            <div className="dk-stat">
              <div className="k">Stock covers</div>
              <div className="v">{survivalDays} days</div>
            </div>
          ) : null}
          {peakRisk !== null && peakRisk > 0 && peakDay !== null ? (
            <div className="dk-stat">
              <div className="k">At risk by day {peakDay}</div>
              <div className="v red">
                <DeckCount target={peakRisk} prefix="$" />
              </div>
            </div>
          ) : null}
          {/* The 2nd-AI chip (ported): ONLY when a genuine cross-family
              Skeptic ran -- gracefully absent on the pre-Skeptic fixture. */}
          {skepticState === "cleared" || skepticState === "annotated" ? (
            <div className="dk-stat">
              <div className="k">Second opinion</div>
              <div
                className="v"
                title={
                  skepticState === "cleared"
                    ? "A second AI from a different company challenged this finding and accepted it"
                    : "The second AI raised a caution; action proceeds on the finding's independent corroboration and needs your approval"
                }
              >
                2nd AI {skepticState === "cleared" ? "agreed" : "cautioned"}
              </div>
            </div>
          ) : null}
        </div>
        <div className="dk-scrollcue dk-rv dk-d3">
          <span className="ln" aria-hidden="true" />
          Scroll — the deck stacks as you go
        </div>
      </section>

      <div className="dk-deck">
        {/* CARD 1 -- what we saw */}
        <div className="dk-slot" id="dk-c1">
          <article className="dk-card dk-rv" aria-label="What we saw">
            <div className="dk-chead">
              <span className="dk-ckick">What we saw</span>
              <span className="dk-cn">Card 01 / 06</span>
            </div>
            <h2>
              {honesty.total} public feeds<span className="dk-b">.</span> One pattern
              <span className="dk-b">.</span>
            </h2>
            <p className="dk-dek">
              RESILIX watches public sources: no privileged intelligence, nothing you
              cannot check yourself.
              {capturedAt ? (
                <> On {shortDate(capturedAt)}, the feeds line up.</>
              ) : (
                <> The feeds line up.</>
              )}
            </p>
            <div className="dk-feedlist">
              {packet.publicSignals.map((signal) => (
                <div className="dk-feedcard" key={signal.id}>
                  <span className={feedDotClass(signal.severity)} aria-hidden="true" />
                  <div className="dk-fwho">
                    <b>{signal.source}</b>
                    <span>
                      {humanizeToken(signal.eventType)} ·{" "}
                      {signal.severity.toLowerCase()}
                    </span>
                  </div>
                  <div className="dk-fwhat">{signal.summary}</div>
                  <div className="dk-fsrc">
                    {signalStatusWord(signal.status)} · {shortDate(signal.fetchedAt)}
                    {signal.freshnessMinutes > 0 ? (
                      <> · {signal.freshnessMinutes} min old</>
                    ) : null}
                    <br />
                    <a
                      href={safeHref(signal.sourceUrl)}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Source: {hostname(signal.sourceUrl)}
                    </a>
                  </div>
                </div>
              ))}
            </div>
            <p className="dk-rulenote">
              <b>
                {strongSignals} of {honesty.total}
              </b>{" "}
              carry weight
              {honesty.live === 0 ? (
                <>
                  ; all are recorded signals, replayed honestly — nothing here
                  pretends to be live.
                </>
              ) : (
                <>; every row links to where it came from.</>
              )}
            </p>
          </article>
        </div>

        {/* CARD 2 -- what it means */}
        <div className="dk-slot" id="dk-c2">
          <article className="dk-card dk-rv" aria-label="What it means">
            <div className="dk-chead">
              <span className="dk-ckick">What it means</span>
              <span className="dk-cn">Card 02 / 06</span>
            </div>
            <div className="dk-confrow">
              <div className="dk-confbig">
                <DeckCount target={confidencePct} />
                <sup>%</sup>
                <small>Confidence, on the evidence in card 01</small>
              </div>
              <div className="dk-confside">
                <p>{threatCard.summary}</p>
                {/* The confidence sentence, ported: the number supports the
                    prose, and the replay honesty is stated with it. */}
                <p className="tnum">
                  We hold{" "}
                  <b>
                    {confidenceWord(confidencePct, ACTION_CONFIDENCE_FLOOR * 100)}{" "}
                    confidence
                  </b>{" "}
                  in this read ({confidencePct}%), drawn from{" "}
                  {honesty.cached + honesty.live} sources
                  {capturedAt ? <> captured {shortDate(capturedAt)}</> : null}.{" "}
                  {honesty.live > 0
                    ? `${honesty.live} live, ${honesty.cached} recorded.`
                    : "Recorded replay — no live AI is claimed."}
                </p>
                <span className="dk-pill">
                  {threatCard.severity === "HIGH" ||
                  threatCard.severity === "CRITICAL" ? (
                    <i aria-hidden="true" />
                  ) : null}
                  Severity {threatCard.severity.toLowerCase()} ·{" "}
                  {humanizeToken(threatCard.eventType)}
                </span>
              </div>
            </div>
            {/* The cross-family Skeptic verdict -- ONLY when a genuine
                challenge ran (graceful absence on the pre-Skeptic fixture). */}
            {skepticState ? <SkepticTrustLine state={skepticState} /> : null}
            <p className="dk-rulenote">
              <b>Every figure in this plan traces back to a named source.</b>
              {!evidenceAllowlistPassed ? (
                <>
                  {" "}
                  {allowedEvidenceUrls.length} of {threatCard.evidenceUrls.length}{" "}
                  source links cleared the safety check.
                </>
              ) : null}
            </p>
            {allowedEvidenceUrls.length > 0 ? (
              <ul className="dk-evidence">
                {allowedEvidenceUrls.map((url) => (
                  <li key={url}>
                    <a href={safeHref(url)} target="_blank" rel="noreferrer noopener">
                      {hostname(url)}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        </div>

        {/* CARD 3 -- who it touches */}
        <div className="dk-slot" id="dk-c3">
          <article className="dk-card dk-rv" aria-label="Who it touches">
            <div className="dk-chead">
              <span className="dk-ckick">Who it touches</span>
              <span className="dk-cn">Card 03 / 06</span>
            </div>
            <h2>
              {sourcing.total} suppliers stand in that lane
              <span className="dk-b">.</span>
            </h2>
            <p className="dk-dek">
              A world event becomes a company problem only through your suppliers. The
              score is exposure out of 100
              {sourcing.hasData ? (
                sourcing.noBackup > 0 ? (
                  <>
                    {" "}
                    —{" "}
                    <b>
                      the {sourcing.noBackup} in red have no second source to turn to
                    </b>
                    .
                  </>
                ) : (
                  <> — every one has a qualified backup on file.</>
                )
              ) : (
                <>.</>
              )}
            </p>
            {/* The context EVERY exposed supplier shares, stated once (ported):
                the sourcing clause is DATA-DRIVEN off the P1 singleSource field;
                an older fixture without it falls back to the lead-time note, so
                the note never asserts a backup claim it cannot prove. */}
            {rankedSuppliers.length > 0 ? (
              <p className="dk-subnote">
                {sourcing.hasData ? (
                  sourcing.noBackup === 0 ? (
                    <>
                      All {sourcing.total} sit on lanes routed through the affected
                      chokepoint, each with a qualified backup on file. Per card:
                      sourcing and the estimated time to restore.
                    </>
                  ) : sourcing.noBackup === sourcing.total ? (
                    <>
                      All {sourcing.total} sit on lanes routed through the affected
                      chokepoint, none with a qualified backup on file. Per card:
                      sourcing and the estimated time to restore.
                    </>
                  ) : (
                    <>
                      All {sourcing.total} sit on lanes routed through the affected
                      chokepoint; {sourcing.noBackup} of them are single-source with
                      no qualified backup. Per card: sourcing and the estimated time
                      to restore.
                    </>
                  )
                ) : (
                  <>
                    All {sourcing.total} sit on lanes routed through the affected
                    chokepoint. Per card: the risk tier and the standard lead time.
                  </>
                )}
              </p>
            ) : null}
            {rankedSuppliers.length === 0 ? (
              <p className="dk-rulenote">No direct exposure for this event.</p>
            ) : (
              <div className="dk-supgrid">
                {rankedSuppliers.map((result) => {
                  const noBackup = result.singleSource === true;
                  const tier = tierFromRationale(result.rationale);
                  return (
                    <div
                      className={`dk-sup${noBackup ? " nb" : ""}`}
                      key={result.id}
                    >
                      <div className="s-score">{result.exposureScore}</div>
                      <div className="s-track">
                        <div
                          className="s-fill"
                          style={
                            {
                              "--w": `${Math.min(100, Math.max(0, result.exposureScore))}%`
                            } as React.CSSProperties
                          }
                        />
                      </div>
                      <div className="s-name">{result.supplierName}</div>
                      <div className="s-geo">
                        {result.country} · {humanizeToken(result.sector)}
                      </div>
                      {/* The Atlas rationale, verbatim (ported): WHY this score
                          -- tier, lead time, sourcing -- as a quiet caption, so
                          the card never shows a number without its reason. */}
                      <div className="s-why">{result.rationale}</div>
                      <span className="s-tag">
                        {result.singleSource === undefined
                          ? tier
                            ? `${humanizeToken(tier)} risk`
                            : "Exposed"
                          : noBackup
                            ? "No backup"
                            : "Backup on file"}
                      </span>
                      {/* P1 TTR (ported wording): the disruption-aware restore
                          estimate, distinct from the standard lead time. */}
                      {result.recoveryDays !== undefined ? (
                        <div className="s-rec">
                          Est. time to restore ~{result.recoveryDays} days
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </article>
        </div>

        {/* CARD 4 -- time we have */}
        <div className="dk-slot" id="dk-c4">
          <article className="dk-card dk-rv" aria-label="Time we have">
            <div className="dk-chead">
              <span className="dk-ckick">Time we have</span>
              <span className="dk-cn">Card 04 / 06</span>
            </div>
            {coveredNow && survivalDays !== null ? (
              <h2>
                Nothing is lost yet<span className="dk-b">.</span> Day {survivalDays}{" "}
                changes that<span className="dk-r">.</span>
              </h2>
            ) : (
              <h2>
                How fast it bites<span className="dk-b">.</span>
              </h2>
            )}
            {simulation && maxDay !== null ? (
              <>
                <div className="dk-runrow">
                  {survivalDays !== null ? (
                    <div className="dk-runbig">
                      {/* The runway numeral uses the sample's CUBIC ease
                          (1-(1-k)^3, 900ms) -- distinct from the quartic
                          general count-ups. */}
                      <DeckCount
                        target={survivalDays}
                        durationMs={900}
                        threshold={0.35}
                        easePow={3}
                      />
                      <small>Days of stock remaining</small>
                    </div>
                  ) : null}
                  <div className="dk-runside">
                    <div className="dk-scale" role="img" aria-label={scaleAria}>
                      {survivalDays !== null ? (
                        <div
                          className="zone"
                          style={{ left: `${pctOf(survivalDays)}%` }}
                        />
                      ) : null}
                      <div className="track" />
                      <span className="dk-tick big" style={{ left: 0 }} />
                      <span className="dk-slab" style={{ left: 0, transform: "none" }}>
                        Day 0 · today
                      </span>
                      {survivalDays !== null && survivalDays > 0 ? (
                        <>
                          <span
                            className="dk-tick big red"
                            style={{ left: `${pctOf(survivalDays)}%` }}
                          />
                          <span
                            className="dk-slab"
                            style={{
                              left: `${pctOf(survivalDays)}%`,
                              transform: labelTransform(pctOf(survivalDays))
                            }}
                          >
                            Day {survivalDays} · stock out
                          </span>
                        </>
                      ) : null}
                      {simulation.horizons.map((h) => {
                        const pct = pctOf(h.days);
                        // The stockout tick already owns this position.
                        if (survivalDays !== null && h.days === survivalDays) {
                          return null;
                        }
                        // Ticks too close to the endpoints -- or to the
                        // stockout label -- keep the mark but drop the label,
                        // so day labels never collide on a tight scale.
                        const nearStockout =
                          survivalDays !== null &&
                          Math.abs(pct - pctOf(survivalDays)) < 9;
                        const labelled = (pct > 10 || pct >= 98) && !nearStockout;
                        return (
                          <span key={`tick-${h.days}`}>
                            <span
                              className={`dk-tick${pct >= 98 ? " big" : ""}`}
                              style={{ left: `${pct}%` }}
                            />
                            {labelled ? (
                              <span
                                className="dk-slab"
                                style={{
                                  left: `${pct}%`,
                                  transform: labelTransform(pct)
                                }}
                              >
                                Day {h.days}
                              </span>
                            ) : null}
                          </span>
                        );
                      })}
                      {dollarCallouts.map((h) => {
                        const pct = pctOf(h.days);
                        return (
                          <span
                            className="dk-sval"
                            key={`val-${h.days}`}
                            style={{
                              left: `${pct}%`,
                              transform: labelTransform(pct)
                            }}
                          >
                            <b>
                              <DeckCount target={h.revenueAtRiskUsd} prefix="$" />
                            </b>
                            <span>by day {h.days}</span>
                            {/* P1 margin-at-risk (ported): finance decides on
                                contribution, not gross revenue. Additive-
                                optional -- only when the Simulator stamped it. */}
                            {h.marginAtRiskUsd !== undefined &&
                            h.marginAtRiskUsd > 0 ? (
                              <span className="margin">
                                {formatCurrency(h.marginAtRiskUsd)} margin
                              </span>
                            ) : null}
                          </span>
                        );
                      })}
                    </div>
                    {sortedRunouts.length > 0 ? (
                      <div className="dk-runouts">
                        {sortedRunouts.map((runout, runoutIndex) => (
                          <div className="dk-rocard" key={runout.productId}>
                            <span>
                              {runoutIndex === 0 ? "First" : "Next"} material out (
                              {runout.productId})
                            </span>
                            <span className="mono">
                              {stampDate(runout.runoutDate)} · day{" "}
                              {daysBetween(
                                new Date(packet.createdAt),
                                new Date(runout.runoutDate)
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {plateau ? (
                      <p className="dk-finenote tnum">
                        Saturated — full exposure is reached by day {plateau.day};
                        later horizons hold at the peak.
                      </p>
                    ) : null}
                    {/* P1 survival read (ported): cover (TTS) vs the worst
                        lane's restore time (TTR) on one scale -- the gap is
                        the window the response must bridge. Absent unless
                        both fields exist. */}
                    {survival ? (
                      <div className="dk-survival">
                        <p className="sv-kick">Cover vs restore time</p>
                        <div className="sv-row">
                          <span>Days of cover</span>
                          <span className="sv-track">
                            <span
                              className="sv-fill"
                              style={{
                                display: "block",
                                width: `${(survival.tts / survival.scale) * 100}%`
                              }}
                            />
                          </span>
                          <span className="sv-val">{survival.tts} days</span>
                        </div>
                        <div className="sv-row">
                          <span>Time to restore</span>
                          <span className="sv-track">
                            <span
                              className={`sv-fill${survival.gap > 0 ? " gap" : ""}`}
                              style={{
                                display: "block",
                                width: `${(survival.worstTtr / survival.scale) * 100}%`
                              }}
                            />
                          </span>
                          <span className="sv-val">{survival.worstTtr} days</span>
                        </div>
                        <p className="sv-note tnum">
                          {survival.gap > 0 ? (
                            <>
                              About {survival.tts} days of cover before the first
                              stockout, but the most exposed lane needs about{" "}
                              {survival.worstTtr} days to restore —{" "}
                              <span className="gapfig">
                                a ~{survival.gap}-day gap
                              </span>{" "}
                              the response must bridge.
                            </>
                          ) : (
                            <>
                              The {survival.tts} days of cover outlast the ~
                              {survival.worstTtr}-day restore time — no exposure gap
                              on the worst lane.
                            </>
                          )}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
                {coveredNow && survivalDays !== null ? (
                  <p className="dk-dek" style={{ marginTop: 26 }}>
                    Revenue at risk is <b>$0 while stock covers demand</b>. After
                    day {survivalDays} the meter runs — decide inside the
                    white zone and the red numbers never happen.
                  </p>
                ) : (
                  <p className="dk-dek" style={{ marginTop: 26 }}>
                    Revenue at risk accrues across the window above
                    {earliestRunout ? (
                      <>
                        ; the first projected stockout lands{" "}
                        <b>{shortDate(earliestRunout)}</b>.
                      </>
                    ) : (
                      <>.</>
                    )}
                  </p>
                )}
              </>
            ) : (
              // No simulation (a Tier-1 packet): the packet's own dataGaps
              // explain the missing runway -- ported fallback, never a blank.
              <div className="dk-dek">
                {packet.dataGaps.length > 0 ? (
                  packet.dataGaps.map((gap) => <p key={gap}>{gap}</p>)
                ) : (
                  <p>No runway simulation for this packet.</p>
                )}
              </div>
            )}
          </article>
        </div>

        {/* CARD 5 -- what we recommend */}
        <div className="dk-slot" id="dk-c5">
          <article className="dk-card dk-rv" aria-label="What we recommend">
            <div className="dk-chead">
              <span className="dk-ckick">What we recommend</span>
              <span className="dk-cn">Card 05 / 06</span>
            </div>
            <div className="dk-actline">
              {isNoAction ? "Hold" : "Act"}
              <span className="dk-r">.</span>
            </div>
            {isNoAction ? (
              <>
                {/* The refusal, first-class (ported from the RefusalCard): the
                    withhold, then each missing-evidence item. */}
                <p className="dk-dek">
                  Outbound action withheld — the evidence is too thin to act on.
                  RESILIX will not draft outbound supplier action on the strength of a
                  single unconfirmed, low-confidence source.
                </p>
                {missingEvidence.length > 0 ? (
                  <ul className="dk-missing">
                    {missingEvidence.map((item) => (
                      <li key={item.requirement}>
                        <p className="m-req">{item.requirement}</p>
                        <p className="m-detail">{item.detail}</p>
                        <p className="m-flip">Would change if: {item.wouldFlipIf}</p>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <>
                <p className="dk-dek">
                  {honesty.cached + honesty.live >= 2 ? "A corroborated, " : "A "}
                  {threatCard.severity.toLowerCase()}-severity threat.
                  {sourcing.hasData && sourcing.noBackup > 0 ? (
                    <> {sourcing.noBackup} suppliers with no fallback.</>
                  ) : null}
                  {peakRisk !== null && peakRisk > 0 && peakDay !== null ? (
                    <>
                      {" "}
                      <b>
                        {formatCurrency(peakRisk)} at risk by day {peakDay}.
                      </b>
                    </>
                  ) : null}{" "}
                  The work, split by the desk that owns it:
                </p>
                {packet.playbooks.length > 0 ? (
                  <div className="dk-rolecards">
                    {packet.playbooks.map((playbook) => (
                      <div className="dk-rolecard" key={playbook.id}>
                        <h3>{playbook.role}</h3>
                        <p>{playbook.summary}</p>
                        {playbook.steps.length > 0 ? (
                          <ul>
                            {playbook.steps.map((step, stepIndex) => (
                              <li key={`${playbook.id}-step-${stepIndex}`}>{step}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                {/* The scored recovery options (ported): the structural moves
                    available, ranked by fit, with reversibility as the
                    GOVERNANCE dial. Withheld entirely on a NO_ACTION packet
                    (this branch is ACT-only; the schema enforces the rest). */}
                {rankedOptions.length > 0 ? (
                  <div className="dk-recovery">
                    <h3 className="rc-kick">What we could do</h3>
                    <p className="dk-subnote">
                      The structural moves on the table, ranked by fit.
                      Reversibility is the governance dial — the hardest-to-undo
                      moves are the ones that most need your sign-off.
                    </p>
                    <div style={{ marginTop: 14 }}>
                      {rankedOptions.map((opt, optIndex) => (
                        <div
                          className={`dk-recrow${optIndex === 0 ? " lead" : ""}`}
                          key={opt.id}
                        >
                          <div className="r-head">
                            <span className="r-tag">
                              {recoveryActionLabel(opt.actionType)}
                            </span>
                            <span className="r-title">{opt.title}</span>
                            {optIndex === 0 ? (
                              <span className="r-lead">Lead option</span>
                            ) : null}
                          </div>
                          <p className="r-sum">{opt.summary}</p>
                          <div className="r-metrics tnum">
                            <span>
                              Cost <b>{formatCurrency(opt.estimatedCostUsd)}</b>
                            </span>
                            <span>
                              Buys back <b>~{opt.speedGainDays} days</b>
                            </span>
                            <span>
                              Cuts risk <b>~{opt.riskReductionPct}%</b>
                            </span>
                            <span>
                              <b>{reversibilityLabel(opt.reversibility)}</b>
                            </span>
                            {opt.approvalRequired ? (
                              <span className="r-appr">Needs your approval</span>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
            {/* The honest-refusal note. The claim wording is the SHIPPED
                RefusalCard's, not the sample's (the sample cited a 10%-confidence
                case this packet does not carry -- an unsourced figure stays off
                the glass). */}
            <div className="dk-honest">
              <i>For the record</i>
              {isNoAction ? (
                <p>
                  That refusal is this system working as designed —{" "}
                  <b>nothing is drafted until the disruption is confirmed.</b> The
                  restraint is part of the product.
                </p>
              ) : (
                <p>
                  When the evidence is too thin, this system refuses:{" "}
                  <b>
                    RESILIX will not draft outbound supplier action on the strength of
                    a single unconfirmed, low-confidence source.
                  </b>{" "}
                  The restraint is part of the product.
                </p>
              )}
            </div>
          </article>
        </div>

        {/* CARD 6 -- your call */}
        <div className="dk-slot" id="dk-c6">
          <article className="dk-card dk-rv" aria-label="Your call">
            <div className="dk-chead">
              <span className="dk-ckick">Your call</span>
              <span className="dk-cn">Card 06 / 06</span>
            </div>
            <h2>
              Nothing sends itself<span className="dk-b">.</span>
            </h2>
            {/* Decision-aware dek: the pending copy ("waiting… signs it out")
                would contradict a released or returned state, so each branch
                states its own truth -- released stays replay-qualified. */}
            <p className="dk-dek">
              {isNoAction ? (
                <>
                  No outreach was drafted — outbound action is withheld until the
                  disruption is confirmed (see the recommendation above).
                </>
              ) : packet.supplierMessages.length === 0 ? (
                <>No supplier drafts generated.</>
              ) : approval.status === "APPROVED" ? (
                // Literal "&", never &amp;: an entity in the text node after
                // the count expression trips the SWC leading-space trim (the
                // documented seam bug fixed across this file with literals).
                <>
                  {packet.supplierMessages.length} supplier letters are signed &
                  released — in this replay that is a recorded simulation, so{" "}
                  <b>nothing has actually been sent</b>; in the product, release hands
                  them to the audited dispatch path.
                </>
              ) : approval.status === "REJECTED" ? (
                <>
                  {packet.supplierMessages.length} supplier letters were returned for
                  revision — <b>nothing goes out</b>.
                </>
              ) : (
                <>
                  {packet.supplierMessages.length} supplier letters are drafted and
                  waiting. These are drafts only —{" "}
                  <b>nothing leaves the building until a person sends them</b>. Each is
                  held until a named person signs it out.
                </>
              )}
            </p>
            {packet.supplierMessages.length > 0 ? (
              <div className="dk-letters">
                {packet.supplierMessages.map((message, messageIndex) => (
                  <LetterCard
                    key={message.id}
                    message={message}
                    index={messageIndex}
                    total={packet.supplierMessages.length}
                    supplierName={
                      supplierNameById.get(message.supplierId) ?? message.supplierId
                    }
                    approvalStatus={approval.status}
                    heldMid={heldMid}
                    releasedMid={releasedMid}
                  />
                ))}
              </div>
            ) : null}

            {/* The decision rail -- ONE packet-level approve/return pair (the
                shipped gatekeeper-gated simulation; per-letter controls would
                re-invent the invariant). Absent-by-gate on NO_ACTION. The id
                is the ONE approve door the hero BLUF anchors to (#approve-h,
                pinned by the e2e: exactly one in the document). */}
            <div className="dk-decide" id="approve-h">
              <div className="dk-gate">
                <span>Automatic checks</span>
                <span
                  className={gatekeeper.status === "PASS" ? "g-pass" : "g-fail"}
                  title={gatekeeper.status}
                >
                  {gatekeeper.status === "PASS"
                    ? "Cleared"
                    : gatekeeper.status === "BLOCKED"
                      ? "Blocked"
                      : "Needs review"}
                  {degraded ? " · live feed down" : null}
                </span>
              </div>
              {gatekeeper.failures.length > 0 ? (
                <ul className="dk-gatefail">
                  {gatekeeper.failures.map((failure, failureIndex) => (
                    <li key={`gate-fail-${failureIndex}`}>{failure}</li>
                  ))}
                </ul>
              ) : (
                // PASS names WHAT was cleared (ported GateCheck statements) --
                // "Cleared" alone is a verdict without evidence. The URL-safety
                // clause is bound to the REAL allowlist result, never asserted
                // blindly (ported binding).
                <p className="dk-finenote">
                  Every number traces to a source ·{" "}
                  {evidenceAllowlistPassed ? (
                    <>all source links passed the safety check</>
                  ) : (
                    <>
                      {allowedEvidenceUrls.length} of{" "}
                      {threatCard.evidenceUrls.length} source links cleared the
                      safety check
                    </>
                  )}{" "}
                  · suppliers matched to your list
                </p>
              )}
              <p className="dk-finenote">
                {isNoAction
                  ? "Nothing to sign out on a refusal — approval opens only when the pipeline recommends action."
                  : approval.status === "APPROVED"
                    ? "Response approved — drafts remain unsent until a person dispatches them."
                    : approval.status === "REJECTED"
                      ? "Response returned for revision — nothing goes out."
                      : `Approve the drafted response${
                          earliestRunout
                            ? ` before the first stockout on ${shortDate(earliestRunout)}`
                            : ""
                        } — nothing sends without you.`}
              </p>
              {!isNoAction ? (
                <div className="dk-act">
                  <button
                    type="button"
                    className="dk-btn"
                    onClick={() => decide("REJECTED")}
                    disabled={approval.status !== "PENDING"}
                  >
                    Hold
                  </button>
                  <button
                    type="button"
                    className="dk-btn primary"
                    onClick={() => decide("APPROVED")}
                    disabled={!canApprove}
                    data-testid="approve-action"
                    aria-describedby={
                      approveBlockedReason ? "dk-approve-blocked" : undefined
                    }
                  >
                    Sign &amp; release
                  </button>
                </div>
              ) : null}
              {approveBlockedReason ? (
                <p id="dk-approve-blocked" className="dk-blocked">
                  {approveBlockedReason}
                </p>
              ) : null}
              {latestAudit ? (
                <p className="dk-logged" data-testid="decision-logged">
                  {latestAudit.action === "HUMAN_APPROVAL"
                    ? "Signed & released"
                    : "Held"}{" "}
                  — logged {shortDate(latestAudit.at)} · {latestAudit.detail}
                </p>
              ) : null}
              <p className="dk-promise">
                RESILIX never sends anything without your approval.
              </p>
              {/* Replay honesty (ported verbatim): the decision is a local
                  simulation of the approval flow -- stated on the glass, by the
                  control it qualifies. */}
              <p className="dk-finenote">
                Demo note: this replay simulates the approval locally — your click is
                not persisted. In the product, approval is an atomic, audited API
                transition behind authentication.
              </p>
            </div>

            {packet.actionItems.length > 0 ? (
              <div className="dk-tasks">
                {packet.actionItems.map((item) => (
                  <div className="dk-taskrow" key={item.id}>
                    <span className="box" aria-hidden="true" />
                    <span>{item.title}</span>
                    <span className="own">{item.owner}</span>
                    {/* Due date AND status are both operational fields the old
                        table carried -- render both, never one-or-the-other.
                        Red is time pressure only: a dateless row reads neutral. */}
                    <span className={item.dueDate ? "due" : "due neutral"}>
                      {item.dueDate ? <>Due {stampDate(item.dueDate)}</> : "—"}
                    </span>
                    <span className="st">{humanizeToken(item.status)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        </div>
      </div>

      {/* ============ THE RECEIPTS ============
          Two CLOSED disclosures between the deck and the coda -- the coda's
          "Logged" chip points at these. Both keyboard-operable by construction
          (native details/summary); each renders only when it has entries, so
          the surface never blanks.
            1. The deliberation trail (ported): the governed multi-agent loop.
            2. The provenance log (ported): every packet audit entry merged
               with the local simulated decision, in order. */}
      {packet.agentRuns.length > 0 || auditTrail.length > 0 ? (
        <section className="dk-trailwrap" aria-label="How this decision was made">
          {packet.agentRuns.length > 0 ? (
          <details className="dk-trail dk-rv">
            <summary>
              <span className="t-kick">How this was reasoned</span>
              <span className="t-count tnum">
                {packet.agentRuns.length} steps
                <span className="t-arrow" aria-hidden="true">
                  →
                </span>
              </span>
            </summary>
            <div className="t-body">
              <p className="t-intro">
                Each step did one job and handed off to the next. This is the audit
                of how the plan was built — shown honestly, recorded steps labelled
                as recorded.
              </p>
              <ol>
                {packet.agentRuns.map((run, index) => {
                  const failed = run.validationStatus === "FAIL";
                  return (
                    <li key={run.id || `${index}-${run.agentName}`}>
                      <div className="t-step">
                        <span aria-hidden="true" className="t-n">
                          {index + 1}.
                        </span>
                        <span className="t-name">{run.agentName}</span>
                        {/* Humanized run mode on the glass; the raw enum only
                            in the auditor's hover title (ported honesty). */}
                        <span className="t-mode" title={agentModeTitle(run.mode)}>
                          {agentModeLabel(run.mode)}
                        </span>
                        {failed ? (
                          <span className="t-fail">Needs review</span>
                        ) : (
                          <span className="t-pass">
                            <CheckCircle2 className="size-3" aria-hidden="true" />
                            <span className="sr-only">passed validation</span>
                          </span>
                        )}
                      </div>
                      <p className="t-sum">{run.summary}</p>
                    </li>
                  );
                })}
              </ol>
            </div>
          </details>
          ) : null}

          {/* The provenance log: EVERY audit entry -- packet + the local
              simulated decision -- with plain-English action labels (the raw
              enum stays the stored value; presentation only, ported). */}
          {auditTrail.length > 0 ? (
            <details className="dk-trail dk-rv dk-d1">
              <summary>
                <span className="t-kick">Provenance log</span>
                <span className="t-count tnum">
                  {auditTrail.length} entries
                  <span className="t-arrow" aria-hidden="true">
                    →
                  </span>
                </span>
              </summary>
              <div className="t-body">
                <p className="t-intro">
                  Every step of this packet as it was recorded, oldest first —
                  including your simulated decision from card 06.
                </p>
                <ol data-testid="provenance-log">
                  {auditTrail.map((entry, entryIndex) => (
                    // Index in the key (ported): at+actor+action can repeat;
                    // the index is the deterministic tiebreaker.
                    <li key={`${entryIndex}-${entry.at}-${entry.actor}-${entry.action}`}>
                      <div className="t-step">
                        <span aria-hidden="true" className="t-n">
                          {entryIndex + 1}.
                        </span>
                        <span className="t-name">{auditActionLabel(entry.action)}</span>
                        <span className="t-meta tnum">
                          {auditActorLabel(entry.actor)} · {shortDate(entry.at)}{" "}
                          {shortTime(entry.at)}
                        </span>
                      </div>
                      <p className="t-sum">{entry.detail}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </details>
          ) : null}
        </section>
      ) : null}

      {/* ============ CODA ============ */}
      <section className="dk-coda">
        <h2 className="dk-rv">
          The machine investigates and drafts<span className="dk-b">.</span> A named
          human decides<span className="dk-b">.</span>
        </h2>
        <div className="dk-trust dk-rv dk-d1">
          <span>
            <b>Logged</b> — every step recorded as it happened
          </span>
          <span>
            <b>Replayed</b> — a recorded run, nothing pretends to be live
          </span>
          {/* True in EVERY approval state: even a released draft only ever
              simulated its release here (nothing dispatches on this replay). */}
          <span>
            <b>Held by default</b> — nothing sends without a named signature
          </span>
          <span>
            <b>Sourced</b> — every number links to its origin
          </span>
        </div>
        {/* Packet identity (ported): the full plan id + compiled instant, so
            the recording is traceable to its exact artifact -- not just the
            stamp's short fragment. */}
        <div className="dk-fine dk-rv dk-d2">
          RESILIX · packet <span className="tnum">{packet.id}</span> · compiled{" "}
          <span className="tnum">
            {shortDate(packet.createdAt)} {shortTime(packet.createdAt)} UTC
          </span>{" "}
          · Synthetic data — demonstration
        </div>
      </section>
    </div>
  );
}
