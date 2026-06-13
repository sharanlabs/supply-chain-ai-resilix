"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  GitBranch,
  Loader2,
  Play,
  RadioTower,
  ShieldCheck,
  Truck
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type {
  DecisionPacket,
  DecisionPacketV1,
  DecisionPacketV2,
  Scenario
} from "@/lib/schemas";
import { formatCurrency, formatNumber } from "@/lib/utils";

type Tab = "queue" | "impact" | "trace" | "packet" | "approval";

export function LaunchOpsDashboard() {
  const [packet, setPacket] = useState<DecisionPacket | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("queue");
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useLiveSignals, setUseLiveSignals] = useState(true);

  async function runScenario() {
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
      setPacket(body.packet);
      setScenario({
        id: "SCN-LAUNCH-001",
        name: "Launch-critical component delay",
        description:
          "Camera module delay threatens launch readiness while public signals enrich the risk context.",
        defaultSignalMode: "LIVE_WITH_FALLBACK",
        flagship: true
      });
      setActiveTab("packet");
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function submitApproval(status: "APPROVED" | "REJECTED") {
    if (!packet) return;
    setApproving(true);
    setError(null);
    try {
      const response = await fetch(`/api/decision-packets/${packet.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          reason:
            status === "APPROVED"
              ? "Approved for launch-critical mitigation demo."
              : "Rejected for demo review."
        })
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "Approval failed");
      }
      setPacket(body.packet);
      setActiveTab("approval");
    } catch (approvalError) {
      setError(
        approvalError instanceof Error ? approvalError.message : "Unknown error"
      );
    } finally {
      setApproving(false);
    }
  }

  // The live pipeline still emits the LaunchOps V1 packet; a V2 (ActionOps)
  // packet renders through ActionOpsPacketView instead. Narrow on the
  // discriminant so the V1 chrome below (options chart, recovery tabs) stays
  // type-safe and is simply skipped for a V2 packet.
  const v1Packet = packet?.packetVersion === 1 ? packet : null;

  const recommended = v1Packet?.options.find(
    (option) => option.id === v1Packet.recommendedOptionId
  );

  const chartData = useMemo(() => {
    if (!v1Packet) return [];
    return v1Packet.options.map((option) => ({
      name: option.id.replace("OPT-", ""),
      score: option.score,
      risk: option.riskReductionPct
    }));
  }, [v1Packet]);

  return (
    <main className="min-h-screen px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <header className="flex flex-col gap-3 border-b border-zinc-300 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">RESILIX LaunchOps AI</Badge>
              <Badge tone={packet ? statusTone(packet.gatekeeper.status) : "neutral"}>
                {packet ? packet.gatekeeper.status : "READY"}
              </Badge>
              {packet ? (
                <Badge tone={approvalTone(packet.approvalStatus)}>
                  {packet.approvalStatus}
                </Badge>
              ) : null}
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-normal text-zinc-950 md:text-3xl">
              Supply continuity exception workbench
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600">
              Deterministic impact calculations, bounded AI agents, validation, and
              human approval for a launch-critical recovery decision.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="flex h-10 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700">
              <input
                type="checkbox"
                checked={useLiveSignals}
                onChange={(event) => setUseLiveSignals(event.target.checked)}
              />
              Live signals
            </label>
            <Button onClick={runScenario} disabled={loading} data-testid="run-scenario">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run flagship scenario
            </Button>
          </div>
        </header>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {packet?.packetVersion === 2 ? (
          <ActionOpsPacketView packet={packet} />
        ) : (
          <>
            <section className="grid gap-3 md:grid-cols-4">
              <Metric label="Launch Risk" value={v1Packet ? `${v1Packet.impactReport.launchRiskScore}/100` : "--"} />
              <Metric
                label="Inventory Cover"
                value={v1Packet ? `${v1Packet.impactReport.inventoryDaysRemaining} days` : "--"}
              />
              <Metric
                label="Revenue At Risk"
                value={v1Packet ? formatCurrency(v1Packet.impactReport.revenueAtRisk) : "--"}
              />
              <Metric
                label="Signal State"
                value={
                  v1Packet
                    ? `${v1Packet.publicSignals.filter((signal) => signal.status === "LIVE").length}/${v1Packet.publicSignals.length} live`
                    : "--"
                }
              />
            </section>

            <nav className="flex gap-2 overflow-x-auto border-b border-zinc-300 pb-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`h-9 shrink-0 rounded-md px-3 text-sm font-semibold ${
                    activeTab === tab.id
                      ? "bg-zinc-950 text-white"
                      : "bg-white text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            {activeTab === "queue" ? (
              <ExceptionQueue packet={v1Packet} scenario={scenario} onRun={runScenario} loading={loading} />
            ) : null}
            {activeTab === "impact" ? <ImpactView packet={v1Packet} /> : null}
            {activeTab === "trace" ? <AgentTrace packet={v1Packet} /> : null}
            {activeTab === "packet" ? (
              <DecisionPacketView packet={v1Packet} chartData={chartData} recommendedTitle={recommended?.title} />
            ) : null}
            {activeTab === "approval" ? (
              <ApprovalConsole
                packet={v1Packet}
                approving={approving}
                onApprove={() => submitApproval("APPROVED")}
                onReject={() => submitApproval("REJECTED")}
              />
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "queue", label: "Exception Queue" },
  { id: "impact", label: "Impact View" },
  { id: "trace", label: "Agent Trace" },
  { id: "packet", label: "Decision Packet" },
  { id: "approval", label: "Approval Console" }
];

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel rounded-lg p-3">
      <div className="text-xs font-bold uppercase text-zinc-500">{label}</div>
      <div className="mt-2 min-h-8 text-xl font-bold text-zinc-950">{value}</div>
    </div>
  );
}

function EmptyState({ onRun, loading }: { onRun?: () => void; loading?: boolean }) {
  return (
    <Card className="min-h-64">
      <div className="flex h-full min-h-56 flex-col items-center justify-center gap-3 text-center">
        <RadioTower className="h-8 w-8 text-zinc-500" />
        <p className="max-w-md text-sm leading-6 text-zinc-600">
          Run the flagship scenario to create the launch exception, ingest public
          signals, calculate impact, and generate the decision packet.
        </p>
        {onRun ? (
          <Button onClick={onRun} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run scenario
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function ExceptionQueue({
  packet,
  scenario,
  onRun,
  loading
}: {
  packet: DecisionPacketV1 | null;
  scenario: Scenario | null;
  onRun: () => void;
  loading: boolean;
}) {
  if (!packet) return <EmptyState onRun={onRun} loading={loading} />;
  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <Card>
        <CardHeader title="Active Exception" action={<AlertTriangle className="h-5 w-5 text-amber-700" />} />
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-zinc-950">{packet.exception.title}</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              {packet.exception.problemSummary}
            </p>
          </div>
          <div className="metric-grid">
            <Metric label="Scenario" value={scenario?.id ?? packet.exception.scenarioId} />
            <Metric label="Affected Orders" value={`${packet.exception.affectedOrderIds.length}`} />
            <Metric label="Affected Components" value={`${packet.exception.affectedComponentIds.length}`} />
            <Metric label="Severity" value={packet.exception.severity} />
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Public Signals" action={<RadioTower className="h-5 w-5 text-teal-700" />} />
        <div className="space-y-2">
          {packet.publicSignals.map((signal) => (
            <div key={signal.id} className="rounded-md border border-zinc-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-bold text-zinc-900">{signal.source}</div>
                <Badge tone={signal.status === "LIVE" ? "success" : signal.status === "FAILED" ? "critical" : "warning"}>
                  {signal.status}
                </Badge>
              </div>
              <p className="mt-1 text-sm leading-5 text-zinc-600">{signal.summary}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ImpactView({ packet }: { packet: DecisionPacketV1 | null }) {
  if (!packet) return <EmptyState />;
  return (
    <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
      <Card>
        <CardHeader title="Impact Calculations" action={<Database className="h-5 w-5 text-teal-700" />} />
        <div className="space-y-2">
          {packet.impactReport.calculations.map((calc) => (
            <div key={calc.id} className="rounded-md border border-zinc-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-bold text-zinc-900">{calc.label}</div>
                <div className="text-sm font-bold text-zinc-950">
                  {calc.unit === "USD" ? formatCurrency(calc.value) : `${formatNumber(calc.value)} ${calc.unit}`}
                </div>
              </div>
              <div className="mt-1 text-xs text-zinc-500">{calc.formula}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {calc.sourceIds.map((sourceId) => (
                  <Badge key={sourceId}>{sourceId}</Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader title="Operational Exposure" action={<Truck className="h-5 w-5 text-teal-700" />} />
        <table className="stable-table">
          <thead>
            <tr>
              <th>Entity</th>
              <th>Identifier</th>
              <th>Business Impact</th>
            </tr>
          </thead>
          <tbody>
            {packet.impactReport.affectedSuppliers.map((supplier) => (
              <tr key={supplier.supplierId}>
                <td>Supplier</td>
                <td>{supplier.supplierId}</td>
                <td>{supplier.supplierName} / {supplier.country}</td>
              </tr>
            ))}
            {packet.impactReport.affectedComponents.map((component) => (
              <tr key={component.componentId}>
                <td>Component</td>
                <td>{component.componentId}</td>
                <td>{component.componentName}</td>
              </tr>
            ))}
            {packet.impactReport.affectedOrders.map((order) => (
              <tr key={order.orderId}>
                <td>Order</td>
                <td>{order.orderId}</td>
                <td>{order.region} / {formatCurrency(order.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function AgentTrace({ packet }: { packet: DecisionPacketV1 | null }) {
  if (!packet) return <EmptyState />;
  return (
    <Card>
      <CardHeader
        title="Agent Trace"
        description="Each run records model mode, latency, hashes, token estimate, and validation status."
        action={<GitBranch className="h-5 w-5 text-teal-700" />}
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {packet.agentRuns.map((run) => (
          <div key={run.id} className="rounded-md border border-zinc-200 bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-bold text-zinc-950">{run.agentName}</div>
              <Badge tone={run.validationStatus === "PASS" ? "success" : "critical"}>
                {run.validationStatus}
              </Badge>
            </div>
            <p className="mt-2 min-h-16 text-sm leading-5 text-zinc-600">{run.summary}</p>
            <div className="mt-3 space-y-1 text-xs text-zinc-500">
              <div>Model: {run.model}</div>
              <div>Mode: {run.mode}</div>
              <div>Latency: {run.latencyMs}ms</div>
              <div>Tokens: {run.tokenEstimate}</div>
              <div>Input: {run.inputHash}</div>
              <div>Output: {run.outputHash}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DecisionPacketView({
  packet,
  chartData,
  recommendedTitle
}: {
  packet: DecisionPacketV1 | null;
  chartData: Array<{ name: string; score: number; risk: number }>;
  recommendedTitle?: string;
}) {
  if (!packet) return <EmptyState />;
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
      <Card>
        <CardHeader
          title="Ranked Recovery Options"
          action={<ShieldCheck className="h-5 w-5 text-teal-700" />}
        />
        <div className="space-y-3" data-testid="decision-packet">
          {packet.options.map((option) => (
            <div key={option.id} className="rounded-md border border-zinc-200 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-sm font-bold text-zinc-950">{option.title}</div>
                  <p className="mt-1 text-sm leading-5 text-zinc-600">{option.summary}</p>
                </div>
                <Badge tone={option.id === packet.recommendedOptionId ? "success" : "neutral"}>
                  Score {option.score}
                </Badge>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-4">
                <SmallMetric label="Cost" value={formatCurrency(option.estimatedCostUsd)} />
                <SmallMetric label="Speed" value={`${option.speedGainDays} days`} />
                <SmallMetric label="Risk Cut" value={`${option.riskReductionPct}%`} />
                <SmallMetric label="Confidence" value={option.confidence} />
              </div>
            </div>
          ))}
        </div>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader title="Recommendation" />
          <div className="text-lg font-bold text-zinc-950">{recommendedTitle}</div>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Gatekeeper status is {packet.gatekeeper.status}. Human approval remains
            required before execution because the recovery action affects launch
            availability and cost.
          </p>
        </Card>
        <Card>
          <CardHeader title="Option Scores" />
          <div className="h-56 min-h-56 min-w-[280px]">
            <ResponsiveContainer
              width="100%"
              height="100%"
              minWidth={280}
              minHeight={224}
              initialDimension={{ width: 480, height: 224 }}
            >
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="score" fill="#0f766e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="risk" fill="#64748b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <TrustPanel packet={packet} />
      </div>
    </div>
  );
}

function ApprovalConsole({
  packet,
  approving,
  onApprove,
  onReject
}: {
  packet: DecisionPacketV1 | null;
  approving: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  if (!packet) return <EmptyState />;
  return (
    <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <Card>
        <CardHeader
          title="Approval"
          description="Execution stays blocked until a human decision is recorded."
          action={<CheckCircle2 className="h-5 w-5 text-teal-700" />}
        />
        <div className="space-y-3">
          <Badge tone={approvalTone(packet.approvalStatus)}>{packet.approvalStatus}</Badge>
          <p className="text-sm leading-6 text-zinc-600">
            {packet.approvalReason ?? "Awaiting human approval."}
          </p>
          <p className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs leading-5 text-zinc-600">
            Approval actions update packet state and append an immutable-style audit
            event. n8n callbacks can be protected with `N8N_CALLBACK_SECRET` for
            demo-to-enterprise hardening.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onApprove} disabled={approving || packet.approvalStatus === "APPROVED"} data-testid="approve-packet">
              {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Approve
            </Button>
            <Button variant="danger" onClick={onReject} disabled={approving || packet.approvalStatus === "REJECTED"}>
              Reject
            </Button>
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Execution Drafts" />
        <div className="grid gap-3 md:grid-cols-2">
          {Object.entries(packet.executionDraft).map(([key, value]) => (
            <div key={key} className="rounded-md border border-zinc-200 p-3">
              <div className="text-xs font-bold uppercase text-zinc-500">
                {key.replace("Message", "")}
              </div>
              <p className="mt-2 text-sm leading-5 text-zinc-700">{value}</p>
            </div>
          ))}
        </div>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader title="Audit Trail" action={<Clock3 className="h-5 w-5 text-teal-700" />} />
        <table className="stable-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {packet.auditTrail.map((entry) => (
              <tr key={`${entry.at}-${entry.actor}-${entry.action}`}>
                <td>{new Date(entry.at).toLocaleString()}</td>
                <td>{entry.actor}</td>
                <td>{entry.action}</td>
                <td>{entry.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// V2 (ActionOps) packet view. P2.3 ships a minimal, real render of the
// plan-locked fields so the versioned seam is live (not a stub) and renderable;
// the full 4-tab ActionOps UI (Live Events / Exposure / Simulation / Action
// Packet) is Phase 8. The live pipeline does not emit V2 yet, so this path is
// reached only once the ActionOps agents land (and by the fixture test).
export function ActionOpsPacketView({ packet }: { packet: DecisionPacketV2 }) {
  const degraded = packet.effectiveMode === "FAILED_TO_FALLBACK";
  const { threatCard, simulation } = packet;
  return (
    <div className="flex flex-col gap-4" data-testid="actionops-packet">
      <Card>
        <CardHeader
          title="Threat Card"
          action={<AlertTriangle className="h-5 w-5 text-amber-700" />}
        />
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info">{threatCard.eventType}</Badge>
            <Badge tone={statusTone(packet.gatekeeper.status)}>{packet.gatekeeper.status}</Badge>
            <Badge tone="neutral">{packet.dataTier}</Badge>
            {degraded ? <Badge tone="critical">Degraded - no live AI</Badge> : null}
          </div>
          <p className="text-sm leading-6 text-zinc-700">{threatCard.summary}</p>
          <div className="metric-grid">
            <Metric label="Severity" value={threatCard.severity} />
            <Metric
              label="Location"
              value={
                threatCard.location.chokepoint ??
                threatCard.location.region ??
                threatCard.location.country ??
                "--"
              }
            />
            <Metric label="Confidence" value={`${Math.round(threatCard.confidence * 100)}%`} />
          </div>
          {threatCard.evidenceUrls.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {threatCard.evidenceUrls.map((url) => (
                <Badge key={url}>{url}</Badge>
              ))}
            </div>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader title="Exposure" action={<Truck className="h-5 w-5 text-teal-700" />} />
        {packet.exposureResults.length === 0 ? (
          <p className="text-sm leading-6 text-zinc-600">No direct exposure for this event.</p>
        ) : (
          <table className="stable-table">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Country / Sector</th>
                <th>Exposure</th>
              </tr>
            </thead>
            <tbody>
              {packet.exposureResults.map((result) => (
                <tr key={result.id}>
                  <td>{result.supplierName}</td>
                  <td>{result.country} / {result.sector}</td>
                  <td>{result.exposureScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <CardHeader title="Runway Simulation" action={<Database className="h-5 w-5 text-teal-700" />} />
        {simulation ? (
          <div className="space-y-3">
            <div className="metric-grid">
              {simulation.horizons.map((horizon) => (
                <Metric
                  key={horizon.days}
                  label={`${horizon.days}-day`}
                  value={formatCurrency(horizon.revenueAtRiskUsd)}
                />
              ))}
            </div>
            <div className="space-y-1 text-sm text-zinc-600">
              {simulation.productRunouts.map((runout) => (
                <div key={runout.productId}>
                  {runout.productId}: runout {runout.runoutDate}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-1 text-sm leading-6 text-zinc-600">
            {packet.dataGaps.length > 0 ? (
              packet.dataGaps.map((gap) => <p key={gap}>{gap}</p>)
            ) : (
              <p>No runway simulation for this packet.</p>
            )}
          </div>
        )}
      </Card>

      {packet.playbooks.length > 0 ? (
        <Card>
          <CardHeader title="Playbooks" action={<ShieldCheck className="h-5 w-5 text-teal-700" />} />
          <div className="space-y-3">
            {packet.playbooks.map((playbook) => (
              <div key={playbook.id} className="rounded-md border border-zinc-200 p-3">
                <div className="text-sm font-bold text-zinc-950">{playbook.role}</div>
                <p className="mt-1 text-sm leading-5 text-zinc-600">{playbook.summary}</p>
                {playbook.steps.length > 0 ? (
                  <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700">
                    {playbook.steps.map((step, index) => (
                      <li key={`${playbook.id}-step-${index}`}>{step}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Supplier Message Drafts" action={<RadioTower className="h-5 w-5 text-teal-700" />} />
        <p className="mb-3 text-xs font-semibold uppercase text-zinc-500">
          Drafts only - nothing sends without human approval.
        </p>
        {packet.supplierMessages.length === 0 ? (
          <p className="text-sm leading-6 text-zinc-600">No supplier drafts generated.</p>
        ) : (
          <div className="space-y-3">
            {packet.supplierMessages.map((message) => (
              <div key={message.id} className="rounded-md border border-zinc-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-bold text-zinc-900">
                    {message.supplierId} · {message.channel}
                  </div>
                  {message.approvalRequired ? <Badge tone="warning">Approval required</Badge> : null}
                </div>
                {message.subject ? (
                  <div className="mt-1 text-sm font-semibold text-zinc-700">{message.subject}</div>
                ) : null}
                <p className="mt-1 whitespace-pre-line text-sm leading-5 text-zinc-700">{message.body}</p>
                {message.claims.length > 0 ? (
                  <div className="mt-2 space-y-1 text-xs text-zinc-500">
                    {message.claims.map((claim, index) => (
                      <div key={`${message.id}-claim-${index}`}>
                        {String(claim.value)} {claim.unit} ← {claim.sourcePath}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      {packet.actionItems.length > 0 ? (
        <Card>
          <CardHeader title="Action Items" action={<CheckCircle2 className="h-5 w-5 text-teal-700" />} />
          <table className="stable-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Owner</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {packet.actionItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.title}</td>
                  <td>{item.owner}</td>
                  <td>{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      {/* P2.3 renders approval STATUS + audit (read-only). The approve/reject
          ACTION controls for V2 land with the Phase 8 "Action Packet" tab
          (plan §8 merges playbook + drafts + approvals); the approval store/API
          are already version-neutral, so Phase 8 only wires the buttons. No V2
          packet is producible until the ActionOps agents exist, so the controls
          would be unreachable here. (Codex P2.3 [Low].) */}
      <Card>
        <CardHeader title="Approval & Audit" action={<Clock3 className="h-5 w-5 text-teal-700" />} />
        <div className="space-y-3">
          <Badge tone={approvalTone(packet.approvalStatus)}>{packet.approvalStatus}</Badge>
          <p className="text-sm leading-6 text-zinc-600">
            {packet.approvalReason ?? "Awaiting human approval."}
          </p>
          <table className="stable-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {packet.auditTrail.map((entry) => (
                <tr key={`${entry.at}-${entry.actor}-${entry.action}`}>
                  <td>{new Date(entry.at).toLocaleString()}</td>
                  <td>{entry.actor}</td>
                  <td>{entry.action}</td>
                  <td>{entry.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function TrustPanel({ packet }: { packet: DecisionPacketV1 }) {
  const liveSignals = packet.publicSignals.filter((signal) => signal.status === "LIVE").length;
  const fallbackSignals = packet.publicSignals.length - liveSignals;
  const liveAiRuns = packet.agentRuns.filter((run) => run.mode === "LIVE_AI").length;
  // Only FAILED_TO_FALLBACK is degraded (R4-8). A by-design DETERMINISTIC_RULES
  // (or future REPLAY) run is healthy and must NOT be labeled "fallback"; key
  // the degraded indicator off the packet's derived effectiveMode (Phase 8 adds
  // the full requested-vs-effective badge).
  const degraded = packet.effectiveMode === "FAILED_TO_FALLBACK";
  const failedAgentRuns = packet.agentRuns.filter(
    (run) => run.validationStatus === "FAIL"
  ).length;
  const recommendedOption = packet.options.find(
    (option) => option.id === packet.recommendedOptionId
  );
  const calculationSourceCount = new Set(
    packet.impactReport.calculations.flatMap((calc) => calc.sourceIds)
  ).size;

  return (
    <Card>
      <CardHeader
        title="AI Trust Panel"
        description="Enterprise-facing evidence, authority, validation, and approval controls."
      />
      <div className="space-y-2 text-sm">
        <TrustRow label="Decision authority" value="Code calculates; AI explains and drafts" />
        <TrustRow
          label="Model mode"
          value={
            degraded
              ? "Degraded - live AI attempted, deterministic fallback used"
              : `${packet.effectiveMode} (${liveAiRuns} live AI run${liveAiRuns === 1 ? "" : "s"})`
          }
        />
        <TrustRow label="Public signals" value={`${liveSignals} live / ${fallbackSignals} cached or failed`} />
        <TrustRow label="Operational evidence" value={`${packet.exception.affectedSupplierIds.length} supplier, ${packet.exception.affectedComponentIds.length} component, ${packet.exception.affectedOrderIds.length} orders`} />
        <TrustRow label="Calculation trace" value={`${packet.impactReport.calculations.length} calculations / ${calculationSourceCount} source IDs`} />
        <TrustRow label="Validation" value={`${packet.gatekeeper.status}: ${packet.gatekeeper.failures.length} failures, ${packet.gatekeeper.warnings.length} warnings`} />
        <TrustRow label="Agent output status" value={`${packet.agentRuns.length - failedAgentRuns} pass / ${failedAgentRuns} fail`} />
        <TrustRow label="Recommended option" value={packet.recommendedOptionId} />
        <TrustRow label="Approval required" value={recommendedOption?.approvalRequired ? "Yes" : "No"} />
      </div>
    </Card>
  );
}

function TrustRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-zinc-200 py-2 last:border-b-0">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right font-semibold text-zinc-900">{value}</span>
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-zinc-50 p-2">
      <div className="text-xs font-bold uppercase text-zinc-500">{label}</div>
      <div className="mt-1 text-sm font-bold text-zinc-950">{value}</div>
    </div>
  );
}

function statusTone(status: "PASS" | "WARN" | "BLOCKED") {
  if (status === "PASS") return "success";
  if (status === "WARN") return "warning";
  return "critical";
}

function approvalTone(status: DecisionPacket["approvalStatus"]) {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "critical";
  return "warning";
}
