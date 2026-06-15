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

// Shared by both packet versions. Extracted so V1 and V2 share one audit shape.
export const AuditTrailEntrySchema = z.object({
  at: z.string().datetime(),
  actor: z.string(),
  action: z.string(),
  detail: z.string()
});

// ---------------------------------------------------------------------------
// Packet contract versioning (R4-7).
//
// The decision packet is persisted as a self-contained jsonb document. The
// LaunchOps salvage shape (V1, below) hard-codes a 3-recovery-option +
// executionDraft contract that does NOT fit RESILIX ActionOps. Rather than
// silently reuse it, packets carry an explicit `packetVersion` discriminant and
// the schema is a discriminated union, so the contract can evolve without
// ambiguous reads and `tsc` flags every version-specific field access.
//
//   V1 = the LaunchOps salvage packet (exception / 3 options / executionDraft).
//   V2 = the ActionOps packet (threat card / exposure / playbooks / drafts).
//
// P2.3 installs the seam, the V2 schema, and version-aware consumers
// (store/UI/tests). The ActionOps AGENTS that populate V2 land in later phases,
// so every agent-produced V2 leaf is intentionally MINIMAL and PERMISSIVE and
// the owning phase tightens it (see per-field notes). The pipeline still emits
// V1 until those agents exist, so no V2 packet persists in P2.3 — the
// "migrate API/UI/tests before any V2 packet persists" rule holds trivially.
// ---------------------------------------------------------------------------

// --- V2 (ActionOps) section schemas ---------------------------------------

// Closed US supply-chain sector taxonomy. This is the STARTING taxonomy; Phase 4
// (Sentinel) owns and refines the closed vocab and reuses this enum. The last
// member, OTHER_UNMAPPED, is the escape hatch for anything not yet classified.
// Enforcement of the closed set happens at the Atlas/ingest boundary (Phase 4/5),
// mirroring how eventType stays a string here (the closed vocab is owned by the
// boundary, not pinned at every leaf).
export const SectorSchema = z.enum([
  "SEMICONDUCTORS",
  "ELECTRONICS",
  "AUTOMOTIVE",
  "AEROSPACE_DEFENSE",
  "PHARMACEUTICALS",
  "MEDICAL_DEVICES",
  "CHEMICALS",
  "ENERGY",
  "METALS_MINING",
  "INDUSTRIAL_MACHINERY",
  "AGRICULTURE_FOOD",
  "TEXTILES_APPAREL",
  "CONSUMER_GOODS",
  "LOGISTICS",
  "OTHER_UNMAPPED"
]);

// Country is validated as an ISO-3166 alpha-2 code at the app/ingest boundary,
// NOT as a DB enum (249 values would be a brittle pgEnum). Two uppercase letters.
export const CountryCodeSchema = z
  .string()
  .regex(/^[A-Z]{2}$/, "ISO-3166 alpha-2 code");

// Sentinel output (Phase 4). Phase 4 replaces the open eventType string with the
// closed ISO/chokepoint/sector/event vocabulary + an `OTHER_UNMAPPED` escape
// hatch — an enum here now would actively fight that, so it stays a string.
export const ThreatCardSchema = z.object({
  id: z.string(),
  eventType: z.string(),
  severity: SeveritySchema,
  location: z.object({
    region: z.string().optional(),
    country: z.string().optional(),
    chokepoint: z.string().optional()
  }),
  summary: z.string(),
  // URL shape only; the per-run fetched-evidence allowlist check is the
  // Sentinel/gatekeeper path's job (Phase 4).
  evidenceUrls: z.array(z.string().url()),
  confidence: z.number().min(0).max(1),
  createdAt: z.string().datetime()
});

// Atlas output (Phase 5). supplierId is the canonical internal ID — uploaded
// names are quarantined to IDs at ingest (Phase 2 P2.5), never crossing raw.
// Phase 5 owns the scoring model, so exposureScore is left an open number.
export const ExposureResultSchema = z.object({
  id: z.string(),
  supplierId: z.string(),
  supplierName: z.string(),
  country: z.string(),
  // The sector value is validated against SectorSchema at the Atlas/ingest
  // boundary (Phase 4/5), same pattern as eventType. One sector notion:
  // SectorSchema is the taxonomy, enforcement is layered, no divergence.
  sector: z.string(),
  exposureScore: z.number(),
  rationale: z.string(),
  evidenceIds: z.array(z.string())
});

