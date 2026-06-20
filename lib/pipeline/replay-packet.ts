import frozenHormuz from "@/evals/fixtures/live/SCN-HORMUZ.json";
import { DecisionPacketV2Schema } from "@/lib/schemas";
import type { DecisionPacketV2 } from "@/lib/schemas";

// The landing demo serves a FROZEN, real live-captured packet as a REPLAY: rich
// live-quality output (the full Hormuz exposures + playbooks + drafted messages),
// reproducibly, at $0, with NO network and NO LLM call. Source of truth: the recorder
// (evals/record-live-packets.test.ts) writes evals/fixtures/live/SCN-HORMUZ.json from a
// genuine live Gemini run -- this re-presents that one artifact. Importing the fixture
// directly keeps a SINGLE source (regenerate it and the landing updates), per the handoff.
//
// Honesty (Success_Criteria "Replay mode rendering: renders < 15s, shows the fixture
// capture date, NEVER labeled live"): the served packet is relabeled REPLAY end-to-end --
// requested/effectiveMode REPLAY, every agent run REPLAY at $0, totalCostUsd 0 -- so no
// surface can claim live or claim to have billed. The capture instant (the fixture's own
// createdAt) is preserved and surfaced (the dashboard reads the CACHED signals' fetchedAt
// + the packet createdAt), so a viewer always sees a dated recording, not a live fetch.
//
// The frozen JSON is parsed through DecisionPacketV2Schema and FAILS LOUD on any drift
// (the codebase's "a malformed versioned packet fails loudly" rule) rather than serving a
// malformed packet. The page-level caller keeps a demo fallback so production never blanks,
// but the loud parse is what the replay unit + e2e tests assert against.
export function loadReplayPacket(): DecisionPacketV2 {
  const parsed = DecisionPacketV2Schema.safeParse(frozenHormuz);
  if (!parsed.success) {
    throw new Error(
      `Replay fixture SCN-HORMUZ.json failed DecisionPacketV2 validation ` +
        `(regenerate via evals/record-live-packets.test.ts): ${parsed.error.message}`
    );
  }
  const captured = parsed.data;

  // Re-present the captured live packet as a recorded REPLAY. Content is preserved
  // verbatim; only the mode/cost provenance is normalized so nothing claims live or cost.
  return {
    ...captured,
    requestedMode: "REPLAY",
    effectiveMode: "REPLAY",
    totalCostUsd: 0,
    agentRuns: captured.agentRuns.map((run) => ({
      ...run,
      mode: "REPLAY",
      costUsd: 0
    })),
    auditTrail: [
      ...captured.auditTrail,
      {
        at: captured.createdAt,
        actor: "system",
        action: "REPLAY_SERVED",
        detail: `Served as a recorded REPLAY of a live packet captured ${captured.createdAt}; no live AI call, no cost.`
      }
    ]
  };
}
