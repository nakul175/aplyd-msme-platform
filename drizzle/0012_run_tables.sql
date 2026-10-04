CREATE TABLE `outcome_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`engagement_id` text NOT NULL,
	`company_id` text NOT NULL,
	`at` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`review_no` integer,
	`value` integer NOT NULL,
	`verdict` text,
	`in_use` text,
	`note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`company_id`) REFERENCES `engagements`(`id`,`company_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "outcome_events_value" CHECK("outcome_events"."value" BETWEEN 0 AND 1000000000),
	CONSTRAINT "outcome_events_note" CHECK(length("outcome_events"."note") <= 500),
	CONSTRAINT "outcome_events_shape" CHECK(("outcome_events"."kind" = 'baseline' AND "outcome_events"."review_no" IS NULL AND "outcome_events"."verdict" IS NULL AND "outcome_events"."in_use" IS NULL)
       OR ("outcome_events"."kind" = 'review' AND "outcome_events"."review_no" BETWEEN 1 AND 3 AND "outcome_events"."verdict" IN ('met', 'partly', 'not_met') AND "outcome_events"."in_use" IN ('yes', 'no')))
);
--> statement-breakpoint
CREATE INDEX `outcome_events_engagement` ON `outcome_events` (`engagement_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `outcome_events_one_baseline` ON `outcome_events` (`engagement_id`) WHERE "outcome_events"."kind" = 'baseline';--> statement-breakpoint
CREATE UNIQUE INDEX `outcome_events_one_review` ON `outcome_events` (`engagement_id`,`review_no`) WHERE "outcome_events"."kind" = 'review';