import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// D.9 wiring proof -- the regression guard that runActionOpsAgents actually ROUTES to the
// live LLM bodies, threads a CUMULATIVE budget across the 3 calls, and honors the explicit
// per-invocation `live` flag (the page-render billing guard). NO network, NO spend: the AI
// SDK's generateObject is mocked. The clean end-to-end LIVE_AI proof against the REAL key is
// the gated leg (RUN_LIVE_AI_TESTS) in the live pass; this file proves the orchestration
// the agents' own unit tests can't see (they inject `generate` at the agent, not the seam).
//
// The mock outputs are ECHOES of the deterministic pipeline's own outputs (computed live:false
// first), so they pass every agent firewall BY CONSTRUCTION -- the test can't rot when a
// firewall tightens, because the echo is exactly what the firewall already accepts.

const { generateObjectMock } = vi.hoisted(() => ({ generateObjectMock: vi.fn() }));
vi.mock("ai", () => ({ generateObject: generateObjectMock }));
// geminiModel() constructs the provider via createGoogleGenerativeAI; stub it so no real
// provider/network is built. The mocked generateObject never uses the returned model.
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => (modelId: string) => ({ modelId })
}));

import { runActionOpsAgents } from "@/lib/agents/actionops";
import { computeEffectiveMode } from "@/lib/agents/run";
import { costUsd } from "@/lib/agents/pricing";
import { getActionOpsScenario } from "@/lib/data/actionops-scenarios";
import { fetchPublicSignals } from "@/lib/signals/fetchers";
import { ingestSeed } from "@/lib/ingest/seed-suppliers";
import type { ActionOpsContext } from "@/lib/agents/actionops/types";
import type { AgentRun } from "@/lib/schemas";

const BASE_DATE = "2026-06-18T12:00:00.000Z";
const MODEL = "gemini-2.5-flash"; // the resolved default; pricing keys off it

// A live context with real cached signals + the seed suppliers + the default (Hormuz)
// scenario, which DOES produce exposures (so Strategist/Dispatcher actually fire live --
// an empty-exposure run short-circuits them to deterministic by design).
async function hormuzLiveContext(): Promise<ActionOpsContext> {
  return {
    scenario: getActionOpsScenario(),
    signals: await fetchPublicSignals({ useLive: false }),
    suppliers: ingestSeed().suppliers,
    baseDateIso: BASE_DATE
  };
}

const runById = (runs: AgentRun[], id: string) => runs.find((r) => r.id === id);

// Build prompt-aware mock LLM responses by ECHOING the deterministic pipeline's outputs
// (valid by construction). `usage` is injectable so a test can force a large cost to prove
// the cumulative budget hard-stop.
function echoMockFromDeterministic(
  det: Awaited<ReturnType<typeof runActionOpsAgents>>,
  usageBy: { sentinel?: UsageShape; strategist?: UsageShape; dispatcher?: UsageShape } = {}
) {
  const stdUsage: UsageShape = {
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
    finishReason: "stop"
  };
  return (args: { prompt: string }) => {
    const prompt = args.prompt;
    if (prompt.includes("You are the Sentinel")) {
      const t = det.threatCard;
      return Promise.resolve({
        object: {
          eventType: t.eventType,
          severity: t.severity,
          location: t.location,
          summary: t.summary,
          evidenceUrls: t.evidenceUrls,
          confidence: t.confidence
        },
        usage: usageBy.sentinel ?? stdUsage,
        finishReason: (usageBy.sentinel ?? stdUsage).finishReason
      });
    }
    if (prompt.includes("You are the Strategist")) {
      return Promise.resolve({
        object: {
          playbooks: det.playbooks.map((p) => ({
            role: p.role,
            summary: p.summary,
            steps: p.steps,
            groundedClaimIds: p.groundedClaimIds
          }))
        },
        usage: usageBy.strategist ?? stdUsage,
        finishReason: (usageBy.strategist ?? stdUsage).finishReason
      });
    }
    if (prompt.includes("You are the Dispatcher")) {
      return Promise.resolve({
        object: {
          messages: det.supplierMessages.map((m) => ({
            supplierId: m.supplierId,
            subject: m.subject,
            body: m.body,
            claims: m.claims
          }))
        },
        usage: usageBy.dispatcher ?? stdUsage,
        finishReason: (usageBy.dispatcher ?? stdUsage).finishReason
      });
    }
    throw new Error(`Unexpected live prompt in test: ${prompt.slice(0, 40)}`);
  };
}

type UsageShape = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  finishReason: string;
};

