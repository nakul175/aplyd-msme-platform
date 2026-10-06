-- Migration 0015 (run module). Two things, both appended: nothing here edits or drops an earlier table or trigger.
-- 1. The starting number of an engagement (a baseline in outcome_events) is taken only after the plan is agreed and while the engagement
--    is open (FND-253). Before this migration the table took a baseline on a closed engagement and on one with no agreed plan; the
--    application refused neither. Two new triggers refuse them, written not to overlap with the six of 0013: each needs the figure to be
--    a whole number, no baseline yet and nothing accepted (those are answered by 0013's own triggers first).
-- 2. A correction of a number the owner recorded (BR-RUN-09): a new append-only table, outcome_corrections. A correction names the row of
--    outcome_events it corrects, which stays as it was; the latest correction of a row is its current value.
-- The drizzle snapshot of this migration also holds outcome_events' shape CHECK as migration 0012 has it (with IS NOT NULL); the
-- snapshots of 0012 to 0014 hold an older text of that CHECK, so drizzle-kit generated a rebuild of outcome_events here. The rebuild was
-- removed by hand: the table in the database already has that CHECK, and a rebuild would drop its triggers.
CREATE TABLE `outcome_corrections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`outcome_id` integer NOT NULL,
	`engagement_id` text NOT NULL,
	`company_id` text NOT NULL,
	`at` text NOT NULL,
	`user_id` text NOT NULL,
	`value` integer NOT NULL,
	`reason` text NOT NULL,
	FOREIGN KEY (`outcome_id`) REFERENCES `outcome_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`company_id`) REFERENCES `engagements`(`id`,`company_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "outcome_corrections_value" CHECK("outcome_corrections"."value" BETWEEN 0 AND 1000000000),
	CONSTRAINT "outcome_corrections_reason" CHECK(length("outcome_corrections"."reason") BETWEEN 1 AND 500 AND length(CAST("outcome_corrections"."reason" AS BLOB)) <= 2000)
);
--> statement-breakpoint
CREATE INDEX `outcome_corrections_engagement` ON `outcome_corrections` (`engagement_id`);
--> statement-breakpoint
CREATE TRIGGER outcome_events_baseline_not_after_close BEFORE INSERT ON outcome_events
WHEN typeof(NEW.value) = 'integer' AND typeof(COALESCE(NEW.review_no, 0)) = 'integer' AND NEW.kind = 'baseline'
 AND NOT EXISTS (SELECT 1 FROM outcome_events WHERE engagement_id = NEW.engagement_id AND kind = 'baseline')
 AND NOT EXISTS (SELECT 1 FROM engagement_events WHERE engagement_id = NEW.engagement_id AND kind = 'accepted')
 AND EXISTS (SELECT 1 FROM engagement_events WHERE engagement_id = NEW.engagement_id AND kind = 'closed')
BEGIN
  SELECT RAISE(ABORT, 'a baseline is not taken on a closed engagement');
END;
--> statement-breakpoint
CREATE TRIGGER outcome_events_baseline_needs_an_agreed_plan BEFORE INSERT ON outcome_events
WHEN typeof(NEW.value) = 'integer' AND typeof(COALESCE(NEW.review_no, 0)) = 'integer' AND NEW.kind = 'baseline'
 AND NOT EXISTS (SELECT 1 FROM outcome_events WHERE engagement_id = NEW.engagement_id AND kind = 'baseline')
 AND NOT EXISTS (SELECT 1 FROM engagement_events WHERE engagement_id = NEW.engagement_id AND kind = 'accepted')
 AND NOT EXISTS (SELECT 1 FROM engagement_events WHERE engagement_id = NEW.engagement_id AND kind = 'closed')
 AND NOT EXISTS (SELECT 1 FROM engagement_events WHERE engagement_id = NEW.engagement_id AND kind = 'plan_agreed')
BEGIN
  SELECT RAISE(ABORT, 'a baseline needs an agreed plan');
END;
--> statement-breakpoint
-- outcome_corrections is append-only in the same three ways as outcome_events. Its only unique key is the id.
CREATE TRIGGER outcome_corrections_no_update BEFORE UPDATE ON outcome_corrections
BEGIN
  SELECT RAISE(ABORT, 'outcome_corrections is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER outcome_corrections_no_delete BEFORE DELETE ON outcome_corrections
BEGIN
  SELECT RAISE(ABORT, 'outcome_corrections is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER outcome_corrections_no_replace BEFORE INSERT ON outcome_corrections
WHEN NEW.id IS NOT NULL AND EXISTS (SELECT 1 FROM outcome_corrections WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'outcome_corrections is append-only');
END;
--> statement-breakpoint
-- The figure and the row it names are whole numbers (the columns keep 1.5 as 1.5, and the range CHECK lets it through). The other rule
-- below leaves such a row to this one, so one rule answers.
CREATE TRIGGER outcome_corrections_value_is_whole BEFORE INSERT ON outcome_corrections
WHEN typeof(NEW.value) <> 'integer' OR typeof(NEW.outcome_id) <> 'integer'
BEGIN
  SELECT RAISE(ABORT, 'a corrected figure is a whole number');
END;
--> statement-breakpoint
-- A correction names a number recorded for the same engagement of the same company: never one of another engagement or company.
CREATE TRIGGER outcome_corrections_names_an_outcome BEFORE INSERT ON outcome_corrections
WHEN typeof(NEW.value) = 'integer' AND typeof(NEW.outcome_id) = 'integer'
 AND NOT EXISTS (SELECT 1 FROM outcome_events WHERE id = NEW.outcome_id AND engagement_id = NEW.engagement_id AND company_id = NEW.company_id)
BEGIN
  SELECT RAISE(ABORT, 'a correction names a number recorded for the same engagement');
END;