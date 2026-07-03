import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, ArrowLeft, SearchX } from "lucide-react";

import { customsDeskEnabled } from "@/lib/server/env-flags";
import { CUSTOMS_GOLDEN_CASES } from "@/evals/golden/customs/cases";
import { MATRIX_CELLS, findCell } from "@/lib/agents/customsdesk/edge-case-matrix";
import { generateCase } from "@/lib/agents/customsdesk/synthetic-entries";
import {
  runCustomsDefenseCase,
  type CustomsDefenseOutcome
} from "@/lib/agents/customsdesk/pipeline";
import { skepticReview } from "@/lib/agents/customsdesk/skeptic-check";

import { SyntheticChip, LabelClassBadge, MatrixCellDims } from "@/components/customs/parts";
import { ScenarioPicker } from "@/components/customs/scenario-picker";
import { PipelineWalk } from "@/components/customs/pipeline-walk";
import { DefensePacketView } from "@/components/customs/defense-packet-view";
import { RefusalView } from "@/components/customs/refusal-view";
import { CitationGuardStop } from "@/components/customs/citation-guard-stop";
import { SkepticVerdict } from "@/components/customs/skeptic-verdict";
import { CounselGate } from "@/components/customs/counsel-gate";

export const metadata: Metadata = {
  title: "Customs Defense Desk — RESILIX",
  description:
    "Deterministic, replay-first demonstration of the customs enforcement-defense engine. Synthetic data; zero API keys."
};

// D5.2 -- the full `/customs` desktop surface.
//
// FLAG-GATED (customsDeskEnabled, DEFAULT OFF) and DYNAMIC (`await connection()`):
// the flag is read per-request and the strict nonce CSP needs a per-request nonce,
// so the route 404s cleanly when the flag is unset and the deploy stays byte-identical
// to the pre-D5 product. Case selection is a URL searchParam -> server-rendered,
// deep-linkable, replay-first; the whole run (generateCase -> runCustomsDefenseCase ->
// skepticReview) computes SERVER-SIDE here and flows down as serializable props. The
// engine is pure and key-off, safe to call in a Server Component.

function CustomsMasthead() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-ground/80 shadow-[var(--shadow-e2)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-8 py-3.5">
        <Link href="/customs" className="flex items-center gap-3.5 rounded-md">
          <span className="flex size-9 items-center justify-center rounded-lg bg-ink text-ground shadow-[var(--shadow-e2),inset_0_1px_0_oklch(1_0_0/0.12)]">
            <ShieldCheck className="size-[1.125rem]" aria-hidden="true" />
          </span>
          <span className="flex items-baseline gap-3">
            <span className="wordmark text-[1.1875rem] font-semibold text-ink">
              RESILIX <em>Customs Desk</em>
            </span>
            <span className="font-mono text-[0.625rem] tracking-[0.18em] text-ink-faint uppercase">
              Enforcement defense
            </span>
          </span>
        </Link>
        <SyntheticChip />
      </div>
    </header>
  );
}

function DisclaimerLine() {
  return (
    <p className="mt-4 text-[0.8125rem] leading-relaxed text-ink-faint">
      Synthetic data — demonstration. Every figure derives from the frozen engine over synthetic
      entries valid against the real CATAIR layout; no live services, no model calls, zero API keys.
    </p>
  );
}

function PickerLanding() {
  return (
    <>
      <header className="reveal mb-7" style={{ "--d": 40 } as React.CSSProperties}>
        <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-ink-faint uppercase">
          Customs enforcement-defense engine
        </p>
        <h1 className="mt-2.5 max-w-[42rem] text-[1.75rem] leading-tight font-semibold tracking-[-0.01em] text-ink">
          Pick a case. Watch the engine show its work, then hold or file it.
        </h1>
        <p className="mt-3 max-w-[60ch] text-[0.9375rem] leading-relaxed text-ink-muted">
          Each scenario runs the same deterministic spine: quarantine every exhibit, decide the
          disposition in code, bind every figure to a tool return, then produce a filing-grade
          packet — or refuse and name the gaps. The Skeptic re-derives it independently, and nothing
          exports without a named counsel approval.
        </p>
        <p className="tnum mt-5 font-mono text-[0.8125rem] font-medium text-accent-strong">
          {CUSTOMS_GOLDEN_CASES.length} replay cases · {MATRIX_CELLS.length} matrix cells
        </p>
        <DisclaimerLine />
      </header>
      <ScenarioPicker cases={CUSTOMS_GOLDEN_CASES} />
    </>
  );
}

function EmptyState({ requested }: { requested: string }) {
  return (
    <section
      className="reveal panel rounded-(--radius-card) p-8"
      style={{ "--d": 40 } as React.CSSProperties}
    >
      <div className="flex items-start gap-3">
        <SearchX className="mt-0.5 size-5 shrink-0 text-ink-faint" aria-hidden="true" />
        <div>
          <h1 className="text-[1.125rem] font-semibold text-ink">No case matches that link</h1>
          <p className="mt-2 max-w-[60ch] text-[0.875rem] leading-relaxed text-ink-muted">
            No golden case is registered under{" "}
            <span className="font-mono text-ink">{requested}</span>. It may be mistyped or from an
            older link.
          </p>
          {/* min-h-6: SC 2.5.8 target size -- a bare text-line link measures under
              24px tall; the 1.5rem floor keeps the target compliant. */}
          <Link
            href="/customs"
            className="mt-4 inline-flex min-h-6 items-center gap-1.5 text-[0.875rem] font-medium text-accent-strong hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to all cases
          </Link>
        </div>
      </div>
      <DisclaimerLine />
    </section>
  );
}

