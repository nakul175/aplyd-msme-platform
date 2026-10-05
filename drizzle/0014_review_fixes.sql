-- Rules the independent reviews of slices 2 and 4 found were kept by the application but not by the database. Each is a trigger
-- because a table cannot be given a CHECK after it exists without rebuilding it, and applied migrations are not edited.
-- SQLite does not define the order triggers run in, so the WHEN clauses of the three revision triggers below (answers, no gaps,
-- limit) are mutually exclusive with each other and with factory_revisions_no_replace: no insert is refused by two of them, and a
-- test can name the one that refused it. The triggers further down (notes, numbers, dates, text) are not exclusive with the rules
-- of their own tables: see the comment above them.

-- A revision's answers are a JSON object. A row that could not be read back would make the company's description page fail for good.
CREATE TRIGGER factory_revisions_answers_are_an_object BEFORE INSERT ON factory_revisions
WHEN NOT EXISTS (SELECT 1 FROM factory_revisions WHERE id = NEW.id OR (company_id = NEW.company_id AND revision_no = NEW.revision_no))
 AND NOT (CASE WHEN typeof(NEW.answers) = 'text' AND json_valid(NEW.answers) THEN json_type(NEW.answers) = 'object' ELSE 0 END)
BEGIN
  SELECT RAISE(ABORT, 'the answers of a revision are a JSON object');
END;
--> statement-breakpoint
-- Revision numbers have no gaps: a revision is the one after the latest of its company.
CREATE TRIGGER factory_revisions_no_gaps BEFORE INSERT ON factory_revisions
WHEN NOT EXISTS (SELECT 1 FROM factory_revisions WHERE id = NEW.id OR (company_id = NEW.company_id AND revision_no = NEW.revision_no))
 AND (CASE WHEN typeof(NEW.answers) = 'text' AND json_valid(NEW.answers) THEN json_type(NEW.answers) = 'object' ELSE 0 END)
 AND NEW.revision_no <> COALESCE((SELECT MAX(revision_no) FROM factory_revisions WHERE company_id = NEW.company_id), 0) + 1
BEGIN
  SELECT RAISE(ABORT, 'a revision number follows the one before it');
END;
--> statement-breakpoint
-- A company may save at most 500 revisions (an assumption, not a measured figure). Rows cannot be deleted, so without a limit one
-- session could grow the table for ever, and the platform would carry the cost.
CREATE TRIGGER factory_revisions_limit BEFORE INSERT ON factory_revisions
WHEN NOT EXISTS (SELECT 1 FROM factory_revisions WHERE id = NEW.id OR (company_id = NEW.company_id AND revision_no = NEW.revision_no))
 AND (CASE WHEN typeof(NEW.answers) = 'text' AND json_valid(NEW.answers) THEN json_type(NEW.answers) = 'object' ELSE 0 END)
 AND NEW.revision_no = COALESCE((SELECT MAX(revision_no) FROM factory_revisions WHERE company_id = NEW.company_id), 0) + 1
 AND (SELECT COUNT(*) FROM factory_revisions WHERE company_id = NEW.company_id) >= 500
BEGIN
  SELECT RAISE(ABORT, 'a company has the most revisions it may have');
END;
--> statement-breakpoint
-- What a provider serves is fixed from its first listing on, listed or not (the review of slice 4 found a service could still be
-- added to a listed provider by a direct insert, which would put it in pools it was never listed for, with no record).
CREATE TRIGGER provider_services_closed_after_first_listing BEFORE INSERT ON provider_services
WHEN EXISTS (SELECT 1 FROM provider_events WHERE provider_id = NEW.provider_id)
 AND NOT (NEW.id IS NOT NULL AND EXISTS (SELECT 1 FROM provider_services WHERE id = NEW.id OR (provider_id = NEW.provider_id AND opportunity_id = NEW.opportunity_id AND cluster = NEW.cluster)))
BEGIN
  SELECT RAISE(ABORT, 'what a provider serves is fixed once it has been listed');
