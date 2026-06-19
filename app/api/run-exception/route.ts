import { z } from "zod";
import { runExceptionPipeline } from "@/lib/pipeline/run-exception";
import { hasActionOpsScenario } from "@/lib/data/actionops-scenarios";
import { apiError, noStoreJson, parseJsonRequest } from "@/lib/server/http";
import { IDEMPOTENCY_KEY_HEADER, verifyApprovalToken } from "@/lib/server/security";

const RunRequestSchema = z.object({
  // No default here: an omitted scenarioId must flow to getActionOpsScenario's
  // DEFAULT_SCENARIO_ID (the single source of default truth). Hard-coding the
  // retired "SCN-LAUNCH-001" default would route every bare run at an unknown
  // scenario -> a 500. Present values are still validated as a string.
  scenarioId: z.string().optional(),
  useLiveSignals: z.boolean().default(true),
  // Live-AI opt-in. Default FALSE: billing the Gemini budget requires an EXPLICIT
  // per-request opt-in even behind the approval token (do not mirror useLiveSignals's
  // default-true -- a forgotten flag must fall back to the free deterministic run, not
  // silently bill). Effective only when the runtime also has the flag + key
  // (liveAiEnabled()); otherwise the pipeline runs deterministically regardless.
  live: z.boolean().default(false),
  idempotencyKey: z
    .string()
    .trim()
    .min(8)
    .max(120)
    .regex(/^[A-Za-z0-9_.:-]+$/)
    .optional()
});

export async function POST(request: Request) {
  // P2.7 (R4-4) corollary: a live-AI run must never be authless (strangers must
  // not burn the $5 Gemini budget). This route was previously UNGATED; in secure
  // mode (live AI / DATABASE_URL / opt-in) it now requires the bearer token.
  const auth = verifyApprovalToken(request);
  if (!auth.ok) {
    return apiError(auth.code, auth.message, auth.status);
  }

  const parsed = await parseJsonRequest(request, RunRequestSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  // An unknown scenario id is a client error (400), not a pipeline failure (500):
  // getActionOpsScenario throws on an unknown id, so validate at the boundary and
  // return a precise 400 rather than letting it surface as PIPELINE_FAILED. An
  // omitted scenarioId flows to the pipeline's DEFAULT_SCENARIO_ID.
  if (parsed.data.scenarioId && !hasActionOpsScenario(parsed.data.scenarioId)) {
    return apiError(
      "INVALID_SCENARIO_ID",
      `Unknown scenario ${parsed.data.scenarioId}`,
      400
    );
  }

  const headerIdempotencyKey = request.headers.get(IDEMPOTENCY_KEY_HEADER)?.trim();
  if (
    headerIdempotencyKey &&
    !/^[A-Za-z0-9_.:-]{8,120}$/.test(headerIdempotencyKey)
  ) {
    return apiError(
      "INVALID_IDEMPOTENCY_KEY",
      "Idempotency key must be 8-120 URL-safe characters",
      400
    );
  }

  try {
    const packet = await runExceptionPipeline({
      scenarioId: parsed.data.scenarioId,
      useLiveSignals: parsed.data.useLiveSignals,
      live: parsed.data.live,
      idempotencyKey: headerIdempotencyKey ?? parsed.data.idempotencyKey
    });
    return noStoreJson({ packet });
  } catch (error) {
    return noStoreJson(
      {
        error: "PIPELINE_FAILED",
        detail: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
