"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Database,
  Loader2,
  Play,
  RadioTower,
  ShieldCheck
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ActionOpsPacketView } from "@/components/action-packet-view";
import { PANEL_ID, TabNav, tabId, type TabKey } from "@/components/tab-nav";
import { makeDemoPacket } from "@/lib/data/demo-packet";
import type {
  DecisionPacketV1,
  DecisionPacketV2,
  PublicSignal
} from "@/lib/schemas";
import { formatCurrency } from "@/lib/utils";

// Re-export so the existing eval (evals/actionops-packet-view.test.tsx) keeps
// importing the V2 view from this module path. The implementation moved to its
// own file as part of the calm-command-center rework.
export { ActionOpsPacketView };

type TabDef = { key: TabKey; label: string; hint: string; pip?: string };

// The signal-feed tab label must be honest about provenance: it may only claim
// "Live Events" when at least one signal is actually LIVE. With recorded/CACHED
// signals (the default seeded demo) it reads "Recorded Events" — no false LIVE
// claim. Built per render from the real signal set, not a hardcoded label.
function buildTabs(signals: PublicSignal[]): TabDef[] {
  const hasLive = signals.some((s) => s.status === "LIVE");
  return [
    {
      key: "events",
      label: hasLive ? "Live Events" : "Recorded Events",
      hint: "Signal feed"
    },
    { key: "exposure", label: "Exposure", hint: "Who is hit" },
    { key: "simulation", label: "Simulation", hint: "Runway" },
    {
      key: "packet",
      label: "Action Packet",
      hint: "The decision",
      pip: "READY"
    }
  ];
}

// Human-readable agent mode label for the honest provenance badges.
function modeLabel(mode: string) {
  if (mode === "LIVE_AI") return "Live AI";
  if (mode === "DETERMINISTIC_RULES") return "Deterministic";
  if (mode === "REPLAY") return "Replay";
  if (mode === "FAILED_TO_FALLBACK") return "Failed → fallback";
  return mode;
}

function severityTone(severity: PublicSignal["severity"]) {
  if (severity === "LOW") return "low" as const;
  if (severity === "MEDIUM") return "medium" as const;
  if (severity === "HIGH") return "high" as const;
  return "critical-sev" as const;
}

function signalTone(status: PublicSignal["status"]) {
  if (status === "LIVE") return "success" as const;
  if (status === "FAILED") return "critical" as const;
  return "neutral" as const;
}