END;
--> statement-breakpoint
-- ---- What the application checks, the tables check too (the reviews of slices 3 to 5, and tests written for their findings).
-- Two things a CHECK does not do. A CHECK that comes out NULL passes, so `decision IN (...)` or `amount BETWEEN 1 AND n` on a column
-- that may be NULL lets a row with no value through. And a column with integer affinity keeps 1.5 as 1.5, which a range check on
-- whole numbers lets through. The handlers refuse all of it; these triggers make the tables say so too, for a second writer (a
-- script, a migration, a future module). A trigger below can apply to an insert that also breaks an order rule of the same table;
-- the insert is refused either way and which message answers is not defined. Each is tested on its own, with a row that breaks
-- nothing else.

-- A decision says accept, defer or reject. The table's shape check names the decision as IN (...), which a NULL passes, so a
-- decision with no decision was accepted and counted as the answer to an item when the sign-off looked for one.
CREATE TRIGGER assessment_events_decision_needs_a_value BEFORE INSERT ON assessment_events
WHEN NEW.kind = 'decision' AND NEW.decision IS NULL
BEGIN
  SELECT RAISE(ABORT, 'a decision is accept, defer or reject');
END;
--> statement-breakpoint
-- A note is at most 500 characters, as every handler says; the table now says so as well. Without it, a direct write could put any
-- amount of text in a column every read returns. SQLite's length() of text stops counting at the first NUL character (U+0000), so
-- a note of 'a', a NUL and a hundred thousand more characters would count as one; the second bound is on bytes (four a character
-- is the most UTF-8 takes), which counts past a NUL. A note that has a NUL in it but is short is still stored.
CREATE TRIGGER factory_revisions_note_is_short BEFORE INSERT ON factory_revisions
WHEN length(NEW.note) > 500 OR length(CAST(NEW.note AS BLOB)) > 2000
BEGIN
  SELECT RAISE(ABORT, 'a note is at most 500 characters');
END;
--> statement-breakpoint
CREATE TRIGGER assessment_events_note_is_short BEFORE INSERT ON assessment_events
WHEN length(NEW.note) > 500 OR length(CAST(NEW.note AS BLOB)) > 2000
BEGIN
  SELECT RAISE(ABORT, 'a note is at most 500 characters');
END;
--> statement-breakpoint
CREATE TRIGGER listing_terms_note_is_short BEFORE INSERT ON listing_terms
WHEN length(NEW.note) > 500 OR length(CAST(NEW.note AS BLOB)) > 2000
BEGIN
  SELECT RAISE(ABORT, 'a note is at most 500 characters');
END;
--> statement-breakpoint
CREATE TRIGGER provider_events_note_is_short BEFORE INSERT ON provider_events
WHEN length(NEW.note) > 500 OR length(CAST(NEW.note AS BLOB)) > 2000
BEGIN
  SELECT RAISE(ABORT, 'a note is at most 500 characters');
END;
--> statement-breakpoint
CREATE TRIGGER requirement_events_note_is_short BEFORE INSERT ON requirement_events
WHEN length(NEW.note) > 500 OR length(CAST(NEW.note AS BLOB)) > 2000
BEGIN
  SELECT RAISE(ABORT, 'a note is at most 500 characters');
END;
--> statement-breakpoint
CREATE TRIGGER engagement_events_note_is_short BEFORE INSERT ON engagement_events
WHEN length(NEW.note) > 500 OR length(CAST(NEW.note AS BLOB)) > 2000
BEGIN
  SELECT RAISE(ABORT, 'a note is at most 500 characters');
END;
--> statement-breakpoint
-- The listing fee is a whole number of rupees. The check on the table is "greater than zero", which 0.5 satisfies.
CREATE TRIGGER listing_terms_fee_is_whole BEFORE INSERT ON listing_terms
WHEN typeof(NEW.fee_inr) <> 'integer'
BEGIN
  SELECT RAISE(ABORT, 'a fee is a whole number of rupees');
END;
--> statement-breakpoint
-- An amount a milestone is paid is a whole number of rupees, and a payment has one. The shape check says `amount BETWEEN 1 AND n` for
-- a payment, which a NULL passes, and 1.5 satisfies.
CREATE TRIGGER engagement_events_amount_is_whole BEFORE INSERT ON engagement_events
WHEN NEW.amount_inr IS NOT NULL AND typeof(NEW.amount_inr) <> 'integer'
BEGIN
  SELECT RAISE(ABORT, 'an amount is a whole number of rupees');
