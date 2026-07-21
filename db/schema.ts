import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp
} from "drizzle-orm/pg-core";

export const severityEnum = pgEnum("severity", [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL"
]);

export const approvalStatusEnum = pgEnum("approval_status", [
  "PENDING",
  "APPROVED",
  "REJECTED"
]);

// Kept in lockstep with AgentModeSchema in lib/schemas.ts (R4-8 taxonomy).
export const agentModeEnum = pgEnum("agent_mode", [
  "LIVE_AI",
  "DETERMINISTIC_RULES",
  "REPLAY",
  "FAILED_TO_FALLBACK"
]);

export const validationStatusEnum = pgEnum("validation_status", [
  "PASS",
  "FAIL"
]);

export const suppliers = pgTable("suppliers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  country: text("country").notNull(),
  region: text("region").notNull(),
  riskTier: severityEnum("risk_tier").notNull(),
  backupSupplierId: text("backup_supplier_id"),
  standardLeadTimeDays: integer("standard_lead_time_days").notNull(),
  // P2.4: sector values are drawn from SectorSchema in lib/schemas.ts and
  // validated at ingest. NULLABLE with no default -- ADD COLUMN NOT NULL with no
  // default fails on a populated table, and NULL honestly means "not yet
  // classified". P2.6 seed / P2.5 ingest populate it. country stays text;
  // ISO-3166 enforcement is app-layer via CountryCodeSchema.
  sector: text("sector")
});

export const components = pgTable("components", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  supplierId: text("supplier_id").notNull(),
  backupSupplierId: text("backup_supplier_id"),
  productId: text("product_id").notNull(),
  requiredForLaunch: boolean("required_for_launch").notNull(),
  unitCostUsd: numeric("unit_cost_usd").notNull()
});

export const inventory = pgTable("inventory", {
  id: text("id").primaryKey(),
  componentId: text("component_id").notNull(),
  site: text("site").notNull(),
  onHandUnits: integer("on_hand_units").notNull(),
  dailyBurnUnits: integer("daily_burn_units").notNull(),
  safetyStockUnits: integer("safety_stock_units").notNull()
});

export const shipments = pgTable("shipments", {
  id: text("id").primaryKey(),
  componentId: text("component_id").notNull(),
  supplierId: text("supplier_id").notNull(),
  carrier: text("carrier").notNull(),
  lane: text("lane").notNull(),
  status: text("status").notNull(),
  originalEta: text("original_eta").notNull(),
  revisedEta: text("revised_eta").notNull(),
  quantityUnits: integer("quantity_units").notNull(),
  expediteCostUsd: numeric("expedite_cost_usd").notNull()
});

export const orders = pgTable("orders", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  customerSegment: text("customer_segment").notNull(),
  region: text("region").notNull(),
  quantity: integer("quantity").notNull(),
  promisedDate: text("promised_date").notNull(),
  priority: severityEnum("priority").notNull()
});

