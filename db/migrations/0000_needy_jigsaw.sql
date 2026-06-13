CREATE TYPE "public"."agent_mode" AS ENUM('LIVE_AI', 'DETERMINISTIC_FALLBACK');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."validation_status" AS ENUM('PASS', 'FAIL');--> statement-breakpoint
CREATE TABLE "components" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"supplier_id" text NOT NULL,
	"backup_supplier_id" text,
	"product_id" text NOT NULL,
	"required_for_launch" boolean NOT NULL,
	"unit_cost_usd" numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decision_packet_agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"packet_id" text NOT NULL,
	"agent_run_id" text NOT NULL,
	"agent_name" text NOT NULL,
	"model" text NOT NULL,
	"mode" "agent_mode" NOT NULL,
	"validation_status" "validation_status" NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decision_packet_audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"packet_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"detail" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decision_packets" (
	"id" text PRIMARY KEY NOT NULL,
	"exception_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"approval_status" "approval_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" text PRIMARY KEY NOT NULL,
	"component_id" text NOT NULL,
	"site" text NOT NULL,
	"on_hand_units" integer NOT NULL,
	"daily_burn_units" integer NOT NULL,
	"safety_stock_units" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"customer_segment" text NOT NULL,
	"region" text NOT NULL,
	"quantity" integer NOT NULL,
	"promised_date" text NOT NULL,
	"priority" "severity" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_approval_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"packet_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_idempotency_keys" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"packet_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" text PRIMARY KEY NOT NULL,
	"component_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"carrier" text NOT NULL,
	"lane" text NOT NULL,
	"status" text NOT NULL,
	"original_eta" text NOT NULL,
	"revised_eta" text NOT NULL,
	"quantity_units" integer NOT NULL,
	"expedite_cost_usd" numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"country" text NOT NULL,
	"region" text NOT NULL,
	"risk_tier" "severity" NOT NULL,
	"backup_supplier_id" text,
	"standard_lead_time_days" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "decision_packet_agent_runs" ADD CONSTRAINT "decision_packet_agent_runs_packet_id_decision_packets_id_fk" FOREIGN KEY ("packet_id") REFERENCES "public"."decision_packets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_packet_audit_events" ADD CONSTRAINT "decision_packet_audit_events_packet_id_decision_packets_id_fk" FOREIGN KEY ("packet_id") REFERENCES "public"."decision_packets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processed_approval_events" ADD CONSTRAINT "processed_approval_events_packet_id_decision_packets_id_fk" FOREIGN KEY ("packet_id") REFERENCES "public"."decision_packets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_idempotency_keys" ADD CONSTRAINT "run_idempotency_keys_packet_id_decision_packets_id_fk" FOREIGN KEY ("packet_id") REFERENCES "public"."decision_packets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "decision_packet_agent_runs_packet_id_idx" ON "decision_packet_agent_runs" USING btree ("packet_id");--> statement-breakpoint
CREATE INDEX "decision_packet_agent_runs_validation_status_idx" ON "decision_packet_agent_runs" USING btree ("validation_status");--> statement-breakpoint
CREATE INDEX "decision_packet_audit_events_packet_id_idx" ON "decision_packet_audit_events" USING btree ("packet_id");--> statement-breakpoint
CREATE INDEX "decision_packet_audit_events_at_idx" ON "decision_packet_audit_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX "decision_packets_approval_status_idx" ON "decision_packets" USING btree ("approval_status");--> statement-breakpoint
CREATE INDEX "decision_packets_created_at_idx" ON "decision_packets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "processed_approval_events_packet_id_idx" ON "processed_approval_events" USING btree ("packet_id");--> statement-breakpoint
CREATE INDEX "run_idempotency_keys_packet_id_idx" ON "run_idempotency_keys" USING btree ("packet_id");