import { z } from "zod";
import { runExceptionPipeline } from "@/lib/pipeline/run-exception";
import { apiError, noStoreJson, parseJsonRequest } from "@/lib/server/http";
import { IDEMPOTENCY_KEY_HEADER } from "@/lib/server/security";

const RunRequestSchema = z.object({
  scenarioId: z.string().default("SCN-LAUNCH-001"),
  useLiveSignals: z.boolean().default(true),
  idempotencyKey: z
    .string()
    .trim()
    .min(8)
    .max(120)
    .regex(/^[A-Za-z0-9_.:-]+$/)
    .optional()
});

export async function POST(request: Request) {
  const parsed = await parseJsonRequest(request, RunRequestSchema);
  if (!parsed.ok) {
    return parsed.response;
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