export function LaunchOpsDashboard() {
  // The seeded Hormuz demo packet drives the primary screen out of the box
  // (the live ActionOps agents land in Phases 4-7). It is a healthy
  // DETERMINISTIC_RULES packet, never presented as live AI.
  const demoPacket = useMemo(() => makeDemoPacket(), []);
  const tabs = useMemo(
    () => buildTabs(demoPacket.publicSignals),
    [demoPacket]
  );
  const [active, setActive] = useState<TabKey>("packet");

  // The live V1 pipeline (LaunchOps salvage) is still reachable for the live
  // run + approve demo and the e2e. Its testids (run-scenario, decision-packet,
  // approve-packet) and the "Live signals" / "Approval Console" affordances are
  // preserved on the V1 surface below.
  const [v1Packet, setV1Packet] = useState<DecisionPacketV1 | null>(null);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useLiveSignals, setUseLiveSignals] = useState(true);

  // The dated capture of the recorded signals — shown in the masthead so a
  // viewer is never shown replay as a live fetch.
  const recordedAt = useMemo(() => {
    const captured = demoPacket.publicSignals.find(
      (s) => s.status === "CACHED"
    )?.fetchedAt;
    if (!captured) return null;
    return new Date(captured).toLocaleDateString("en-CA", { timeZone: "UTC" }); // YYYY-MM-DD
  }, [demoPacket]);

  async function runLivePipeline() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/run-exception", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId: "SCN-LAUNCH-001",
          useLiveSignals
        })
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.detail ?? body.error ?? "Pipeline failed");
      }
      if (body.packet?.packetVersion === 1) {
        setV1Packet(body.packet);
      }
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function submitApproval(status: "APPROVED" | "REJECTED") {
    if (!v1Packet) return;
    setApproving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/decision-packets/${v1Packet.id}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            reason:
              status === "APPROVED"
                ? "Approved for launch-critical mitigation demo."
                : "Rejected for demo review."
          })
        }
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "Approval failed");
      }
      if (body.packet?.packetVersion === 1) {
        setV1Packet(body.packet);
      }
    } catch (approvalError) {
      setError(
        approvalError instanceof Error ? approvalError.message : "Unknown error"
      );
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-20 border-b border-line bg-ground/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-3.5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3.5">
            <div className="flex size-9 items-center justify-center rounded-md bg-ink text-ground">
              <ShieldCheck className="size-[1.125rem]" aria-hidden="true" />
            </div>
            <div className="flex items-baseline gap-3">
              <p className="wordmark text-[1.1875rem] font-medium text-ink">
                RESILIX <em>ActionOps</em>
              </p>
              <span className="hidden font-mono text-[0.625rem] tracking-[0.16em] text-ink-faint uppercase sm:inline">
                War Room
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span className="hidden font-mono text-[0.6875rem] tracking-[0.02em] text-ink-faint sm:inline">
              OP · RX-2614
            </span>
            {/* Honest provenance — recorded signals, never labeled live. */}
            <span
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-muted"
              title="Signals served from dated recorded fixtures — not a live fetch"
            >
              <span
                aria-hidden="true"
                className="size-[0.4375rem] rounded-full bg-ink-faint shadow-[0_0_0_3px_var(--color-sink)]"
              />
              Recorded signals
              {recordedAt ? (
                <span className="tnum font-mono text-[0.6875rem] text-ink">
                  {recordedAt}
                </span>
              ) : null}
            </span>
            <label className="flex h-10 items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm font-medium text-ink-muted">
              <input
                type="checkbox"
                checked={useLiveSignals}
                onChange={(event) => setUseLiveSignals(event.target.checked)}
                className="accent-accent"
              />
              Live signals
            </label>
            <Button
              onClick={runLivePipeline}
              disabled={loading}
              variant="secondary"
              data-testid="run-scenario"
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Play className="size-4" aria-hidden="true" />
              )}
              Run live pipeline
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        {error ? (
          <div
            role="alert"
            className="mb-5 rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
          >
            {error}
          </div>
        ) : null}

        <div className="mb-6">
          <TabNav tabs={tabs} active={active} onChange={setActive} />
        </div>

        {/* tabIndex={0} per ARIA APG: after arrowing the tablist, Tab must move
            focus INTO the panel rather than skipping its content. */}
        <section
          id={PANEL_ID}
          role="tabpanel"
          aria-labelledby={tabId(active)}
          tabIndex={0}
        >
          {/* `key={active}` re-fires the calm ≤200ms tab-enter on every switch.
              Playwright treats opacity:0 as visible, so this never affects the
              e2e; reduced-motion shows the final frame immediately. */}
          <div key={active} className="tab-enter">
            {active === "events" ? <LiveEventsTab packet={demoPacket} /> : null}
            {active === "exposure" ? (
              <ExposureTab packet={demoPacket} />
            ) : null}
            {active === "simulation" ? (
              <SimulationTab packet={demoPacket} />
            ) : null}
            {active === "packet" ? (
              <ActionOpsPacketView packet={demoPacket} />
            ) : null}
          </div>
        </section>

        {v1Packet ? (
          <V1LivePanel
            packet={v1Packet}
            approving={approving}
            onApprove={() => submitApproval("APPROVED")}
            onReject={() => submitApproval("REJECTED")}
          />
        ) : null}
      </main>
    </div>
  );
}

// --- Tab shells (Live Events / Exposure / Simulation) ----------------------

