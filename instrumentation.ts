// Next.js startup hook (runs once when the server process boots).
//
// S6 -- the recorded 2026-06-27 forward-guardrail: wire the stranded-dispatch
// reconcile sweep to the boot path so a crash that stranded a REVERSIBLE dispatch
// is recovered at restart, not only when a request happens to touch that packet.
//
// SAFETY (all enforced downstream, restated here so the boot path is legible):
//   - The governance moat holds on recovery: reconcile re-drives ONLY REVERSIBLE
//     actions on APPROVED packets, NEVER an outward/IRREVERSIBLE one -- so the boot
//     sweep can never auto-fire the ERP_CASE n8n webhook or any outbound channel.
//   - Best-effort + non-fatal: reconcileAllStrandedDispatches never throws; a
//     recovery failure must not crash the server boot.
//   - Inert under the in-memory demo (no persisted packets survive a restart) and
//     when no transport is configured (NoopTransport) -- it earns its keep only on
//     a persistent, transport-wired production deploy.
//   - nodejs runtime only (the edge runtime has no DB/transport surface).

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Opt-out for environments that want a fully passive boot (e.g. a build probe).
  if (process.env.DISABLE_BOOT_RECONCILE === "true") return;

  // Dynamic import so this heavy module is not pulled into the edge bundle.
  const { reconcileAllStrandedDispatches } = await import("@/lib/server/action-executor");
  try {
    await reconcileAllStrandedDispatches();
  } catch {
    // reconcileAllStrandedDispatches is already fail-safe; this is belt-and-braces
    // so a boot can never be taken down by dispatch recovery.
  }
}
