CREATE TABLE "lab_canonical_pins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lab_canonical_pins_group_id_unique" UNIQUE("group_id"),
	CONSTRAINT "lab_canonical_pins_source_check" CHECK ("lab_canonical_pins"."source" IN ('bdtd','capes'))
);
--> statement-breakpoint
CREATE TABLE "lab_dedup_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"canonical_key" text NOT NULL,
	"confidence" text NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lab_dedup_groups_project_key_unique" UNIQUE("project_id","canonical_key"),
	CONSTRAINT "lab_dedup_groups_confidence_check" CHECK ("lab_dedup_groups"."confidence" IN ('exact','fuzzy','single')),
	CONSTRAINT "lab_dedup_groups_status_check" CHECK ("lab_dedup_groups"."status" IN ('confirmed','pending'))
);
--> statement-breakpoint
CREATE TABLE "lab_dedup_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"result_id" uuid NOT NULL,
	CONSTRAINT "lab_dedup_members_group_result_unique" UNIQUE("group_id","result_id"),
	CONSTRAINT "lab_dedup_members_result_unique" UNIQUE("result_id")
);
--> statement-breakpoint
CREATE TABLE "lab_divergences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"source" text NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lab_divergences_group_source_unique" UNIQUE("group_id","source"),
	CONSTRAINT "lab_divergences_source_check" CHECK ("lab_divergences"."source" IN ('bdtd','capes')),
	CONSTRAINT "lab_divergences_note_check" CHECK (char_length("lab_divergences"."note") >= 1 AND char_length("lab_divergences"."note") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "lab_group_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"decision" text DEFAULT 'undecided' NOT NULL,
	"reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lab_group_decisions_group_id_unique" UNIQUE("group_id"),
	CONSTRAINT "lab_group_decisions_decision_check" CHECK ("lab_group_decisions"."decision" IN ('eligible','ineligible','undecided')),
	CONSTRAINT "lab_group_decisions_reason_check" CHECK (char_length("lab_group_decisions"."reason") <= 500)
);
--> statement-breakpoint
CREATE TABLE "lab_group_tags" (
	"group_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "lab_group_tags_group_tag_unique" UNIQUE("group_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "lab_rejected_pairs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"key_a" text NOT NULL,
	"key_b" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lab_rejected_pairs_project_keys_unique" UNIQUE("project_id","key_a","key_b")
);
--> statement-breakpoint
CREATE TABLE "lab_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lab_tags_project_name_unique" UNIQUE("project_id","name"),
	CONSTRAINT "lab_tags_name_check" CHECK (char_length("lab_tags"."name") >= 1 AND char_length("lab_tags"."name") <= 100)
);
--> statement-breakpoint
ALTER TABLE "lab_canonical_pins" ADD CONSTRAINT "lab_canonical_pins_group_id_lab_dedup_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."lab_dedup_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_dedup_groups" ADD CONSTRAINT "lab_dedup_groups_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_dedup_members" ADD CONSTRAINT "lab_dedup_members_group_id_lab_dedup_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."lab_dedup_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_dedup_members" ADD CONSTRAINT "lab_dedup_members_result_id_lab_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."lab_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_divergences" ADD CONSTRAINT "lab_divergences_group_id_lab_dedup_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."lab_dedup_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_group_decisions" ADD CONSTRAINT "lab_group_decisions_group_id_lab_dedup_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."lab_dedup_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_group_tags" ADD CONSTRAINT "lab_group_tags_group_id_lab_dedup_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."lab_dedup_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_group_tags" ADD CONSTRAINT "lab_group_tags_tag_id_lab_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."lab_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_rejected_pairs" ADD CONSTRAINT "lab_rejected_pairs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_tags" ADD CONSTRAINT "lab_tags_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lab_dedup_groups_project_status_idx" ON "lab_dedup_groups" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "lab_dedup_members_group_idx" ON "lab_dedup_members" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "lab_group_tags_group_idx" ON "lab_group_tags" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "lab_rejected_pairs_project_idx" ON "lab_rejected_pairs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "lab_tags_project_idx" ON "lab_tags" USING btree ("project_id");