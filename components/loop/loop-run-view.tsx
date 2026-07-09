import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Braces,
  ShieldCheck,
  Workflow
} from "lucide-react";
import type { LoopTrajectory } from "@/lib/pipeline/replay-loop";
import type { AgentRun } from "@/lib/schemas";

// The /loop exhibit -- "watch the agents work": a RECORDED Investigator-loop run
// rendered as an audit-trace viewer. Server component, zero interactivity, zero
// network: the fixture is the page. Honesty framing (enforced by loop.spec.ts):
// every mode reads "ran live (recorded)" prose -- never a bare enum that could
// read as live-now -- under a dated recorded-run banner, and the footer carries
// the synthetic-data disclosure like every other surface.
//
// Prior art for the pattern (live-verified 2026-07-08): LangSmith trace replay /
// AgentOps time-travel debugging -- a recorded agent trajectory a reviewer can
// walk. Ours adds the governance read: which steps were a model deciding, which
// were deterministic code, and where the numbers were bound.

// UTC-pinned date + a 4-dp cost format (metered fractions of a cent are the point).
function recordedDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "UTC" });
}
function microUsd(v: number): string {
  return `$${v.toFixed(4)}`;
}

// The loop's tool calls, mapped to the agent that executed each -- the display
// spine of the exhibit. Sentinel precedes the loop (it classified the threat the
// loop investigates); Strategist/Dispatcher run after the finding completes.
const TOOL_TO_AGENT: Record<string, string> = {
  checkCorroboration: "Verifier",
  assessExposure: "Atlas",
  simulateRunway: "Simulator",
  challengeFinding: "Skeptic"
};

