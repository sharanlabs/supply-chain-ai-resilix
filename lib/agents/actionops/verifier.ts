import type { AgentRun, PublicSignal, ThreatCard } from "@/lib/schemas";
import { makeAgentRun } from "@/lib/agents/actionops/agent-run";
import type { ActionOpsContext } from "@/lib/agents/actionops/types";

// Verifier (deterministic). A DISTINCT agent with its own run record -- kept
// separate from the gatekeeper on purpose so the "healthy runs never mislabeled"
// criterion can assert Verifier / Atlas / Simulator / gatekeeper as independent
// DETERMINISTIC_RULES runs. It corroborates the threat against the fetched signals
// (source count, recency, geo agreement) with a templated rationale, never an LLM
// call. D.4 hardens the checks.
export type VerifierChecks = {
  sourceCount: number;
  corroborated: boolean;
  freshestMinutes: number | null;
  geoAgrees: boolean;
};

export function runVerifier(
  ctx: ActionOpsContext,
  threatCard: ThreatCard
): { checks: VerifierChecks; agentRun: AgentRun } {
  const { signals, baseDateIso } = ctx;
  const checks = computeChecks(signals, threatCard);

  const agentRun = makeAgentRun({
    id: "RUN-VERIFIER",
    agentName: "Verifier",
    input: { signalCount: signals.length, threatId: threatCard.id },
    output: checks,
    summary: `${checks.sourceCount} source(s); corroboration ${
      checks.corroborated ? "met" : "single-source"
    }; geo ${checks.geoAgrees ? "agrees" : "unconfirmed"}.`,
    createdAt: baseDateIso,
    // A run with zero corroborating signals is a real verification failure.
    validationStatus: checks.sourceCount > 0 ? "PASS" : "FAIL"
  });

  return { checks, agentRun };
}

function computeChecks(signals: PublicSignal[], threatCard: ThreatCard): VerifierChecks {
  const freshestMinutes =
    signals.length > 0 ? Math.min(...signals.map((s) => s.freshnessMinutes)) : null;
  const threatCountry = threatCard.location.country;
  const geoAgrees =
    threatCountry != null && signals.some((s) => s.location.country === threatCountry);
  // Corroboration counts INDEPENDENT sources, not raw signals: two articles from the SAME
  // source (same `source` label) are one outlet, not two-source agreement. Counting raw
  // signals would let duplicated same-source items flip the refusal gate to ACT, which is
  // exactly the accountability the NO_ACTION path exists to prevent. Source identity is the
  // normalized `source` label (the outlet); the closely-named "Reuters (via GDELT)" vs
  // "GDELT DOC 2.0" stay distinct, while two raw "GDELT DOC 2.0" hits collapse to one.
  // Filter BLANK/whitespace source labels before counting: a sourceless signal is not an
  // independent outlet, and counting "" as a distinct source would let one real source plus
  // a blank-source signal reach sourceCount=2 -> corroborated -> bypass the NO_ACTION gate
  // (Codex MED). Only genuinely-labeled, distinct outlets count toward corroboration.
  const distinctSources = new Set(
    signals.map((s) => s.source.trim().toLowerCase()).filter((s) => s.length > 0)
  );
  const sourceCount = distinctSources.size;
  return {
    sourceCount,
    corroborated: sourceCount >= 2,
    freshestMinutes,
    geoAgrees
  };
}
