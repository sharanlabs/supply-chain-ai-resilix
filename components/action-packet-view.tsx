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
import { HttpUrlSchema } from "@/lib/schemas";
import type {
  AuditTrailEntry,
  DecisionPacketV2,
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

// Defense-in-depth: only http(s) reaches the DOM. Evidence URLs derive from GDELT
// signals validated by HttpUrlSchema upstream, but the render layer must not assume
// that holds — block javascript:/data: if an unvalidated path ever feeds an
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

// Compact currency for the display headline only — a 42px serif lede reads
// "$1.1M", not "$1,142,500". The exact figure is shown everywhere it matters
// (runway rows, threat params, claim provenance); only the hero is rounded.
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

// Pre-format the event type to a readable phrase IN JS — never a blanket CSS
// title-case. Small words (of/the/and/&/to/in/for/on) stay lowercase so a
// proper noun like "Strait of Hormuz" never becomes "Strait Of Hormuz". The
// location comes straight from data and is already correct, so it is left
// untouched. Works for any threat: chokepoint closure, tariff, hurricane,
// bankruptcy — not just the Gulf demo.
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
  return where ? `${event} — ${where}` : event;
}

// ---------------------------------------------------------------------------
// The Action Packet — the primary screen, read like a briefing document.
//
// Editorial 2-column command-center layout (matching the approved iter-3):
//   packet head (kicker + serif headline + meta)
//   main column  -> threat / exposure / runway / playbooks / drafts / tasks
//   sticky side  -> human approval / gatekeeper / audit trail
//
// Presentational + a self-contained approve/reject action with optimistic local
// state (the persisted /approve API only exists for the live V1 pipeline; on a
// seeded V2 packet it would 404, so the action mutates a local copy and appends
// a client-side audit line — honest, and the right behavior for a demo packet).
// ---------------------------------------------------------------------------
export function ActionOpsPacketView({ packet }: { packet: DecisionPacketV2 }) {
  const [approval, setApproval] = useState<{
    status: DecisionPacketV2["approvalStatus"];
    reason?: string;
    extraAudit: AuditTrailEntry[];
  }>({ status: packet.approvalStatus, extraAudit: [] });

  const degraded = packet.effectiveMode === "FAILED_TO_FALLBACK";
  const { threatCard, simulation, gatekeeper } = packet;
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
  // signal pipeline uses (HttpUrlSchema — http(s)-only). The "evidence allowlist
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

  // The headline figure the packet turns on: the worst-case revenue at risk.
  const peakRisk = useMemo(() => {
    if (!simulation || simulation.horizons.length === 0) return null;
    return Math.max(...simulation.horizons.map((h) => h.revenueAtRiskUsd));
  }, [simulation]);

  const earliestRunout = useMemo(() => {
    if (!simulation || simulation.productRunouts.length === 0) return null;
    return simulation.productRunouts
      .map((r) => r.runoutDate)
      .sort()[0];
  }, [simulation]);

  const auditTrail = [...packet.auditTrail, ...approval.extraAudit];

  // The human-approval invariant: a packet may only be approved while it is
  // PENDING *and* the gatekeeper cleared it for human review. A BLOCKED/WARN
  // gatekeeper verdict, or an already-decided packet, must make approval
  // impossible from the UI — both the control and the handler are gated, so the
  // gate can never be bypassed. (Return-for-revision stays available while
  // PENDING; only the approve path is gatekeeper-gated.)
  const canApprove =
    approval.status === "PENDING" && gatekeeper.approvedForHumanReview === true;

  // Why approval is blocked, surfaced under the disabled control. Derived from
  // the real gatekeeper verdict — never hardcoded.
  const approveBlockedReason =
    approval.status !== "PENDING"
      ? null // already decided — the status pill already communicates this
      : gatekeeper.approvedForHumanReview
        ? null
        : gatekeeper.status === "BLOCKED"
          ? "Gatekeeper BLOCKED this packet — resolve the failures above before approval."
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
    <div className="flex flex-col gap-8" data-testid="actionops-packet">
      {/* WCAG 2.2 SC 4.1.3: a persistent, always-mounted live region -- it exists
          empty when live, and when the packet mode flips to degraded (or recorded)
          its text changes so assistive tech announces it without moving focus.
          A conditionally-mounted region (the visible Badge) does NOT announce. */}
      <div role="status" aria-live="polite" className="sr-only" data-testid="mode-status">
        {modeAnnouncement}
      </div>
      {/* Packet head — the briefing lede. The at-risk figure is the one accented
          word in the serif headline. */}
      <div
        className="reveal flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"
        style={{ "--d": 40 } as React.CSSProperties}
      >
        <div>
          <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-accent-strong uppercase">
            Decision packet ·{" "}
            {approval.status === "PENDING"
              ? "Pending approval"
              : approval.status === "APPROVED"
                ? "Approved"
                : "Returned"}
          </p>
          <h1 className="headline mt-2 max-w-[22ch] text-[1.875rem] leading-[1.06] font-medium text-ink sm:text-[2.625rem]">
            {peakRisk !== null ? (
              <>
                A{" "}
                {threatCard.location.chokepoint ??
                  threatCard.location.region ??
                  "supply"}{" "}
                disruption puts <em>{compactCurrency(peakRisk)}</em> of supply
                at risk.
              </>
            ) : (
              threatHeadline(threatCard)
            )}
          </h1>
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
      </div>

      {/* The editorial 2-column command-center grid: main briefing + sticky
          decision rail. Collapses to one column under lg. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* ===================== MAIN COLUMN ===================== */}
        <div className="flex min-w-0 flex-col gap-6">
          {/* Threat card — severity-led, with the deterministic-verifier
              evidence line rendered as a verified statement. */}
          <section
            className="reveal panel rounded-(--radius-card) border-l-[3px] border-l-sev-critical p-6 sm:p-7"
            style={{ "--d": 120 } as React.CSSProperties}
            aria-labelledby="threat-h"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[0.625rem] font-semibold tracking-[0.13em] text-ink-faint uppercase">
                Threat card · Sentinel
              </span>
              <span className="font-mono text-[0.625rem] tracking-[0.04em] text-ink-faint">
                {threatCard.eventType}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
              <h2
                id="threat-h"
                className="headline max-w-[26ch] text-[1.375rem] leading-[1.14] font-medium text-ink sm:text-[1.625rem]"
              >
                {threatHeadline(threatCard)}
              </h2>
              <Badge tone={severityTone(threatCard.severity)}>
                {threatCard.severity}
              </Badge>
            </div>

            <p className="mt-4 max-w-[62ch] text-[0.9375rem] leading-7 text-ink-muted">
              {threatCard.summary}
            </p>

            {/* Threat parameters — the count-up lands one figure (confidence)
                for a calm sense of compute; the rest are static. */}
            <dl className="tnum mt-5 flex flex-wrap gap-x-10 gap-y-4 border-t border-b border-line py-4">
              <Param label="Confidence" value={`${confidenceCount}`} unit="%" />
              <Param
                label="Sources"
                value={`${honesty.cached + honesty.live}`}
                unit="cited"
              />
              {peakRisk !== null ? (
                <Param
                  label="Peak at risk"
                  value={formatCurrency(peakRisk)}
                />
              ) : null}
              <Param
                label="Exposed"
                value={`${packet.exposureResults.length}`}
                unit="suppliers"
              />
            </dl>

            {/* Deterministic-verifier evidence line. */}
            <div className="mt-5 flex items-start gap-3 rounded-md border border-accent/30 bg-accent-soft px-4 py-3.5">
              <span
                aria-hidden="true"
                className="mt-px flex size-[1.375rem] shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink"
              >
                <CheckCircle2 className="size-3.5" />
              </span>
              <div className="text-[0.8125rem] leading-[1.45] text-accent-strong">
                <span className="font-semibold">
                  Corroborated across {honesty.cached + honesty.live} sources
                </span>
                {capturedAt
                  ? `, recorded ${shortDate(capturedAt)}.`
                  : "."}{" "}
                {honesty.live > 0
                  ? `${honesty.live} live / ${honesty.cached} recorded.`
                  : "Recorded replay — no live AI claimed."}
                <span className="mt-1 block font-mono text-[0.625rem] tracking-[0.02em]">
                  VERIFIER · {packet.effectiveMode} ·{" "}
                  {evidenceAllowlistPassed
                    ? "evidence allowlist passed"
                    : `evidence allowlist: ${allowedEvidenceUrls.length}/${threatCard.evidenceUrls.length} URLs passed`}
                </span>
              </div>
            </div>

            {/* Source links. */}
            {/* min-h-6 makes every source link a >=24px WCAG 2.2 SC 2.5.8
                target (these are a link list, not a sentence, so the inline
                exception does not apply); the wider gap-y keeps wrapped rows
                from crowding the enlarged targets. */}
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

          {/* Exposure — a scannable table, not a card grid. */}
          <section
            className="reveal panel rounded-(--radius-card)"
            style={{ "--d": 200 } as React.CSSProperties}
            aria-labelledby="exp-h"
          >
            <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h2
                  id="exp-h"
                  className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-faint uppercase"
                >
                  Supplier exposure
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  {packet.exposureResults.length} suppliers in the blast radius,
                  ranked by exposure score.
                </p>
              </div>
              <AlertTriangle
                className="size-5 shrink-0 text-sev-high"
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
                    {packet.exposureResults.map((result) => (
                      <tr key={result.id}>
                        <td>
                          <div className="font-medium text-ink">
                            {result.supplierName}
                          </div>
                          <div className="mt-0.5 max-w-[42ch] text-xs leading-5 text-ink-faint">
                            {result.rationale}
                          </div>
                        </td>
                        <td className="tnum text-ink-muted">{result.country}</td>
                        <td className="font-mono text-xs text-ink-muted">
                          {result.sector}
                        </td>
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="flex-1">
                              <RunwayBar
                                pct={(result.exposureScore / maxExposure) * 100}
                                sev="high"
                              />
                            </div>
                            <span className="tnum w-8 text-right text-sm font-medium text-ink">
                              {result.exposureScore}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Runway — inline horizontal bars, revenue at risk over time. */}
          <section
            className="reveal panel rounded-(--radius-card) p-5"
            style={{ "--d": 280 } as React.CSSProperties}
            aria-labelledby="run-h"
          >
            <header className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2
                  id="run-h"
                  className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-faint uppercase"
                >
                  Runway
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Revenue at risk across the response window.
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
                </div>
                <div className="border-line lg:border-l lg:pl-6">
                  <h3 className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-faint uppercase">
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
                      First projected stockout —{" "}
                      <span className="tnum font-medium text-sev-critical">
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

          {/* Playbooks — role briefings. */}
          {packet.playbooks.length > 0 ? (
            <section
              className="reveal panel rounded-(--radius-card) p-5"
              style={{ "--d": 340 } as React.CSSProperties}
            >
              <header className="mb-4 flex items-center gap-2">
                <Workflow className="size-4 text-accent" aria-hidden="true" />
                <h2 className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-faint uppercase">
                  Role playbooks
                </h2>
              </header>
              <div className="grid gap-5 md:grid-cols-2">
                {packet.playbooks.map((playbook) => (
                  <article
                    key={playbook.id}
                    className="border-l-2 border-accent/40 pl-4"
                  >
                    <h3 className="text-sm font-semibold text-ink">
                      {playbook.role}
                    </h3>
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
            </section>
          ) : null}

          {/* Supplier drafts — never sends. */}
          <section
            className="reveal panel rounded-(--radius-card) p-5"
            style={{ "--d": 400 } as React.CSSProperties}
          >
            <header className="mb-1 flex items-center gap-2">
              <Mail className="size-4 text-accent" aria-hidden="true" />
              <h2 className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-faint uppercase">
                Drafted supplier emails
              </h2>
            </header>
            <p className="mb-4 text-xs text-ink-faint">
              Drafts only — nothing sends without human approval.
            </p>
            {packet.supplierMessages.length === 0 ? (
              <p className="text-sm text-ink-muted">
                No supplier drafts generated.
              </p>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {packet.supplierMessages.map((message) => (
                  <article
                    key={message.id}
                    className="rounded-md border border-line bg-sink/60 p-4"
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
                    <p className="mt-1 text-sm leading-6 whitespace-pre-line text-ink-muted">
                      {message.body}
                    </p>
                    {message.claims.length > 0 ? (
                      <ul className="mt-3 space-y-1 border-t border-line pt-2 text-xs text-ink-faint">
                        {message.claims.map((claim, index) => (
                          <li
                            key={`${message.id}-claim-${index}`}
                            className="tnum flex items-start gap-1.5"
                          >
                            <CheckCircle2
                              className="mt-0.5 size-3 shrink-0 text-positive"
                              aria-hidden="true"
                            />
                            <span className="min-w-0 break-words">
                              {String(claim.value)} {claim.unit}{" "}
                              <span className="font-mono break-all text-ink-faint">
                                ← {claim.sourcePath}
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

          {/* Task list. */}
          {packet.actionItems.length > 0 ? (
            <section
              className="reveal panel rounded-(--radius-card)"
              style={{ "--d": 460 } as React.CSSProperties}
            >
              <header className="border-b border-line px-5 py-4">
                <h2 className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-faint uppercase">
                  Task list
                </h2>
              </header>
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
                        <td className="font-medium text-ink">{item.title}</td>
                        <td className="text-ink-muted">{item.owner}</td>
                        <td className="tnum text-ink-muted">
                          {item.dueDate ? shortDate(item.dueDate) : "—"}
                        </td>
                        <td>
                          <Badge tone="neutral">{item.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>

        {/* ===================== DECISION RAIL ===================== */}
        <aside className="flex flex-col gap-6 lg:sticky lg:top-[5.5rem]">
          {/* The approve action — the trust anchor of the packet. */}
          <section
            className="reveal panel overflow-hidden rounded-(--radius-card)"
            style={{ "--d": 160 } as React.CSSProperties}
            aria-labelledby="approve-h"
          >
            <div className="bg-gradient-to-b from-accent-soft/60 to-transparent p-5 sm:p-6">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold tracking-[0.06em] uppercase ${
                    approval.status === "APPROVED"
                      ? "bg-positive-soft text-positive"
                      : approval.status === "REJECTED"
                        ? "bg-danger-soft text-danger"
                        : "bg-caution-soft text-caution-ink"
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
                className="headline mt-3 text-[1.3125rem] leading-tight font-medium text-ink"
              >
                Approve the action packet
              </h2>
              <p className="mt-2 text-[0.8125rem] leading-[1.55] text-ink-muted">
                {approval.reason ??
                  "Code calculates the exposure; the AI drafts the response. Approval releases the drafts, tasks, and one-pager for execution and writes an audit entry — and even then, nothing sends automatically."}
              </p>

              {/* Gatekeeper PASS — the trust anchor next to APPROVE, bound to
                  the real gatekeeper verdict (never hardcoded). */}
              <div className="mt-4 rounded-md border border-line bg-ground p-3.5">
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-ink-faint uppercase">
                    Gatekeeper
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 text-[0.6875rem] font-bold tracking-[0.06em] ${
                      gatekeeper.status === "PASS"
                        ? "text-positive"
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
                This action is logged and reversible until execution.
              </p>
            </div>
          </section>

          {/* Audit trail — bound to the real packet audit entries. */}
          <section
            className="reveal panel rounded-(--radius-card)"
            style={{ "--d": 240 } as React.CSSProperties}
            aria-labelledby="audit-h"
          >
            <header className="flex items-center justify-between gap-2 border-b border-line px-5 py-4">
              <h2
                id="audit-h"
                className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-faint uppercase"
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
            <ol className="relative flex flex-col gap-4 px-5 py-4 pl-9 before:absolute before:top-5 before:bottom-5 before:left-[1.5rem] before:w-px before:bg-line">
              {auditTrail.map((entry, index) => {
                const isLatest = index === auditTrail.length - 1;
                return (
                  // The array index is part of the key because at+actor+action
                  // can repeat (two approvals in the same millisecond); the index
                  // is the deterministic tiebreaker that keeps keys collision-free
                  // for an append-only audit log.
                  <li
                    key={`${index}-${entry.at}-${entry.actor}-${entry.action}`}
                    className="relative"
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute top-1 -left-[0.875rem] size-[0.5625rem] rounded-full border-2 ${
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

// An inline runway/exposure bar. When motion is allowed it grows from 0 to its
// target on first paint, so the CSS `transition: width` fires (a single calm
// grow-in, not a paint-instantly block). The width INITIALIZES to the final
// value, so server render, first client render, reduced-motion, and no-RAF /
// jsdom all paint the final width immediately — never a flash of 0 (and no
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

// A single threat-parameter cell — uppercase label over a serif figure.
function Param({
  label,
  value,
  unit
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div>
      <dt className="text-[0.6875rem] tracking-[0.1em] text-ink-faint uppercase">
        {label}
      </dt>
      <dd className="headline mt-1.5 text-2xl leading-none font-medium text-ink">
        {value}
        {unit ? (
          <span className="ml-1 font-sans text-[0.8125rem] font-normal text-ink-muted">
            {unit}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

// A gatekeeper check row — teal tick + statement.
function GateCheck({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="flex size-[0.9375rem] shrink-0 items-center justify-center rounded-full bg-positive-soft text-positive"
      >
        <CheckCircle2 className="size-2.5" />
      </span>
      {children}
    </li>
  );
}
