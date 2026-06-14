CREATE TABLE "action_items" (
	"id" text PRIMARY KEY NOT NULL,
	"disruption_event_id" text NOT NULL,
	"title" text NOT NULL,
	"owner" text NOT NULL,
	"status" text NOT NULL,
	"due_date" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chokepoints" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"region" text,
	"country" text
);
--> statement-breakpoint
CREATE TABLE "disruption_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"severity" "severity" NOT NULL,
	"region" text,
	"country" text,
	"chokepoint_id" text,
	"summary" text NOT NULL,
	"evidence_urls" jsonb NOT NULL,
	"confidence" numeric NOT NULL,
	"source_captured_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exposure_results" (
	"id" text PRIMARY KEY NOT NULL,
	"disruption_event_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"supplier_name" text NOT NULL,
	"country" text NOT NULL,
	"sector" text NOT NULL,
	"exposure_score" numeric NOT NULL,
	"rationale" text NOT NULL,
	"evidence_ids" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"revenue_per_unit_usd" numeric NOT NULL,
	"priority" "severity" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_chokepoints" (
	"route_id" text NOT NULL,
	"chokepoint_id" text NOT NULL,
	CONSTRAINT "route_chokepoints_route_id_chokepoint_id_pk" PRIMARY KEY("route_id","chokepoint_id")
);
--> statement-breakpoint
CREATE TABLE "routes" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"origin_country" text NOT NULL,
	"destination_country" text NOT NULL,
	"mode" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"disruption_event_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"channel" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"claims" jsonb NOT NULL,
	"approval_required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "sector" text;--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_disruption_event_id_disruption_events_id_fk" FOREIGN KEY ("disruption_event_id") REFERENCES "public"."disruption_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disruption_events" ADD CONSTRAINT "disruption_events_chokepoint_id_chokepoints_id_fk" FOREIGN KEY ("chokepoint_id") REFERENCES "public"."chokepoints"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exposure_results" ADD CONSTRAINT "exposure_results_disruption_event_id_disruption_events_id_fk" FOREIGN KEY ("disruption_event_id") REFERENCES "public"."disruption_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exposure_results" ADD CONSTRAINT "exposure_results_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_chokepoints" ADD CONSTRAINT "route_chokepoints_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_chokepoints" ADD CONSTRAINT "route_chokepoints_chokepoint_id_chokepoints_id_fk" FOREIGN KEY ("chokepoint_id") REFERENCES "public"."chokepoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_messages" ADD CONSTRAINT "supplier_messages_disruption_event_id_disruption_events_id_fk" FOREIGN KEY ("disruption_event_id") REFERENCES "public"."disruption_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_messages" ADD CONSTRAINT "supplier_messages_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_items_disruption_event_id_idx" ON "action_items" USING btree ("disruption_event_id");--> statement-breakpoint
CREATE INDEX "disruption_events_created_at_idx" ON "disruption_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "disruption_events_event_type_idx" ON "disruption_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "disruption_events_country_idx" ON "disruption_events" USING btree ("country");--> statement-breakpoint
CREATE INDEX "disruption_events_chokepoint_id_idx" ON "disruption_events" USING btree ("chokepoint_id");--> statement-breakpoint
CREATE INDEX "exposure_results_disruption_event_id_idx" ON "exposure_results" USING btree ("disruption_event_id");--> statement-breakpoint
CREATE INDEX "exposure_results_supplier_id_idx" ON "exposure_results" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "route_chokepoints_chokepoint_id_idx" ON "route_chokepoints" USING btree ("chokepoint_id");--> statement-breakpoint
CREATE INDEX "supplier_messages_disruption_event_id_idx" ON "supplier_messages" USING btree ("disruption_event_id");--> statement-breakpoint
CREATE INDEX "supplier_messages_supplier_id_idx" ON "supplier_messages" USING btree ("supplier_id");