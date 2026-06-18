"use client";

import { useMemo, useState } from "react";
import { Database, RadioTower, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { ActionOpsPacketView } from "@/components/action-packet-view";
import { PANEL_ID, TabNav, tabId, type TabKey } from "@/components/tab-nav";
import { makeDemoPacket } from "@/lib/data/demo-packet";
import type { DecisionPacketV2, PublicSignal } from "@/lib/schemas";
import { formatCurrency } from "@/lib/utils";

// Re-export so the existing eval (evals/actionops-packet-view.test.tsx) keeps
// importing the V2 view from this module path. The implementation moved to its
// own file as part of the calm-command-center rework.
export { ActionOpsPacketView };

type TabDef = { key: TabKey; label: string; hint: string; pip?: string };

// The signal-feed tab label must be honest about provenance: it may only claim
// "Live Events" when at least one signal is actually LIVE. With recorded/CACHED
// signals (the default seeded demo) it reads "Recorded Events" -- no false LIVE
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

// D.1 V2 cutover: the dashboard renders the REAL ActionOps packet assembled by the
// pipeline (passed from the `/` server component), not a hardcoded demo. The
// makeDemoPacket() fallback only fires if the prop is ever absent, so the surface
// degrades to a valid reference packet rather than blanking. The V1 LaunchOps
// "run live pipeline" panel is retired: the primary screen IS the live pipeline
// output now, and approval lives in the packet view. (The persisted run + server
// approve round-trip is covered by the API-level evals, not a browser path.)
export function LaunchOpsDashboard({ packet }: { packet?: DecisionPacketV2 }) {
  const data = useMemo(() => packet ?? makeDemoPacket(), [packet]);
  const tabs = useMemo(() => buildTabs(data.publicSignals), [data]);
  const [active, setActive] = useState<TabKey>("packet");

  // The dated capture of the recorded signals -- shown in the masthead so a viewer
  // is never shown replay as a live fetch.
  const recordedAt = useMemo(() => {
    const captured = data.publicSignals.find((s) => s.status === "CACHED")?.fetchedAt;
    if (!captured) return null;
    return new Date(captured).toLocaleDateString("en-CA", { timeZone: "UTC" }); // YYYY-MM-DD
  }, [data]);

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
            {/* Honest provenance -- recorded signals, never labeled live. */}
            <span
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-muted"
              title="Signals served from dated recorded fixtures -- not a live fetch"
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
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
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
          {/* `key={active}` re-fires the calm <=200ms tab-enter on every switch.
              Playwright treats opacity:0 as visible, so this never affects the
              e2e; reduced-motion shows the final frame immediately. */}
          <div key={active} className="tab-enter">
            {active === "events" ? <LiveEventsTab packet={data} /> : null}
            {active === "exposure" ? <ExposureTab packet={data} /> : null}
            {active === "simulation" ? <SimulationTab packet={data} /> : null}
            {active === "packet" ? <ActionOpsPacketView packet={data} /> : null}
          </div>
        </section>
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
        {/* Derived from the packet's real horizons -- honest for any scenario,
            never a hardcoded day list that drifts from the simulated window. */}
        <h2 className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-faint uppercase">
          {simulation.horizons.map((h) => h.days).join(" / ")}-day runway
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
