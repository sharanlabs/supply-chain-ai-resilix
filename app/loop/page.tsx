import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import { loadLoopTrajectory } from "@/lib/pipeline/replay-loop";
import { LoopRunView } from "@/components/loop/loop-run-view";

export const metadata: Metadata = {
  title: "Recorded agent run — RESILIX",
  description:
    "A recorded run of the tool-using Investigator loop: the model-driven tool order, deterministic number binding, and the real cross-family Skeptic verdict. $0 replay, zero API keys."
};

// S-L -- the /loop exhibit. ALWAYS mounted (unlike /customs there is no flag: the
// page is a static read of a committed recorded fixture -- it IS the replay-only
// posture) and DYNAMIC (`await connection()`) purely for the per-request CSP nonce,
// same as `/`. The loader fails loud if the fixture is not a genuine live loop
// capture with a real cross-family Skeptic; there is no fallback -- a broken
// exhibit must break visibly, never render a fabricated trace.
export default async function LoopPage() {
  await connection();
  const trajectory = loadLoopTrajectory();

  return (
    <div className="app-shell min-h-[100dvh]">
      <header className="sticky top-0 z-20 border-b border-line bg-ground/80 shadow-[var(--shadow-e2)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-ink text-ground shadow-[var(--shadow-e2),inset_0_1px_0_oklch(1_0_0/0.12)]">
              <ShieldCheck className="size-[1.125rem]" aria-hidden="true" />
            </span>
            <span className="flex items-baseline gap-3">
              <span className="wordmark text-[1.1875rem] font-semibold text-ink">
                RESILIX <em>ActionOps</em>
              </span>
              <span className="hidden font-mono text-[0.625rem] tracking-[0.18em] text-ink-faint uppercase sm:inline">
                Recorded agent run
              </span>
            </span>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted shadow-[var(--shadow-e1)] hover:text-ink"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            War room
          </Link>
        </div>
      </header>
      <LoopRunView trajectory={trajectory} />
    </div>
  );
}
