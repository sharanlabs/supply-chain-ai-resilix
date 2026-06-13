import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
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
  standardLeadTimeDays: integer("standard_lead_time_days").notNull()
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

export const decisionPacketAuditEvents = pgTable("decision_packet_audit_events", {
  id: text("id").primaryKey(),
  packetId: text("packet_id")
    .notNull()
    .references(() => decisionPackets.id, { onDelete: "cascade" }),
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
    .references(() => decisionPackets.id, { onDelete: "cascade" }),
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