// Simulator output (Phase 6). Present ONLY on Tier-2 / seeded inventory data;
// a Tier-1-only packet omits this and records why in dataGaps. Phase 6 owns the
// horizon model; this is the minimal stable shape.
export const SimulationSchema = z.object({
  horizons: z.array(
    z.object({
      days: z.number().int().positive(),
      revenueAtRiskUsd: z.number().nonnegative()
    })
  ),
  productRunouts: z.array(
    z.object({
      productId: z.string(),
      runoutDate: z.string()
    })
  ),
  generatedAt: z.string().datetime()
});

// Strategist output (Phase 7). Every number in a playbook traces to an
// Atlas/Simulator claim id — Phase 7 enforces the grounding.
export const PlaybookSchema = z.object({
  id: z.string(),
  role: z.string(),
  summary: z.string(),
  steps: z.array(z.string()),
  groundedClaimIds: z.array(z.string())
});

// R4-9 (spec-locked): the Dispatcher emits prose PLUS a claims[] array; the
// gatekeeper cross-checks BOTH directions (every numeral in prose maps to a
// claim, and every claim's sourcePath resolves into the structured inputs).
// The three fields are the locked contract; `value` stays union-typed because a
// claim may carry a canonical number or a formatted numeral — Phase 7 interprets.
export const ClaimSchema = z.object({
  value: z.union([z.number(), z.string()]),
  unit: z.string(),
  sourcePath: z.string()
});

// Dispatcher output (Phase 7). Drafts only; nothing sends without human
// approval. channel taxonomy is owned by Phase 7.
export const SupplierMessageDraftSchema = z.object({
  id: z.string(),
  supplierId: z.string(),
  channel: z.string(),
  subject: z.string().optional(),
  body: z.string(),
  claims: z.array(ClaimSchema),
  approvalRequired: z.boolean()
});

// Action Packet tab (Phase 8) owns the status taxonomy.
export const ActionItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  owner: z.string(),
  status: z.string(),
  dueDate: z.string().optional()
});

// Tiered CSV schema (Phase 2): Tier-1 unlocks exposure mapping only; Tier-2
// unlocks runway. SEEDED = the demo dataset path.
export const DataTierSchema = z.enum(["TIER_1", "TIER_2", "SEEDED"]);

// --- Master-data contracts (P2.4) -----------------------------------------
// Typed contracts for the persisted master tables added in db/schema.ts. Kept
// minimal and aligned to the table columns so the schema-extension alignment
// test has a concrete contract to assert against (Zod <-> DB).

// Persisted supplier master (P2.5 CSV ingestion target). Aligned 1:1 to
// `typeof suppliers.$inferSelect` so a Drizzle/Zod drift fails the alignment test,
// not production (P2.4 lesson #1). Notes on the genuine alignment:
//   - id is the CANONICAL internal ID derived from (normalized name + country) at
//     ingest. Uploaded names are untrusted; downstream logic keys off this id,
//     never the raw uploaded string (the ID-quarantine, R4-5/6).
//   - name is the SANITIZED display name (leading formula trigger neutralized).
//   - country is an ISO-3166 alpha-2 code (CountryCodeSchema), normalized at ingest.
//   - sector is .nullish() because suppliers.sector is a NULLABLE column with no
//     default -- Zod .optional() would reject the null a real selected row carries
//     (P2.4 lesson #2). When present it is a SectorSchema member.
//   - backupSupplierId is .nullish() (nullable column). CSV ingest does not set it
//     (cross-supplier linkage is later-phase relational territory); it stays null.
export const SupplierSchema = z.object({
  id: z.string(),
  name: z.string(),
  country: CountryCodeSchema,
  region: z.string(),
  riskTier: SeveritySchema,
  backupSupplierId: z.string().nullish(),
  standardLeadTimeDays: z.number().int().nonnegative(),
  sector: SectorSchema.nullish()
});