function BackLink() {
  // min-h-6: SC 2.5.8 target size (same 24px floor as the empty-state back link).
  return (
    <Link
      href="/customs"
      className="mb-5 inline-flex min-h-6 items-center gap-1.5 text-[0.8125rem] font-medium text-ink-muted hover:text-accent-strong"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      All cases
    </Link>
  );
}

function TerminalRailNote({ kind }: { kind: "refuse" | "guard" }) {
  return (
    <section
      className="reveal panel rounded-(--radius-card) p-5"
      style={{ "--d": 440 } as React.CSSProperties}
    >
      <h2 className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-faint uppercase">
        Counsel gate
      </h2>
      <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-muted">
        {kind === "refuse"
          ? "Nothing to export. The engine withheld the disclosure, so no filing-grade packet exists to approve — the gate is only reached when there is an artifact to release."
          : "No packet was produced. The citation guard failed closed before an artifact existed, so there is nothing to approve or export."}
      </p>
    </section>
  );
}

export default async function CustomsDeskPage({
  searchParams
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Opt into dynamic rendering: per-request CSP nonce + per-request flag evaluation.
  await connection();

  // A disabled flag makes the route indistinguishable from a nonexistent one.
  if (!customsDeskEnabled()) {
    notFound();
  }

  const params = await searchParams;
  const rawCase = Array.isArray(params.case) ? params.case[0] : params.case;
  const selected = rawCase ? CUSTOMS_GOLDEN_CASES.find((c) => c.id === rawCase) : undefined;
  const cell = selected ? findCell(selected.matrixCellId) : undefined;

  return (
    <div className="min-h-[100dvh]">
      <CustomsMasthead />
      <main className="mx-auto max-w-6xl px-8 py-8">
        {!rawCase ? (
          <PickerLanding />
        ) : !selected || !cell ? (
          <EmptyState requested={rawCase} />
        ) : (
          <CaseView case={selected} cell={cell} />
        )}
      </main>
    </div>
  );
}

// CaseView is a plain server render helper (not a component export): it runs the
// frozen engine for the selected case and lays out the war room.
function CaseView({
  case: selected,
  cell
}: {
  case: (typeof CUSTOMS_GOLDEN_CASES)[number];
  cell: NonNullable<ReturnType<typeof findCell>>;
}) {
  const synthetic = generateCase(cell, selected.seed);

  // runCustomsDefenseCase can THROW at produce time (fail-closed citation guard). A
  // throw is a first-class outcome rendered honestly, never an error page.
  let outcome: CustomsDefenseOutcome | null = null;
  let guardError: string | null = null;
  try {
    outcome = runCustomsDefenseCase(synthetic);
  } catch (e) {
    guardError = e instanceof Error ? e.message : String(e);
  }
  const verdict = outcome ? skepticReview(synthetic, outcome) : null;

  return (
    <>
      <BackLink />

      <header className="reveal mb-6" style={{ "--d": 40 } as React.CSSProperties}>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-[0.8125rem] font-medium text-ink-muted">
            {selected.id}
          </span>
          <LabelClassBadge labelClass={selected.labelClass} />
        </div>
        <h1 className="mt-3 max-w-[48rem] text-[1.5rem] leading-snug font-semibold tracking-[-0.01em] text-ink">
          {selected.narrative}
        </h1>
        {selected.patternSource ? (
          <p className="mt-2.5 max-w-[64ch] text-[0.8125rem] leading-relaxed text-ink-faint">
            Models the public fact shape of{" "}
            <span className="text-ink-muted">{selected.patternSource.caseName}</span> —{" "}
            <span className="font-mono">
              {selected.patternSource.court} {selected.patternSource.docket}
            </span>{" "}
            (courtlistener, fetched {selected.patternSource.fetchedAsOf}). Realism attribution, not
            an outcome claim.
          </p>
        ) : null}
        <MatrixCellDims cell={cell} />
        <DisclaimerLine />
      </header>

      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start gap-6">
        {/* Briefing spine: the walk, then the outcome. */}
        <div className="flex min-w-0 flex-col gap-6">
          {outcome ? (
            <>
              <PipelineWalk outcome={outcome} cell={cell} />
              {outcome.disposition === "PROCEED" ? (
                <DefensePacketView packet={outcome.packet} />
              ) : (
                <RefusalView packet={outcome.packet} />
              )}
            </>
          ) : (
            <CitationGuardStop message={guardError ?? "unknown produce-time failure"} />
          )}
        </div>

        {/* Decision rail: independent re-check, then the human gate. */}
        <aside className="sticky top-[5.5rem] flex flex-col gap-6">
          {verdict ? <SkepticVerdict verdict={verdict} /> : null}
          {outcome && outcome.disposition === "PROCEED" ? (
            <CounselGate packet={outcome.packet} />
          ) : (
            <TerminalRailNote kind={outcome ? "refuse" : "guard"} />
          )}
        </aside>
      </div>
    </>
  );
}
