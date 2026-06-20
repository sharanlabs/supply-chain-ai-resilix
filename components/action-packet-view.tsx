"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleSlash,
  Clock3,
  FileText,
  Mail,
  ShieldCheck,
  Workflow
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCountUp } from "@/lib/use-count-up";
import { ACTION_CONFIDENCE_FLOOR } from "@/lib/agents/actionops/recommendation";
import { HttpUrlSchema } from "@/lib/schemas";
import type {
  AuditTrailEntry,
  DecisionPacketV2,
  MissingEvidence,
  PublicSignal
} from "@/lib/schemas";
import { formatCurrency } from "@/lib/utils";

type Severity = DecisionPacketV2["threatCard"]["severity"];

function severityTone(severity: Severity) {
  if (severity === "LOW") return "low" as const;
  if (severity === "MEDIUM") return "medium" as const;
  if (severity === "HIGH") return "high" as const;
  return "critical-sev" as const;
}

// The runway/exposure bar hue follows the same perceptual ramp as the badges,
// keyed off a horizon's position in the response window (the data, not a guess).
function severityKey(severity: Severity): "low" | "medium" | "high" | "critical" {
  if (severity === "LOW") return "low";
  if (severity === "MEDIUM") return "medium";
  if (severity === "HIGH") return "high";
  return "critical";
}

// The single source of truth for a supplier row's risk tier: the leading token of
// the Atlas rationale ("CRITICAL risk tier; 47-day lead time."). The exposureScore
// alone CANNOT recover the tier -- base+lead ranges overlap (a HIGH supplier on a
// long lane can outscore a CRITICAL on a short one; atlas.ts states this is
// intended) -- so a score threshold would mislabel real packets. Parsing the tier
// keeps the WHO-IS-HIT bar color and any future tier label reading the SAME field,
// so they can never disagree. Defensive null only if an upstream rationale ever
// drops the leading tier token (not a path Atlas produces); the caller falls back
// to a neutral mid so the bar still renders.
function tierFromRationale(rationale: string): Severity | null {
  const match = /^\s*(LOW|MEDIUM|HIGH|CRITICAL)\b/i.exec(rationale);
  return match ? (match[1].toUpperCase() as Severity) : null;
}

// A plain-English confidence word for the prose, so a layperson reads "high
// confidence", not a bare percentage. The number still appears beside it. The
// "low" boundary is the SAME ACTION_CONFIDENCE_FLOOR the refusal logic uses (scaled
// to a percentage here, since this takes 0-100): "low confidence" on screen and "too
// low to act on a lone source" in the pipeline are one boundary, never divergent.
function confidenceWord(pct: number) {
  if (pct >= 85) return "high";
  if (pct >= 65) return "moderate";
  if (pct >= ACTION_CONFIDENCE_FLOOR * 100) return "limited";
  return "low";
}

// Defense-in-depth: only http(s) reaches the DOM. Evidence URLs derive from GDELT
// signals validated by HttpUrlSchema upstream, but the render layer must not assume
// that holds -- block javascript:/data: if an unvalidated path ever feeds an
// evidence URL (Law 11: untrusted external data is never trusted at the sink).
function safeHref(url: string): string {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:" ? url : "#";
  } catch {
    return "#";
  }
}

// Recorded vs live, stated honestly. CACHED signals render the dated capture
// line; the degraded badge is reserved for FAILED_TO_FALLBACK only (a healthy
// DETERMINISTIC_RULES run is never labeled degraded).
function signalHonesty(signals: PublicSignal[]) {
  const live = signals.filter((s) => s.status === "LIVE").length;
  const cached = signals.filter((s) => s.status === "CACHED").length;
  const failed = signals.filter((s) => s.status === "FAILED").length;
  return { live, cached, failed, total: signals.length };
}

// Date-only fields (e.g. runoutDate "2026-06-29") parse as UTC midnight; without
// an explicit timeZone the local zone can shift them a calendar day earlier
// (America/New_York) AND diverge SSR vs client. Pin to UTC so a date-only value
// renders as its true calendar date, identically on server and client. Full ISO
// datetimes (capturedAt, threat createdAt) also pass through here and are pinned
// to UTC for the same SSR/client consistency.
function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
}

// Pinned to UTC so the compiled-at time is identical on server and client (no
// hydration drift); the packet timestamps are already UTC ISO strings.
function shortTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC"
  });
}

// Compact currency for the display lede only -- the serif at-risk figure reads
// "$1.1M", not "$1,142,500". The exact figure is shown everywhere it matters
// (runway rows, threat prose, claim provenance); only the lede is rounded.
function compactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 1
  }).format(value);
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Turn a claim's machine sourcePath into a plain-English provenance phrase, so a
// layperson reads "from this supplier's exposure result", not the bare dotted
// path `exposureResults[0].exposureScore`. The raw path still renders beside it
// (smaller, mono) -- the human reading leads, the exact trace stays for the pro.
// Keyed off the top-level field of the path; falls back to a generic phrase for
// any path shape not enumerated, so it never renders blank.
function humanSource(sourcePath: string): string {
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
      return "traced to a structured input";
  }
}

// Pre-format the event type to a readable phrase IN JS -- never a blanket CSS
// title-case. Small words (of/the/and/&/to/in/for/on) stay lowercase so a
// proper noun like "Strait of Hormuz" never becomes "Strait Of Hormuz". The
// location comes straight from data and is already correct, so it is left
// untouched. Works for any threat: chokepoint closure, tariff, hurricane,
// bankruptcy -- not just the Gulf demo.
const SMALL_WORDS = new Set([
  "of",
  "the",
  "and",
  "a",
  "an",
  "to",
  "in",
  "for",
  "on",
  "at",
  "by",
  "vs"
]);

