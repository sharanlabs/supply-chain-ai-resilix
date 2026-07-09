"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CircleSlash,
  Clock3,
  Factory,
  FileText,
  Gauge,
  GitBranch,
  Hourglass,
  LifeBuoy,
  Lock,
  Mail,
  RotateCcw,
  Scale,
  ShieldCheck,
  TrendingDown,
  Workflow
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCountUp } from "@/lib/use-count-up";
import { ACTION_CONFIDENCE_FLOOR } from "@/lib/agents/actionops/recommendation";
import { HttpUrlSchema } from "@/lib/schemas";
import type {
  AgentMode,
  AgentRun,
  AuditTrailEntry,
  DecisionPacketV2,
  MissingEvidence,
  PublicSignal,
  Recommendation,
  RecoveryOption,
  SkepticGateOutcome
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

// A plain-English label for the run mode, so the audit footer reads "Recorded",
// never the raw enum (REPLAY / FAILED_TO_FALLBACK) a procurement lead should not
// have to decode. The exact mode stays available on hover (title) for an auditor.
function modeLabel(mode: DecisionPacketV2["effectiveMode"]): string {
  switch (mode) {
    case "LIVE_AI":
      return "Live";
    case "DETERMINISTIC_RULES":
      return "Recorded data";
    case "FAILED_TO_FALLBACK":
      return "Live feed down";
    case "REPLAY":
    default:
      return "Recorded";
  }
}

// Plain-English label for ONE agent step's run mode in the deliberation trail. Reuses the
// run-mode honesty: a recorded replay reads "Recorded", a degraded fallback "Degraded", a
// by-design rules step "Rules", a live model call "Live AI". NEVER the raw enum on the
// glass. The exact enum stays reachable for an auditor in the chip's title -- but via
// agentModeTitle (a DESCRIPTIVE form), never the bare "REPLAY" string the e2e pins to the
// single audit-footer chip.
function agentModeLabel(mode: AgentMode): string {
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

// The auditor's hover form -- carries the raw enum, but NEVER as the bare token, so the
// e2e's single-match [title="REPLAY"] (the audit footer chip) is not duplicated here.
function agentModeTitle(mode: AgentMode): string {
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

// The recovery action type in lead-facing words (the raw enum never reaches the glass).
function recoveryActionLabel(actionType: RecoveryOption["actionType"]): string {
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

// Reversibility -> the GOVERNANCE read. The harder a move is to undo, the more it needs a
// human's sign-off (the graduated-autonomy dial). Plain words, no saturated color.
function reversibilityLabel(r: RecoveryOption["reversibility"]): string {
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

// The cross-family Skeptic's verdict, distilled to a single on-glass state. Returns null
// (render nothing) when there is no Skeptic run, OR when the only Skeptic run is the
// DETERMINISTIC affirmative placeholder (model "deterministic-rules") -- which adds no real
// adversarial gate, so claiming "a second AI challenged this" would overclaim. When a
// GENUINE cross-family challenge ran (a real model id, preserved through the REPLAY
// relabel), the held-vs-on-hold read keys off the PACKET RECOMMENDATION, never the run's
// validationStatus: a live REJECT is a HEALTHY run (validationStatus PASS) that still forces
// NO_ACTION, so validationStatus would ship a false "it held". A broken critic (degraded) is
// a distinct third state that never claims the finding held.
type SkepticState = "cleared" | "annotated" | "held-back" | "degraded";

function skepticChallengeState(
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
  // ANNOTATED: the gate DOWNGRADED a live REJECT to a recorded caution on an independently strong
  // finding -- the plan ACTs, but the critic OBJECTED. We must NOT show the positive
  // "it held" clear (that would overclaim the critic endorsed it); a distinct, honest state instead.
  // gateOutcome is set in CODE (authoritative-binding) and only present on a genuine cross-family run.
  // REQUIRE recommendation ACT (Codex P2 defense-in-depth): the annotated copy says "action
  // proceeds", so a malformed ANNOTATED+NO_ACTION packet (which the schema superRefine already
  // rejects at parse) must NEVER reach it -- fall through to the held-back read instead of claiming
  // outbound action proceeds on a refusal.
  if (gateOutcome === "ANNOTATED" && recommendation === "ACT") {
    return "annotated";
  }
  return recommendation === "NO_ACTION" ? "held-back" : "cleared";
}

// Plain-English audit labels, so the trail reads "Approved" / "Served from
// recorded data", not the raw enum (HUMAN_APPROVAL / REPLAY_SERVED) a
// non-technical reviewer would have to decode. The enum stays the stored value
// (the DB + the API evals assert on it); this is presentation only. Any unmapped
// action degrades to a title-cased form of its code, never a blank.
function auditActionLabel(action: string): string {
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

// "procurement-reviewer" -> "Procurement reviewer".
function auditActorLabel(actor: string): string {
  const spaced = actor.replace(/[-_]/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : actor;
}

// "TEXTILES_APPAREL" -> "Textiles Apparel" / "OTHER_UNMAPPED" -> "Other Unmapped".
// Humanizes a raw enum token so a sector/category reads as words, not a CONSTANT,
// on the glass. The stored value is unchanged (the data layer keeps the enum).
function humanizeToken(token: string): string {
  return token
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// The automatic-checks verdict in lead-facing words, not the raw enum.
function gateStatusLabel(status: string): string {
  switch (status) {
    case "PASS":
      return "Cleared";
    case "BLOCKED":
      return "Blocked";
    case "WARN":
      return "Needs review";
    default:
      return humanizeToken(status);
  }
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
      return "from the underlying data";
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
        unconfirmed, low-confidence source. The exposure and runway below are shown for
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

// The cross-family Skeptic's verdict, as ONE calm trust line on the glass -- the
// human-meaningful signal (a second, independent reviewer challenged this finding) lifted
// out of the machinery. Four honest states: it HELD (the finding cleared on an ACT plan, the
// critic ACCEPTED), it raised a CAUTION but the plan proceeds (annotated -- the critic objected
// yet the finding was independently strong, so the gate downgraded the veto to a
// recorded caution; action proceeds on the finding's own corroboration/confidence, human approval
// still required), it is ON HOLD (NO_ACTION -- the reviewer ran but the copy does NOT claim it was
// the holder, since a thin-evidence hold can co-occur with a Skeptic accept; the refusal above
// carries the why), or the review was DEGRADED (the critic broke and could not complete). Only
// "cleared" reads in the positive accent seal; caution/hold/degrade read calm-neutral, never alarm.
function SkepticTrustLine({ state }: { state: SkepticState }) {
  const cleared = state === "cleared";
  return (
    <div
      className={`mt-4 flex items-start gap-3 rounded-lg border px-4 py-3 ${
        cleared
          ? "border-accent/25 bg-accent-soft shadow-[inset_0_1px_0_oklch(1_0_0/0.4)]"
          : "border-line bg-sink"
      }`}
    >
      <Scale
        aria-hidden="true"
        className={`mt-0.5 size-4 shrink-0 ${cleared ? "text-accent-strong" : "text-ink-muted"}`}
      />
      <p
        className={`text-[0.8125rem] leading-[1.5] ${cleared ? "text-accent-strong" : "text-ink-muted"}`}
      >
        {state === "cleared" ? (
          <>
            An independent reviewer -- a different AI model -- challenged this finding, and it
            held.
          </>
        ) : state === "annotated" ? (
          // The critic OBJECTED, but the finding was independently strong, so the
          // gate downgraded the veto to a recorded caution (ANNOTATED). Honest, calm-neutral: name
          // the caution AND that action proceeds on the finding's own merits, with human approval.
          <>
            An independent reviewer -- a different AI model -- raised a caution about this finding;
            outbound action proceeds on its independent corroboration and confidence, and still
            requires your approval before anything is sent.
          </>
        ) : state === "held-back" ? (
          // Neutral by design: a NO_ACTION packet can be held by the thin-evidence gate even
          // when the Skeptic itself ACCEPTED (applySkepticGate only forces NO_ACTION on a
          // non-accept). The `accepted` boolean is not on the AgentRun, and binding from the
          // run's prose would violate the never-bind-from-prose rule -- so this states the
          // reviewer ran and action is held, WITHOUT claiming the Skeptic was the holder. The
          // RefusalCard's missingEvidence carries the actual reason (Skeptic-hold vs thin).
          <>
            An independent reviewer -- a different AI model -- reviewed this finding; outbound
            action is on hold (see the recommendation above for why).
          </>
        ) : (
          <>
            An independent review was attempted but could not complete, so outbound action is
            held as a precaution.
          </>
        )}
      </p>
    </div>
  );
}

// The deliberation trajectory -- the governed multi-agent loop made VISIBLE. The ordered
// chain of agent steps (Sentinel -> Verifier -> Atlas -> Simulator -> [Skeptic] ->
// Strategist -> Dispatcher), each with its run mode + the machine's own one-line summary +
// whether it validated. This is MACHINERY, so it lives behind a disclosure (off the calm
// default glass); honest labels throughout (a recorded replay reads "Recorded", a degraded
// fallback "Degraded"), the raw enum only in an auditor's hover. Rendered in the array's own
// order (the producer emits execution order) -- never re-sorted, so the audit reflects what
// actually ran. The summaries are the machine's OWN log lines, shown verbatim (this audit
// layer, behind a disclosure, is the sanctioned home for the machine's raw record).
function DeliberationTrail({ runs }: { runs: AgentRun[] }) {
  return (
    <details className="group">
      <summary className="flex min-h-6 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
        <span className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.1em] text-ink-faint uppercase">
          <GitBranch className="size-4 text-accent" aria-hidden="true" />
          How this was reasoned
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-strong">
          <span className="tnum">{runs.length} steps</span>
          <ArrowUpRight
            className="size-3.5 transition-transform group-open:rotate-90"
            aria-hidden="true"
          />
        </span>
      </summary>
      <div className="border-t border-line bg-surface px-5 py-5">
        <p className="mb-4 max-w-[64ch] text-sm leading-6 text-ink-muted">
          Each step did one job and handed off to the next. This is the audit of how the
          plan was built -- shown honestly, recorded steps labelled as recorded.
        </p>
        <ol className="divide-y divide-line">
          {runs.map((run, index) => {
            const failed = run.validationStatus === "FAIL";
            return (
              <li
                key={run.id || `${index}-${run.agentName}`}
                className="py-3 first:pt-0 last:pb-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="tnum font-mono text-[0.625rem] text-ink-faint"
                  >
                    {index + 1}.
                  </span>
                  <span className="text-[0.8125rem] font-semibold text-ink">
                    {run.agentName}
                  </span>
                  <span
                    className="rounded border border-line bg-sink px-1.5 py-0.5 font-mono text-[0.625rem] text-ink-muted"
                    title={agentModeTitle(run.mode)}
                  >
                    {agentModeLabel(run.mode)}
                  </span>
                  {failed ? (
                    <Badge tone="critical">Needs review</Badge>
                  ) : (
                    <span className="inline-flex items-center text-accent-strong">
                      <CheckCircle2 className="size-3" aria-hidden="true" />
                      <span className="sr-only">passed validation</span>
                    </span>
                  )}
                </div>
                <p className="mt-1 max-w-[72ch] text-xs leading-5 text-ink-muted">
                  {run.summary}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </details>
  );
}

// The scored recovery options -- the structural moves available, ranked by fit. On the glass
// (human decision-support, not machinery): each move's cost, the days it buys back, how much
// risk it takes off, and -- the GOVERNANCE dial -- how reversible it is (the hardest-to-undo
// moves are the ones that most need a human's sign-off). Withheld entirely on a NO_ACTION
// packet (the schema enforces it), so this only renders on an ACT plan.
function RecoveryOptions({ options }: { options: RecoveryOption[] }) {
  // Ranked by score, highest first -- the producer scores them; the order is the read. Sort a
  // copy (never mutate the packet array).
  const ranked = [...options].sort((a, b) => b.score - a.score);
  return (
    <div className="divide-y divide-line">
      {ranked.map((opt, index) => {
        const hardToReverse = opt.reversibility === "LOW";
        return (
          <article key={opt.id} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={index === 0 ? "accent" : "neutral"}>
                  {recoveryActionLabel(opt.actionType)}
                </Badge>
                <h3 className="text-[0.9375rem] font-semibold text-ink">{opt.title}</h3>
              </div>
              {index === 0 ? (
                <span className="shrink-0 text-[0.6875rem] font-semibold tracking-[0.06em] text-accent-strong uppercase">
                  Lead option
                </span>
              ) : null}
            </div>
            <p className="max-w-[68ch] text-sm leading-6 text-ink-muted">{opt.summary}</p>
            {/* The metrics strip -- separated by spacing alone (no decorative low-contrast
                dots, which axe flags as color-contrast incomplete). Each label is faint,
                each value ink (AA). Reversibility is set apart as the governance dial. */}
            <div className="tnum flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-ink-faint">
              <span>
                Cost{" "}
                <span className="font-medium text-ink">
                  {formatCurrency(opt.estimatedCostUsd)}
                </span>
              </span>
              <span>
                Buys back <span className="font-medium text-ink">~{opt.speedGainDays} days</span>
              </span>
              <span>
                Cuts risk <span className="font-medium text-ink">~{opt.riskReductionPct}%</span>
              </span>
              <span className="inline-flex items-center gap-1 font-medium text-ink">
                {hardToReverse ? (
                  <Lock className="size-3 text-ink-muted" aria-hidden="true" />
                ) : (
                  <RotateCcw className="size-3 text-ink-muted" aria-hidden="true" />
                )}
                {reversibilityLabel(opt.reversibility)}
              </span>
              {opt.approvalRequired ? (
                <span className="font-medium text-accent-strong">Needs your approval</span>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
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
    ? "The live data feed is down. This plan is running on recorded data; every figure still traces to a recorded source."
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

  // Map supplier id -> human name, so a draft card reads "Gulf Components Ltd",
  // not the raw "SUP-0042" id, on the default glass. The id stays available in the
  // claim source-detail trace and the audit trail for an auditor.
  const supplierNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of packet.exposureResults) map.set(r.supplierId, r.supplierName);
    return map;
  }, [packet.exposureResults]);

  const maxHorizon = useMemo(() => {
    if (!simulation) return 1;
    return Math.max(...simulation.horizons.map((h) => h.revenueAtRiskUsd), 1);
  }, [simulation]);

  // The cross-family Skeptic run (Phase 4), if one is present. The homepage replay fixture
  // predates the Skeptic (6 runs, no Skeptic), so this is DATA-DRIVEN: absent => no Skeptic
  // line, no crash. skepticState collapses the run + the packet recommendation into the one
  // honest on-glass state (see skepticChallengeState).
  const skepticRun = useMemo(
    () => packet.agentRuns.find((r) => r.agentName === "Skeptic"),
    [packet.agentRuns]
  );
  const skepticState = skepticChallengeState(skepticRun, recommendation, packet.skepticGateOutcome);

  // P1 sourcing read: how many exposed suppliers are single-source (no qualified backup) --
  // the concentration risk. Only meaningful when the rows carry the P1 singleSource field;
  // an older fixture without it falls back to the lead-time note (hasData=false), so the
  // shared note never asserts a backup claim it cannot prove.
  const sourcing = useMemo(() => {
    const rows = packet.exposureResults;
    const hasData = rows.some((r) => r.singleSource !== undefined);
    const singleSourceCount = rows.filter((r) => r.singleSource === true).length;
    return { hasData, singleSourceCount, total: rows.length };
  }, [packet.exposureResults]);

  // P1 survival read (TTR/TTS framing): days of cover before the first stockout
  // (survivalDays) vs the worst exposed lane's time-to-restore (max recoveryDays). Covered
  // when cover >= restore; exposed by the gap when it falls short. Null unless both the TTS
  // and at least one TTR are present (additive-optional), so older fixtures render nothing.
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
    ? "No outbound action to approve -- the disruption must be confirmed first."
    : approval.status !== "PENDING"
      ? null // already decided -- the status pill already communicates this
      : gatekeeper.approvedForHumanReview
        ? null
        : gatekeeper.status === "BLOCKED"
          ? "Automatic checks blocked this plan -- resolve the failures above before approval."
          : "Automatic checks have not cleared this plan for review.";

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
              ? "Plan approved. Drafts remain unsent until a person dispatches them."
              : "Plan returned; no drafts dispatched."
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
          0. BLUF VERDICT BAR (S-D.2) -- the register's bottom-line-up-front:
          the VERDICT, the load-bearing figures, and the path to the decision,
          before any narrative (AR 25-50 / inverted-pyramid, live-verified
          2026-07-08). Every value is a real packet derivation shared with the
          sections below -- nothing here is computed twice. The Approve
          affordance is an ANCHOR to the audited decision panel (#approve-h),
          never a second approval control: the atomic, gatekeeper-gated flow
          keeps its one door. Non-sticky by design -- a second sticky band
          would re-open the SC 2.4.11 focus-obscured geometry the masthead's
          scroll-padding is tuned for.
          ============================================================ */}
      <section
        aria-label="Bottom line up front"
        data-testid="bluf-bar"
        className="reveal panel flex flex-wrap items-center gap-x-5 gap-y-3 rounded-(--radius-card) px-5 py-4"
        style={{ "--d": 0 } as React.CSSProperties}
      >
        <span
          className={`inline-flex items-center rounded-md px-2.5 py-1 font-mono text-[0.6875rem] font-semibold tracking-[0.08em] uppercase shadow-[var(--shadow-e1)] ${
            isNoAction
              ? "bg-caution-soft text-caution-ink"
              : "bg-accent-strong text-accent-ink"
          }`}
        >
          {isNoAction ? "Hold" : "Act"}
        </span>
        <p className="min-w-[16rem] flex-1 text-sm leading-6 text-ink">
          {isNoAction
            ? "The evidence is too thin to act on -- nothing is drafted until the disruption is confirmed."
            : approval.status === "APPROVED"
              ? "Response approved -- drafts remain unsent until a person dispatches them."
              : approval.status === "REJECTED"
                ? "Response returned for revision -- nothing goes out."
                : `Approve the drafted response${
                    earliestRunout
                      ? ` before the first stockout on ${shortDate(earliestRunout)}`
                      : ""
                  } -- nothing sends without you.`}
        </p>
        <div className="tnum flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.8125rem] text-ink-muted">
          {peakRisk !== null ? (
            <span className="inline-flex items-center gap-1.5" title="Peak revenue at risk">
              <TrendingDown className="size-3.5 text-sev-critical" aria-hidden="true" />
              <span className="font-medium text-ink">{compactCurrency(peakRisk)}</span> at risk
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5" title="Exposed suppliers">
            <Factory className="size-3.5 text-ink-faint" aria-hidden="true" />
            <span className="font-medium text-ink">{packet.exposureResults.length}</span> suppliers
          </span>
          {earliestRunout ? (
            <span className="inline-flex items-center gap-1.5" title="First projected stockout">
              <CalendarClock className="size-3.5 text-ink-faint" aria-hidden="true" />
              <span className="font-medium text-ink">{shortDate(earliestRunout)}</span>
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5" title="Threat-read confidence">
            <Gauge className="size-3.5 text-ink-faint" aria-hidden="true" />
            <span className="font-medium text-ink">{confidencePct}%</span> confidence
          </span>
          {skepticState === "cleared" || skepticState === "annotated" ? (
            <span
              className="inline-flex items-center gap-1.5"
              title={
                skepticState === "cleared"
                  ? "A second AI from a different company challenged this finding and accepted it"
                  : "The second AI raised a caution; action proceeds on the finding's independent corroboration and needs your approval"
              }
            >
              <ShieldCheck
                className={`size-3.5 ${skepticState === "cleared" ? "text-accent-strong" : "text-caution-ink"}`}
                aria-hidden="true"
              />
              2nd AI {skepticState === "cleared" ? "agreed" : "cautioned"}
            </span>
          ) : null}
        </div>
        {canApprove ? (
          <a
            href="#approve-h"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-accent-strong bg-accent px-3.5 text-sm font-semibold text-accent-ink shadow-[var(--shadow-e2),inset_0_1px_0_oklch(1_0_0/0.18)] hover:bg-accent-strong"
          >
            Review &amp; approve
            <ArrowDown className="size-3.5" aria-hidden="true" />
          </a>
        ) : null}
      </section>

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
            Response plan ·{" "}
            {isNoAction
              ? "no action recommended"
              : approval.status === "PENDING"
                ? "awaiting your approval"
                : approval.status === "APPROVED"
                  ? "approved"
                  : "returned for revision"}
          </p>
          <h1 className="mt-3 text-[1.625rem] leading-[1.18] font-semibold tracking-[-0.01em] text-ink sm:text-[2rem] sm:leading-[1.16]">
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
            Plan{" "}
            <span className="font-mono font-medium text-ink">{packet.id}</span>
          </div>
          <div className="leading-7">
            Compiled{" "}
            <span className="font-medium text-ink">
              {shortTime(packet.createdAt)}
            </span>
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
                {honesty.cached + honesty.live} sources
              </span>
              {capturedAt ? <> captured {shortDate(capturedAt)}</> : null}.{" "}
              <span className="text-ink-faint">
                {honesty.live > 0
                  ? `${honesty.live} live, ${honesty.cached} recorded.`
                  : "Recorded replay -- no live AI is claimed."}
              </span>
            </p>

            {/* Quiet evidence line -- the provenance/verifier statement as a trust
                feature, in the calm accent, never red-alert chrome. A soft accent
                wash (solid accent-soft, not a gradient) lifted by an inset top
                highlight so it reads as the packet's trust seal. */}
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-accent/25 bg-accent-soft px-4 py-3 shadow-[inset_0_1px_0_oklch(1_0_0/0.4)]">
              <ShieldCheck
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-accent-strong"
              />
              <p className="text-[0.8125rem] leading-[1.5] text-accent-strong">
                Every figure in this plan traces back to a named source.
                {!evidenceAllowlistPassed ? (
                  <span className="mt-0.5 block text-[0.75rem] text-accent">
                    {allowedEvidenceUrls.length} of{" "}
                    {threatCard.evidenceUrls.length} source links cleared the
                    safety check.
                  </span>
                ) : null}
              </p>
            </div>

            {/* The cross-family Skeptic's verdict -- the human-meaningful "a second,
                independent reviewer challenged this" signal on the glass. Renders ONLY when
                a genuine cross-family challenge ran; absent on the 6-run replay fixture. */}
            {skepticState ? <SkepticTrustLine state={skepticState} /> : null}

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

            {/* The raw signals behind this read -- the former Events tab, folded
                in as on-demand depth so the consolidated briefing loses no
                content while the spine stays calm. Collapsed by default; present
                in the DOM so it is always discoverable. */}
            {packet.publicSignals.length > 0 ? (
              <details className="group mt-4 border-t border-line pt-3">
                <summary className="inline-flex min-h-6 cursor-pointer list-none items-center gap-1 text-xs font-medium text-accent-strong underline-offset-2 hover:underline">
                  <ArrowUpRight
                    className="size-3 transition-transform group-open:rotate-90"
                    aria-hidden="true"
                  />
                  The {packet.publicSignals.length} signals behind this read
                </summary>
                <ul className="mt-3 flex flex-col gap-3">
                  {packet.publicSignals.map((signal) => (
                    <li key={signal.id} className="text-xs leading-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink">
                          {signal.source}
                        </span>
                        <Badge tone={severityTone(signal.severity)}>
                          {signal.severity}
                        </Badge>
                        <span className="text-ink-faint">
                          {signal.status === "LIVE"
                            ? "live"
                            : signal.status === "FAILED"
                              ? "failed"
                              : "recorded"}{" "}
                          · {signal.freshnessMinutes} min old
                        </span>
                      </div>
                      <p className="mt-1 max-w-[72ch] text-ink-muted">
                        {signal.summary}
                      </p>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
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
                {/* The context EVERY exposed supplier shares, stated once. The
                    sourcing clause is DATA-DRIVEN off the P1 singleSource field --
                    a hardcoded "none with a qualified backup" was false against the
                    mixed real data, so the count is read from the rows, and an older
                    fixture without the field falls back to the lead-time note. */}
                {packet.exposureResults.length > 0 ? (
                  <p className="mt-1.5 max-w-[60ch] text-xs leading-5 text-ink-faint">
                    {sourcing.hasData ? (
                      sourcing.singleSourceCount === 0 ? (
                        <>
                          All {sourcing.total} sit on lanes routed through the
                          affected chokepoint, each with a qualified backup on file.
                          Per row: sourcing and the estimated time to restore.
                        </>
                      ) : sourcing.singleSourceCount === sourcing.total ? (
                        <>
                          All {sourcing.total} sit on lanes routed through the
                          affected chokepoint, none with a qualified backup on file.
                          Per row: sourcing and the estimated time to restore.
                        </>
                      ) : (
                        <>
                          All {sourcing.total} sit on lanes routed through the
                          affected chokepoint; {sourcing.singleSourceCount} of them
                          are single-source with no qualified backup. Per row:
                          sourcing and the estimated time to restore.
                        </>
                      )
                    ) : (
                      <>
                        All {sourcing.total} sit on lanes routed through the affected
                        chokepoint. Per row: the risk tier and the standard lead time.
                      </>
                    )}
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
                            {/* P1 TTR -- the estimated time to restore supply on
                                this lane, a disruption-aware figure distinct from
                                the standard lead time. Additive-optional: only when
                                Atlas stamped recoveryDays. */}
                            {result.recoveryDays !== undefined ? (
                              <div className="tnum mt-0.5 text-[0.6875rem] leading-5 text-ink-faint">
                                Est. time to restore{" "}
                                <span className="font-medium text-ink-muted">
                                  ~{result.recoveryDays} days
                                </span>
                              </div>
                            ) : null}
                          </td>
                          <td className="tnum text-ink-muted">
                            {result.country}
                          </td>
                          <td className="text-xs text-ink-muted">
                            {humanizeToken(result.sector)}
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
            </header>
            {/* P1 survival read (TTR/TTS): days of cover before the first stockout
                vs the worst exposed lane's time-to-restore. The gap is the window
                the response must bridge. Two bars on one day-scale make the overshoot
                literal; both reuse RunwayBar so the SC 1.4.11 edge token is carried.
                Additive-optional -- absent unless survivalDays + a recoveryDays exist. */}
            {survival ? (
              <div className="mb-5 rounded-lg border border-line bg-sink p-4 shadow-[inset_0_1px_2px_oklch(0.3_0.02_286/0.05)]">
                <div className="flex items-center gap-2">
                  <Hourglass
                    className="size-3.5 shrink-0 text-ink-muted"
                    aria-hidden="true"
                  />
                  <h3 className="text-[0.6875rem] font-semibold tracking-[0.1em] text-ink-faint uppercase">
                    Cover vs restore time
                  </h3>
                </div>
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-[7rem_1fr_auto] items-center gap-3">
                    <span className="text-xs text-ink-muted">Days of cover</span>
                    <RunwayBar
                      pct={(survival.tts / survival.scale) * 100}
                      sev="low"
                    />
                    <span className="tnum w-16 text-right text-sm font-medium text-ink">
                      {survival.tts} days
                    </span>
                  </div>
                  <div className="grid grid-cols-[7rem_1fr_auto] items-center gap-3">
                    <span className="text-xs text-ink-muted">Time to restore</span>
                    <RunwayBar
                      pct={(survival.worstTtr / survival.scale) * 100}
                      sev={survival.gap > 0 ? "high" : "low"}
                    />
                    <span className="tnum w-16 text-right text-sm font-medium text-ink">
                      {survival.worstTtr} days
                    </span>
                  </div>
                </div>
                <p className="tnum mt-3 text-xs leading-5 text-ink-muted">
                  {survival.gap > 0 ? (
                    <>
                      About {survival.tts} days of cover before the first stockout,
                      but the most exposed lane needs about {survival.worstTtr} days
                      to restore --{" "}
                      <span className="font-medium text-sev-critical-ink">
                        a ~{survival.gap}-day gap
                      </span>{" "}
                      the response must bridge.
                    </>
                  ) : (
                    <>
                      The {survival.tts} days of cover outlast the ~
                      {survival.worstTtr}-day restore time -- no exposure gap on the
                      worst lane.
                    </>
                  )}
                </p>
              </div>
            ) : null}
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
                        {/* Revenue at risk, with the P1 margin-at-risk beneath it --
                            finance decides on contribution, not gross revenue.
                            Additive-optional: the margin line only when the
                            Simulator stamped marginAtRiskUsd. */}
                        <div className="tnum w-24 text-right">
                          <div className="text-sm font-medium text-ink">
                            {formatCurrency(horizon.revenueAtRiskUsd)}
                          </div>
                          {horizon.marginAtRiskUsd !== undefined ? (
                            <div className="text-[0.625rem] leading-4 text-ink-faint">
                              {formatCurrency(horizon.marginAtRiskUsd)} margin
                            </div>
                          ) : null}
                        </div>
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
              4b. WHAT WE COULD DO -- the scored recovery options (P1).
              The structural moves available, ranked by fit, with
              reversibility as the governance dial. On the glass (human
              decision-support); withheld entirely on a NO_ACTION packet.
              -------------------------------------------------------- */}
          {recommendation !== "NO_ACTION" &&
          packet.recoveryOptions &&
          packet.recoveryOptions.length > 0 ? (
            <section
              className="reveal panel rounded-(--radius-card) p-5 sm:p-6"
              style={{ "--d": 320 } as React.CSSProperties}
              aria-labelledby="recovery-h"
            >
              <header className="flex items-center gap-2">
                <LifeBuoy className="size-4 text-accent" aria-hidden="true" />
                <h2
                  id="recovery-h"
                  className="text-[0.6875rem] font-semibold tracking-[0.1em] text-ink-faint uppercase"
                >
                  What we could do
                </h2>
              </header>
              <p className="mt-1 mb-4 max-w-[64ch] text-sm leading-6 text-ink-muted">
                The structural moves on the table, ranked by fit. Reversibility is
                the governance dial -- the hardest-to-undo moves are the ones that
                most need your sign-off.
              </p>
              <RecoveryOptions options={packet.recoveryOptions} />
            </section>
          ) : null}

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
                ? "No outreach was drafted -- outbound action is withheld until the disruption is confirmed (see the recommendation above)."
                : "We have written the outreach for you. These are drafts only -- nothing leaves the building until a person sends them."}
            </p>
            {packet.supplierMessages.length === 0 ? (
              <p className="text-sm text-ink-muted">
                {isNoAction
                  ? "Drafting withheld pending confirmation."
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
                      <span className="text-xs text-ink-muted">
                        <span className="font-medium text-ink">
                          {supplierNameById.get(message.supplierId) ??
                            message.supplierId}
                        </span>
                        {message.channel ? <> · {message.channel}</> : null}
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
                        <span className="sr-only">
                          {" "}
                          for{" "}
                          {supplierNameById.get(message.supplierId) ??
                            message.supplierId}
                        </span>
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
                              {/* The exact machine trace -- kept for an auditor,
                                  tucked behind a disclosure so the default glass
                                  shows only the plain-English provenance, never a
                                  dotted code path. */}
                              <details className="mt-0.5">
                                <summary className="inline-flex min-h-6 min-w-6 cursor-pointer list-none items-center px-1 text-[0.625rem] text-ink-faint underline-offset-2 hover:underline">
                                  Source detail
                                  <span className="sr-only"> for this figure</span>
                                </summary>
                                <span className="mt-0.5 block font-mono text-[0.625rem] break-all text-ink-faint">
                                  {claim.sourcePath}
                                </span>
                              </details>
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

          {/* --------------------------------------------------------
              DELIBERATION TRAIL -- the governed multi-agent loop made
              visible (Phase 6). Machinery, so it lives behind a
              disclosure as the spine's closing "receipts" section.
              Renders nothing when no agent runs exist (the demo
              fallback packet), so the surface never blanks or breaks.
              -------------------------------------------------------- */}
          {packet.agentRuns.length > 0 ? (
            <section
              className="reveal panel-sunken rounded-(--radius-card)"
              style={{ "--d": 500 } as React.CSSProperties}
            >
              <DeliberationTrail runs={packet.agentRuns} />
            </section>
          ) : null}
        </div>

        {/* ===================== 6. THE APPROVE MOMENT ===================== */}
        <aside className="flex flex-col gap-6 lg:sticky lg:top-[5.5rem]">
          {/* The human decision -- the trust anchor of the packet. A solid tonal
              panel (no gradient behind text, so the a11y contrast scan stays
              clean): depth is read from the surface step, the panel elevation,
              and a 2px Forest accent cap that marks this as THE decision moment.
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
                  <Badge tone="critical">Live feed down</Badge>
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
                  "The exposure figures come from your supplier data; the outreach was drafted for you to review. Approving records your decision in the audit trail below and releases the drafts, tasks, and summary for execution."}
              </p>

              {/* The plain-language trust promise (banks' "we don't ask that"
                  pattern) -- the cheapest, highest-signal answer to "can I trust
                  this enough to act". Stated once, on the glass, by the approve. */}
              <p className="mt-3 flex items-center gap-1.5 text-[0.75rem] font-medium text-accent-strong">
                <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
                RESILIX never sends anything without your approval.
              </p>

              {/* Gatekeeper PASS -- the quiet-evidence trust anchor next to APPROVE,
                  bound to the real gatekeeper verdict (never hardcoded). Rendered
                  in calm ink + the accent, not a green light. A recessed well
                  (inset shadow) so the verdict reads as carved-in evidence. */}
              <div className="mt-4 rounded-lg border border-line bg-sink p-3.5 shadow-[inset_0_1px_2px_oklch(0.3_0.02_286/0.05)]">
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-ink-faint uppercase">
                    Automatic checks
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 text-[0.6875rem] font-bold tracking-[0.06em] ${
                      gatekeeper.status === "PASS"
                        ? "text-accent-strong"
                        : "text-danger"
                    }`}
                  >
                    <ShieldCheck className="size-3.5" aria-hidden="true" />
                    <span title={gatekeeper.status}>
                      {gateStatusLabel(gatekeeper.status)}
                    </span>
                  </span>
                </div>
                {gatekeeper.failures.length === 0 ? (
                  <ul className="flex flex-col gap-2 text-xs text-ink-muted">
                    <GateCheck>
                      Every number traces to a{" "}
                      <span className="font-medium text-ink">source</span>
                    </GateCheck>
                    {/* Bound to the REAL url-safety result (evidenceAllowlistPassed
                        = every evidence URL passed HttpUrlSchema), not to the
                        gatekeeper verdict -- so this can never claim "verified"
                        while a non-http(s) link was actually filtered out. */}
                    <GateCheck>
                      {evidenceAllowlistPassed ? (
                        <>
                          All source links{" "}
                          <span className="font-medium text-ink">
                            passed the safety check
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="font-medium text-ink">
                            {allowedEvidenceUrls.length} of{" "}
                            {threatCard.evidenceUrls.length}
                          </span>{" "}
                          source links cleared the safety check
                        </>
                      )}
                    </GateCheck>
                    <GateCheck>
                      Suppliers{" "}
                      <span className="font-medium text-ink">
                        matched to your list
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
                  : "Approve plan"}
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
              <span
                className="rounded border border-line bg-sink px-1.5 py-0.5 text-[0.625rem] text-ink-muted"
                title={packet.effectiveMode}
              >
                {modeLabel(packet.effectiveMode)}
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
              {auditActionLabel(entry.action)}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-ink-muted">
              {entry.detail}
            </p>
            <p className="mt-0.5 text-[0.625rem] text-ink-faint">
              {auditActorLabel(entry.actor)} ·{" "}
              <span className="tnum font-mono">
                {shortDate(entry.at)} {shortTime(entry.at)}
              </span>
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
