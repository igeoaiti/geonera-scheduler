CREATE SCHEMA "scheduler";
--> statement-breakpoint
CREATE TYPE "scheduler"."job_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "scheduler"."cron_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"trigger_method" text DEFAULT 'RABBITMQ' NOT NULL,
	"cron_expression" text NOT NULL,
	"payload" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cron_schedules_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "scheduler"."jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"trigger_method" text DEFAULT 'RABBITMQ' NOT NULL,
	"status" "scheduler"."job_status" DEFAULT 'pending' NOT NULL,
	"payload" jsonb,
	"priority" integer DEFAULT 0 NOT NULL,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cron_is_active_next_run_idx" ON "scheduler"."cron_schedules" USING btree ("is_active","next_run_at");--> statement-breakpoint
CREATE INDEX "jobs_status_scheduled_idx" ON "scheduler"."jobs" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "jobs_status_name_idx" ON "scheduler"."jobs" USING btree ("status","name");