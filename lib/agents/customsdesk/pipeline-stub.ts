// The declared seam the golden suite runs against -- and NOTHING more.
//
// D0 ships NO pipeline code (plan §5: D0 is validation tooling; D1-D7 are blocked
// behind the §6.1 interview kill-gate). This stub exists so the golden suite is
// RUNNABLE-RED today: `npm run customs:golden` executes every case and every case
// fails HERE, honestly, until the gate clears and D1-D3 build the real thing.
// Do not add behavior to this file -- the first real implementation replaces it.

import type { SyntheticCase } from "./synthetic-entries";

export interface CustomsDefenseOutcome {
  disposition: "PROCEED" | "REFUSE";
  namedGaps: string[];
  packetText: string;
}

export function runCustomsDefenseCase(input: SyntheticCase): CustomsDefenseOutcome {
  void input; // the seam's contract; consumed by the D1-D3 implementation
  throw new Error(
    "NOT_IMPLEMENTED: the customs-defense pipeline is D1-D3 work, blocked behind the " +
      "interview kill-gate (plan §6.1). The golden suite is runnable-red by design."
  );
}
