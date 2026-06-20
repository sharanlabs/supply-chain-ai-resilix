import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  liveGenerateValidated,
  makeRetryReserve,
  type LiveValidateResult
} from "@/lib/agents/run";
import { BudgetExceededError } from "@/lib/agents/budget";

// The bounded "+2 reserve" retry (follow-up 3). A live agent occasionally emits a stochastic
// slip its firewall rightly rejects; a single re-ask usually clears it, keeping the run
// all-LIVE instead of degrading to FAILED_TO_FALLBACK. The retry is BOUNDED by a SHARED
// run-level reserve so the worst-case billed call count stays at the Success_Criteria
// "3 (+2 retry reserve)" = 5 ceiling -- proven directly below with injected generate/validate
// (no SDK, no network, no spend).

const MODEL = "gemini-2.5-flash"; // a real priced model so the internal cost estimate resolves
const OK_BUDGET = { spentUsd: 0, estimatedNextUsd: 0, capUsd: 5 } as const;

// A generate stub that counts calls -- the validate fn decides ok/fail, not the object.
function countingGenerate() {
  let calls = 0;
  return {
    generate: async () => {
      calls += 1;
      return {
        object: { n: calls },
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, finishReason: "stop" }
      };
    },
    calls: () => calls
  };
}

describe("makeRetryReserve", () => {
  it("decrements and reports empty", () => {
    const r = makeRetryReserve(2);
    expect(r.tryConsume()).toBe(true);
    expect(r.tryConsume()).toBe(true);
    expect(r.tryConsume()).toBe(false);
  });

  it("clamps a zero/negative reserve to no retries (fail-safe)", () => {
    expect(makeRetryReserve(0).tryConsume()).toBe(false);
    expect(makeRetryReserve(-3).tryConsume()).toBe(false);
  });
});

describe("liveGenerateValidated -- bounded retry", () => {
  it("retries a RETRYABLE slip from the reserve, then succeeds (run stays LIVE)", async () => {
    const { generate, calls } = countingGenerate();
    const reserve = makeRetryReserve(2);
    let attempt = 0;
    const result = await liveGenerateValidated<string>({
      model: MODEL,
      schema: z.any(),
      prompt: "p",
      budget: OK_BUDGET,
      retry: reserve,
      generate,
      validate: (): LiveValidateResult<string> => {
        attempt += 1;
        // First draw is a firewall slip; the re-ask is clean.
        return attempt === 1
          ? { ok: false, reason: "slip", errorClass: "FIREWALL_REJECT", retryable: true }
          : { ok: true, value: "clean" };
      }
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("clean");
    expect(calls()).toBe(2); // 1 base + 1 retry
    // The reserve started at two and only one retry was used -> one remains.
    expect(reserve.tryConsume()).toBe(true);
    expect(reserve.tryConsume()).toBe(false);
  });

  it("does NOT retry a non-retryable failure (the reserve is untouched)", async () => {
    const { generate, calls } = countingGenerate();
    const reserve = makeRetryReserve(2);
    const result = await liveGenerateValidated({
      model: MODEL,
      schema: z.any(),
      prompt: "p",
      budget: OK_BUDGET,
      retry: reserve,
      generate,
      validate: () => ({
        ok: false,
        reason: "structural",
        errorClass: "UNPARSEABLE_OUTPUT",
        retryable: false
      })
    });
    expect(result.ok).toBe(false);
    expect(calls()).toBe(1);
    // Untouched: both retries still available.
    expect(reserve.tryConsume()).toBe(true);
    expect(reserve.tryConsume()).toBe(true);
  });

  it("a budget breach is NOT retried -- it throws to the caller's catch, no call billed", async () => {
    const { generate, calls } = countingGenerate();
    const reserve = makeRetryReserve(2);
    await expect(
      liveGenerateValidated({
        model: MODEL,
        schema: z.any(),
        prompt: "p",
        // spent + estimatedNext > cap -> assertWithinBudget throws BEFORE any call.
        budget: { spentUsd: 4.99, estimatedNextUsd: 1, capUsd: 5 },
        retry: reserve,
        generate,
        validate: () => ({ ok: true, value: 1 })
      })
    ).rejects.toBeInstanceOf(BudgetExceededError);
    expect(calls()).toBe(0);
    // The breach consumed no retry.
    expect(reserve.tryConsume()).toBe(true);
  });
});

describe("the reserve is RUN-LEVEL -- shared across agents caps total calls at 3 (+2)", () => {
  it("three agents sharing one reserve(2), each failing retryable, make exactly 5 calls (never 9)", async () => {
    const reserve = makeRetryReserve(2); // the ONE run-level pool the orchestrator threads
    let totalCalls = 0;
    const alwaysSlip = (): LiveValidateResult<number> => ({
      ok: false,
      reason: "slip",
      errorClass: "FIREWALL_REJECT",
      retryable: true
    });
    const runAgent = () =>
      liveGenerateValidated<number>({
        model: MODEL,
        schema: z.any(),
        prompt: "p",
        budget: OK_BUDGET,
        retry: reserve,
        generate: async () => {
          totalCalls += 1;
          return { object: {}, usage: {} };
        },
        validate: alwaysSlip
      });

    const r1 = await runAgent();
    const r2 = await runAgent();
    const r3 = await runAgent();

    // All three degrade (their slips never clear), but the SHARED reserve allows only two
    // retries across the whole run: 3 base attempts + 2 shared retries = 5. A per-agent
    // reserve would be 3 x (1 + 2) = 9 -- the ceiling this guards.
    expect([r1.ok, r2.ok, r3.ok]).toEqual([false, false, false]);
    expect(totalCalls).toBe(5);
  });
});
