import { z } from "zod";
import type { AgentRunUsage } from "@/lib/agents/actionops/agent-run";
import {
  type BudgetContext,
  estimateLiveCallCostUsd,
  liveAiEnabled,
  liveGenerateObject,
  resolvedGeminiModel
} from "@/lib/agents/run";

// The ONE LLM-as-judge (Success_Criteria: "one flash-model judge is used for exactly one
// check -- no-unsupported-claims prose; everything else is code"). The deterministic graders
// are the hard gates (numeral<->claim citation, entity/url existence, injection quarantine);
// this judge adds the ONE thing code cannot decide: whether the PROSE asserts something the
// structured data does not support -- a SEMANTIC unsupported claim ("we have secured backup
// suppliers", "prices will rise") that carries no numeral and so slips the citation grader.
//
// FAIL-CLOSED: a judge that errors, times out, or returns an unparseable/uncertain verdict
// is treated as supported:false (a FLAG), never silently passed. A judge that fails open is
// not a safety check. Calibrated in evals/judge-calibration.test.ts (TPR/TNR + Cohen's kappa
// over a held-out labelled set); the calibration is what lets this verdict be trusted as a gate
// input.
//
// SAME-FAMILY (ADR-0002): this judge defaults to a Gemini model -- the SAME family as the
// Dispatcher prose it grades. Best practice is a CROSS-family judge: self-preference (a model
// rating its own family's output more leniently) is the most validated judge bias (evals_kb
// llm-as-judge.md; Panickssery, NeurIPS 2024). Accepted here as a SECONDARY check ONLY -- the
// deterministic graders (citation / entity / url / injection) + atomic human approval are the
// primary gates, and this judge is fail-closed + off by default, so a leniency bias here cannot
// by itself pass an unsupported claim to a recipient. The cross-family switch (a JUDGE_PROVIDER
// seam + a non-Gemini SDK) removes the residual entirely; it is deferred, gated on a non-Gemini
// key + a billed recalibration. NOTE: JUDGE_MODEL below selects another GEMINI id, not another
// family.

// The judge model. Defaults to the configured agent model (flash, per the Success_Criteria
// "flash-model judge"); JUDGE_MODEL overrides it (the model policy allows stepping the judge
// up to pro if calibration shows flash misses the bar -- judge >= agents).
export function resolvedJudgeModel(): string {
  return process.env.JUDGE_MODEL?.trim() || resolvedGeminiModel();
}

// The judge's structured verdict. `supported` = every factual claim in the prose is backed by
// the source data. Permissive schema (a free-string reason) so the firewall logic, not zod,
// owns the fail-closed decision.
const JudgeVerdictSchema = z.object({
  supported: z.boolean(),
  reason: z.string()
});

export type JudgeVerdict = {
  // true ONLY when the judge affirmatively cleared the prose; false on an unsupported claim
  // OR on any judge error (fail-closed).
  supported: boolean;
  reason: string;
  // true when the verdict came from the fail-closed path (call threw / unparseable), not from
  // a real judgement -- so a caller can distinguish "judge says unsupported" from "judge broke".
  errored: boolean;
  errorClass?: string;
};

// judgeNoUnsupportedClaims: ask the judge whether EVERY claim in `prose` is supported by
// `sourceData`. `generate` is injected so the calibration's fail-closed path (and unit tests)
// run with no network. Budget-guarded via liveGenerateObject (the same $5 hard-stop boundary
// the agents use), so a runaway calibration loop cannot bill past the cap.
export async function judgeNoUnsupportedClaims(args: {
  prose: string;
  sourceData: unknown;
  budget?: BudgetContext;
  enabled?: () => boolean;
  generate?: (a: {
    model: string;
    schema: z.ZodTypeAny;
    prompt: string;
  }) => Promise<{ object: unknown; usage?: AgentRunUsage }>;
}): Promise<JudgeVerdict> {
  // BILLING SELF-GUARD (defense-in-depth): the judge calls liveGenerateObject, which BILLS. It
  // must not fire on a real (non-injected) path when live AI is disabled, even if a caller forgets
  // to gate it -- the billing-boundary first principle holds by construction, not by caller
  // discipline. `enabled` defaults to liveAiEnabled (flag + key); an injected `generate` is a
  // test/DI path that never bills, so it is allowed through. Key-OFF + no injected generate ->
  // fail-closed (a flag), no call.
  const enabled = args.enabled ?? liveAiEnabled;
  if (!enabled() && !args.generate) {
    return {
      supported: false,
      reason: "Judge skipped: live AI disabled (no flag/key); failing closed.",
      errored: true,
      errorClass: "LIVE_AI_DISABLED"
    };
  }

  const model = resolvedJudgeModel();
  const budget: BudgetContext = args.budget ?? {
    spentUsd: 0,
    estimatedNextUsd: estimateLiveCallCostUsd(model)
  };

  const prompt =
    "You are a claims auditor for supplier-facing crisis communications. You are given DRAFT " +
    "PROSE and the SOURCE DATA the drafter was allowed to use. Decide whether the prose makes " +
    "any UNSUPPORTED assertion of fact about the world.\n\n" +
    "SUPPORTED -- do NOT flag any of these:\n" +
    "- The disruption premise: that an event exists and the recipient is a flagged exposed " +
    "supplier on an affected lane (the source data establishes this).\n" +
    "- Grounded values present in the source data (e.g. the exposure score, the assessment window).\n" +
    "- The SENDER'S OWN forward intent or process: 'we are reviewing', 'we will confirm / share " +
    "next steps / a contingency plan after review', 'no action is required from you yet', 'we " +
    "request your lead times / input'. These state the sender's plan, not a fact about the world.\n\n" +
    "UNSUPPORTED -- FLAG (supported=false) -- a factual assertion that EXCEEDS the source data:\n" +
    "- a quantity not in the data ('$2 million', '20%', '5 days', '40% of volume', 'reopens in 12 days');\n" +
    "- an action ALREADY TAKEN ('we have secured three suppliers', 'we rebooked your cargo', 'we " +
    "approved a purchase order');\n" +
    "- a definite external status ('your shipment is delayed', 'this is resolved', 'your premium increased');\n" +
    "- a cause ('you are the sole cause') or a prediction ('prices will rise', 'this will last six weeks').\n\n" +
    "Return supported=true ONLY if the prose makes NO unsupported assertion; otherwise supported=false " +
    "with a reason naming the first unsupported assertion. Judge ONLY support-by-data, not tone or style.\n\n" +
    `SOURCE DATA:\n${JSON.stringify(args.sourceData, null, 2)}\n\nDRAFT PROSE:\n${args.prose}`;

  try {
    const { object } = await liveGenerateObject({
      model,
      schema: JudgeVerdictSchema,
      prompt,
      budget,
      generate: args.generate
    });
    const parsed = JudgeVerdictSchema.safeParse(object);
    if (!parsed.success) {
      // Unparseable verdict -> fail closed (flag), never a silent pass.
      return {
        supported: false,
        reason: "Judge returned an unparseable verdict; failing closed.",
        errored: true,
        errorClass: "UNPARSEABLE_VERDICT"
      };
    }
    return { supported: parsed.data.supported, reason: parsed.data.reason, errored: false };
  } catch (err) {
    // Call threw (budget breach, network, refusal) -> fail closed.
    return {
      supported: false,
      reason: err instanceof Error ? `Judge call failed: ${err.message}` : "Judge call failed.",
      errored: true,
      errorClass: "JUDGE_CALL_THREW"
    };
  }
}
