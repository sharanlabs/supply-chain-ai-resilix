import { OctagonX } from "lucide-react";

// The fail-closed outcome: runCustomsDefenseCase() can THROW at produce time when the
// citation guard finds an uncited numeral. That throw is a first-class, honest result
// -- the engine's own guard refusing to emit an unsourced figure -- never an error
// page. (Defensive: all 24 golden cases pass the guard, so this does not fire for
// them; it is the honest surface for the guard ever firing.)

export function CitationGuardStop({ message }: { message: string }) {
  return (
    <section
      className="reveal panel overflow-hidden rounded-(--radius-card)"
      style={{ "--d": 280 } as React.CSSProperties}
      aria-labelledby="guard-h"
    >
      <div className="border-t-2 border-caution" />
      <div className="flex items-start gap-3 px-6 py-5">
        <OctagonX className="mt-0.5 size-5 shrink-0 text-caution-ink" aria-hidden="true" />
        <div>
          <h2 id="guard-h" className="text-[1.125rem] leading-tight font-semibold text-ink">
            The citation guard stopped emission
          </h2>
          <p className="mt-2 max-w-[70ch] text-[0.875rem] leading-relaxed text-ink-muted">
            The engine assembled a packet but its produce-time citation check found a numeral without a backing tool
            return, so the packet was not emitted. A packet that fails this check does not exist — the guard fails
            closed rather than disclose an unsourced figure.
          </p>
          <pre className="panel-sunken mt-3 overflow-auto rounded-md p-3 font-mono text-[0.75rem] leading-relaxed whitespace-pre-wrap text-ink">
            {message}
          </pre>
        </div>
      </div>
    </section>
  );
}
