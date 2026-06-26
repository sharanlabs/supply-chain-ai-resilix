import { createGroq } from "@ai-sdk/groq";
import { generateObject } from "ai";
import { z } from "zod";
import type { AgentRunUsage } from "@/lib/agents/actionops/agent-run";

// Shared CROSS-FAMILY (Groq) infrastructure (ADR-0002). The self-preference bias -- a model
// rating its OWN family's output more leniently -- is the most validated LLM-judge/critic bias
// (evals_kb llm-as-judge.md; Panickssery, NeurIPS 2024). The Gemini system-under-test must
// therefore be JUDGED (the no-unsupported-claims judge, lib/evals/judge.ts) AND adversarially
// CHALLENGED (the Phase-4 Skeptic critic, lib/agents/actionops/skeptic.ts) by a DIFFERENT family.
// Both route to Groq's Meta Llama-4 -- a family distinct from BOTH the Gemini system-under-test
// and the GPT/Codex build-time gate -- on Groq's free tier.
//
// This module is the SINGLE source for the Groq model id + the Groq-bound generate, so the judge
// and the Skeptic can never drift on either (the "single source so X and Y cannot diverge" rule
// the rest of the pipeline follows). Each consumer keeps its own env override + its own
// fail-closed verdict logic; only the provider plumbing is shared here.

// The default Groq cross-family model: a Meta Llama-4 instruct model with Groq json_schema
// structured-output support -- a different family from Gemini. Per-consumer env overrides
// (JUDGE_MODEL / SKEPTIC_MODEL) resolve against this in their own modules.
export const GROQ_DEFAULT_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

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
// are reused unchanged -- only the provider differs. The output is bounded (the verdict is tiny;
// the headroom covers a reasoning model's scratch tokens). Groq is priced at its PUBLISHED rates
// (pricing.ts GROQ_PRICING) so the budget/ledger stay honest on any key; the per-call estimate is
// a fraction of a cent, far under the cap.
export function makeGroqGenerate(apiKey: string, maxOutputTokens: number = 4_000) {
  const groq = createGroq({ apiKey });
  return async (a: { model: string; schema: z.ZodTypeAny; prompt: string }) => {
    const result = await generateObject({
      model: groq(a.model),
      schema: a.schema,
      prompt: a.prompt,
      maxOutputTokens,
      // Disable the SDK transport retry loop (Codex P3 High) so no un-ledgered, un-budget-guarded
      // retry can bill past the cap -- the cross-family Skeptic's budget hard-stop stays hard.
      maxRetries: 0
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
  };
}
