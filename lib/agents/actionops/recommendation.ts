import type { ExposureResult, MissingEvidence, Recommendation } from "@/lib/schemas";

// The "low" confidence band ceiling. NOT a tuned magic number: it is the SAME 0.45
// boundary the UI's confidenceWord() uses to label a threat "low confidence"
// (components/action-packet-view.tsx). Below it, a threat the system itself reads as
// low-confidence is too weak to draft irreversible outbound supplier action on -- when
// it is ALSO uncorroborated. A single AUTHORITATIVE source (an official NWS hurricane
// warning, ~0.75) clears this comfortably; a lone unverified rumor (~0.35) does not.
// Keeping the value here as the single source of truth, referenced by the UI, means the
// refusal boundary and the UI's "low confidence" label can never silently diverge.
export const ACTION_CONFIDENCE_FLOOR = 0.45;

// capUncorroboratedLiveConfidence (A-01/D-01) -- the ONE place the live confidence cap lives.
//
// The live classifier authors its own `confidence`, and that number feeds decideRecommendation:
// it is the single spot where a model-authored value could flip a decision. When the
// DETERMINISTIC corroboration check says single-source, we cap the value below the action floor,
// which makes the refusal trigger deterministic again. Corroborated findings keep the model's
// (already clamped) value; deterministic/replay runs never enter this branch, so the frozen
// fixtures stay byte-identical.
//
// It lives HERE, beside the floor it references, because there are TWO live routes -- the
// waterfall (index.ts) and the default-ON agent loop (investigator.ts) -- and the 2026-07-16 fix
// was applied to the waterfall only, leaving the loop (the DEFAULT live path, see
// env-flags.ts agentLoopEnabled) deciding on uncapped model confidence. That is exactly the
// recorded lesson: a safety invariant duplicated (or half-applied) across modules is a latent
// drift bug -- extract ONE helper both sides import, so skipping it is structurally visible.
export function capUncorroboratedLiveConfidence<T extends { confidence: number }>(
  threatCard: T,
  opts: { live: boolean; corroborated: boolean }
): T {
  if (!opts.live || opts.corroborated) return threatCard;
  if (threatCard.confidence < ACTION_CONFIDENCE_FLOOR) return threatCard;
  return { ...threatCard, confidence: Math.max(0, ACTION_CONFIDENCE_FLOOR - 0.05) };
}

// decideRecommendation -- the act/refuse gate (pure + deterministic, so it is unit-true
// and never an LLM call). NO_ACTION fires ONLY when ALL THREE hold:
//
//   1. !corroborated        -- a single source (the Verifier's >=2-source bar is unmet).
//   2. confidence < FLOOR    -- the threat itself reads as low-confidence/unverified.
//                               This is the discriminator that keeps a single but
//                               AUTHORITATIVE source (NWS hurricane warning) acting,
//                               while a single UNVERIFIED one refuses -- the competitive
//                               differentiator is "unverified", not raw source count.
//   3. a real-sector exposure exists -- at least one matched supplier in a named sector.
//                               Excludes the zero-exposure control (no matched supplier ->
//                               nothing to act on) and the off-taxonomy control (every matched
//                               exposure is OTHER_UNMAPPED, held for taxonomy review upstream in
//                               Atlas, not yet a recognized actionable threat). Both return ACT
//                               from THIS gate -- the refusal is specifically about a recognized,
//                               actionable exposure we cannot corroborate, not those two cases.
//
// On NO_ACTION it returns the missing-evidence list (numeral-free): what is required,
// what is absent, and what would flip the decision. On ACT, missingEvidence is empty.
export function decideRecommendation(args: {
  corroborated: boolean;
  confidence: number;
  exposureResults: ExposureResult[];
}): { recommendation: Recommendation; missingEvidence: MissingEvidence[] } {
  const { corroborated, confidence, exposureResults } = args;

  const hasActionableExposure = exposureResults.some((e) => e.sector !== "OTHER_UNMAPPED");
  const lowConfidence = confidence < ACTION_CONFIDENCE_FLOOR;
  const refuse = !corroborated && lowConfidence && hasActionableExposure;

  if (!refuse) {
    return { recommendation: "ACT", missingEvidence: [] };
  }

  // Both trigger conditions are gaps when we refuse; enumerate the ones that actually
  // hold so the packet states exactly why. Prose is numeral-free -- counts are spelled
  // ("a single source", "a second independent source") so the refusal carries no
  // unsourced figure (the same citation contract the action path enforces).
  const missingEvidence: MissingEvidence[] = [];
  if (!corroborated) {
    missingEvidence.push({
      requirement: "Independent corroboration",
      detail:
        "Only a single source reports this disruption. RESILIX requires a second independent source before drafting outbound supplier action, so one source cannot be wrong, stale, or injected and still move suppliers.",
      wouldFlipIf: "A second independent source corroborates the same disruption."
    });
  }
  if (lowConfidence) {
    missingEvidence.push({
      requirement: "Authoritative confirmation",
      detail:
        "The available signal is low-confidence and unverified -- no official or authoritative source confirms it.",
      wouldFlipIf:
        "An official or authoritative source (a government advisory, a carrier or regulator notice) confirms the disruption."
    });
  }

  return { recommendation: "NO_ACTION", missingEvidence };
}