export const decisionPackets = pgTable("decision_packets", {
  id: text("id").primaryKey(),
  exceptionId: text("exception_id").notNull(),
  payload: jsonb("payload").notNull(),
  approvalStatus: approvalStatusEnum("approval_status").notNull().default("PENDING"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
}, (table) => [
  index("decision_packets_approval_status_idx").on(table.approvalStatus),
  index("decision_packets_created_at_idx").on(table.createdAt)
]);

// B-14 (2026-07-16 re-review, decided at fix 2026-07-21): the AUDIT-BEARING children of a
// packet are RESTRICT, not cascade. In an evidence product, deleting a packet must not
// silently erase the record of what was decided, by whom, or what was executed in the
// outside world -- the DB should refuse and force an explicit, deliberate cleanup.
// Derived/regenerable children (runIdempotencyKeys, processedApprovalEvents -- operational
// dedup guards, reconstructible and meaningless without their packet) keep cascade.
// Verified at fix time: NO code path anywhere deletes a decisionPacket, so this is purely
// protective today -- it costs nothing now and closes the hole before a cleanup path exists.
export const decisionPacketAuditEvents = pgTable("decision_packet_audit_events", {
  id: text("id").primaryKey(),
  packetId: text("packet_id")
    .notNull()
    .references(() => decisionPackets.id, { onDelete: "restrict" }),
  at: timestamp("at", { withTimezone: true }).notNull(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  detail: text("detail").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
}, (table) => [
  index("decision_packet_audit_events_packet_id_idx").on(table.packetId),
  index("decision_packet_audit_events_at_idx").on(table.at)
]);

export const decisionPacketAgentRuns = pgTable("decision_packet_agent_runs", {
  id: text("id").primaryKey(),
  packetId: text("packet_id")
    .notNull()
    .references(() => decisionPackets.id, { onDelete: "restrict" }),
  agentRunId: text("agent_run_id").notNull(),
  agentName: text("agent_name").notNull(),
  model: text("model").notNull(),
  mode: agentModeEnum("mode").notNull(),
  validationStatus: validationStatusEnum("validation_status").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
}, (table) => [
  index("decision_packet_agent_runs_packet_id_idx").on(table.packetId),
  index("decision_packet_agent_runs_validation_status_idx").on(
    table.validationStatus
  )
]);

export const runIdempotencyKeys = pgTable("run_idempotency_keys", {
  idempotencyKey: text("idempotency_key").primaryKey(),
  packetId: text("packet_id")
    .notNull()
    .references(() => decisionPackets.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
}, (table) => [
  index("run_idempotency_keys_packet_id_idx").on(table.packetId)
]);

export const processedApprovalEvents = pgTable("processed_approval_events", {
  eventId: text("event_id").primaryKey(),
  packetId: text("packet_id")
    .notNull()
    .references(() => decisionPackets.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
}, (table) => [
  index("processed_approval_events_packet_id_idx").on(table.packetId)
]);

// ===========================================================================
// P2.4: ActionOps master + transactional schema (ADDITIVE; forward-laid for
// Phases 5/7/8). The runtime pipeline still emits V1 packets and does not write
// these tables yet.
// ===========================================================================

// Persisted product master (the single reconciled product notion referenced by
// the existing components.product_id / orders.product_id text columns). Aligns
// ProductSchema. The in-memory Product type in lib/data/operations.ts is legacy
// LaunchOps scenario/replay data, superseded by this table for persisted data.
// No FK constraints are added onto the existing components/orders columns -- they
// reference by ID; keeping this increment surgical.
export const products = pgTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  // mode: "number" so $inferSelect yields number (default numeric() infers
  // string), matching ProductSchema.revenuePerUnitUsd (genuine Zod <-> DB align).
  revenuePerUnitUsd: numeric("revenue_per_unit_usd", { mode: "number" }).notNull(),
  priority: severityEnum("priority").notNull()
});

// Persisted chokepoint master (closed list per Phase 4). Aligns ChokepointSchema.
export const chokepoints = pgTable("chokepoints", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  region: text("region"),
  // ISO-3166 alpha-2; enforced app-layer via CountryCodeSchema.
  country: text("country")
});

// Persisted route master. Aligns RouteSchema. mode is transport mode (e.g.
// SEA/AIR/RAIL/ROAD); kept text.
export const routes = pgTable("routes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  originCountry: text("origin_country").notNull(),
  destinationCountry: text("destination_country").notNull(),
  mode: text("mode").notNull()
});

// M:N join: a route transits multiple chokepoints (e.g. Asia->Europe via
// Malacca + Suez). Composite primary key; index on chokepoint_id for reverse
// lookups (which routes transit a given chokepoint).
export const routeChokepoints = pgTable("route_chokepoints", {
  routeId: text("route_id")
    .notNull()
    .references(() => routes.id, { onDelete: "cascade" }),
  chokepointId: text("chokepoint_id")
    .notNull()
    .references(() => chokepoints.id, { onDelete: "cascade" })
}, (table) => [
  primaryKey({ columns: [table.routeId, table.chokepointId] }),
  index("route_chokepoints_chokepoint_id_idx").on(table.chokepointId)
]);

