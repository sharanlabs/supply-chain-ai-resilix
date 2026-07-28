import { createGroq } from "@ai-sdk/groq";
import { generateObject, APICallError, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import type { AgentRunUsage } from "@/lib/agents/actionops/agent-run";

// Shared CROSS-FAMILY (Groq) infrastructure (ADR-0002). The self-preference bias -- a model
// rating its OWN family's output more leniently -- is the most validated LLM-judge/critic bias
// (evals_kb llm-as-judge.md; Panickssery, NeurIPS 2024). The Gemini system-under-test must
// therefore be JUDGED (the no-unsupported-claims judge, lib/evals/judge.ts) AND adversarially
// CHALLENGED (the Phase-4 Skeptic critic, lib/agents/actionops/skeptic.ts) by a DIFFERENT family.
// Both route to a non-Gemini Groq model on Groq's free tier.
//
// This module is the SINGLE source for the Groq model id + the Groq-bound generate, so the judge
// and the Skeptic can never drift on either (the "single source so X and Y cannot diverge" rule
// the rest of the pipeline follows). Each consumer keeps its own env override + its own
// fail-closed verdict logic; only the provider plumbing is shared here.

// The default Groq cross-family model. Groq json_schema structured-output support is a HARD
// requirement (both consumers call generateObject with a Zod schema), and it is the binding
// constraint -- NOT raw model quality.
//
// 2026-07-27 (L-1): the prior default `meta-llama/llama-4-scout-17b-16e-instruct` was
// DECOMMISSIONED by Groq -- absent from the key's ListModels -- so every live Skeptic call threw
// and fail-closed to a HOLD, degrading every live packet to NO_ACTION. Candidates were re-probed
// live through this module's own generate + the real verdict schema:
//     openai/gpt-oss-120b      OK   (priced, ~0.9s)   <-- selected
//     openai/gpt-oss-20b       OK   (priced, ~0.5s)
//     llama-3.3-70b-versatile  FAIL "does not support response format json_schema"
//     qwen/qwen3.6-27b         FAIL "does not support response format json_schema"
//
// DISCLOSED DEVIATION from the ADR-0002 wording above: gpt-oss is an OpenAI-family model, so the
// critic now shares a family with the GPT/Codex BUILD-TIME gate. The bias ADR-0002 defends against
// is self-preference over the SYSTEM UNDER TEST (Gemini), which still holds -- and the build-time
// gate judges source code at a different time, not these runtime findings. Recorded rather than
// silently reinterpreted: on this key, gpt-oss is the ONLY family offering json_schema support, so
// three-way family separation is not currently purchasable. Revisit if Groq restores a
// structured-output-capable Llama/Qwen model. Verify with `npm run preflight:groq`.
export const GROQ_DEFAULT_MODEL = "openai/gpt-oss-120b";

// The configured Groq key (trimmed) or undefined. ONE accessor so the judge + Skeptic read the
// key identically, resolved at CALL time (not module load) so a key set after import -- a script
// or a test that assigns process.env before the first call -- is still picked up.
export function groqApiKey(): string | undefined {
  return process.env.GROQ_API_KEY?.trim() || undefined;
}

// Whether a real Groq (cross-family) call may be made: a GROQ_API_KEY is present. The cross-family
// path runs on its OWN key, INDEPENDENT of the Gemini live-AI flag -- so the judge/Skeptic can be
// configured (or not) without touching ENABLE_LIVE_AI. An injected generate in tests bypasses this
// (the DI path that never bills).
export function groqAvailable(): boolean {
  return groqApiKey() !== undefined;
}

// The Groq-bound generate (cross-family). It returns the SAME { object, usage } shape
// liveGenerateObject's default Gemini generate returns, so its budget hard-stop + fail-closed flow
// are reused unchanged -- only the provider differs. Groq is priced at its PUBLISHED rates
// (pricing.ts GROQ_PRICING) so the budget/ledger stay honest on any key; the per-call estimate is
// a fraction of a cent, far under the cap.
//
// ⚠ maxOutputTokens IS A THROUGHPUT KNOB, NOT JUST A SAFETY CEILING (measured 2026-07-27).
// Groq's rate limiter reserves `input + max_completion_tokens` against the per-minute TPM window
// regardless of how much the model actually emits. Free-tier TPM on the gpt-oss models is 8,000,
// so a GENEROUS budget throttles the caller into 429s -- and for a fail-CLOSED consumer every 429
// silently becomes a HOLD. Size this to the real output need plus modest headroom; do not treat a
// bigger number as "safer". See SKEPTIC_MAX_OUTPUT_TOKENS (actionops/skeptic.ts) and
// JUDGE_MAX_OUTPUT_TOKENS (evals/judge.ts) for the two worked measurements.
//
// `maxOutputTokens` is REQUIRED, deliberately (Codex cross-model [Med], 2026-07-27). It previously
// defaulted to 4,000 -- the value MEASURED to self-throttle this provider into 429s -- so a new or
// forgotten caller would silently inherit the exact failure this module was just repaired for, and
// on a fail-closed consumer that failure is invisible. Both production callers already pass an
// explicit measured budget; removing the default makes "pick a number you have measured" a
// compile-time obligation rather than a comment somebody has to read.
export function makeGroqGenerate(apiKey: string, maxOutputTokens: number) {
  const groq = createGroq({ apiKey });
  return async (a: { model: string; schema: z.ZodTypeAny; prompt: string }) => {
    try {
      const result = await generateObject({
        model: groq(a.model),
        schema: a.schema,
        prompt: a.prompt,
        maxOutputTokens,
        // Disable the SDK transport retry loop (Codex P3 High) so no un-ledgered, un-budget-guarded
        // retry can bill past the cap -- the cross-family Skeptic's budget hard-stop stays hard.
        maxRetries: 0,
        providerOptions: {
          groq: {
            // TRUNCATION DEFENCE (Codex cross-model [High], 2026-07-27). gpt-oss is a REASONING
            // model and its reasoning tokens are billed against maxOutputTokens. Groq's default
            // effort is "medium", so a harder or adversarial finding can reason past the cap, the
            // completion truncates, generateObject fails schema validation and THROWS -- which on
            // this fail-closed consumer becomes a silent HOLD -> NO_ACTION. That is exactly the
            // L-1 symptom returning by a different cause. Both consumers here ask for a tiny
            // verdict object over a short finding, so "low" is matched to the task and buys
            // headroom in the one budget that actually binds. Verified present in the installed
            // provider: @ai-sdk/groq groqProviderOptions.reasoningEffort ('none'|'default'|'low'|
            // 'medium'|'high').
            reasoningEffort: "low",
            // Ask for STRICT json_schema rather than best-effort. The candidate probe established
            // that only the gpt-oss models support json_schema on this key at all; requesting it
            // explicitly makes a schema violation a provider-side error instead of a parse failure
            // discovered after we have already paid for the tokens.
            structuredOutputs: true
          }
        }
      });
      return {
        object: result.object,
        usage: {
          inputTokens: result.usage?.inputTokens,
          outputTokens: result.usage?.outputTokens,
          totalTokens: result.usage?.totalTokens,
          finishReason: result.finishReason ?? null
        } satisfies AgentRunUsage
      };
    } catch (err) {
      // LEDGER TRUTH ON A FAILED BILLED CALL (Codex cross-model [Med], 2026-07-27). A completion
      // that ran and then failed schema validation HAS BEEN BILLED. The previous generic catch
      // upstream recorded it as a zero-token run, which understates real spend and violates the
      // "every call is ledgered" contract -- and it collapsed a TRUNCATION into an indistinguishable
      // "LIVE_CALL_THREW". NoObjectGeneratedError carries the real usage + finishReason, so
      // re-throw an ENRICHED error that preserves both for the caller's audit record.
      // (maxRetries:0 stops hidden REPEAT billing; it does not make the first failed call free.)
      const tagged = err as {
        groqUsage?: AgentRunUsage;
        truncated?: boolean;
        schemaGenerationFailed?: boolean;
      };

      // PATH A -- the SDK's documented shape: a completion came back but did not satisfy the
      // schema. It carries the real usage + finishReason; "length" is the smoking gun for
      // truncation. Kept because it is the contract-level path (and the one that fires when
      // strict structured outputs are unavailable).
      if (NoObjectGeneratedError.isInstance(err)) {
        tagged.groqUsage = {
          inputTokens: err.usage?.inputTokens,
          outputTokens: err.usage?.outputTokens,
          totalTokens: err.usage?.totalTokens,
          finishReason: err.finishReason ?? null
        } satisfies AgentRunUsage;
        tagged.truncated = err.finishReason === "length";
      } else if (APICallError.isInstance(err) && err.statusCode === 400) {
        // PATH B -- what Groq ACTUALLY does under strict json_schema, measured 2026-07-27 with a
        // deliberately starved budget (16 output tokens): it rejects with
        //   400 "Failed to generate JSON. Please adjust your prompt. See 'failed_generation'..."
        // rather than returning a truncated completion. So the finishReason==="length" branch above
        // NEVER FIRES on this provider in this mode -- discovered only because the truncation fix
        // was positive-controlled instead of assumed. Named distinctly so the operator is pointed at
        // the output budget first; we deliberately do NOT call it "truncated", because a 400 here
        // cannot be distinguished from a genuine prompt/schema problem without the failed_generation
        // body. Honest name over a confident one.
        if (/failed to generate json|failed_generation/i.test(err.message ?? "")) {
          tagged.schemaGenerationFailed = true;
        }
      }
      throw err;
    }
  };
}