function ModeChip({ run }: { run: AgentRun }) {
  const live = run.mode === "LIVE_AI";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[0.625rem] font-semibold tracking-[0.06em] uppercase ${
        live ? "bg-accent-soft text-accent-strong" : "bg-sink text-ink-muted"
      }`}
    >
      {live ? <Bot className="size-3" aria-hidden="true" /> : <Braces className="size-3" aria-hidden="true" />}
      {live ? `ran live -- ${run.model} (recorded)` : "deterministic code"}
    </span>
  );
}

function StepCard({
  index,
  title,
  run,
  note
}: {
  index: number;
  title: string;
  run: AgentRun;
  note?: string;
}) {
  return (
    <li className="panel flex flex-col gap-2 rounded-(--radius-card) p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">
          <span className="tnum mr-2 font-mono text-[0.6875rem] text-ink-faint">
            {String(index).padStart(2, "0")}
          </span>
          {title}
        </p>
        <ModeChip run={run} />
      </div>
      <p className="text-[0.8125rem] leading-6 text-ink-muted">{run.summary}</p>
      <p className="tnum font-mono text-[0.6875rem] text-ink-faint">
        metered {microUsd(run.costUsd ?? 0)} when recorded
        {note ? <span className="ml-2 text-ink-muted">{note}</span> : null}
      </p>
    </li>
  );
}

export function LoopRunView({ trajectory }: { trajectory: LoopTrajectory }) {
  const { packet, recordedAt, meteredCostUsd, toolSequence, investigator, skeptic, gateOutcome } =
    trajectory;
  const byName = new Map(packet.agentRuns.map((r) => [r.agentName, r]));
  const sentinel = byName.get("Sentinel");
  const strategist = byName.get("Strategist");
  const dispatcher = byName.get("Dispatcher");
  const accepted = gateOutcome === "ACCEPTED";

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6" data-testid="loop-run">
      {/* Lede + the recorded-run provenance banner (the honesty spine of the page). */}
      <header className="flex flex-col gap-4">
        <p className="flex items-center gap-2 text-sm text-ink-faint">
          <Workflow className="size-4" aria-hidden="true" />
          The agentic capstone, on the record
        </p>
        <h1 className="text-[1.75rem] leading-[1.16] font-semibold tracking-[-0.01em] text-ink">
          Watch the agents work.
        </h1>
        <p className="max-w-[52ch] text-[0.9375rem] leading-7 text-ink-muted">
          This is a recorded run of the tool-using Investigator loop on the Hormuz flagship: a
          live model chose which tools to call and in what order, deterministic code computed
          every number, and a second AI from a different company challenged the finding before
          it counted. Replaying it here costs nothing and calls nothing.
        </p>
        <p
          className="tnum inline-flex w-fit items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-muted shadow-[var(--shadow-e1)]"
          data-testid="loop-provenance"
        >
          <span aria-hidden="true" className="size-[0.4375rem] rounded-full bg-accent shadow-[0_0_0_3px_var(--color-accent-soft)]" />
          Recorded run
          <span className="font-mono text-[0.6875rem] text-ink">{recordedDate(recordedAt)}</span>
          · metered {microUsd(meteredCostUsd)} · replayed at $0, no live call
        </p>
      </header>

      {/* The model-driven tool order -- the loop's signature. */}
      <section aria-labelledby="seq-h" className="panel rounded-(--radius-card) p-5">
        <h2 id="seq-h" className="text-[0.6875rem] font-semibold tracking-[0.1em] text-ink-faint uppercase">
          The order the model chose
        </h2>
        <ol className="mt-3 flex flex-wrap items-center gap-2" data-testid="tool-sequence">
          {toolSequence.map((tool, i) => (
            <li key={tool} className="flex items-center gap-2">
              <span className="rounded-md border border-line bg-sink px-2.5 py-1 font-mono text-[0.75rem] text-ink">
                {tool}
              </span>
              {i < toolSequence.length - 1 ? (
                <ArrowRight className="size-3.5 text-ink-faint" aria-hidden="true" />
              ) : null}
            </li>
          ))}
        </ol>
        <p className="mt-3 max-w-[60ch] text-[0.8125rem] leading-6 text-ink-muted">
          {investigator.summary} The loop decides <em>what to look at</em>; it never authors a
          number -- every figure in the packet was bound from these tools&rsquo; return values in
          code, and the act/refuse decision was re-run in code after the loop finished.
        </p>
      </section>

      {/* The full cast, in execution order. */}
      <section aria-labelledby="steps-h" className="flex flex-col gap-3">
        <h2 id="steps-h" className="text-[0.6875rem] font-semibold tracking-[0.1em] text-ink-faint uppercase">
          Every step, with its provenance
        </h2>
        <ol className="flex flex-col gap-3">
          {sentinel ? (
            <StepCard index={1} title="Sentinel reads the raw news" run={sentinel} note="the only agent that ever sees raw article text" />
          ) : null}
          <StepCard index={2} title="The Investigator loop drives the tools" run={investigator} />
          {toolSequence.map((tool, i) => {
            const agent = byName.get(TOOL_TO_AGENT[tool] ?? "");
            return agent ? (
              <StepCard
                key={tool}
                index={3 + i}
                title={`${tool} -> ${TOOL_TO_AGENT[tool]}`}
                run={agent}
              />
            ) : null;
          })}
          {strategist ? (
            <StepCard index={3 + toolSequence.length} title="Strategist writes the playbooks" run={strategist} note="grounded only in the tools' numbers" />
          ) : null}
          {dispatcher ? (
            <StepCard index={4 + toolSequence.length} title="Dispatcher drafts the outreach" run={dispatcher} note="never sees raw article text; every numeral claims-checked" />
          ) : null}
        </ol>
      </section>

      {/* The second opinion -- the cross-family Skeptic, verbatim. */}
      <section
        aria-labelledby="skeptic-h"
        className="panel rounded-(--radius-card) border-t-2 border-t-accent p-5"
        data-testid="skeptic-verdict"
      >
        <h2 id="skeptic-h" className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.1em] text-ink-faint uppercase">
          <ShieldCheck className="size-3.5 text-accent-strong" aria-hidden="true" />
          The second opinion
        </h2>
        <p className="mt-3 max-w-[60ch] text-[0.9375rem] leading-7 text-ink">
          Before the finding counted, it was challenged by <span className="font-mono text-[0.8125rem]">{skeptic.model}</span> --
          a model from a different company than the one that drove the loop, so it cannot
          rubber-stamp its own work. Its recorded verdict:{" "}
          <span className={`font-semibold ${accepted ? "text-accent-strong" : "text-caution-ink"}`}>
            {accepted ? "accepted" : gateOutcome.toLowerCase()}
          </span>
          {" -- "}
          <q>{skeptic.summary}</q>
        </p>
        <p className="mt-2 max-w-[60ch] text-[0.8125rem] leading-6 text-ink-muted">
          The gate that turns this verdict into an outcome is deterministic code, not the
          critic&rsquo;s prose: a reject on a weak finding vetoes the plan; a reject on an
          independently strong one is recorded as a caution and still requires your approval.
        </p>
      </section>

      {/* Outcome + the paths onward. */}
      <section aria-label="Recorded outcome" className="panel flex flex-wrap items-center gap-x-5 gap-y-2 rounded-(--radius-card) px-5 py-4">
        <span className="inline-flex items-center rounded-md bg-accent-strong px-2.5 py-1 font-mono text-[0.6875rem] font-semibold tracking-[0.08em] text-accent-ink uppercase">
          {packet.recommendation ?? "ACT"}
        </span>
        <span className="tnum text-[0.8125rem] text-ink-muted">
          <span className="font-medium text-ink">{packet.exposureResults.length}</span> suppliers exposed ·{" "}
          <span className="font-medium text-ink">{packet.supplierMessages.length}</span> drafts queued ·
          gatekeeper <span className="font-medium text-ink">{packet.gatekeeper.status}</span> · run metered{" "}
          <span className="font-medium text-ink">{microUsd(meteredCostUsd)}</span>
        </span>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-strong hover:underline"
        >
          See this scenario&rsquo;s decision packet
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      </section>

      <footer className="border-t border-line pt-4 text-[0.75rem] leading-6 text-ink-faint">
        Synthetic data -- demonstration. The supplier list is a disclosed synthetic dataset; the
        run above is a genuine recorded execution against it (re-record:{" "}
        <span className="font-mono">evals/record-loop-trajectory.test.ts</span>, gated + billed).
        Nothing on this page performs a live model call.
      </footer>
    </main>
  );
}
