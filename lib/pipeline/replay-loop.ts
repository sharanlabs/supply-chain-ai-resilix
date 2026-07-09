import recordedLoopRun from "@/evals/fixtures/loop/LOOP-HORMUZ.json";
import { DecisionPacketSchema } from "@/lib/schemas";
import type { AgentRun, DecisionPacketV2 } from "@/lib/schemas";

// The /loop exhibit serves a FROZEN, real live-captured Investigator-loop run as a
// recorded trace: the model-driven tool-call order, the per-agent runs, the REAL
// cross-family Skeptic verdict, and the code-bound gate outcome -- reproducibly, at
// $0, with NO network and NO LLM call. Source of truth: the S-L recorder
// (evals/record-loop-trajectory.test.ts) writes evals/fixtures/loop/LOOP-HORMUZ.json
// from a genuine live run (real Gemini loop + real Groq Skeptic, NO injected verdict).
//
// This loader differs from replay-packet.ts DELIBERATELY: the landing re-serves a
// packet AS the product surface, so it relabels every run REPLAY/$0. This page is an
// exhibit ABOUT a recorded run -- an audit-trace viewer -- so the run's recorded facts
// (which agents ran live, what the run metered, which model challenged it) ARE the
// content. Honesty lives in framing, enforced by the view + e2e: everything renders
// under "recorded run" provenance with the capture date, prose says "ran live
// (recorded)", and nothing claims a live call is happening now (serving is $0).
//
// Fail-loud guards mirror the landing loader: canonical schema parse, then semantic
// guards that the fixture IS what the exhibit claims -- a genuine LIVE loop capture
// with a REAL cross-family Skeptic. A regeneration that captured a waterfall,
// key-off, or injected-Skeptic run must throw here, never render as the exhibit.
export type LoopTrajectory = {
  packet: DecisionPacketV2;
  recordedAt: string;
  meteredCostUsd: number;
  toolSequence: string[];
  investigator: AgentRun;
  skeptic: AgentRun;
  skepticModel: string;
  gateOutcome: NonNullable<DecisionPacketV2["skepticGateOutcome"]>;
};

export function loadLoopTrajectory(): LoopTrajectory {
  const parsed = DecisionPacketSchema.safeParse(recordedLoopRun);
  if (!parsed.success || parsed.data.packetVersion !== 2) {
    throw new Error(
      `Loop fixture LOOP-HORMUZ.json failed canonical DecisionPacket validation ` +
        `(regenerate via evals/record-loop-trajectory.test.ts): ${
          parsed.success ? `got packetVersion ${parsed.data.packetVersion}` : parsed.error.message
        }`
    );
  }
  const packet = parsed.data;

  if (packet.effectiveMode !== "LIVE_AI" || (packet.totalCostUsd ?? 0) <= 0) {
    throw new Error(
      `Loop fixture is not a successful LIVE capture (effectiveMode=${packet.effectiveMode}, ` +
        `totalCostUsd=${packet.totalCostUsd ?? 0}); regenerate via evals/record-loop-trajectory.test.ts.`
    );
  }

  const investigator = packet.agentRuns.find((r) => r.agentName === "Investigator");
  // The readable tool order lives in the Investigator summary ("... [a -> b -> c]").
  const sequenceMatch = investigator?.summary?.match(/\[([^\]]+)\]/);
  if (!investigator || investigator.mode !== "LIVE_AI" || !sequenceMatch) {
    throw new Error(
      "Loop fixture has no live Investigator run with a recorded tool sequence -- " +
        "this is a waterfall capture, not a loop trajectory; regenerate."
    );
  }

  const skeptic = packet.agentRuns.find((r) => r.agentName === "Skeptic");
  if (!skeptic || !skeptic.model || skeptic.model === "deterministic-rules" || !packet.skepticGateOutcome) {
    throw new Error(
      "Loop fixture has no REAL cross-family Skeptic run with a code-bound gate outcome -- " +
        "the exhibit must never present a deterministic or injected verdict as the live critic; regenerate."
    );
  }

  return {
    packet,
    recordedAt: packet.createdAt,
    meteredCostUsd: packet.totalCostUsd ?? 0,
    toolSequence: sequenceMatch[1].split("->").map((s) => s.trim()),
    investigator,
    skeptic,
    skepticModel: skeptic.model,
    gateOutcome: packet.skepticGateOutcome
  };
}
