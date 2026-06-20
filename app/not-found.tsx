import Link from "next/link";
import { connection } from "next/server";
import { ShieldCheck } from "lucide-react";

// Rendered DYNAMICALLY (await connection()) for the same reason as app/page.tsx: the
// strict nonce-based CSP (proxy.ts) injects a per-request nonce only into a dynamically
// rendered document. A build-time-static 404 would ship Next's framework scripts with no
// nonce, which 'strict-dynamic' then blocks (fails closed, but a degraded page). Opting in
// here keeps the 404 fully nonced -- every document route the proxy matches is covered.
export default async function NotFound() {
  await connection();
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col items-center justify-center gap-7 px-6 text-center">
      <div className="flex size-11 items-center justify-center rounded-xl bg-ink text-ground shadow-[var(--shadow-e2),inset_0_1px_0_oklch(1_0_0/0.12)]">
        <ShieldCheck className="size-5" aria-hidden="true" />
      </div>
      <div className="space-y-2.5">
        <p className="font-mono text-xs tracking-[0.18em] text-ink-faint uppercase">Error 404</p>
        <h1 className="text-2xl font-semibold text-ink">This surface isn&rsquo;t on the board</h1>
        <p className="text-ink-muted">
          The page you tried to reach doesn&rsquo;t exist. Head back to the live action packet.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-medium text-ground shadow-[var(--shadow-e1)] transition-opacity hover:opacity-90"
      >
        Return to the war room
      </Link>
    </main>
  );
}
