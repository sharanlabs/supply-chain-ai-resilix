import { z } from "zod";

export const SeveritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export const SignalStatusSchema = z.enum(["LIVE", "CACHED", "FAILED"]);
export const ApprovalStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED"
]);

// Agent-mode taxonomy (R4-8). Four values that distinguish a HEALTHY
// deterministic run from a DEGRADED one:
//   LIVE_AI             - an LLM call succeeded and its output passed validation.
//   DETERMINISTIC_RULES - by-design deterministic output OR live AI disabled by
//                         config. Healthy; NOT degraded.
//   REPLAY              - output served from recorded fixtures. Defined for the
//                         Phase 3 replay-first demo; no code path emits it yet.
//   FAILED_TO_FALLBACK  - live AI was ATTEMPTED and failed (threw or returned
//                         invalid/semantically-rejected output) -> deterministic
//                         fallback used. This is the ONLY degraded value.
export const AgentModeSchema = z.enum([
  "LIVE_AI",
  "DETERMINISTIC_RULES",
  "REPLAY",
  "FAILED_TO_FALLBACK"
]);

// A run can REQUEST live AI, deterministic rules, or replay, but it can never
// "request a failure" -- FAILED_TO_FALLBACK is an OUTCOME, only ever derived
// into effectiveMode. requestedMode is therefore narrowed to exclude it.
export const RequestedModeSchema = AgentModeSchema.exclude([
  "FAILED_TO_FALLBACK"
]);

export const PublicSignalSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourceUrl: z.string().url(),
  fetchedAt: z.string().datetime(),
  eventType: z.string(),
  location: z.object({
    lat: z.number().optional(),
    lon: z.number().optional(),
    region: z.string().optional(),
    country: z.string().optional()
  }),
  severity: SeveritySchema,
  summary: z.string(),
  freshnessMinutes: z.number().nonnegative(),
  status: SignalStatusSchema
});

export const ExceptionEventSchema = z.object({
  id: z.string(),
  scenarioId: z.string(),
  title: z.string(),
  status: z.enum(["OPEN", "IN_REVIEW", "APPROVED", "REJECTED"]),
  severity: SeveritySchema,
  problemSummary: z.string(),
  linkedSignalIds: z.array(z.string()),
  affectedSupplierIds: z.array(z.string()),
  affectedComponentIds: z.array(z.string()),
  affectedShipmentIds: z.array(z.string()),
  affectedOrderIds: z.array(z.string()),
  createdAt: z.string().datetime()
});

export const CalculationTraceSchema = z.object({
  id: z.string(),
  label: z.string(),
  formula: z.string(),
  value: z.number(),
  unit: z.string(),
  sourceIds: z.array(z.string())
});

export const ImpactReportSchema = z.object({
  id: z.string(),
  exceptionId: z.string(),
  launchId: z.string(),
  affectedSuppliers: z.array(
    z.object({
      supplierId: z.string(),
      supplierName: z.string(),
      country: z.string(),
      tier: z.string()
    })
  ),
  affectedComponents: z.array(
    z.object({
      componentId: z.string(),
      componentName: z.string(),
      requiredForLaunch: z.boolean()
    })
  ),
  affectedOrders: z.array(
    z.object({
      orderId: z.string(),
      customerSegment: z.string(),
      region: z.string(),
      promisedDate: z.string(),
      revenue: z.number()
    })
  ),
  calculations: z.array(CalculationTraceSchema),
  inventoryDaysRemaining: z.number(),
  projectedStockoutDate: z.string(),
  shipmentDelayDays: z.number(),
  launchRiskScore: z.number().min(0).max(100),
  revenueAtRisk: z.number().nonnegative(),
  slaRiskOrders: z.number().int().nonnegative(),
  generatedAt: z.string().datetime()
});

export const RecoveryOptionSchema = z.object({
  id: z.string(),
  title: z.string(),
  actionType: z.enum([
    "EXPEDITE",
    "REALLOCATE",
    "SUBSTITUTE",
    "SPLIT_SHIPMENT",
    "SUPPLIER_ESCALATION",
    "LAUNCH_PRIORITIZATION"
  ]),
  summary: z.string(),
  estimatedCostUsd: z.number().nonnegative(),
  speedGainDays: z.number(),
  riskReductionPct: z.number().min(0).max(100),
  confidence: SeveritySchema.exclude(["CRITICAL"]),
  reversibility: z.enum(["LOW", "MEDIUM", "HIGH"]),
  score: z.number().min(0).max(100),
  evidenceIds: z.array(z.string()),
  approvalRequired: z.boolean()
});

export const GatekeeperReportSchema = z.object({
  status: z.enum(["PASS", "BLOCKED", "WARN"]),
  failures: z.array(z.string()),
  warnings: z.array(z.string()),
  approvedForHumanReview: z.boolean(),
  checkedAt: z.string().datetime()
});

export const ExecutionDraftSchema = z.object({
  supplierMessage: z.string(),
  carrierMessage: z.string(),
  internalMessage: z.string(),
  customerMessage: z.string()
});

export const AgentRunSchema = z.object({
  id: z.string(),
  agentName: z.string(),
  model: z.string(),
  mode: AgentModeSchema,
  latencyMs: z.number().nonnegative(),
  tokenEstimate: z.number().nonnegative(),
  inputHash: z.string(),
  outputHash: z.string(),
  validationStatus: z.enum(["PASS", "FAIL"]),
  summary: z.string(),
  createdAt: z.string().datetime()
});

export const DecisionPacketSchema = z.object({
  id: z.string(),
  exception: ExceptionEventSchema,
  publicSignals: z.array(PublicSignalSchema),
  impactReport: ImpactReportSchema,
  options: z.array(RecoveryOptionSchema).length(3),
  recommendedOptionId: z.string(),
  gatekeeper: GatekeeperReportSchema,
  executionDraft: ExecutionDraftSchema,
  agentRuns: z.array(AgentRunSchema),
  // requestedMode = what the run intended (LIVE_AI when live AI is enabled,
  // else DETERMINISTIC_RULES; REPLAY arrives in Phase 3).
  // effectiveMode = what actually happened, derived from the agent runs by
  // computeEffectiveMode. A divergence to FAILED_TO_FALLBACK is the degraded
  // case a future "degraded - no live AI" badge keys off.
  requestedMode: RequestedModeSchema,
  effectiveMode: AgentModeSchema,
  approvalStatus: ApprovalStatusSchema,
  approvalReason: z.string().optional(),
  auditTrail: z.array(
    z.object({
      at: z.string().datetime(),
      actor: z.string(),
      action: z.string(),
      detail: z.string()
    })
  ),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const ScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  defaultSignalMode: z.enum(["LIVE_WITH_FALLBACK", "CACHED_ONLY"]),
  flagship: z.boolean()
});

export type PublicSignal = z.infer<typeof PublicSignalSchema>;
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;
export type AgentMode = z.infer<typeof AgentModeSchema>;
export type RequestedMode = z.infer<typeof RequestedModeSchema>;
export type ExceptionEvent = z.infer<typeof ExceptionEventSchema>;
export type ImpactReport = z.infer<typeof ImpactReportSchema>;
export type RecoveryOption = z.infer<typeof RecoveryOptionSchema>;
export type GatekeeperReport = z.infer<typeof GatekeeperReportSchema>;
export type ExecutionDraft = z.infer<typeof ExecutionDraftSchema>;
export type AgentRun = z.infer<typeof AgentRunSchema>;
export type DecisionPacket = z.infer<typeof DecisionPacketSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
