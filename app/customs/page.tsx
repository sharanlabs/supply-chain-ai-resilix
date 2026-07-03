import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { customsDeskEnabled } from "@/lib/server/env-flags";
import { CUSTOMS_GOLDEN_CASES } from "@/evals/golden/customs/cases";
import { MATRIX_CELLS } from "@/lib/agents/customsdesk/edge-case-matrix";

export const metadata: Metadata = {
  title: "Customs Defense Desk — RESILIX",
  description:
    "Deterministic, replay-first demonstration of the customs enforcement-defense engine. Synthetic data; zero API keys.",
};

// D5.1 scaffold: the `/customs` desktop surface entry point.
//
// FLAG-GATED (customsDeskEnabled, DEFAULT OFF): with ENABLE_CUSTOMS_DESK unset the route
// 404s and the deploy stays byte-identical to the pre-D5 product. The full desk lands in
// the next piece; this scaffold proves three things end-to-end -- the flag gate, the
// app-shell/panel shell, and that the surface is wired to the REAL frozen engine data.
//
// Renders DYNAMICALLY via `await connection()` (identical to the `/` landing surface): the
// strict nonce-based CSP (proxy.ts) needs a per-request nonce, which only a dynamically
// rendered page receives. Forcing dynamic FIRST also means the flag is read per-request
// (not baked at build), so toggling ENABLE_CUSTOMS_DESK takes effect without a rebuild.
export default async function CustomsDeskPage() {
  // Opt into dynamic rendering: per-request CSP nonce + per-request flag evaluation.
  await connection();

  // A disabled flag makes the route indistinguishable from a nonexistent one.
  if (!customsDeskEnabled()) {
    notFound();
  }

  // ONE deterministic fact, read straight from the frozen engine's pure data modules --
  // proof the surface is wired to the real engine, not a mock. Both counts are computed
  // server-side from the exact sources the golden suite consumes.
  const replayScenarios = CUSTOMS_GOLDEN_CASES.length; // 24 labelled golden cases
  const matrixCells = MATRIX_CELLS.length; // 40 declared coverage cells

  return (
    <main className="mx-auto max-w-3xl px-8 py-16">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
          RESILIX
        </p>
        <h1 className="wordmark mt-2 text-3xl font-semibold tracking-[-0.01em] text-ink">
          Customs Defense Desk
        </h1>
      </header>

      <section className="reveal panel rounded-(--radius-card) p-7">
        <p className="text-sm font-semibold text-sev-medium-ink">
          Synthetic data — demonstration
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          A deterministic, replay-first demonstration of the customs
          enforcement-defense engine. Every figure is derived from the frozen
          engine over synthetic entries — no live services, no model calls,
          zero API keys.
        </p>
        <p className="tnum mt-5 text-sm font-medium text-accent-strong">
          {replayScenarios} replay scenarios · {matrixCells} matrix cells
        </p>
      </section>
    </main>
  );
}
