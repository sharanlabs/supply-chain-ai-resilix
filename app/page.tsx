import { LaunchOpsDashboard } from "@/components/launchops-dashboard";
import { buildDecisionPacket } from "@/lib/pipeline/build-packet";
import { makeDemoPacket } from "@/lib/data/demo-packet";
import type { DecisionPacketV2 } from "@/lib/schemas";

// The `/` route is an async server component (D.1 cutover). It ASSEMBLES the real
// ActionOps packet once on the server: buildDecisionPacket is pure + NON-persisting
// and runs on cached signals (useLiveSignals:false), so a page load does NOT write
// a packet and does NOT hit the network -- no per-load save, no request-time
// flakiness. The validated V2 is handed to the client dashboard as a prop.
// makeDemoPacket() is the defensive fallback if assembly ever throws, so the
// surface degrades to a valid reference packet rather than blanking.
export default async function Home() {
  let packet: DecisionPacketV2;
  try {
    packet = await buildDecisionPacket({ useLiveSignals: false });
  } catch (error) {
    // Fall back to the reference packet so the surface never blanks -- but make the
    // failure OBSERVABLE. A silent swallow would render the canned demo
    // indistinguishably from real pipeline output; once live AI lands (D.5+) that
    // could mask a real outage behind a healthy-looking demo. Logged server-side.
    console.error(
      "buildDecisionPacket failed for the `/` render; serving the demo fallback packet.",
      error
    );
    packet = makeDemoPacket();
  }
  return <LaunchOpsDashboard packet={packet} />;
}
