"use client";

import { useEffect } from "react";
import { ShieldAlert } from "lucide-react";

// The route error boundary. Next requires error.tsx to be a Client Component, which is
// rendered dynamically -- so it receives the strict CSP's per-request nonce (proxy.ts)
// automatically; no connection() needed. This replaces Next's static default error page,
// whose framework scripts would otherwise be nonce-less and blocked by 'strict-dynamic'.
export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Observable, not swallowed -- surfaced server-side via the digest in production.
    console.error("Unhandled error on the ActionOps surface:", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col items-center justify-center gap-7 px-6 text-center">
      <div className="flex size-11 items-center justify-center rounded-xl bg-sev-critical text-ground shadow-[var(--shadow-e2),inset_0_1px_0_oklch(1_0_0/0.12)]">
        <ShieldAlert className="size-5" aria-hidden="true" />
      </div>
      <div className="space-y-2.5">
        <p className="font-mono text-xs tracking-[0.18em] text-ink-faint uppercase">Surface error</p>
        <h1 className="text-2xl font-semibold text-ink">Something interrupted the war room</h1>
        <p className="text-ink-muted">
          The action surface hit an unexpected error. Retry, or return to the live packet.
        </p>
      </div>
      <button
        type="button"
        onClick={() => reset()}
        className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-medium text-ground shadow-[var(--shadow-e1)] transition-opacity hover:opacity-90"
      >
        Try again
      </button>
    </main>
  );
}