function LiveEventsTab({ packet }: { packet: DecisionPacketV2 }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">
        Recorded public signals backing the current threat. Each carries its
        source, recency, and an honest live/recorded status.
      </p>
      {packet.publicSignals.map((signal) => (
        <article
          key={signal.id}
          className="panel rounded-(--radius-card) p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <RadioTower className="size-4 text-accent" aria-hidden="true" />
              <span className="font-medium text-ink">{signal.source}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={severityTone(signal.severity)}>
                {signal.severity}
              </Badge>
              <Badge tone={signalTone(signal.status)}>{signal.status}</Badge>
            </div>
          </div>
          <p className="mt-2 max-w-[72ch] text-sm leading-6 text-ink-muted">
            {signal.summary}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 text-xs text-ink-faint">
            <span>{signal.eventType}</span>
            {signal.location.region ? (
              <span>{signal.location.region}</span>
            ) : null}
            <span className="tnum">{signal.freshnessMinutes} min old</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function ExposureTab({ packet }: { packet: DecisionPacketV2 }) {
  const max = Math.max(
    ...packet.exposureResults.map((r) => r.exposureScore),
    1
  );
  return (
    <div className="panel rounded-(--radius-card)">
      <header className="border-b border-line px-5 py-4">
        <h2 className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-faint uppercase">
          Exposure mapping
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Suppliers matched to the threat on origin, sector, and routing.
        </p>
      </header>
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
              <td className="font-medium text-ink">{result.supplierName}</td>
              <td className="tnum text-ink-muted">{result.country}</td>
              <td className="text-xs text-ink-muted">{result.sector}</td>
              <td>
                <div className="flex items-center gap-3">
                  <div className="runway-track flex-1">
                    <div
                      className="runway-fill bg-sev-high"
                      style={{
                        width: `${(result.exposureScore / max) * 100}%`
                      }}
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
    </div>
  );
}

function SimulationTab({ packet }: { packet: DecisionPacketV2 }) {
  const { simulation } = packet;
  if (!simulation) {
    return (
      <Card>
        <CardHeader title="Runway" />
        <p className="text-sm text-ink-muted">
          {packet.dataGaps[0] ?? "No runway simulation for this packet."}
        </p>
      </Card>
    );
  }
  const max = Math.max(
    ...simulation.horizons.map((h) => h.revenueAtRiskUsd),
    1
  );
  return (
    <div className="panel rounded-(--radius-card) p-5">
      <header className="mb-4 flex items-center gap-2">
        <Database className="size-4 text-accent" aria-hidden="true" />
        <h2 className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-faint uppercase">
          3 / 7 / 14 / 30-day runway
        </h2>
      </header>
      <div className="space-y-3">
        {simulation.horizons.map((horizon) => (
          <div
            key={horizon.days}
            className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3"
          >
            <span className="tnum text-sm font-medium text-ink-muted">
              {horizon.days}-day
            </span>
            <div className="runway-track">
              <div
                className={
                  horizon.days >= 14
                    ? "runway-fill bg-sev-critical"
                    : "runway-fill bg-sev-high"
                }
                style={{
                  width: `${(horizon.revenueAtRiskUsd / max) * 100}%`
                }}
              />
            </div>
            <span className="tnum w-24 text-right text-sm font-medium text-ink">
              {formatCurrency(horizon.revenueAtRiskUsd)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- V1 live pipeline panel (deterministic salvage) ------------------------
// Preserves the run/approve flow and the e2e testids. Restyled to the new
// tokens; the data-testid="decision-packet" + data-testid="approve-packet" +
// "Approval Console" affordances are intentionally kept for the live demo path.

function V1LivePanel({
  packet,
  approving,
  onApprove,
  onReject
}: {
  packet: DecisionPacketV1;
  approving: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  // Honest provenance on the V1 path, parity with the V2 view: disclose the
  // requested vs effective run mode, and surface a degraded badge ONLY when a
  // live-AI attempt actually failed and fell back (effectiveMode ===
  // FAILED_TO_FALLBACK). A healthy DETERMINISTIC_RULES run is never "degraded".
  const degraded = packet.effectiveMode === "FAILED_TO_FALLBACK";
  const modeDiverged = packet.effectiveMode !== packet.requestedMode;

  return (
    <section className="mt-8 border-t border-line-strong pt-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone="info">Live pipeline result</Badge>
        <Badge tone={modeDiverged ? "warning" : "neutral"}>
          Mode {modeLabel(packet.requestedMode)}
          {modeDiverged
            ? ` → ${modeLabel(packet.effectiveMode)}`
            : ""}
        </Badge>
        {degraded ? (
          <Badge tone="critical">Degraded - no live AI</Badge>
        ) : null}
        <Badge tone={packet.gatekeeper.status === "PASS" ? "success" : "warning"}>
          {packet.gatekeeper.status}
        </Badge>
        <Badge
          tone={
            packet.approvalStatus === "APPROVED"
              ? "success"
              : packet.approvalStatus === "REJECTED"
                ? "critical"
                : "warning"
          }
        >
          {packet.approvalStatus}
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader title="Ranked recovery options" />
          <div className="space-y-3" data-testid="decision-packet">
            {packet.options.map((option) => (
              <div
                key={option.id}
                className="rounded-md border border-line p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {option.title}
                    </p>
                    <p className="mt-1 text-sm leading-5 text-ink-muted">
                      {option.summary}
                    </p>
                  </div>
                  <Badge
                    tone={
                      option.id === packet.recommendedOptionId
                        ? "success"
                        : "neutral"
                    }
                  >
                    Score {option.score}
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <SmallStat
                    label="Cost"
                    value={formatCurrency(option.estimatedCostUsd)}
                  />
                  <SmallStat
                    label="Speed"
                    value={`${option.speedGainDays}d`}
                  />
                  <SmallStat
                    label="Risk cut"
                    value={`${option.riskReductionPct}%`}
                  />
                  <SmallStat label="Confidence" value={option.confidence} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Approval Console" />
          <div className="space-y-3">
            <p className="text-sm leading-6 text-ink-muted">
              {packet.approvalReason ??
                "Execution stays blocked until a human decision is recorded."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={onApprove}
                disabled={approving || packet.approvalStatus === "APPROVED"}
                data-testid="approve-packet"
              >
                {approving ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                )}
                Approve
              </Button>
              <Button
                variant="secondary"
                onClick={onReject}
                disabled={approving || packet.approvalStatus === "REJECTED"}
              >
                Reject
              </Button>
            </div>
            <div className="mt-2 flex items-center gap-2 border-t border-line pt-3 text-xs text-ink-faint">
              <Clock3 className="size-3.5" aria-hidden="true" />
              {packet.auditTrail.length} audit events recorded
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-sink p-2">
      <p className="text-[0.625rem] font-semibold tracking-wide text-ink-faint uppercase">
        {label}
      </p>
      <p className="tnum mt-0.5 text-sm font-medium text-ink">{value}</p>
    </div>
  );
}
