CREATE TABLE "executed_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"packet_id" text NOT NULL,
	"action_type" text NOT NULL,
	"channel" text NOT NULL,
	"reversibility" text NOT NULL,
	"status" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload_hash" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"executed_at" timestamp with time zone,
	"audit_detail" text NOT NULL,
	"error_class" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "executed_actions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "executed_actions" ADD CONSTRAINT "executed_actions_packet_id_decision_packets_id_fk" FOREIGN KEY ("packet_id") REFERENCES "public"."decision_packets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "executed_actions_packet_id_idx" ON "executed_actions" USING btree ("packet_id");--> statement-breakpoint
CREATE INDEX "executed_actions_status_idx" ON "executed_actions" USING btree ("status");