describe("D.9 live pipeline wiring (mocked SDK, no spend)", () => {
  // The runner's own GROQ_API_KEY (the owner keeps one for judge calibration) would otherwise make
  // the cross-family Skeptic fire a 4th call through the SAME mocked generateObject -- breaking the
  // "exactly 3 Gemini calls" + budget assertions below. Neutralize it for this suite so the Skeptic
  // deterministically short-circuits to its affirmative pass (no Groq key -> no network), making
  // these Gemini-only wiring assertions independent of the runner's environment.
  const savedGroqKey = process.env.GROQ_API_KEY;

  beforeEach(() => {
    generateObjectMock.mockReset();
    process.env.ENABLE_LIVE_AI = "true";
    process.env.GEMINI_API_KEY = "test-key-not-real";
    delete process.env.GEMINI_MODEL; // resolve to the GA default the pricing table prices
    delete process.env.GROQ_API_KEY; // keep the cross-family Skeptic off this Gemini-only path
  });

  afterEach(() => {
    delete process.env.ENABLE_LIVE_AI;
    delete process.env.GEMINI_API_KEY;
    if (savedGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = savedGroqKey;
  });

  it("live:true routes the 3 LLM agents to LIVE_AI and threads the real per-call cost", async () => {
    const ctx = await hormuzLiveContext();
    // Deterministic baseline (live:false) -- the echo source. Does NOT call the mock.
    const det = await runActionOpsAgents({ ...ctx, live: false });
    expect(generateObjectMock).not.toHaveBeenCalled();
    expect(det.exposureResults.length).toBeGreaterThan(0); // Hormuz must expose suppliers

    generateObjectMock.mockImplementation(echoMockFromDeterministic(det));

    const live = await runActionOpsAgents({ ...ctx, live: true });

    // Exactly the 3 LLM agents fired live; the deterministic agents did not call the model.
    expect(generateObjectMock).toHaveBeenCalledTimes(3);
    expect(runById(live.agentRuns, "RUN-SENTINEL")?.mode).toBe("LIVE_AI");
    expect(runById(live.agentRuns, "RUN-STRATEGIST")?.mode).toBe("LIVE_AI");
    expect(runById(live.agentRuns, "RUN-DISPATCHER")?.mode).toBe("LIVE_AI");
    // Verifier / Atlas / Simulator stay deterministic on the live path too.
    expect(runById(live.agentRuns, "RUN-VERIFIER")?.mode).toBe("DETERMINISTIC_RULES");
    expect(runById(live.agentRuns, "RUN-ATLAS")?.mode).toBe("DETERMINISTIC_RULES");
    expect(runById(live.agentRuns, "RUN-SIMULATOR")?.mode).toBe("DETERMINISTIC_RULES");

    expect(computeEffectiveMode(live.agentRuns, "LIVE_AI")).toBe("LIVE_AI");

    // Each live run carries the real provider-reported cost (100 in / 50 out at the GA
    // price), and the deterministic runs cost $0 -- the cumulative ledger is the 3 calls.
    const perCall = costUsd(MODEL, 100, 50);
    for (const id of ["RUN-SENTINEL", "RUN-STRATEGIST", "RUN-DISPATCHER"]) {
      expect(runById(live.agentRuns, id)?.costUsd).toBeCloseTo(perCall, 10);
    }
    const total = live.agentRuns.reduce((s, r) => s + (r.costUsd ?? 0), 0);
    expect(total).toBeCloseTo(perCall * 3, 10);
  });

  it("live:false stays deterministic even when liveAiEnabled() -- the page-render billing guard", async () => {
    const ctx = await hormuzLiveContext();
    // The page render passes live:false on every request. Even with the flag + key set,
    // the orchestrator must NOT call the model -- this is the footgun fix.
    const result = await runActionOpsAgents({ ...ctx, live: false });
    expect(generateObjectMock).not.toHaveBeenCalled();
    expect(result.agentRuns.every((r) => r.mode === "DETERMINISTIC_RULES")).toBe(true);
  });

  it("threads the CUMULATIVE budget: a first call that blows the cap blocks the later calls", async () => {
    const ctx = await hormuzLiveContext();
    const det = await runActionOpsAgents({ ...ctx, live: false });
    generateObjectMock.mockReset();

    // Sentinel reports a huge output token count -> its real cost exceeds the $5 cap. If the
    // budget is threaded per-RUN (correct), spentUsd carries that overage into Strategist's
    // pre-call check, which then breaches and blocks BEFORE billing -- so Strategist +
    // Dispatcher degrade to FAILED_TO_FALLBACK/BUDGET_EXCEEDED and generateObject is called
    // exactly ONCE. If the budget reset per-call (the bug this guards), all 3 would fire.
    const hugeOutput = 3_000_000; // 3M out @ $2.5/1M = ~$7.5 > $5 cap
    generateObjectMock.mockImplementation(
      echoMockFromDeterministic(det, {
        sentinel: { inputTokens: 1000, outputTokens: hugeOutput, totalTokens: hugeOutput + 1000, finishReason: "stop" }
      })
    );

    const live = await runActionOpsAgents({ ...ctx, live: true });

    expect(generateObjectMock).toHaveBeenCalledTimes(1); // only Sentinel billed; later calls blocked
    expect(runById(live.agentRuns, "RUN-SENTINEL")?.mode).toBe("LIVE_AI");

    const strategist = runById(live.agentRuns, "RUN-STRATEGIST");
    const dispatcher = runById(live.agentRuns, "RUN-DISPATCHER");
    expect(strategist?.mode).toBe("FAILED_TO_FALLBACK");
    expect(strategist?.errorClass).toBe("BUDGET_EXCEEDED");
    expect(dispatcher?.mode).toBe("FAILED_TO_FALLBACK");
    expect(dispatcher?.errorClass).toBe("BUDGET_EXCEEDED");
  });
});
