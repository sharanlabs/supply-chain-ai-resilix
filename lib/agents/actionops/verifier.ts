import type { AgentRun, CountryCode, ThreatCard } from "@/lib/schemas";
import { normalizeCountryToIso } from "@/lib/data/country-iso";
import { makeAgentRun } from "@/lib/agents/actionops/agent-run";
import { type QuarantinedSignal, quarantineSignals } from "@/lib/agents/actionops/quarantine";
import type { ActionOpsContext } from "@/lib/agents/actionops/types";

// Verifier (deterministic). A DISTINCT agent with its own run record -- kept
// separate from the gatekeeper on purpose so the "healthy runs never mislabeled"
// criterion can assert Verifier / Atlas / Simulator / gatekeeper as independent
// DETERMINISTIC_RULES runs. It corroborates the threat against the fetched signals
// (source count, recency, geo agreement) with a templated rationale, never an LLM
// call. D.4 hardens the checks.

// GeoStatus: the THREE-STATE geo-coherence signal (supersedes the old `geoAgrees` boolean, which
// conflated two very different situations). The split is load-bearing for the Skeptic gate:
//   - AGREES      -- the finding names a country AND at least one corroborating source is in it.
//   - UNCONFIRMED -- there is no single country to match: EITHER the finding carries no country
//                    (e.g. a CHOKEPOINT event like the Strait of Hormuz, which spans several states),
//                    OR the sources carry no geography at all. This is "we cannot confirm OR deny",
//                    NOT a disagreement -- it must never be treated as a geo conflict (the old
//                    boolean did, which STRUCTURALLY false-vetoed the chokepoint flagship).
//   - CONFLICT    -- the finding names a country, the sources DO carry geography, and NONE of them
//                    is that country: a real geographic contradiction (likely misclassification).
// Only CONFLICT is an adverse signal; UNCONFIRMED is neutral. The Skeptic gate keys its precise geo
// veto off CONFLICT alone (skeptic.ts: FindingStrength.geoConflict).
export type GeoStatus = "AGREES" | "UNCONFIRMED" | "CONFLICT";

export type VerifierChecks = {
  sourceCount: number;
  corroborated: boolean;
  freshestMinutes: number | null;
  geo: GeoStatus;
};

export function runVerifier(
  ctx: ActionOpsContext,
  threatCard: ThreatCard
): { checks: VerifierChecks; agentRun: AgentRun } {
  const { signals, baseDateIso } = ctx;
  // QUARANTINE BOUNDARY: the Verifier corroborates from STRUCTURED signal fields only (source
  // count, recency, geo) -- it never needs the raw prose, so it receives the quarantined view.
  // The `summary` is structurally absent here (quarantine.ts), so a future edit cannot make the
  // Verifier read untrusted article text.
  const checks = computeChecks(quarantineSignals(signals), threatCard);

  const agentRun = makeAgentRun({
    id: "RUN-VERIFIER",
    agentName: "Verifier",
    input: { signalCount: signals.length, threatId: threatCard.id },
    output: checks,
    summary: `${checks.sourceCount} source(s); corroboration ${
      checks.corroborated ? "met" : "single-source"
    }; geo ${checks.geo.toLowerCase()}.`,
    createdAt: baseDateIso,
    // A run with zero corroborating signals is a real verification failure.
    validationStatus: checks.sourceCount > 0 ? "PASS" : "FAIL"
  });

  return { checks, agentRun };
}

function computeChecks(signals: QuarantinedSignal[], threatCard: ThreatCard): VerifierChecks {
  const freshestMinutes =
    signals.length > 0 ? Math.min(...signals.map((s) => s.freshnessMinutes)) : null;
  // Three-state geo coherence (see GeoStatus). The distinction Codex's deferred [P1] #2 named: a
  // gate-only `country != null && !agrees` approximation would mislabel "country named but the
  // sources carry NO geography" as a conflict and over-veto. So we compute CONFLICT precisely --
  // it requires the sources to actually carry a DIFFERENT, COMPARABLE country, not merely the
  // ABSENCE of a match.
  //
  // NORMALIZE BOTH SIDES TO ISO before comparing (Codex [P1], closure): the threat country is
  // already an ISO alpha-2 code (Sentinel validates via CountryCodeSchema), but a SOURCE signal's
  // country is a LOOSE string -- GDELT/NWS emit "United States" / "Japan", not "US" / "JP". A raw
  // string compare would read a real US finding whose sources say "United States" as a CONFLICT and
  // false-veto it. Only a source that resolves to a real ISO code counts as geography; a blank or
  // unrecognized one is neither agreement nor conflict -- it stays UNCONFIRMED (cannot confirm/deny).
  const threatCountry = normalizeCountryToIso(threatCard.location.country);
  const sourceCountries = signals
    .map((s) => normalizeCountryToIso(s.location.country))
    .filter((c): c is CountryCode => c != null);
  let geo: GeoStatus;
  if (threatCountry == null) {
    // No single country to corroborate against (a chokepoint spanning several states, a global
    // event, or an unrecognized threat country). UNCONFIRMED -- the chokepoint flagship's shape.
    geo = "UNCONFIRMED";
  } else if (sourceCountries.includes(threatCountry)) {
    geo = "AGREES";
  } else if (sourceCountries.length > 0) {
    // The sources resolve to a real country and none is the named threat country -> a real conflict.
    geo = "CONFLICT";
  } else {
    // The finding names a country but no source resolves to one -> cannot confirm or deny.
    geo = "UNCONFIRMED";
  }
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
    geo
  };
}
