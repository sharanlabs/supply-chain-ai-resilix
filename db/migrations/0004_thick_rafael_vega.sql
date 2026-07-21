ALTER TABLE "decision_packet_agent_runs" DROP CONSTRAINT "decision_packet_agent_runs_packet_id_decision_packets_id_fk";
--> statement-breakpoint
ALTER TABLE "decision_packet_audit_events" DROP CONSTRAINT "decision_packet_audit_events_packet_id_decision_packets_id_fk";
--> statement-breakpoint
ALTER TABLE "executed_actions" DROP CONSTRAINT "executed_actions_packet_id_decision_packets_id_fk";
--> statement-breakpoint
ALTER TABLE "decision_packet_agent_runs" ADD CONSTRAINT "decision_packet_agent_runs_packet_id_decision_packets_id_fk" FOREIGN KEY ("packet_id") REFERENCES "public"."decision_packets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_packet_audit_events" ADD CONSTRAINT "decision_packet_audit_events_packet_id_decision_packets_id_fk" FOREIGN KEY ("packet_id") REFERENCES "public"."decision_packets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executed_actions" ADD CONSTRAINT "executed_actions_packet_id_decision_packets_id_fk" FOREIGN KEY ("packet_id") REFERENCES "public"."decision_packets"("id") ON DELETE restrict ON UPDATE no action;