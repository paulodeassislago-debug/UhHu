CREATE TABLE "lab_idempotency_keys" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"body_hash" text NOT NULL,
	"run_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"title" text NOT NULL,
	"authors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"year" integer,
	"doc_type" text,
	"institution" text,
	"program" text,
	"abstract" text,
	"origin_url" text,
	"source_url" text,
	"raw_metadata" jsonb NOT NULL,
	"rank" integer NOT NULL,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lab_results_run_source_sid_unique" UNIQUE("run_id","source","source_id"),
	CONSTRAINT "lab_results_source_check" CHECK ("lab_results"."source" IN ('bdtd','capes'))
);
--> statement-breakpoint
CREATE TABLE "lab_search_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"term_snapshot" text NOT NULL,
	"filters_snapshot" jsonb NOT NULL,
	"sources_snapshot" jsonb NOT NULL,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" jsonb,
	"adapter_versions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key_hash" text,
	CONSTRAINT "lab_search_runs_status_check" CHECK ("lab_search_runs"."status" IN ('queued','running','succeeded','partial','failed','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "lab_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"term" text NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sources" text[] DEFAULT '{bdtd,capes}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lab_searches_term_length_check" CHECK (char_length("lab_searches"."term") >= 1 AND char_length("lab_searches"."term") <= 500),
	CONSTRAINT "lab_searches_sources_check" CHECK ("lab_searches"."sources" <@ ARRAY['bdtd','capes','oasisbr'])
);
--> statement-breakpoint
CREATE TABLE "lab_source_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"ok" boolean NOT NULL,
	"is_challenge" boolean DEFAULT false NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lab_source_events_source_check" CHECK ("lab_source_events"."source" IN ('bdtd','capes'))
);
--> statement-breakpoint
ALTER TABLE "lab_idempotency_keys" ADD CONSTRAINT "lab_idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_idempotency_keys" ADD CONSTRAINT "lab_idempotency_keys_run_id_lab_search_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."lab_search_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_run_id_lab_search_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."lab_search_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_search_runs" ADD CONSTRAINT "lab_search_runs_search_id_lab_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."lab_searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_search_runs" ADD CONSTRAINT "lab_search_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_searches" ADD CONSTRAINT "lab_searches_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lab_idempotency_keys_expires_idx" ON "lab_idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "lab_results_run_source_rank_idx" ON "lab_results" USING btree ("run_id","source","rank");--> statement-breakpoint
CREATE INDEX "lab_search_runs_search_executed_idx" ON "lab_search_runs" USING btree ("search_id","executed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "lab_search_runs_creator_executed_idx" ON "lab_search_runs" USING btree ("created_by","executed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "lab_searches_project_created_idx" ON "lab_searches" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "lab_source_events_source_at_idx" ON "lab_source_events" USING btree ("source","at" DESC NULLS LAST);