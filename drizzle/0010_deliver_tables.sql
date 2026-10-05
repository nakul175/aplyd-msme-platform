CREATE TABLE `engagement_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`engagement_id` text NOT NULL,
	`company_id` text NOT NULL,
	`at` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`milestone_id` text,
	`amount_inr` integer,
	`note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`company_id`) REFERENCES `engagements`(`id`,`company_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`milestone_id`,`engagement_id`) REFERENCES `milestones`(`id`,`engagement_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "engagement_events_shape" CHECK(("engagement_events"."kind" IN ('plan_agreed', 'closed') AND "engagement_events"."milestone_id" IS NULL AND "engagement_events"."amount_inr" IS NULL)
       OR ("engagement_events"."kind" IN ('delivered', 'accepted', 'rejected') AND "engagement_events"."milestone_id" IS NOT NULL AND "engagement_events"."amount_inr" IS NULL)
       OR ("engagement_events"."kind" = 'payment_recorded' AND "engagement_events"."milestone_id" IS NOT NULL AND "engagement_events"."amount_inr" BETWEEN 1 AND 100000000))
);
--> statement-breakpoint
CREATE INDEX `engagement_events_engagement` ON `engagement_events` (`engagement_id`);--> statement-breakpoint
CREATE INDEX `engagement_events_milestone` ON `engagement_events` (`milestone_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `engagement_events_one_agreement` ON `engagement_events` (`engagement_id`) WHERE "engagement_events"."kind" = 'plan_agreed';--> statement-breakpoint
CREATE UNIQUE INDEX `engagement_events_one_close` ON `engagement_events` (`engagement_id`) WHERE "engagement_events"."kind" = 'closed';--> statement-breakpoint
CREATE UNIQUE INDEX `engagement_events_one_payment` ON `engagement_events` (`milestone_id`) WHERE "engagement_events"."kind" = 'payment_recorded';--> statement-breakpoint
CREATE TABLE `engagements` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`requirement_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requirement_id`,`company_id`) REFERENCES `requirements`(`id`,`company_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `engagements_one_per_requirement` ON `engagements` (`requirement_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `engagements_id_company` ON `engagements` (`id`,`company_id`);--> statement-breakpoint
CREATE INDEX `engagements_company` ON `engagements` (`company_id`);--> statement-breakpoint
CREATE TABLE `milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`company_id` text NOT NULL,
	`seq` integer NOT NULL,
	`title` text NOT NULL,
	`acceptance_test` text NOT NULL,
	`due_on` text NOT NULL,
	`agreed_inr` integer NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`company_id`) REFERENCES `engagements`(`id`,`company_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "milestones_seq" CHECK("milestones"."seq" BETWEEN 1 AND 12),
	CONSTRAINT "milestones_title" CHECK(length("milestones"."title") BETWEEN 1 AND 120),
	CONSTRAINT "milestones_test" CHECK(length("milestones"."acceptance_test") BETWEEN 1 AND 500),
	CONSTRAINT "milestones_due" CHECK("milestones"."due_on" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "milestones_agreed" CHECK("milestones"."agreed_inr" BETWEEN 1 AND 100000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `milestones_order` ON `milestones` (`engagement_id`,`seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `milestones_id_engagement` ON `milestones` (`id`,`engagement_id`);--> statement-breakpoint
CREATE INDEX `milestones_company` ON `milestones` (`company_id`);