END;
--> statement-breakpoint
CREATE TRIGGER engagement_events_payment_has_an_amount BEFORE INSERT ON engagement_events
WHEN NEW.kind = 'payment_recorded' AND NEW.amount_inr IS NULL
BEGIN
  SELECT RAISE(ABORT, 'a payment has an amount');
END;
--> statement-breakpoint
-- A milestone's place in the plan and its price are whole numbers; its date is a real one between the years 2000 and 2100 (the table
-- checks only the shape of the text: 9999-99-99 passes it, and SQLite's date() turns 2026-02-30 into 2026-03-02, so a date that
-- does not come back as itself is not one); its name and its test are not only blanks.
CREATE TRIGGER milestones_numbers_are_whole BEFORE INSERT ON milestones
WHEN typeof(NEW.seq) <> 'integer' OR typeof(NEW.agreed_inr) <> 'integer'
BEGIN
  SELECT RAISE(ABORT, 'a place in the plan and a price are whole numbers');
END;
--> statement-breakpoint
CREATE TRIGGER milestones_due_is_a_date BEFORE INSERT ON milestones
WHEN date(NEW.due_on) IS NOT NEW.due_on OR NEW.due_on NOT BETWEEN '2000-01-01' AND '2100-12-31'
BEGIN
  SELECT RAISE(ABORT, 'a due date is a real date between 2000 and 2100');
END;
--> statement-breakpoint
CREATE TRIGGER milestones_text_is_not_blank BEFORE INSERT ON milestones
WHEN length(trim(NEW.title, ' ' || char(9) || char(10) || char(11) || char(12) || char(13))) = 0
  OR length(trim(NEW.acceptance_test, ' ' || char(9) || char(10) || char(11) || char(12) || char(13))) = 0
BEGIN
  SELECT RAISE(ABORT, 'a milestone has a name and a test');
END;
--> statement-breakpoint
-- The rules of deliveries and of creating an engagement were meant to refuse an event by one rule only (so the message is the rule's
-- and a test can name it). The review of slice 5 found two overlaps: a 15th delivery while the 14th awaits a decision matched the
-- delivery limit and the "delivered once, or again after a rejection" rule, and an engagement for a withdrawn requirement with an
-- unlisted provider matched two rules. Both are recreated so each is left to one rule.
DROP TRIGGER engagement_events_delivery_limit;
--> statement-breakpoint
CREATE TRIGGER engagement_events_delivery_limit BEFORE INSERT ON engagement_events
WHEN NEW.kind = 'delivered'
 AND (SELECT COUNT(*) FROM engagement_events WHERE milestone_id = NEW.milestone_id AND kind = 'delivered') >= 14
 AND IFNULL((SELECT kind FROM engagement_events WHERE milestone_id = NEW.milestone_id ORDER BY id DESC LIMIT 1), 'rejected') = 'rejected'
 AND EXISTS (SELECT 1 FROM engagement_events WHERE engagement_id = NEW.engagement_id AND kind = 'plan_agreed')
 AND NOT EXISTS (SELECT 1 FROM engagement_events WHERE engagement_id = NEW.engagement_id AND kind = 'closed')
BEGIN
  SELECT RAISE(ABORT, 'too many deliveries of this milestone');
END;
--> statement-breakpoint
DROP TRIGGER engagements_needs_a_listed_provider;
--> statement-breakpoint
CREATE TRIGGER engagements_needs_a_listed_provider BEFORE INSERT ON engagements
WHEN (NOT EXISTS (
        SELECT 1 FROM requirements r JOIN provider_services s ON s.opportunity_id = r.opportunity_id AND s.cluster = r.cluster
        WHERE r.id = NEW.requirement_id AND s.provider_id = NEW.provider_id)
      OR IFNULL((SELECT kind FROM provider_events WHERE provider_id = NEW.provider_id ORDER BY id DESC LIMIT 1), 'unlist') <> 'list')
 AND EXISTS (SELECT 1 FROM requirements WHERE id = NEW.requirement_id AND company_id = NEW.company_id)
 AND NOT EXISTS (SELECT 1 FROM requirement_events WHERE requirement_id = NEW.requirement_id AND kind = 'withdraw')
BEGIN
  SELECT RAISE(ABORT, 'an engagement needs a listed provider that serves the requirement');
END;
