import { randomUUID } from "node:crypto";
import { runLaunchOpsAgents } from "@/lib/agents/run";
import { validateDecisionInputs, validateDecisionPacket } from "@/lib/agents/gatekeeper";
import { buildExceptionEvent, calculateImpact } from "@/lib/engine/impact";
import { getScenario } from "@/lib/data/operations";
import { fetchPublicSignals } from "@/lib/signals/fetchers";
import {
  getDecisionPacketByIdempotencyKey,
  saveDecisionPacket
} from "@/lib/server/store";
import type { DecisionPacket } from "@/lib/schemas";

// In-process reservation of in-flight runs keyed by idempotencyKey. This
// guarantees the expensive pipeline body (which calls the LLM agents) runs at
// most once per key WITHIN a single Node instance. Cross-instance
// serialization relies on the DB unique constraint on run_idempotency_keys
// plus a future Postgres advisory lock (post-MVP).
const inflightRuns = new Map<string, Promise<DecisionPacket>>();

export async function runExceptionPipeline(options: {
  scenarioId?: string;
  useLiveSignals?: boolean;
  idempotencyKey?: string;
} = {}): Promise<DecisionPacket> {
  const { idempotencyKey } = options;
  if (!idempotencyKey) {
    return executeExceptionPipeline(options);
  }

  // get -> create promise -> set must be synchronous and contiguous (no await
  // between them) so a concurrent same-key caller sees the in-flight promise.
  const pending = inflightRuns.get(idempotencyKey);
  if (pending) {
    return pending;
  }

  const promise = (async () => {
    // Double-check inside the lock: a prior run may have already persisted a
    // packet for this key in a previous (completed) request.
    const existing = await getDecisionPacketByIdempotencyKey(idempotencyKey);
    if (existing) {
      return existing;
    }
    return executeExceptionPipeline(options);
  })();
  inflightRuns.set(idempotencyKey, promise);

  try {
    return await promise;
  } finally {
    inflightRuns.delete(idempotencyKey);
  }
}

async function executeExceptionPipeline({
  scenarioId = "SCN-LAUNCH-001",
  useLiveSignals = true,
  idempotencyKey
}: {
  scenarioId?: string;
  useLiveSignals?: boolean;
  idempotencyKey?: string;
} = {}): Promise<DecisionPacket> {
  const scenario = getScenario(scenarioId);
  const now = new Date().toISOString();
  const publicSignals = await fetchPublicSignals({ useLive: useLiveSignals });
  const exception = buildExceptionEvent({ scenarioId: scenario.id, publicSignals });
  const impactReport = calculateImpact(exception);
  const { options, recommendedOptionId, executionDraft, agentRuns } =
    await runLaunchOpsAgents({
      publicSignals,
      impactReport
    });
  const gatekeeper = validateDecisionInputs({
    publicSignals,
    impactReport,
    options,
    recommendedOptionId
  });

  const packet: DecisionPacket = {
    id: `DP-${randomUUID()}`,
    exception,
    publicSignals,
    impactReport,
    options,
    recommendedOptionId,
    gatekeeper,
    executionDraft,
    agentRuns,
    approvalStatus: "PENDING",
    auditTrail: [
      {
        at: now,
        actor: "system",
        action: "SCENARIO_RUN",
        detail: `Scenario ${scenario.name} executed with ${
          useLiveSignals ? "live signal fetchers" : "cached signals"
        }.`
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
    throw new Error(`Decision packet failed schema validation: ${parsed.error.message}`);
  }

  return saveDecisionPacket(parsed.data, { idempotencyKey });
}
