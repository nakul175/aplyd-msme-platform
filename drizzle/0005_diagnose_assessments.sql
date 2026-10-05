CREATE TABLE `assessment_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`assessment_id` text NOT NULL,
	`company_id` text NOT NULL,
	`at` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`opportunity_id` text,
	`decision` text,
	`note` text DEFAULT '' NOT NULL,
	`digest` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assessment_id`,`company_id`) REFERENCES `assessments`(`id`,`company_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "assessment_events_shape" CHECK(("assessment_events"."kind" = 'decision' AND "assessment_events"."opportunity_id" IS NOT NULL AND "assessment_events"."decision" IN ('accept', 'defer', 'reject') AND "assessment_events"."digest" IS NULL) OR ("assessment_events"."kind" = 'signoff' AND "assessment_events"."opportunity_id" IS NULL AND "assessment_events"."decision" IS NULL AND "assessment_events"."digest" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_events_one_signoff` ON `assessment_events` (`assessment_id`) WHERE "assessment_events"."kind" = 'signoff';--> statement-breakpoint
CREATE INDEX `assessment_events_assessment` ON `assessment_events` (`assessment_id`);--> statement-breakpoint
CREATE TABLE `assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`factory_revision_no` integer NOT NULL,
	`library_version` integer NOT NULL,
	`engine_version` integer NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL,
	`result` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`,`factory_revision_no`) REFERENCES `factory_revisions`(`company_id`,`revision_no`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "assessments_result_json" CHECK(json_valid("assessments"."result"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessments_inputs` ON `assessments` (`company_id`,`factory_revision_no`,`library_version`,`engine_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `assessments_id_company` ON `assessments` (`id`,`company_id`);--> statement-breakpoint
CREATE INDEX `assessments_company` ON `assessments` (`company_id`);