// Persisted product master (the single reconciled product notion referenced by
// components.product_id / orders.product_id). The in-memory Product type in
// lib/data/operations.ts is legacy LaunchOps scenario/replay data, superseded by
// this table for persisted data.
export const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  revenuePerUnitUsd: z.number().nonnegative(),
  priority: SeveritySchema
});

// Persisted chokepoint master (closed list, owned by Phase 4).
export const ChokepointSchema = z.object({
  id: z.string(),
  name: z.string(),
  // nullish (not optional) so a DB-shaped row's null parses (genuine Zod <-> DB).
  region: z.string().nullish(),
  country: CountryCodeSchema.nullish()
});

// Persisted route master. mode is transport mode (e.g. SEA/AIR/RAIL/ROAD); kept
// an open string here, like other Phase-owned vocab.
export const RouteSchema = z.object({
  id: z.string(),
  name: z.string(),
  originCountry: CountryCodeSchema,
  destinationCountry: CountryCodeSchema,
  mode: z.string()
});

// Persisted disruption event (survives the GDELT ~3-month window; aligns with
// ThreatCard). eventType stays an open string -- Phase 4 owns the closed vocab.
export const DisruptionEventSchema = z.object({
  id: z.string(),
  eventType: z.string(),
  severity: SeveritySchema,
  // nullish (not optional) so DB-shaped null values parse (genuine Zod <-> DB).
  region: z.string().nullish(),
  country: CountryCodeSchema.nullish(),
  chokepointId: z.string().nullish(),
  summary: z.string(),
  evidenceUrls: z.array(z.string().url()),
  confidence: z.number().min(0).max(1),
  sourceCapturedAt: z.string().datetime(),
  createdAt: z.string().datetime()
});

// --- Supplier CSV ingestion contract (P2.5, R4-5/6) -----------------------
// The response contract for POST /api/suppliers/upload. A per-row report makes a
// silent zero-match impossible: every input row resolves to exactly one entry that
// is MATCHED (persisted), MATCHED_OVERWRITE (dedup last-write-wins), or UNMATCHED
// with a specific human-readable reason. That guarantee is ENFORCED by the
// discriminated union below -- an UNMATCHED row without a reason fails parse, so
// the "every rejection carries a reason" rule is a schema invariant, not just a
// code convention. The row index is the 1-based position in the data rows (header
// excluded) so a user can find the offending row.

export const SupplierRowOutcomeSchema = z.enum([
  "MATCHED",
  "MATCHED_OVERWRITE",
  "UNMATCHED"
]);

// Discriminated on `outcome` so each variant carries exactly the fields its
// outcome requires (and the right ones are REQUIRED, not optional):
//   MATCHED            -> supplierId + supplierName (the persisted handle + name)
//   MATCHED_OVERWRITE  -> supplierId + supplierName + reason (the dedup note)
//   UNMATCHED          -> reason (the specific rejection cause; no ids)
export const SupplierRowReportSchema = z.discriminatedUnion("outcome", [
  z.object({
    rowIndex: z.number().int().positive(),
    outcome: z.literal("MATCHED"),
    // The canonical internal ID assigned. Uploaded names never cross downstream as
    // raw strings -- this id is the opaque handle.
    supplierId: z.string(),
    // The sanitized display name actually stored (formula trigger neutralized).
    supplierName: z.string()
  }),
  z.object({
    rowIndex: z.number().int().positive(),
    outcome: z.literal("MATCHED_OVERWRITE"),
    supplierId: z.string(),
    supplierName: z.string(),
    // The dedup note explaining the last-write-wins overwrite.
    reason: z.string()
  }),
  z.object({
    rowIndex: z.number().int().positive(),
    outcome: z.literal("UNMATCHED"),
    // A specific reason is REQUIRED for every UNMATCHED row -- this is the
    // schema-level enforcement of zero-match-impossible.
    reason: z.string()
  })
]);

