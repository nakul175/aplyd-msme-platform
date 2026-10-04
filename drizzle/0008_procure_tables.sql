CREATE TABLE `listing_terms` (
	`version` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text NOT NULL,
	`user_id` text NOT NULL,
	`fee_inr` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "listing_terms_fee_positive" CHECK("listing_terms"."fee_inr" > 0)
);
--> statement-breakpoint
CREATE TABLE `provider_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider_id` text NOT NULL,
	`at` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`terms_version` integer,
	`fee_inr` integer,
	`note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`terms_version`) REFERENCES `listing_terms`(`version`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "provider_events_shape" CHECK(("provider_events"."kind" = 'list' AND "provider_events"."terms_version" IS NOT NULL AND "provider_events"."fee_inr" IS NOT NULL) OR ("provider_events"."kind" = 'unlist' AND "provider_events"."terms_version" IS NULL AND "provider_events"."fee_inr" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `provider_events_provider` ON `provider_events` (`provider_id`);--> statement-breakpoint
CREATE TABLE `provider_services` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider_id` text NOT NULL,
	`opportunity_id` text NOT NULL,
	`cluster` text NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_services_unique` ON `provider_services` (`provider_id`,`opportunity_id`,`cluster`);--> statement-breakpoint
CREATE INDEX `provider_services_match` ON `provider_services` (`cluster`,`opportunity_id`);--> statement-breakpoint
CREATE TABLE `providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`is_synthetic` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `requirement_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`requirement_id` text NOT NULL,
	`company_id` text NOT NULL,
	`at` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requirement_id`,`company_id`) REFERENCES `requirements`(`id`,`company_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "requirement_events_kind" CHECK("requirement_events"."kind" = 'withdraw')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `requirement_events_one_withdrawal` ON `requirement_events` (`requirement_id`);--> statement-breakpoint
CREATE TABLE `requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`assessment_id` text NOT NULL,
	`opportunity_id` text NOT NULL,
	`cluster` text NOT NULL,
	`spec` text NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assessment_id`,`company_id`) REFERENCES `assessments`(`id`,`company_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "requirements_spec_json" CHECK(json_valid("requirements"."spec"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `requirements_one_per_item` ON `requirements` (`company_id`,`assessment_id`,`opportunity_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `requirements_id_company` ON `requirements` (`id`,`company_id`);--> statement-breakpoint
CREATE INDEX `requirements_company` ON `requirements` (`company_id`);--> statement-breakpoint
CREATE INDEX `requirements_pool` ON `requirements` (`cluster`,`opportunity_id`);