function titleCasePhrase(value: string) {
  const words = value.toLowerCase().split(/\s+/);
  return words
    .map((word, index) => {
      if (index > 0 && SMALL_WORDS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function threatHeadline(threat: DecisionPacketV2["threatCard"]) {
  const event = titleCasePhrase(threat.eventType.split("_").join(" "));
  const where =
    threat.location.chokepoint ??
    threat.location.region ??
    threat.location.country;
  return where ? `${event} -- ${where}` : event;
}

// The NO_ACTION refusal, rendered as a FIRST-CLASS packet element -- not an error, not a
// degraded badge. A calm, deliberate decision ("we chose not to act, and here is exactly
// what is missing"), the accountability differentiator the genre does not show. It states
// the withhold, then enumerates each missing-evidence item: what is required, what is
// absent, and what would flip the decision to ACT. The exposure/runway sections still
// render below, flagged contingent by a dataGaps line.
function RefusalCard({ missingEvidence }: { missingEvidence: MissingEvidence[] }) {
  return (
    <section
      className="reveal panel rounded-(--radius-card) p-6 sm:p-7"
      style={{ "--d": 80 } as React.CSSProperties}
      aria-labelledby="refusal-h"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.1em] text-ink-faint uppercase">
          <CircleSlash aria-hidden="true" className="size-4 text-accent" />
          Recommendation
        </span>
        <Badge tone="medium">NO ACTION</Badge>
      </div>
      <h2
        id="refusal-h"
        className="mt-4 max-w-[44ch] text-[1.25rem] leading-[1.22] font-semibold text-ink sm:text-[1.4375rem]"
      >
        Outbound action withheld -- the evidence is too thin to act on.
      </h2>
      <p className="mt-4 max-w-[64ch] text-[0.9375rem] leading-7 text-ink-muted">
        RESILIX will not draft outbound supplier action on the strength of a single
        uncorroborated, low-confidence source. The exposure and runway below are shown for
        situational awareness only -- they are contingent on the disruption being confirmed,
        not an endorsed assessment.
      </p>
      {missingEvidence.length > 0 ? (
        <div className="mt-5 border-t border-line pt-5">
          <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-ink-faint uppercase">
            What evidence is missing
          </p>
          <ul className="mt-3 flex flex-col gap-4">
            {missingEvidence.map((item) => (
              <li key={item.requirement} className="max-w-[64ch]">
                <p className="text-[0.9375rem] font-semibold text-ink">
                  {item.requirement}
                </p>
                <p className="mt-1 text-[0.9375rem] leading-7 text-ink-muted">
                  {item.detail}
                </p>
                <p className="mt-1 text-[0.875rem] leading-6 text-ink-faint">
                  Would change if: {item.wouldFlipIf}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// The Action Packet -- the primary screen, read start-to-end like a war-room
// briefing a layperson and an industry pro both follow.
//
// The narrative spine (numbers SUPPORT the story, never a stat-wall):
//   1. North-star lede   -- the at-risk figure, in one sentence (the serif gesture)
//   2. Threat            -- what happened, how sure (confidence in prose + evidence)
//   3. Exposure          -- who is hit (ranked table)
//   4. Runway            -- how fast (revenue-at-risk over time + first stockout)
//   5. Drafted response  -- the prepared supplier emails (bodies behind disclosure)
//   6. The Approve moment -- the human decision, with the gatekeeper as quiet evidence
//
// Secondary detail (role playbooks, full task list) lives behind progressive
// disclosure so the default view stays at the briefing spine, not a data dump.
//
// Presentational + a self-contained approve/reject action with optimistic local
// state (the persisted /approve API only exists for the live V1 pipeline; on a
// seeded V2 packet it would 404, so the action mutates a local copy and appends
// a client-side audit line -- honest, and the right behavior for a demo packet).
// ---------------------------------------------------------------------------
export function ActionOpsPacketView({ packet }: { packet: DecisionPacketV2 }) {
  const [approval, setApproval] = useState<{
    status: DecisionPacketV2["approvalStatus"];
    reason?: string;
    extraAudit: AuditTrailEntry[];
  }>({ status: packet.approvalStatus, extraAudit: [] });

  const degraded = packet.effectiveMode === "FAILED_TO_FALLBACK";
  const { threatCard, simulation, gatekeeper } = packet;
  // The act/refuse decision (absent => ACT, back-compat). On NO_ACTION the pipeline
  // withheld the playbooks + drafts; the RefusalCard states what evidence is missing.
  const recommendation = packet.recommendation ?? "ACT";
  const isNoAction = recommendation === "NO_ACTION";
  const missingEvidence = packet.missingEvidence ?? [];
  const honesty = signalHonesty(packet.publicSignals);
  // WCAG 2.2 SC 4.1.3 Status Messages: the live region below announces a runtime
  // mode change without moving focus. Empty while live; set when the packet is
  // degraded (FAILED_TO_FALLBACK) or running on recorded/cached-only signals.
  const modeAnnouncement = degraded
    ? "Live AI unavailable. The action packet is running in degraded fallback mode; figures are deterministic."
    : honesty.live === 0 && honesty.cached > 0
      ? "Signals are recorded (cached), not live."
      : "";
  const confidencePct = Math.round(threatCard.confidence * 100);
  const confidenceCount = useCountUp(confidencePct);

  const capturedAt = packet.publicSignals.find((s) => s.status === "CACHED")
    ?.fetchedAt;

  // Validate the evidence URLs at the data boundary with the SAME schema the
  // signal pipeline uses (HttpUrlSchema -- http(s)-only). The "evidence allowlist
  // passed" line is then derived from this real result, not asserted blindly: if
  // any URL fails (e.g. a javascript:/data: link slipped in), the line says so
  // and only the URLs that actually pass are rendered as links. safeHref stays
  // as render-layer defense-in-depth on top of this.
  const allowedEvidenceUrls = useMemo(
    () =>
      threatCard.evidenceUrls.filter(
        (url) => HttpUrlSchema.safeParse(url).success
      ),
    [threatCard.evidenceUrls]
  );
  const evidenceAllowlistPassed =
    allowedEvidenceUrls.length === threatCard.evidenceUrls.length;

  const maxExposure = useMemo(
    () => Math.max(...packet.exposureResults.map((r) => r.exposureScore), 1),
    [packet.exposureResults]
  );

  const maxHorizon = useMemo(() => {
    if (!simulation) return 1;
    return Math.max(...simulation.horizons.map((h) => h.revenueAtRiskUsd), 1);
  }, [simulation]);

  // The north-star figure the packet turns on: the worst-case revenue at risk.
  const peakRisk = useMemo(() => {
    if (!simulation || simulation.horizons.length === 0) return null;
    return Math.max(...simulation.horizons.map((h) => h.revenueAtRiskUsd));
  }, [simulation]);

  // Revenue at risk saturates once the disruption's full exposure is reached
  // (revenueAtRisk = min(H, durationDays)), so the later horizons can hold flat at
  // the peak -- two equal adjacent bars are correct data, not a render bug. Detect
  // the FIRST horizon that hits the peak: if an earlier one already does (a later
  // bar equals it), the runway plateaus, and the copy/annotation say so honestly
  // instead of claiming it "climbs across the window". When every horizon is
  // distinct (the fixture: 50k -> 200k) it genuinely climbs and no plateau is shown.
  const plateau = useMemo(() => {
    if (!simulation || simulation.horizons.length < 2 || peakRisk === null) {
      return null;
    }
    const firstPeakIndex = simulation.horizons.findIndex(
      (h) => h.revenueAtRiskUsd >= peakRisk
    );
    // A plateau exists only if a horizon AFTER the first peak also sits at the
    // peak (i.e. it stops climbing before the last horizon).
    const saturates = firstPeakIndex < simulation.horizons.length - 1;
    if (!saturates) return null;
    return { day: simulation.horizons[firstPeakIndex].days };
  }, [simulation, peakRisk]);

  const earliestRunout = useMemo(() => {
    if (!simulation || simulation.productRunouts.length === 0) return null;
    return simulation.productRunouts.map((r) => r.runoutDate).sort()[0];
  }, [simulation]);

  const auditTrail = [...packet.auditTrail, ...approval.extraAudit];

  const where =
    threatCard.location.chokepoint ??
    threatCard.location.region ??
    threatCard.location.country ??
    "the supply route";

  // The human-approval invariant: a packet may only be approved while it is
  // PENDING *and* the gatekeeper cleared it for human review. A BLOCKED/WARN
  // gatekeeper verdict, or an already-decided packet, must make approval
  // impossible from the UI -- both the control and the handler are gated, so the
  // gate can never be bypassed. (Return-for-revision stays available while
  // PENDING; only the approve path is gatekeeper-gated.)
  // A NO_ACTION packet has nothing to approve -- the pipeline withheld every outbound
  // draft. Approval is unavailable until the disruption is corroborated (which would
  // re-run the pipeline to ACT). The other gates still apply on an ACT packet.
  const canApprove =
    !isNoAction &&
    approval.status === "PENDING" &&
    gatekeeper.approvedForHumanReview === true;

  // Why approval is blocked, surfaced under the disabled control. Derived from
  // the real gatekeeper verdict (or the refusal) -- never hardcoded.
  const approveBlockedReason = isNoAction
    ? "No outbound action to approve -- the disruption must be corroborated first."
    : approval.status !== "PENDING"
      ? null // already decided -- the status pill already communicates this
      : gatekeeper.approvedForHumanReview
        ? null
        : gatekeeper.status === "BLOCKED"
          ? "Gatekeeper BLOCKED this packet -- resolve the failures above before approval."
          : "Gatekeeper has not cleared this packet for human review.";

  function decide(status: "APPROVED" | "REJECTED") {
    // Hard guard: approval cannot proceed unless the packet is approvable. The
    // disabled button is the affordance; this is the invariant that holds even
    // if the control were somehow triggered.
    if (status === "APPROVED" && !canApprove) return;
    setApproval((prev) => ({
      status,
      reason:
        status === "APPROVED"
          ? "Approved for execution by procurement reviewer."
          : "Returned for revision by procurement reviewer.",
      extraAudit: [
        ...prev.extraAudit,
        {
          at: new Date().toISOString(),
          actor: "procurement-reviewer",
          action: status === "APPROVED" ? "HUMAN_APPROVAL" : "HUMAN_REJECTION",
          detail:
            status === "APPROVED"
              ? "Packet approved. Drafts remain unsent until a person dispatches them."
              : "Packet returned; no drafts dispatched."
        }
      ]
    }));
  }

  return (
    <div className="flex flex-col gap-9" data-testid="actionops-packet">
      {/* WCAG 2.2 SC 4.1.3: a persistent, always-mounted live region -- it exists
          empty when live, and when the packet mode flips to degraded (or recorded)
          its text changes so assistive tech announces it without moving focus.
          A conditionally-mounted region (the visible Badge) does NOT announce. */}
      <div role="status" aria-live="polite" className="sr-only" data-testid="mode-status">
        {modeAnnouncement}
      </div>

      {/* ============================================================
          1. NORTH-STAR LEDE -- the at-risk figure in one calm sentence.
          The serif italic figure is the single editorial gesture in the
          whole app; the rest of the lede is Geist. No uppercase kicker
          stacked above it -- the meta sits quietly to the side.
          ============================================================ */}
      <header
        className="reveal flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"
        style={{ "--d": 40 } as React.CSSProperties}
      >
        <div className="max-w-[34rem]">
          <p className="flex items-center gap-2 text-sm text-ink-faint">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-accent"
            />
            Decision packet ·{" "}
            {isNoAction
              ? "no action recommended"
              : approval.status === "PENDING"
                ? "awaiting your approval"
                : approval.status === "APPROVED"
                  ? "approved"
                  : "returned for revision"}
          </p>
          <h1 className="mt-3 text-[1.625rem] leading-[1.18] font-medium text-ink sm:text-[2rem] sm:leading-[1.16]">
            {peakRisk !== null ? (
              <>
                A disruption at {where} puts{" "}
                {/* The one figure the packet turns on: COMPACT in the display lede
                    ($2.7M), with the exact value as a tooltip so the rounding is
                    intentional, not lossy. Full precision still shows in the runway
                    data table below. */}
                <span
                  className="headline-figure"
                  title={`${formatCurrency(peakRisk)} peak revenue at risk`}
                >
                  {compactCurrency(peakRisk)}
                </span>{" "}
                of supply at risk.
              </>
            ) : (
              threatHeadline(threatCard)
            )}
          </h1>
          {isNoAction ? (
            <p className="mt-3 max-w-[46ch] text-[0.9375rem] leading-7 text-ink-muted">
              Here is what we know and who it would hit -- but the evidence is too
              thin to act on, so we have drafted nothing for sign-off.
            </p>
          ) : peakRisk !== null ? (
            <p className="mt-3 max-w-[46ch] text-[0.9375rem] leading-7 text-ink-muted">
              Here is what we know, who it hits, how fast it bites, and the
              response we have drafted for your sign-off.
            </p>
          ) : null}
        </div>
        {/* Presentational packet meta (label-value lines), not a definition
            list -- a <dl> here trips axe's definition-list rule because the
            divs hold text+span, not dt/dd. A plain <div> is the honest semantic. */}
        <div className="tnum shrink-0 text-sm text-ink-faint sm:text-right">
          <div className="leading-7">
            Packet{" "}
            <span className="font-mono font-medium text-ink">{packet.id}</span>
          </div>
          <div className="leading-7">
            Compiled{" "}
            <span className="font-medium text-ink">
              {shortTime(packet.createdAt)}
            </span>{" "}
            · {packet.dataTier}
          </div>
          <div className="leading-7">
            Reviewer{" "}
            <span className="font-medium text-ink">procurement desk</span>
          </div>
        </div>
      </header>

      {/* NO_ACTION refusal -- a first-class, full-width packet element above the war
          room. Renders ONLY when the pipeline refused; on an ACT packet it is absent. */}
      {isNoAction ? <RefusalCard missingEvidence={missingEvidence} /> : null}

      {/* The two-column war room: the briefing spine on the left, the human
          decision rail sticky on the right. Collapses to one column under lg. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* ===================== BRIEFING SPINE ===================== */}
        <div className="flex min-w-0 flex-col gap-6">
          {/* --------------------------------------------------------
              2. THREAT -- what happened, and how sure we are. Confidence
              reads as a plain-English sentence (number supporting prose),
              not a stat-wall. Severity is a small badge; the panel is a
              hairline tonal surface -- no thick colored left border.
              -------------------------------------------------------- */}
          <section
            className="reveal panel rounded-(--radius-card) p-6 sm:p-7"
            style={{ "--d": 120 } as React.CSSProperties}
            aria-labelledby="threat-h"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-ink-faint uppercase">
                The threat
              </span>
              <span className="font-mono text-[0.625rem] tracking-[0.04em] text-ink-faint">
                {threatCard.eventType}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
              <h2
                id="threat-h"
                className="max-w-[28ch] text-[1.25rem] leading-[1.22] font-semibold text-ink sm:text-[1.4375rem]"
              >
                {threatHeadline(threatCard)}
              </h2>
              <Badge tone={severityTone(threatCard.severity)}>
                {threatCard.severity}
              </Badge>
            </div>

            <p className="mt-4 max-w-[64ch] text-[0.9375rem] leading-7 text-ink-muted">
              {threatCard.summary}
            </p>

            {/* Confidence + sourcing as ONE plain sentence -- the figures support
                the story rather than standing as a number grid. */}
            <p className="tnum mt-4 max-w-[64ch] border-t border-line pt-4 text-[0.9375rem] leading-7 text-ink-muted">
              We hold{" "}
              <span className="font-semibold text-ink">
                {confidenceWord(confidencePct)} confidence
              </span>{" "}
              in this read (
              <span className="font-semibold text-ink">{confidenceCount}%</span>
              ), drawn from{" "}
              <span className="font-semibold text-ink">
                {honesty.cached + honesty.live} recorded sources
              </span>
              {capturedAt ? <> captured {shortDate(capturedAt)}</> : null}.{" "}
              <span className="text-ink-faint">
                {honesty.live > 0
                  ? `${honesty.live} live, ${honesty.cached} recorded.`
                  : "Recorded replay -- no live AI is claimed."}
              </span>
            </p>

            {/* Quiet evidence line -- the provenance/verifier statement as a trust
                feature, in the calm accent, never red-alert chrome. A soft steel
                wash (solid accent-soft, not a gradient) lifted by an inset top
                highlight so it reads as the packet's trust seal. */}
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-accent/25 bg-accent-soft px-4 py-3 shadow-[inset_0_1px_0_oklch(1_0_0/0.4)]">
              <ShieldCheck
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-accent-strong"
              />
              <p className="text-[0.8125rem] leading-[1.5] text-accent-strong">
                Every figure in this packet traces back to a recorded source.
                <span className="mt-0.5 block font-mono text-[0.625rem] tracking-[0.02em] text-accent">
                  VERIFIER · {packet.effectiveMode} ·{" "}
                  {evidenceAllowlistPassed
                    ? "evidence allowlist passed"
                    : `evidence allowlist: ${allowedEvidenceUrls.length}/${threatCard.evidenceUrls.length} URLs passed`}
                </span>
              </p>
            </div>

            {/* Source links. min-h-6 makes every source link a >=24px WCAG 2.2
                SC 2.5.8 target (these are a link list, not a sentence, so the
                inline exception does not apply); the wider gap-y keeps wrapped
                rows from crowding the enlarged targets. */}
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-faint">
              {allowedEvidenceUrls.map((url) => (
                <li key={url}>
                  <a
                    href={safeHref(url)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex min-h-6 items-center gap-1 underline-offset-2 hover:text-accent-strong hover:underline"
                  >
                    {hostname(url)}
                    <ArrowUpRight className="size-3" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </section>

          {/* --------------------------------------------------------
              3. EXPOSURE -- who is hit. A scannable ranked table, not a
              card grid. The lead sentence carries the count.
              -------------------------------------------------------- */}
          <section
            className="reveal panel rounded-(--radius-card)"
            style={{ "--d": 200 } as React.CSSProperties}
            aria-labelledby="exp-h"
          >
            <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h2
                  id="exp-h"
                  className="text-[0.6875rem] font-semibold tracking-[0.1em] text-ink-faint uppercase"
                >
                  Who is hit
                </h2>
                <p className="mt-1 max-w-[52ch] text-sm leading-6 text-ink-muted">
                  {packet.exposureResults.length} suppliers sit in the blast
                  radius, ranked here by how hard the disruption lands.
                </p>
                {/* The context EVERY exposed supplier shares, stated once -- so the
                    per-row line carries only what varies (the risk tier + lead
                    time), not nine repetitions of the same clause. */}
                {packet.exposureResults.length > 0 ? (
                  <p className="mt-1.5 max-w-[58ch] text-xs leading-5 text-ink-faint">
                    All {packet.exposureResults.length} sit on lanes routed
                    through the affected chokepoint, none with a qualified backup
                    on file. Per row: the risk tier and the standard lead time.
                  </p>
                ) : null}
              </div>
              <AlertTriangle
                className="mt-0.5 size-5 shrink-0 text-sev-high"
                aria-hidden="true"
              />
            </header>
            {packet.exposureResults.length === 0 ? (
              <div className="flex items-center gap-2 px-5 py-8 text-sm text-ink-muted">
                <CircleSlash className="size-4" aria-hidden="true" />
                No direct exposure for this event.
              </div>
            ) : (
              <div className="table-scroll">
                <table className="brief-table">
                  <thead>
                    <tr>
                      <th scope="col">Supplier</th>
                      <th scope="col">Origin</th>
                      <th scope="col">Sector</th>
                      <th scope="col" className="w-[34%]">
                        Exposure
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {packet.exposureResults.map((result) => {
                      // The row's ACTUAL tier drives its exposure bar, so the
                      // column reads as a true heat ramp (a CRITICAL row is red, a
                      // LOW row blue) -- not a flat amber. Same parse the row line
                      // shows, so bar color and label can never disagree. Fallback
                      // to a neutral mid only if a rationale ever drops its tier
                      // token (not a path Atlas produces).
                      const tier = tierFromRationale(result.rationale);
                      const sev = tier ? severityKey(tier) : "medium";
                      return (
                        <tr key={result.id}>
                          <td>
                            <div className="font-medium text-ink">
                              {result.supplierName}
                            </div>
                            <div className="mt-0.5 max-w-[42ch] text-xs leading-5 text-ink-faint">
                              {result.rationale}
                            </div>
                          </td>
                          <td className="tnum text-ink-muted">
                            {result.country}
                          </td>
                          <td className="font-mono text-xs text-ink-muted">
                            {result.sector}
                          </td>
                          <td>
                            <div className="flex items-center gap-3">
                              <div className="flex-1">
                                <RunwayBar
                                  pct={
                                    (result.exposureScore / maxExposure) * 100
                                  }
                                  sev={sev}
                                />
                              </div>
                              <span className="tnum w-8 text-right text-sm font-medium text-ink">
                                {result.exposureScore}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* --------------------------------------------------------
              4. RUNWAY -- how fast it bites. Revenue at risk over the
              response window, plus the first projected stockout date.
              -------------------------------------------------------- */}
          <section
            className="reveal panel rounded-(--radius-card) p-5 sm:p-6"
            style={{ "--d": 280 } as React.CSSProperties}
            aria-labelledby="run-h"
          >
            <header className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="run-h"
                  className="text-[0.6875rem] font-semibold tracking-[0.1em] text-ink-faint uppercase"
                >
                  How fast it bites
                </h2>
                <p className="mt-1 max-w-[52ch] text-sm leading-6 text-ink-muted">
                  {earliestRunout ? (
                    <>
                      The first stockout lands{" "}
                      <span className="font-medium text-sev-critical-ink">
                        {shortDate(earliestRunout)}
                      </span>
                      {plateau ? (
                        <>
                          ; revenue at risk climbs to full exposure by day{" "}
                          {plateau.day}, then holds.
                        </>
                      ) : (
                        <>; revenue at risk climbs across the window below.</>
                      )}
                    </>
                  ) : (
                    "Revenue at risk across the response window."
                  )}
                </p>
              </div>
              <Badge tone="neutral">{packet.dataTier}</Badge>
            </header>
            {simulation ? (
              <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                <div className="space-y-3.5">
                  {simulation.horizons.map((horizon) => {
                    const sev: Severity =
                      horizon.days >= 14
                        ? "CRITICAL"
                        : horizon.days >= 7
                          ? "HIGH"
                          : "MEDIUM";
                    return (
                      <div
                        key={horizon.days}
                        className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3"
                      >
                        <span className="tnum text-sm font-medium text-ink-muted">
                          {horizon.days}-day
                        </span>
                        <RunwayBar
                          pct={(horizon.revenueAtRiskUsd / maxHorizon) * 100}
                          sev={severityKey(sev)}
                        />
                        <span className="tnum w-24 text-right text-sm font-medium text-ink">
                          {formatCurrency(horizon.revenueAtRiskUsd)}
                        </span>
                      </div>
                    );
                  })}
                  {/* When two adjacent bars sit at the same value the runway has
                      plateaued -- full exposure is already reached, so the later
                      horizon equals the earlier one. Name it, so equal bars read as
                      a real saturation point and not a render bug. */}
                  {plateau ? (
                    <p className="tnum text-xs leading-5 text-ink-faint">
                      Saturated -- full exposure reached by day {plateau.day};
                      later horizons hold at the peak.
                    </p>
                  ) : null}
                </div>
                <div className="border-line lg:border-l lg:pl-6">
                  <h3 className="text-[0.6875rem] font-semibold tracking-[0.1em] text-ink-faint uppercase">
                    Product runout
                  </h3>
                  <dl className="mt-3 space-y-2.5">
                    {simulation.productRunouts.map((runout) => (
                      <div
                        key={runout.productId}
                        className="flex items-baseline justify-between gap-3 border-b border-line pb-2.5 last:border-none"
                      >
                        <dt className="font-mono text-xs text-ink-muted">
                          {runout.productId}
                        </dt>
                        <dd className="tnum text-sm font-medium text-ink">
                          {shortDate(runout.runoutDate)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {earliestRunout ? (
                    <p className="mt-4 flex items-center gap-2 border-t border-line pt-3 text-xs text-ink-muted">
                      <Clock3
                        className="size-3.5 shrink-0 text-sev-high"
                        aria-hidden="true"
                      />
                      First projected stockout --{" "}
                      <span className="tnum font-medium text-sev-critical-ink">
                        {shortDate(earliestRunout)}
                      </span>
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-line-strong bg-sink px-4 py-6 text-sm leading-6 text-ink-muted">
                {packet.dataGaps.length > 0 ? (
                  packet.dataGaps.map((gap) => <p key={gap}>{gap}</p>)
                ) : (
                  <p>No runway simulation for this packet.</p>
                )}
              </div>
            )}
          </section>

          {/* --------------------------------------------------------
              5. DRAFTED RESPONSE -- the prepared supplier emails. The
              subject + claim provenance stay visible; the full body sits
              behind a per-draft disclosure so the spine stays scannable.
              Nothing ever sends.
              -------------------------------------------------------- */}
          <section
            className="reveal panel rounded-(--radius-card) p-5 sm:p-6"
            style={{ "--d": 360 } as React.CSSProperties}
            aria-labelledby="draft-h"
          >
            <header className="flex items-center gap-2">
              <Mail className="size-4 text-accent" aria-hidden="true" />
              <h2
                id="draft-h"
                className="text-[0.6875rem] font-semibold tracking-[0.1em] text-ink-faint uppercase"
              >
                The drafted response
              </h2>
            </header>
            <p className="mt-1 mb-4 max-w-[60ch] text-sm leading-6 text-ink-muted">
              {isNoAction
                ? "No outreach was drafted -- outbound action is withheld until the disruption is corroborated (see the recommendation above)."
                : "We have written the outreach for you. These are drafts only -- nothing leaves the building until a person sends them."}
            </p>
            {packet.supplierMessages.length === 0 ? (
              <p className="text-sm text-ink-muted">
                {isNoAction
                  ? "Drafting withheld pending corroboration."
                  : "No supplier drafts generated."}
              </p>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {packet.supplierMessages.map((message) => (
                  <article
                    key={message.id}
                    className="rounded-lg border border-line bg-sink/60 p-4 shadow-[inset_0_1px_0_oklch(1_0_0/0.5)] transition-shadow duration-150 hover:shadow-[var(--shadow-e1)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-ink-muted">
                        {message.supplierId} · {message.channel}
                      </span>
                      {message.approvalRequired ? (
                        <span className="font-mono text-[0.625rem] font-semibold tracking-[0.05em] text-ink-faint uppercase">
                          Draft · not sent
                        </span>
                      ) : null}
                    </div>
                    {message.subject ? (
                      <p className="mt-2 text-sm font-semibold text-ink">
                        {message.subject}
                      </p>
                    ) : null}
                    {/* Full body behind a disclosure -- present in the DOM (so
                        claims/search still resolve), collapsed by default to keep
                        the spine calm. */}
                    <details className="group mt-2">
                      <summary className="inline-flex min-h-6 cursor-pointer list-none items-center gap-1 text-xs font-medium text-accent-strong underline-offset-2 hover:underline">
                        <ArrowUpRight
                          className="size-3 transition-transform group-open:rotate-90"
                          aria-hidden="true"
                        />
                        Read the draft
                      </summary>
                      <p className="mt-2 text-sm leading-6 whitespace-pre-line text-ink-muted">
                        {message.body}
                      </p>
                    </details>
                    {message.claims.length > 0 ? (
                      <ul className="mt-3 space-y-1.5 border-t border-line pt-2 text-xs text-ink-faint">
                        {message.claims.map((claim, index) => (
                          <li
                            key={`${message.id}-claim-${index}`}
                            className="flex items-start gap-1.5"
                          >
                            <CheckCircle2
                              className="mt-0.5 size-3 shrink-0 text-accent"
                              aria-hidden="true"
                            />
                            {/* The HUMAN reading leads -- the value and where it
                                came from, in plain English -- so a layperson is
                                not staring at a dotted code path. The exact
                                machine sourcePath stays for the pro, secondary
                                (smaller, mono); it remains in the DOM so the
                                grounding trace is always present. */}
                            <span className="min-w-0 break-words leading-5">
                              <span className="tnum font-medium text-ink">
                                {String(claim.value)} {claim.unit}
                              </span>{" "}
                              {humanSource(claim.sourcePath)}
                              <span className="mt-0.5 block font-mono text-[0.625rem] break-all text-ink-faint">
                                {claim.sourcePath}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* --------------------------------------------------------
              SECONDARY DETAIL -- role playbooks + the task list, behind
              progressive disclosure so the default view stays at the
              briefing spine, not a full data dump.
              -------------------------------------------------------- */}
          {packet.playbooks.length > 0 || packet.actionItems.length > 0 ? (
            <section
              className="reveal panel-sunken rounded-(--radius-card)"
              style={{ "--d": 440 } as React.CSSProperties}
            >
              <details className="group">
                <summary className="flex min-h-6 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
                  <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-ink-faint uppercase">
                    Working detail -- playbooks &amp; tasks
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-strong">
                    <span className="tnum">
                      {packet.playbooks.length} roles · {packet.actionItems.length}{" "}
                      tasks
                    </span>
                    <ArrowUpRight
                      className="size-3.5 transition-transform group-open:rotate-90"
                      aria-hidden="true"
                    />
                  </span>
                </summary>

                <div className="flex flex-col gap-6 border-t border-line bg-surface px-5 py-5">
                  {packet.playbooks.length > 0 ? (
                    <div>
                      <header className="mb-3 flex items-center gap-2">
                        <Workflow
                          className="size-4 text-accent"
                          aria-hidden="true"
                        />
                        <h3 className="text-[0.6875rem] font-semibold tracking-[0.1em] text-ink-faint uppercase">
                          Role playbooks
                        </h3>
                      </header>
                      <div className="grid gap-5 md:grid-cols-2">
                        {packet.playbooks.map((playbook) => (
                          // Edge, not a colored accent stripe -- the same neutral
                          // hairline grammar as every other surface (the decorative
                          // accent left-border contradicted the system's own
                          // "hairline, not elevation, not a colored edge" rule).
                          <article
                            key={playbook.id}
                            className="rounded-md border border-line bg-surface p-4"
                          >
                            <h4 className="text-sm font-semibold text-ink">
                              {playbook.role}
                            </h4>
                            <p className="mt-1 text-sm leading-6 text-ink-muted">
                              {playbook.summary}
                            </p>
                            {playbook.steps.length > 0 ? (
                              <ol className="mt-2 space-y-1.5 text-sm text-ink-muted">
                                {playbook.steps.map((step, index) => (
                                  <li
                                    key={`${playbook.id}-step-${index}`}
                                    className="flex gap-2"
                                  >
                                    <span className="tnum text-ink-faint">
                                      {index + 1}.
                                    </span>
                                    <span>{step}</span>
                                  </li>
                                ))}
                              </ol>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {packet.actionItems.length > 0 ? (
                    <div>
                      <h3 className="mb-3 text-[0.6875rem] font-semibold tracking-[0.1em] text-ink-faint uppercase">
                        Task list
                      </h3>
                      <div className="table-scroll">
                        <table className="brief-table">
                          <thead>
                            <tr>
                              <th scope="col">Task</th>
                              <th scope="col">Owner</th>
                              <th scope="col">Due</th>
                              <th scope="col">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {packet.actionItems.map((item) => (
                              <tr key={item.id}>
                                <td className="font-medium text-ink">
                                  {item.title}
                                </td>
                                <td className="text-ink-muted">{item.owner}</td>
                                <td className="tnum text-ink-muted">
                                  {item.dueDate ? shortDate(item.dueDate) : "--"}
                                </td>
                                <td>
                                  <Badge tone="neutral">{item.status}</Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </div>
              </details>
            </section>
          ) : null}
        </div>

        {/* ===================== 6. THE APPROVE MOMENT ===================== */}
        <aside className="flex flex-col gap-6 lg:sticky lg:top-[5.5rem]">
          {/* The human decision -- the trust anchor of the packet. A solid tonal
              panel (no gradient behind text, so the a11y contrast scan stays
              clean): depth is read from the surface step, the panel elevation,
              and a 2px steel accent cap that marks this as THE decision moment.
              The cap is a top border on a non-text edge -- pure visual weight. */}
          <section
            className="reveal panel overflow-hidden rounded-(--radius-card) border-t-2 border-t-accent shadow-[var(--shadow-e3),inset_0_1px_0_oklch(1_0_0/0.6)]"
            style={{ "--d": 160 } as React.CSSProperties}
            aria-labelledby="approve-h"
          >
            <div className="p-5 sm:p-6">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold tracking-[0.06em] uppercase ${
                    approval.status === "APPROVED"
                      ? "bg-positive-soft text-positive"
                      : approval.status === "REJECTED"
                        ? "bg-danger-soft text-danger"
                        : // PENDING is a NEUTRAL, expected state -- "awaiting your
                          // approval", not a hazard. It reads in the calm accent;
                          // amber/red stay reserved for genuinely adverse states
                          // (a BLOCKED gatekeeper, a returned packet).
                          "bg-accent-soft text-accent-strong"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full bg-current"
                  />
                  {approval.status === "PENDING"
                    ? "Pending review"
                    : approval.status === "APPROVED"
                      ? "Approved"
                      : "Returned"}
                </span>
                {degraded ? (
                  <Badge tone="critical">Degraded - no live AI</Badge>
                ) : (
                  <span className="font-mono text-[0.625rem] text-ink-faint">
                    1 reviewer
                  </span>
                )}
              </div>

              <h2
                id="approve-h"
                className="mt-3 text-[1.1875rem] leading-tight font-semibold text-ink"
              >
                Your call
              </h2>
              <p className="mt-2 text-[0.8125rem] leading-[1.55] text-ink-muted">
                {approval.reason ??
                  "Code calculates the exposure; the AI drafts the response. Approving records your decision in the audit trail below and releases the drafts, tasks, and one-pager for execution. Even then, nothing sends automatically."}
              </p>

              {/* Gatekeeper PASS -- the quiet-evidence trust anchor next to APPROVE,
                  bound to the real gatekeeper verdict (never hardcoded). Rendered
                  in calm ink + the accent, not a green light. A recessed well
                  (inset shadow) so the verdict reads as carved-in evidence. */}
              <div className="mt-4 rounded-lg border border-line bg-sink p-3.5 shadow-[inset_0_1px_2px_oklch(0.3_0.02_262/0.05)]">
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-ink-faint uppercase">
                    Gatekeeper
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 text-[0.6875rem] font-bold tracking-[0.06em] ${
                      gatekeeper.status === "PASS"
                        ? "text-accent-strong"
                        : "text-danger"
                    }`}
                  >
                    <ShieldCheck className="size-3.5" aria-hidden="true" />
                    {gatekeeper.status}
                  </span>
                </div>
                {gatekeeper.failures.length === 0 ? (
                  <ul className="flex flex-col gap-2 text-xs text-ink-muted">
                    <GateCheck>
                      Every numeral maps to a{" "}
                      <span className="font-medium text-ink">
                        structured claim
                      </span>
                    </GateCheck>
                    <GateCheck>
                      All URLs in the{" "}
                      <span className="font-medium text-ink">
                        evidence allowlist
                      </span>
                    </GateCheck>
                    <GateCheck>
                      Entities resolve to{" "}
                      <span className="font-medium text-ink">
                        known supplier IDs
                      </span>
                    </GateCheck>
                  </ul>
                ) : (
                  <ul className="flex flex-col gap-1.5 text-xs text-danger">
                    {gatekeeper.failures.map((failure, index) => (
                      <li key={`gate-fail-${index}`}>{failure}</li>
                    ))}
                  </ul>
                )}
              </div>

              <Button
                onClick={() => decide("APPROVED")}
                disabled={!canApprove}
                aria-describedby={
                  approveBlockedReason ? "approve-blocked-reason" : undefined
                }
                data-testid="approve-action"
                className="mt-4 h-12 w-full text-[0.9375rem] font-semibold"
              >
                <CheckCircle2 className="size-4" aria-hidden="true" />
                {approval.status === "APPROVED"
                  ? "Approved"
                  : "Approve packet"}
              </Button>
              {approveBlockedReason ? (
                <p
                  id="approve-blocked-reason"
                  className="mt-2 flex items-start gap-1.5 text-[0.75rem] leading-[1.45] text-danger"
                >
                  <CircleSlash
                    className="mt-px size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  {approveBlockedReason}
                </p>
              ) : null}
              <Button
                variant="secondary"
                onClick={() => decide("REJECTED")}
                disabled={approval.status !== "PENDING"}
                className="mt-2 w-full"
              >
                Return for revision
              </Button>
              <p className="mt-3 text-center text-[0.6875rem] leading-[1.5] text-ink-faint">
                This decision is recorded in the audit trail and reversible until
                execution.
              </p>
            </div>
          </section>

          {/* Audit trail -- bound to the real packet audit entries. The latest few
              show; older entries collapse behind a disclosure. */}
          <section
            className="reveal panel rounded-(--radius-card)"
            style={{ "--d": 240 } as React.CSSProperties}
            aria-labelledby="audit-h"
          >
            <header className="flex items-center justify-between gap-2 border-b border-line px-5 py-4">
              <h2
                id="audit-h"
                className="text-[0.6875rem] font-semibold tracking-[0.1em] text-ink-faint uppercase"
              >
                <FileText
                  className="mr-1.5 inline size-3.5 align-[-0.15em]"
                  aria-hidden="true"
                />
                Audit trail ({auditTrail.length})
              </h2>
              <span className="font-mono text-[0.625rem] text-ink-faint">
                {packet.id}
              </span>
            </header>
            <AuditTrailList entries={auditTrail} />
            <div className="flex items-center gap-2 border-t border-line px-5 py-3 text-[0.6875rem] text-ink-faint">
              <span className="rounded border border-line bg-sink px-1.5 py-0.5 font-mono text-[0.625rem] text-ink-muted">
                {packet.effectiveMode}
              </span>
              Figures traceable to recorded signals.
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

// The audit trail timeline. The most recent THREE entries are always visible;
// any earlier entries collapse behind a disclosure so the rail stays calm while
// the full append-only log is still one click away (and present in the DOM).
const AUDIT_VISIBLE = 3;

function AuditTrailList({ entries }: { entries: AuditTrailEntry[] }) {
  // Newest first for the reader; the data is appended oldest-first.
  const ordered = [...entries].reverse();
  const head = ordered.slice(0, AUDIT_VISIBLE);
  const rest = ordered.slice(AUDIT_VISIBLE);

  return (
    <div className="px-5 py-4">
      <AuditTimeline entries={head} latestIndex={0} />
      {rest.length > 0 ? (
        <details className="group mt-2">
          <summary className="inline-flex min-h-6 cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-accent-strong underline-offset-2 hover:underline">
            <ArrowUpRight
              className="size-3 transition-transform group-open:rotate-90"
              aria-hidden="true"
            />
            <span className="tnum">{rest.length} earlier entries</span>
          </summary>
          <div className="mt-3">
            <AuditTimeline entries={rest} latestIndex={-1} />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function AuditTimeline({
  entries,
  latestIndex
}: {
  entries: AuditTrailEntry[];
  latestIndex: number;
}) {
  return (
    <ol className="relative flex flex-col gap-4 pl-4 before:absolute before:top-2 before:bottom-2 before:left-[0.1875rem] before:w-px before:bg-line">
      {entries.map((entry, index) => {
        const isLatest = index === latestIndex;
        return (
          // The array index is part of the key because at+actor+action can
          // repeat (two approvals in the same millisecond); the index is the
          // deterministic tiebreaker that keeps keys collision-free.
          <li
            key={`${index}-${entry.at}-${entry.actor}-${entry.action}`}
            className="relative"
          >
            <span
              aria-hidden="true"
              className={`absolute top-1 -left-[1rem] size-[0.5625rem] rounded-full border-2 ${
                isLatest
                  ? "border-accent bg-accent"
                  : "border-line-strong bg-surface"
              }`}
            />
            <p className="text-[0.8125rem] font-medium text-ink">
              {entry.action}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-ink-muted">
              {entry.detail}
            </p>
            <p className="tnum mt-0.5 font-mono text-[0.625rem] text-ink-faint">
              {entry.actor} · {shortDate(entry.at)} {shortTime(entry.at)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

// An inline runway/exposure bar. When motion is allowed it grows from 0 to its
// target on first paint, so the CSS `transition: width` fires (a single calm
// grow-in, not a paint-instantly block). The width INITIALIZES to the final
// value, so server render, first client render, reduced-motion, and no-RAF /
// jsdom all paint the final width immediately -- never a flash of 0 (and no
// hydration mismatch). Only when rAF exists and motion is allowed do we briefly
// drop to 0 and animate back up.
function RunwayBar({
  pct,
  sev
}: {
  pct: number;
  sev: "low" | "medium" | "high" | "critical";
}) {
  const [width, setWidth] = useState(pct);

  useEffect(() => {
    const hasRaf = typeof requestAnimationFrame === "function";
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // No animation: keep the bar at its final width (in case `pct` changed),
    // deferred one microtask so it is not a synchronous in-effect setState
    // (which the react-hooks lint forbids).
    if (!hasRaf || reduce) {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) setWidth(pct);
      });
      return () => {
        cancelled = true;
      };
    }

    // Animate: drop to 0, then grow to the target on the next frame so the CSS
    // width transition has a from-state to run against. The two rAF-scheduled
    // sets are already deferred out of the effect body.
    const id0 = requestAnimationFrame(() => {
      setWidth(0);
      requestAnimationFrame(() => setWidth(pct));
    });
    return () => cancelAnimationFrame(id0);
  }, [pct]);

  return (
    <div className="runway-track">
      <div
        className="runway-fill"
        data-sev={sev}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

// A gatekeeper check row -- accent tick + statement (quiet evidence, not a green
// light).
function GateCheck({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="flex size-[0.9375rem] shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong"
      >
        <CheckCircle2 className="size-2.5" />
      </span>
      {children}
    </li>
  );
}
