"use client";

import { useState } from "react";
import { Lock, Check, Copy, Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  intoReview,
  approve,
  reject,
  exportPacket,
  type ReviewablePacket,
} from "@/lib/agents/customsdesk/counsel-gate";
import type { CustomsDefensePacket } from "@/lib/agents/customsdesk/defense-packet";

// The counsel gate -- a CLIENT island holding the real ReviewablePacket state machine
// in React. A packet is BORN pending; a named reviewer's approval is the ONLY path to
// an exportable artifact, and exportPacket() THROWS on any non-approved state. This
// component shows that real machine: it never fakes the gate, and the export button's
// blocked reason is the actual thrown message.

const STATE_LABEL: Record<string, string> = {
  PENDING_COUNSEL_REVIEW: "Pending counsel review",
  APPROVED_FOR_EXPORT: "Approved for export",
  REJECTED: "Rejected",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CounselGate({ packet }: { packet: CustomsDefensePacket }) {
  const [reviewable, setReviewable] = useState<ReviewablePacket>(() => intoReview(packet));
  const [reviewer, setReviewer] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const state = reviewable.approval.state;
  const pending = state === "PENDING_COUNSEL_REVIEW";
  const nameOk = reviewer.trim().length > 0;
  const reasonOk = note.trim().length > 0;

  // Exercise the REAL export door every render: a non-approved state throws, and we
  // surface that exact message rather than inventing a disabled reason.
  let exportText: string | null = null;
  let blockedReason: string | null = null;
  try {
    exportText = exportPacket(reviewable);
  } catch (e) {
    blockedReason = e instanceof Error ? e.message : String(e);
  }

  function onApprove() {
    setError(null);
    try {
      setReviewable(approve(reviewable, reviewer.trim(), today(), note.trim() || undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function onReject() {
    setError(null);
    try {
      setReviewable(reject(reviewable, reviewer.trim(), today(), note.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function onReset() {
    setReviewable(intoReview(packet));
    setReviewer("");
    setNote("");
    setError(null);
    setCopied(false);
  }

  async function onCopy() {
    if (!exportText) return;
    try {
      await navigator.clipboard.writeText(exportText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Clipboard was blocked by the browser; use Download instead.");
    }
  }

  function onDownload() {
    if (!exportText) return;
    const safeRef = packet.caseRef.replace(/[^a-zA-Z0-9._-]/g, "-");
    const blob = new Blob([exportText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeRef}-defense-packet.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section
      className="reveal panel overflow-hidden rounded-(--radius-card) shadow-[var(--shadow-e3),inset_0_1px_0_oklch(1_0_0/0.6)]"
      style={{ "--d": 440 } as React.CSSProperties}
      aria-labelledby="gate-h"
    >
      <div className="border-t-2 border-accent" />
      <div className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="gate-h" className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-faint uppercase">
            Counsel gate
          </h2>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.625rem] font-semibold tracking-wide uppercase ${
              state === "APPROVED_FOR_EXPORT"
                ? "bg-accent-soft text-accent-strong"
                : state === "REJECTED"
                  ? "bg-caution-soft text-caution-ink"
                  : "bg-sink-deep text-ink-muted"
            }`}
          >
            <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
            {STATE_LABEL[state]}
          </span>
        </div>

        <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-muted">
          This packet is a draft until a named reviewer approves it. Approval is the only path to an exportable
          artifact — there is no bypass parameter.
        </p>

        {pending ? (
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="counsel-reviewer" className="text-[0.75rem] font-medium text-ink">
                Reviewer name <span className="text-caution-ink">*</span>
              </label>
              <input
                id="counsel-reviewer"
                type="text"
                value={reviewer}
                onChange={(e) => setReviewer(e.target.value)}
                placeholder="e.g. J. Okafor, trade counsel"
                autoComplete="off"
                className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink shadow-[var(--shadow-e1)] placeholder:text-ink-faint"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="counsel-note" className="text-[0.75rem] font-medium text-ink">
                Reason or note
              </label>
              <textarea
                id="counsel-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Required to reject; optional as an approval note."
                className="w-full resize-none rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink shadow-[var(--shadow-e1)] placeholder:text-ink-faint"
              />
            </div>

            {error ? (
              <p role="alert" className="text-[0.8125rem] font-medium text-danger">
                {error}
              </p>
            ) : null}

            <div className="flex flex-col gap-2">
              <Button variant="primary" onClick={onApprove} disabled={!nameOk} className="w-full">
                <Check className="size-4" aria-hidden="true" />
                Approve for export
              </Button>
              <Button variant="secondary" onClick={onReject} disabled={!nameOk || !reasonOk} className="w-full">
                Reject — record a reason
              </Button>
              {!nameOk ? (
                <p className="text-center text-[0.6875rem] text-ink-faint">A named reviewer is required to decide.</p>
              ) : !reasonOk ? (
                <p className="text-center text-[0.6875rem] text-ink-faint">
                  Approve is ready. A reason is required to reject.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {state === "APPROVED_FOR_EXPORT" && reviewable.approval.state === "APPROVED_FOR_EXPORT" ? (
          <div className="mt-4">
            <p className="tnum text-[0.8125rem] text-ink">
              Approved for export by{" "}
              <span className="font-medium">{reviewable.approval.reviewer}</span> on{" "}
              <span className="font-mono">{reviewable.approval.approvedOn}</span>.
            </p>
            {reviewable.approval.note ? (
              <p className="mt-1 text-[0.8125rem] text-ink-muted">Note: {reviewable.approval.note}</p>
            ) : null}

            <div className="mt-3 flex gap-2">
              <Button variant="secondary" size="sm" onClick={onCopy}>
                {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button variant="secondary" size="sm" onClick={onDownload}>
                <Download className="size-4" aria-hidden="true" />
                Download .txt
              </Button>
            </div>

            <pre
              aria-label="Exported defense packet text"
              className="panel-sunken mt-3 max-h-80 overflow-auto rounded-md p-3 font-mono text-[0.75rem] leading-relaxed whitespace-pre-wrap text-ink"
            >
              {exportText}
            </pre>

            <div className="mt-3 border-t border-line pt-3">
              <Button variant="ghost" size="sm" onClick={onReset}>
                <RotateCcw className="size-4" aria-hidden="true" />
                Start over
              </Button>
            </div>
          </div>
        ) : null}

        {state === "REJECTED" && reviewable.approval.state === "REJECTED" ? (
          <div className="mt-4">
            <p className="tnum text-[0.8125rem] text-ink">
              Rejected by <span className="font-medium">{reviewable.approval.reviewer}</span> on{" "}
              <span className="font-mono">{reviewable.approval.rejectedOn}</span>.
            </p>
            <p className="mt-1 text-[0.8125rem] text-ink-muted">Reason: {reviewable.approval.reason}</p>
            <div className="mt-3 flex items-center gap-2 rounded-md border border-line bg-sink px-3 py-2 text-[0.75rem] text-ink-muted">
              <Lock className="size-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
              No artifact is produced — export stays blocked in the rejected state.
            </div>
            <div className="mt-3 border-t border-line pt-3">
              <Button variant="ghost" size="sm" onClick={onReset}>
                <RotateCcw className="size-4" aria-hidden="true" />
                Start over
              </Button>
            </div>
          </div>
        ) : null}

        {pending && blockedReason ? (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-line bg-sink px-3 py-2.5 text-[0.75rem] leading-relaxed text-ink-muted">
            <Lock className="mt-0.5 size-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
            <span>
              <span className="font-medium text-ink">Export blocked.</span> {blockedReason}
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
