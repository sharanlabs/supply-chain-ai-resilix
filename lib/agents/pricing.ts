// The COST LEDGER pricing table (D.8, R4-10). Pure + unit-testable. This is the
// money side of the Success_Criteria "<=$5 total LLM spend" row: a real per-call
// USD cost computed from API-reported token counts and a PINNED, VERSIONED price
// table -- not the old chars/4 tokenEstimate, which never touched dollars.
//
// WHY a pinned table (not a live price fetch): prices move under the cutoff, so a
// run's cost must be reproducible from the packet alone. The version string stamped
// on every run/packet records WHICH price list produced the number, so a later
// re-price is an explicit migration, never a silent retroactive change.
//
// Prices are per 1,000,000 tokens in USD, GA + live-verified on this project's key
// (2026-06-18, two independent sources agree). Input = prompt tokens; output =
// completion tokens. Source-of-truth for the model ids is resolvedGeminiModel()
// in lib/agents/run.ts -- the SAME bare ids (no "models/" prefix) the AgentRun.model
// field carries, so the table key and the run's model never drift.

// The pinned price-list version. Bump this whenever the TABLE changes -- a provider re-prices OR a
// provider is added -- so the stamp on each run records which list was in force. Bumped to 2026-07-22
// when the Gemini 3.x GA rows were ADDED and the default moved to gemini-3.5-flash (Batch 7 recency
// fix: Gemini 2.5 Flash is deprecation-scheduled 2026-10-16; the 2.5 rows stay so recorded runs and
// fixtures keep pricing correctly). Pure string id.
export const PRICING_VERSION = "2026-07-22";

// Per-model USD price per 1,000,000 tokens. Keyed on the BARE Gemini id (matches
// resolvedGeminiModel()). Live-verified against ai.google.dev/gemini-api/docs/pricing +
// an independent tracker, 2026-07-22 (standard-context paid-tier rows; the tiered >200k
// rates on -pro are deliberately NOT modeled -- our calls never approach 200k input).
// gemini-3.5-flash is the GA default; the 2.5 line is deprecation-scheduled 2026-10-16
// but still serving, kept for recorded-run reproducibility; gemini-3.6-flash (released
// 2026-07-21) is priced but NOT the default until it has more than a day of history.
type ModelPrice = { inputPerMillionUsd: number; outputPerMillionUsd: number };

export const GEMINI_PRICING: Record<string, ModelPrice> = {
  "gemini-3.6-flash": { inputPerMillionUsd: 1.5, outputPerMillionUsd: 7.5 },
  "gemini-3.5-flash": { inputPerMillionUsd: 1.5, outputPerMillionUsd: 9 },
  "gemini-3.5-flash-lite": { inputPerMillionUsd: 0.3, outputPerMillionUsd: 2.5 },
  "gemini-3.1-flash-lite": { inputPerMillionUsd: 0.25, outputPerMillionUsd: 1.5 },
  "gemini-2.5-flash": { inputPerMillionUsd: 0.3, outputPerMillionUsd: 2.5 },
  "gemini-2.5-flash-lite": { inputPerMillionUsd: 0.1, outputPerMillionUsd: 0.4 },
  "gemini-2.5-pro": { inputPerMillionUsd: 1.25, outputPerMillionUsd: 10 }
};

// Groq pricing (the cross-family LLM-as-judge provider; JUDGE_PROVIDER=groq). Priced at Groq's
// PUBLISHED per-1M-token rates (groq.com/pricing, live-verified 2026-06-22), NOT at $0 -- on purpose.
// Groq's free tier bills $0 in PRACTICE, but the code cannot prove a given key is free-tier (Groq has
// paid/Developer tiers at these same model ids). Pricing a real call at $0 is the exact silent-$0
// blind spot the guard below exists to prevent. The published rate is HONEST on a paid key and a
// CONSERVATIVE over-estimate on the free tier -- which is how estimateLiveCallCostUsd is meant to err
// (toward blocking, never toward overspend). EXPLICIT entries so an unlisted Groq id still throws.
// Only the structured-output-capable judge models are listed (validated against Groq /models +
// structured-outputs support). Re-verify these and bump PRICING_VERSION when Groq re-prices.
export const GROQ_PRICING: Record<string, ModelPrice> = {
  "meta-llama/llama-4-scout-17b-16e-instruct": { inputPerMillionUsd: 0.11, outputPerMillionUsd: 0.34 },
  "openai/gpt-oss-120b": { inputPerMillionUsd: 0.15, outputPerMillionUsd: 0.6 },
  "openai/gpt-oss-20b": { inputPerMillionUsd: 0.075, outputPerMillionUsd: 0.3 }
};

// Google's ListModels returns "models/gemini-2.5-flash" while our config + the
// AgentRun.model field carry the bare id; strip the prefix so a prefixed id (should
// one ever reach here) still keys the table instead of falsely failing as unknown.
// Mirrors bareModelId() in run.ts -- one normalization notion, no divergence.
function bareModelId(model: string): string {
  return model.replace(/^models\//, "").trim();
}

// costUsd: the cost formula. Pure. cost = input/1e6 * inPrice + output/1e6 * outPrice.
//
// FAILS LOUD on an unknown model (throws) rather than silently pricing at $0 -- a
// $0 cost on a real billed call is the exact blind spot that lets spend escape the
// budget cap unseen. WHY this never fires on the deterministic path: the deterministic
// path stamps costUsd: 0 DIRECTLY (it never calls costUsd with "deterministic-rules"),
// so the only ids reaching here are real resolved Gemini ids -- a typo'd or retired
// live id then fails loud, which is the intended guard.
//
// Token counts are coerced to a non-negative finite number: the AI SDK reports
// usage fields as `number | undefined`, so a successful call can still hand us
// undefined token counts. An undefined/NaN count prices at 0 tokens (cost from that
// component is 0), but an unknown MODEL still throws -- the loud guard is on the
// model id, not on the token count.
export function costUsd(
  model: string,
  inputTokens: number | undefined,
  outputTokens: number | undefined
): number {
  const key = bareModelId(model);
  const price = GEMINI_PRICING[key] ?? GROQ_PRICING[key];
  if (!price) {
    throw new Error(
      `costUsd: unknown model "${key}" -- not in the pinned pricing table ` +
        `(${PRICING_VERSION}). Known models: ${[
          ...Object.keys(GEMINI_PRICING),
          ...Object.keys(GROQ_PRICING)
        ].join(", ")}. Add it to the pricing table before billing a live call on it.`
    );
  }
  const inTok = coerceTokens(inputTokens);
  const outTok = coerceTokens(outputTokens);
  return (
    (inTok / 1_000_000) * price.inputPerMillionUsd +
    (outTok / 1_000_000) * price.outputPerMillionUsd
  );
}

// Coerce an API-reported token count to a non-negative finite number. undefined /
// NaN / negative -> 0 (no cost contribution), so a missing usage field never throws
// and never produces a NaN cost. The loud-failure guard lives on the model id.
function coerceTokens(n: number | undefined): number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
}
