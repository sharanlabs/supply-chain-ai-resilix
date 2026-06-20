import { LaunchOpsDashboard } from "@/components/launchops-dashboard";
import { loadReplayPacket } from "@/lib/pipeline/replay-packet";
import { makeDemoPacket } from "@/lib/data/demo-packet";
import type { DecisionPacketV2 } from "@/lib/schemas";

// The `/` landing surface serves a FROZEN live-captured packet as a recorded REPLAY
// (loadReplayPacket): rich live-quality output -- the full Hormuz exposures, playbooks,
// and drafted messages from a real Gemini run -- reproducibly, at $0, with NO network and
// NO LLM call. It is relabeled REPLAY end-to-end and never claims live; the capture date is
// surfaced from the fixture. Because the packet is FROZEN, the route renders STATICALLY:
// the old force-dynamic rationale (buildDecisionPacket stamping a fresh createdAt/id per
// request) no longer applies -- a replay's "compiled" instant IS its dated, recorded
// capture instant, which a static prerender serves correctly and instantly (< 15s, trivially).
export default function Home() {
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
