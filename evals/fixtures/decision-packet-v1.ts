import { randomUUID } from "node:crypto";
import {
  computeEffectiveMode,
  liveAiEnabled,
  runLaunchOpsAgents
} from "@/lib/agents/run";
import { validateDecisionInputs, validateDecisionPacket } from "@/lib/agents/gatekeeper";
import { buildExceptionEvent, calculateImpact } from "@/lib/engine/impact";
import { getScenario } from "@/lib/data/operations";
import { fetchPublicSignals } from "@/lib/signals/fetchers";
import type { DecisionPacketV1 } from "@/lib/schemas";

// ---------------------------------------------------------------------------
// The LaunchOps V1 packet, assembled via the salvage engine -- the canonical V1
// producer the back-compat union + legacy-read tests exercise now that the live
// pipeline emits V2 (D.1 cutover). Deterministic (cached signals, key-OFF), so it
// is reproducible without a network or live AI. This is the V1 test ORACLE;
// production no longer mints V1, but the V1 arm of the versioned union and the
// pre-P2.3 legacy-read path still need a real, schema-valid V1 packet to grade.
//
// It is the old executeExceptionPipeline body MINUS the persistence -- a fixture
// asserts shape, never writes -- which is exactly why the engine functions
// (runLaunchOpsAgents / calculateImpact / buildExceptionEvent / validateDecision-
// Inputs / getScenario) are retained: not dead salvage, but the V1 oracle.
// ---------------------------------------------------------------------------
export async function makeV1Packet(): Promise<DecisionPacketV1> {
  const scenario = getScenario("SCN-LAUNCH-001");
  const now = new Date().toISOString();
  const publicSignals = await fetchPublicSignals({ useLive: false });
  const exception = buildExceptionEvent({ scenarioId: scenario.id, publicSignals });
  const impactReport = calculateImpact(exception);
  const { options, recommendedOptionId, executionDraft, agentRuns } =
    await runLaunchOpsAgents({ publicSignals, impactReport });
  const gatekeeper = validateDecisionInputs({
    publicSignals,
    impactReport,
    options,
    recommendedOptionId
  });

  const requestedMode = liveAiEnabled() ? "LIVE_AI" : "DETERMINISTIC_RULES";
  const effectiveMode = computeEffectiveMode(agentRuns, requestedMode);

  const packet: DecisionPacketV1 = {
    packetVersion: 1,
    id: `DP-${randomUUID()}`,
    exception,
    publicSignals,
    impactReport,
    options,
    recommendedOptionId,
    gatekeeper,
    executionDraft,
    agentRuns,
    requestedMode,
    effectiveMode,
    approvalStatus: "PENDING",
    auditTrail: [
      {
        at: now,
        actor: "system",
        action: "SCENARIO_RUN",
        detail: `Scenario ${scenario.name} executed with cached signals (V1 fixture).`
      },
      {
        at: now,
        actor: "gatekeeper",
        action: gatekeeper.status,
        detail: `${gatekeeper.failures.length} failures and ${gatekeeper.warnings.length} warnings.`
      }
    ],
    createdAt: now,
    updatedAt: now
  };

  const parsed = validateDecisionPacket(packet);
  if (!parsed.success) {
    throw new Error(`V1 fixture failed schema validation: ${parsed.error.message}`);
  }
  return parsed.data as DecisionPacketV1;
}
