CREATE TABLE `factory_revisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` text NOT NULL,
	`revision_no` integer NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL,
	`confirmed` integer DEFAULT 0 NOT NULL,
	`questionnaire_version` integer NOT NULL,
	`answers` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "factory_revisions_confirmed_bool" CHECK("factory_revisions"."confirmed" IN (0, 1)),
	CONSTRAINT "factory_revisions_revision_positive" CHECK("factory_revisions"."revision_no" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `factory_revisions_company_revision` ON `factory_revisions` (`company_id`,`revision_no`);--> statement-breakpoint
CREATE INDEX `factory_revisions_company` ON `factory_revisions` (`company_id`);