import { connection } from "next/server";
import { LaunchOpsDashboard } from "@/components/launchops-dashboard";
import { loadReplayPacket } from "@/lib/pipeline/replay-packet";
import { makeDemoPacket } from "@/lib/data/demo-packet";
import type { DecisionPacketV2 } from "@/lib/schemas";

// The `/` landing surface serves a FROZEN live-captured packet as a recorded REPLAY
// (loadReplayPacket): rich live-quality output -- the full Hormuz exposures, playbooks,
// and drafted messages from a real Gemini run -- reproducibly, at $0, with NO network and
// NO LLM call. It is relabeled REPLAY end-to-end and never claims live; the capture date is
// surfaced from the fixture.
//
// The route renders DYNAMICALLY (`await connection()` below). The packet is still the same
// frozen fixture -- $0, no network, no LLM, REPLAY semantics unchanged -- but the strict
// nonce-based CSP (proxy.ts) requires a per-request nonce, which only a dynamically rendered
// page receives; a static prerender would ship scripts with no nonce and 'strict-dynamic'
// would block them. This supersedes the earlier static-prerender micro-optimization (reading
// a local fixture per request is sub-second either way); the security control wins the trade.
export default async function Home() {
  // Opt into dynamic rendering so proxy.ts's per-request CSP nonce is applied to this page.
  await connection();

  let packet: DecisionPacketV2;
  try {
    packet = loadReplayPacket();
  } catch (error) {
    // Defensive: if the frozen fixture is missing or drifts from the schema (the loud parse
    // throws), fall back to the reference packet so the surface never blanks -- logged
    // server-side so the failure is observable, not silent. The replay unit + e2e tests are
    // the real drift guard (they assert REPLAY actually renders).
    console.error(
      "loadReplayPacket failed for the `/` render; serving the demo fallback packet.",
      error
    );
    packet = makeDemoPacket();
  }
  return <LaunchOpsDashboard packet={packet} />;
}