export const SupplierUploadReportSchema = z.object({
  // The detected tier of the upload (Tier-2 columns present -> TIER_2, else TIER_1).
  // Detection only; P2.5 writes Tier-1 fields to the suppliers table exclusively.
  dataTier: DataTierSchema,
  // Whether any recognized Tier-2 column (lane/route, on-hand, daily use, unit
  // revenue) was present in the header. Tier-2 write paths are Phase 4/5.
  tier2ColumnsDetected: z.array(z.string()),
  totalRows: z.number().int().nonnegative(),
  matched: z.number().int().nonnegative(),
  overwritten: z.number().int().nonnegative(),
  unmatched: z.number().int().nonnegative(),
  rows: z.array(SupplierRowReportSchema),
  // Retention disclosure carried on every response (the dashboard UI string is
  // Phase 8; this exposes the rule in the contract now, R4-5/6).
  retention: z.string()
});

export type SupplierRowOutcome = z.infer<typeof SupplierRowOutcomeSchema>;
export type SupplierRowReport = z.infer<typeof SupplierRowReportSchema>;
export type SupplierUploadReport = z.infer<typeof SupplierUploadReportSchema>;

// --- V1 (LaunchOps salvage) packet ----------------------------------------

export const DecisionPacketV1Schema = z.object({
  packetVersion: z.literal(1),
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
  auditTrail: z.array(AuditTrailEntrySchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

// --- V2 (ActionOps) packet -------------------------------------------------

export const DecisionPacketV2Schema = z.object({
  packetVersion: z.literal(2),
  id: z.string(),
  threatCard: ThreatCardSchema,
  publicSignals: z.array(PublicSignalSchema),
  exposureResults: z.array(ExposureResultSchema),
  // Absent on Tier-1-only uploads (no inventory data) — see dataGaps.
  simulation: SimulationSchema.optional(),
  dataTier: DataTierSchema,
  // Human-readable reasons a section is missing (e.g. "no runway: Tier-1 upload
  // has no inventory columns"). Makes a thin packet self-explaining.
  dataGaps: z.array(z.string()),
  playbooks: z.array(PlaybookSchema),
  supplierMessages: z.array(SupplierMessageDraftSchema),
  actionItems: z.array(ActionItemSchema),
  gatekeeper: GatekeeperReportSchema,
  agentRuns: z.array(AgentRunSchema),
  requestedMode: RequestedModeSchema,
  effectiveMode: AgentModeSchema,
  approvalStatus: ApprovalStatusSchema,
  approvalReason: z.string().optional(),
  auditTrail: z.array(AuditTrailEntrySchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

// The canonical packet contract. Discriminated on `packetVersion` so reads are
// unambiguous and the compiler forces every consumer to handle both versions.
export const DecisionPacketSchema = z.discriminatedUnion("packetVersion", [
  DecisionPacketV1Schema,
  DecisionPacketV2Schema
]);

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
export type AuditTrailEntry = z.infer<typeof AuditTrailEntrySchema>;
// V2 (ActionOps) section types.
export type ThreatCard = z.infer<typeof ThreatCardSchema>;
export type ExposureResult = z.infer<typeof ExposureResultSchema>;
export type Simulation = z.infer<typeof SimulationSchema>;
export type Playbook = z.infer<typeof PlaybookSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type SupplierMessageDraft = z.infer<typeof SupplierMessageDraftSchema>;
export type ActionItem = z.infer<typeof ActionItemSchema>;
export type DataTier = z.infer<typeof DataTierSchema>;
// Sector/country and master-data (P2.4) types.
export type Sector = z.infer<typeof SectorSchema>;
export type CountryCode = z.infer<typeof CountryCodeSchema>;
export type Supplier = z.infer<typeof SupplierSchema>;
// ProductMaster (not Product) avoids colliding with the legacy LaunchOps Product
// type in lib/data/operations.ts, which is still live via .launchId/.program.
export type ProductMaster = z.infer<typeof ProductSchema>;
export type Chokepoint = z.infer<typeof ChokepointSchema>;
export type Route = z.infer<typeof RouteSchema>;
export type DisruptionEvent = z.infer<typeof DisruptionEventSchema>;
// Packet types: the union is canonical; the per-version aliases are for code
// that has already narrowed on packetVersion.
export type DecisionPacketV1 = z.infer<typeof DecisionPacketV1Schema>;
export type DecisionPacketV2 = z.infer<typeof DecisionPacketV2Schema>;
export type DecisionPacket = z.infer<typeof DecisionPacketSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
