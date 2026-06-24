"use client";

import { useMemo } from "react";
import { ShieldCheck } from "lucide-react";
import { ActionOpsPacketView } from "@/components/action-packet-view";
import { makeDemoPacket } from "@/lib/data/demo-packet";
import type { DecisionPacketV2 } from "@/lib/schemas";

// Re-export so the existing eval (evals/actionops-packet-view.test.tsx) keeps
// importing the V2 view from this module path. The implementation lives in its
// own file (action-packet-view.tsx).
export { ActionOpsPacketView };

// The ActionOps command surface.
//
// The calm-command-center rework folded the former FOUR-tab analyst layer
// (Events / Exposure / Simulation / Packet) into ONE flowing briefing. The
// research on consumer crisis-to-action surfaces (emergency alerts, Amazon
// A-to-z, bank fraud, Baymard) is unanimous: the single scrolling narrative is
// the universal pattern for a non-technical user in a "something broke" moment,
// while the multi-tab control board is the operator-tool anti-pattern (PagerDuty
// -- built for the person who FIXES the machine, the opposite of a procurement
// lead in hour one). The raw signal feed (the old Events tab) now lives as an
// on-demand disclosure inside the threat section, so no content was lost; the
// exposure table and runway simulation were already in the briefing spine.
export function ActionOpsDashboard({ packet }: { packet?: DecisionPacketV2 }) {
  const data = useMemo(() => packet ?? makeDemoPacket(), [packet]);

  // The dated capture of the recorded signals -- shown in the masthead so a
  // viewer is never shown replay as a live fetch.
  const recordedAt = useMemo(() => {
    const captured = data.publicSignals.find((s) => s.status === "CACHED")
      ?.fetchedAt;
    if (!captured) return null;
    return new Date(captured).toLocaleDateString("en-CA", { timeZone: "UTC" }); // YYYY-MM-DD
  }, [data]);

  return (
    <div className="min-h-[100dvh]">
      {/* The masthead -- a translucent, blurred sticky band lifted off the canvas
          by a tinted shadow (axe composites the alpha-over-solid background, so
          the blur stays a11y-clean). A hairline-strong divider grounds it. */}
      <header className="sticky top-0 z-20 border-b border-line bg-ground/80 shadow-[var(--shadow-e2)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-3.5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3.5">
            {/* The brand mark -- a deep graphite tile with a steel top-edge
                highlight, so it catches the same "lit from above" light as the
                panels. The accent shield reads as the product's quiet authority. */}
            <div className="flex size-9 items-center justify-center rounded-lg bg-ink text-ground shadow-[var(--shadow-e2),inset_0_1px_0_oklch(1_0_0/0.12)]">
              <ShieldCheck className="size-[1.125rem]" aria-hidden="true" />
            </div>
            <div className="flex items-baseline gap-3">
              <p className="wordmark text-[1.1875rem] font-semibold text-ink">
                RESILIX <em>ActionOps</em>
              </p>
              <span className="hidden font-mono text-[0.625rem] tracking-[0.18em] text-ink-faint uppercase sm:inline">
                Disruption response
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Honest provenance -- recorded signals, never labeled live. Lifted
                on the white surface with a soft shadow so it reads as a status
                chip, not flat text. */}
            <span
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-muted shadow-[var(--shadow-e1)]"
              title="Signals served from dated recorded fixtures -- not a live fetch"
            >
              <span
                aria-hidden="true"
                className="size-[0.4375rem] rounded-full bg-accent shadow-[0_0_0_3px_var(--color-accent-soft)]"
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

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <ActionOpsPacketView packet={data} />
      </main>
    </div>
  );
}
