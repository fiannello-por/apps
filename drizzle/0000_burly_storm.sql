CREATE TYPE "public"."endpoint_type" AS ENUM('metric_query', 'sql', 'saved_chart', 'underlying_data');--> statement-breakpoint
CREATE TYPE "public"."exec_status" AS ENUM('ok', 'error', 'timeout');--> statement-breakpoint
CREATE TYPE "public"."run_mode" AS ENUM('single', 'concurrent');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'completed', 'failed', 'partial');--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"project_uuid" text NOT NULL,
	"encrypted_token" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "query_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_run_id" uuid NOT NULL,
	"iteration_index" integer NOT NULL,
	"status" "exec_status" NOT NULL,
	"submit_ms" real,
	"queue_time_ms" real,
	"warehouse_exec_ms" real,
	"poll_overhead_ms" real,
	"results_fetch_ms" real,
	"total_wall_clock_ms" real,
	"lightdash_query_uuid" text,
	"server_perf" jsonb,
	"row_count" integer,
	"error_message" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "test_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"endpoint_type" "endpoint_type" NOT NULL,
	"payload" jsonb NOT NULL,
	"mode" "run_mode" NOT NULL,
	"concurrency" integer DEFAULT 1 NOT NULL,
	"iterations" integer DEFAULT 1 NOT NULL,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"aggregates" jsonb,
	"created_by" uuid,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "query_executions" ADD CONSTRAINT "query_executions_test_run_id_test_runs_id_fk" FOREIGN KEY ("test_run_id") REFERENCES "public"."test_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;