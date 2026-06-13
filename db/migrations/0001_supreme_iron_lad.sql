ALTER TABLE "decision_packet_agent_runs" ALTER COLUMN "mode" SET DATA TYPE text;--> statement-breakpoint
UPDATE "decision_packet_agent_runs" SET "mode" = 'FAILED_TO_FALLBACK' WHERE "mode" = 'DETERMINISTIC_FALLBACK';--> statement-breakpoint
DROP TYPE "public"."agent_mode";--> statement-breakpoint
CREATE TYPE "public"."agent_mode" AS ENUM('LIVE_AI', 'DETERMINISTIC_RULES', 'REPLAY', 'FAILED_TO_FALLBACK');--> statement-breakpoint
ALTER TABLE "decision_packet_agent_runs" ALTER COLUMN "mode" SET DATA TYPE "public"."agent_mode" USING "mode"::"public"."agent_mode";