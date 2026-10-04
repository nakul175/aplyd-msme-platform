-- The outcome table is append-only, in the same three ways the earlier ones are (no UPDATE, no DELETE, no INSERT that would
-- replace a row), and the order and the dates are enforced here as well as in the application, so no other way of writing to
-- the table can break them. A no_replace trigger names EVERY unique key of its table, not only the id: the two partial unique
-- indexes (one baseline, one review of each number) each have a trigger of their own below, because INSERT OR REPLACE resolves
-- a conflict on any key by deleting the other row without running DELETE triggers.

CREATE TRIGGER outcome_events_no_update BEFORE UPDATE ON outcome_events
BEGIN
  SELECT RAISE(ABORT, 'outcome_events is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER outcome_events_no_delete BEFORE DELETE ON outcome_events
BEGIN
  SELECT RAISE(ABORT, 'outcome_events is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER outcome_events_no_replace BEFORE INSERT ON outcome_events
WHEN NEW.id IS NOT NULL AND EXISTS (SELECT 1 FROM outcome_events WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'outcome_events is append-only');
END;
--> statement-breakpoint
-- The rules below are written not to overlap (the order in which SQLite runs triggers is not defined), so each refusal has one
-- message: a second baseline or review is "once" before anything else is looked at, and a figure or a review number that is not a
-- whole number is refused by its own rule alone (every other rule leaves it to that one).
-- The columns have integer affinity, which keeps 1.5 as 1.5, and a range check lets it through (1.5 is between 1 and 3); the
-- application only sends whole numbers, and this makes the table say so too.
CREATE TRIGGER outcome_events_value_is_whole BEFORE INSERT ON outcome_events
WHEN typeof(NEW.value) <> 'integer' OR typeof(COALESCE(NEW.review_no, 0)) <> 'integer'
BEGIN
  SELECT RAISE(ABORT, 'a figure and a review number are whole numbers');
END;
--> statement-breakpoint
CREATE TRIGGER outcome_events_one_baseline_only BEFORE INSERT ON outcome_events
WHEN typeof(NEW.value) = 'integer' AND typeof(COALESCE(NEW.review_no, 0)) = 'integer' AND NEW.kind = 'baseline' AND EXISTS (SELECT 1 FROM outcome_events WHERE engagement_id = NEW.engagement_id AND kind = 'baseline')
BEGIN
  SELECT RAISE(ABORT, 'a baseline is recorded once');
END;
--> statement-breakpoint
CREATE TRIGGER outcome_events_one_review_each BEFORE INSERT ON outcome_events
WHEN typeof(NEW.value) = 'integer' AND typeof(COALESCE(NEW.review_no, 0)) = 'integer' AND NEW.kind = 'review' AND EXISTS (SELECT 1 FROM outcome_events WHERE engagement_id = NEW.engagement_id AND kind = 'review' AND review_no = NEW.review_no)
BEGIN
  SELECT RAISE(ABORT, 'this review is recorded once');
END;
--> statement-breakpoint
-- The baseline is what things were before the work: it is taken before anything is accepted, not after.
CREATE TRIGGER outcome_events_baseline_before_acceptance BEFORE INSERT ON outcome_events
WHEN typeof(NEW.value) = 'integer' AND typeof(COALESCE(NEW.review_no, 0)) = 'integer' AND NEW.kind = 'baseline'
 AND NOT EXISTS (SELECT 1 FROM outcome_events WHERE engagement_id = NEW.engagement_id AND kind = 'baseline')
 AND EXISTS (SELECT 1 FROM engagement_events WHERE engagement_id = NEW.engagement_id AND kind = 'accepted')
BEGIN
  SELECT RAISE(ABORT, 'a baseline is recorded before anything is accepted');
END;
--> statement-breakpoint
-- A review looks back at work that was accepted, 30, 90 or 180 days after the first acceptance (the same numbers as
-- REVIEW_DAYS in the code; a test keeps them equal). The time compared is the one the application stamps on the event. If either
-- time cannot be read as a time the comparison has no answer, and the review is refused rather than let through.
CREATE TRIGGER outcome_events_review_needs_an_acceptance BEFORE INSERT ON outcome_events
WHEN typeof(NEW.value) = 'integer' AND typeof(COALESCE(NEW.review_no, 0)) = 'integer' AND NEW.kind = 'review'
 AND NOT EXISTS (SELECT 1 FROM outcome_events WHERE engagement_id = NEW.engagement_id AND kind = 'review' AND review_no = NEW.review_no)
 AND NOT EXISTS (SELECT 1 FROM engagement_events WHERE engagement_id = NEW.engagement_id AND kind = 'accepted')
BEGIN
  SELECT RAISE(ABORT, 'a review needs an accepted milestone');
END;
--> statement-breakpoint
CREATE TRIGGER outcome_events_review_is_due BEFORE INSERT ON outcome_events
WHEN typeof(NEW.value) = 'integer' AND typeof(COALESCE(NEW.review_no, 0)) = 'integer' AND NEW.kind = 'review'
 AND NOT EXISTS (SELECT 1 FROM outcome_events WHERE engagement_id = NEW.engagement_id AND kind = 'review' AND review_no = NEW.review_no)
 AND EXISTS (SELECT 1 FROM engagement_events WHERE engagement_id = NEW.engagement_id AND kind = 'accepted')
 AND COALESCE(julianday(NEW.at) >= julianday((SELECT at FROM engagement_events WHERE engagement_id = NEW.engagement_id AND kind = 'accepted' ORDER BY id LIMIT 1))
                                + CASE NEW.review_no WHEN 1 THEN 30 WHEN 2 THEN 90 WHEN 3 THEN 180 ELSE 0 END, 0) = 0
BEGIN
  SELECT RAISE(ABORT, 'this review is not due yet');
END;