// ---------------------------------------------------------------------------
// CANONICAL-SOURCE RULE (this codebase documents these calls):
// The decision-packet `payload` jsonb stays canonical for packet-scoped output.
// The exposure_results / action_items / supplier_messages tables below are
// forward-laid relational projections, each with a NOT NULL disruption_event_id
// FK -- every projection row belongs to a persisted event (no orphan rows),
// populated by Phases 5/7/8. They are NOT mere packet-payload duplication --
// keying them to persisted events earns event-centric queries the packet payload
// cannot serve (e.g. all exposures across every packet for one event).
// ---------------------------------------------------------------------------

// Persisted disruption event (PERSISTED so events survive the GDELT ~3-month
// window; aligns ThreatCard / DisruptionEventSchema).
export const disruptionEvents = pgTable("disruption_events", {
  id: text("id").primaryKey(),
  // Open string -- Phase 4 owns the closed event vocab.
  eventType: text("event_type").notNull(),
  severity: severityEnum("severity").notNull(),
  region: text("region"),
  // ISO-3166 alpha-2; enforced app-layer via CountryCodeSchema.
  country: text("country"),
  chokepointId: text("chokepoint_id").references(() => chokepoints.id, {
    onDelete: "set null"
  }),
  summary: text("summary").notNull(),
  // jsonb infers `unknown` by default; $type pins the shape so $inferSelect
  // matches DisruptionEventSchema.evidenceUrls (string[]).
  evidenceUrls: jsonb("evidence_urls").$type<string[]>().notNull(),
  confidence: numeric("confidence", { mode: "number" }).notNull(),
  // timestamptz -> JS Date (house style, like every other table). The domain
  // contract (DisruptionEventSchema) uses ISO strings, so the Phase 5/7/8
  // DB-row -> domain mapper converts via Date.toISOString(). NOTE: Drizzle
  // mode:"string" would emit the Postgres "YYYY-MM-DD HH:mm:ss+HH" text format,
  // which z.string().datetime() REJECTS (verified) -- so do not use it here.
  sourceCapturedAt: timestamp("source_captured_at", {
    withTimezone: true
  }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
}, (table) => [
  index("disruption_events_created_at_idx").on(table.createdAt),
  index("disruption_events_event_type_idx").on(table.eventType),
  index("disruption_events_country_idx").on(table.country),
  index("disruption_events_chokepoint_id_idx").on(table.chokepointId)
]);

// Atlas projection (Phase 5). Aligns ExposureResultSchema. Keyed to
// disruption_events so it earns event-centric queries that outlive any single
// packet -- this is WHY it is not mere packet-payload duplication.
export const exposureResults = pgTable("exposure_results", {
  id: text("id").primaryKey(),
  disruptionEventId: text("disruption_event_id")
    .notNull()
    .references(() => disruptionEvents.id, { onDelete: "cascade" }),
  supplierId: text("supplier_id")
    .notNull()
    .references(() => suppliers.id),
  supplierName: text("supplier_name").notNull(),
  country: text("country").notNull(),
  // NOT NULL here while suppliers.sector is nullable: Phase 5 (Atlas) coalesces a
  // NULL supplier sector to OTHER_UNMAPPED when projecting an exposure row.
  sector: text("sector").notNull(),
  exposureScore: numeric("exposure_score", { mode: "number" }).notNull(),
  rationale: text("rationale").notNull(),
  evidenceIds: jsonb("evidence_ids").$type<string[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
}, (table) => [
  index("exposure_results_disruption_event_id_idx").on(table.disruptionEventId),
  index("exposure_results_supplier_id_idx").on(table.supplierId)
]);

// Action Packet projection (Phase 8). Aligns ActionItemSchema. status taxonomy
// is owned by Phase 8 (text). NOT NULL disruption_event_id: every action item
// belongs to the event that spawned it (no orphan rows in the MVP flow).
export const actionItems = pgTable("action_items", {
  id: text("id").primaryKey(),
  disruptionEventId: text("disruption_event_id")
    .notNull()
    .references(() => disruptionEvents.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  owner: text("owner").notNull(),
  status: text("status").notNull(),
  dueDate: text("due_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
}, (table) => [
  index("action_items_disruption_event_id_idx").on(table.disruptionEventId)
]);

// Dispatcher projection (Phase 7). Aligns SupplierMessageDraftSchema. DRAFTS
// ONLY -- nothing sends without human approval, a project invariant. The
// approval_required default(true) encodes the no-send-without-approval rule.
// NOT NULL disruption_event_id: every draft belongs to the event that spawned it.
export const supplierMessages = pgTable("supplier_messages", {
  id: text("id").primaryKey(),
  disruptionEventId: text("disruption_event_id")
    .notNull()
    .references(() => disruptionEvents.id, { onDelete: "cascade" }),
  supplierId: text("supplier_id")
    .notNull()
    .references(() => suppliers.id),
  channel: text("channel").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  claims: jsonb("claims")
    .$type<{ value: number | string; unit: string; sourcePath: string }[]>()
    .notNull(),
  approvalRequired: boolean("approval_required").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
}, (table) => [
  index("supplier_messages_disruption_event_id_idx").on(table.disruptionEventId),
  index("supplier_messages_supplier_id_idx").on(table.supplierId)
]);

// ===========================================================================
// Phase 5: governed action execution -- the TRANSACTIONAL OUTBOX table (ADDITIVE,
// mirrors the P2.4 purely-additive style: a brand-new table + indexes, NO ALTER
// to any existing table). One row per governable action per packet; it is the
// IMMUTABLE per-action audit record AND the outbox claim.
// ===========================================================================

// `idempotency_key` carries a UNIQUE constraint (.unique()) -- it is the
// reserve-in-txn claim (mirrors run_idempotency_keys / processed_approval_events):
// a retry/double-fire INSERT ... ON CONFLICT (idempotency_key) DO NOTHING returns
// no row for the loser, so the dispatcher runs EXACTLY ONCE for one logical action.
//
// action_type / channel / reversibility / status are TEXT (not pgEnum): they reuse
// the codebase's "closed vocab owned by the phase, enforced app-layer via Zod"
// pattern (like action_items.status / suppliers.sector / disruption_events.event_type).
// This keeps the migration a clean CREATE TABLE (no new CREATE TYPE) AND makes the
// forward-compat status states (CLAIMED/EXPIRED/NEEDS_RECONCILE) a no-migration add.
export const executedActions = pgTable("executed_actions", {
  id: text("id").primaryKey(),
  packetId: text("packet_id")
    .notNull()
    // B-14: RESTRICT -- this is the immutable outbox/audit row for actions actually
    // executed in the outside world. It must outlive any packet cleanup, not vanish with it.
    .references(() => decisionPackets.id, { onDelete: "restrict" }),
  actionType: text("action_type").notNull(),
  channel: text("channel").notNull(),
  reversibility: text("reversibility").notNull(),
  status: text("status").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  payloadHash: text("payload_hash").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
  // Nullable: stamped only on a terminal dispatch (EXECUTED/FAILED).
  executedAt: timestamp("executed_at", { withTimezone: true }),
  auditDetail: text("audit_detail").notNull(),
  // Nullable: set only on a FAILED dispatch (the fail-closed error class).
  errorClass: text("error_class"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
}, (table) => [
  index("executed_actions_packet_id_idx").on(table.packetId),
  index("executed_actions_status_idx").on(table.status)
]);
