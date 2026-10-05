-- Fixes found by independent review of slice 3 (docs: modules/diagnose/VALIDATION.md). 0005 and 0006 are not edited: they
-- may already have been applied, so the fixes are new triggers.
--
-- H1. assessment_events_no_replace (0006) tests only the id. A second sign-off gets a fresh id, so INSERT OR REPLACE passed
-- it, the partial unique index assessment_events_one_signoff then resolved the conflict by DELETING the first sign-off, and
-- DELETE triggers do not fire for that (recursive_triggers is off). A trigger that refuses any second sign-off closes it,
-- for a plain insert and for a replace alike. Because triggers run before the unique index is checked, the message is now
-- this one and not a UNIQUE error. What this cannot stop: DROP TRIGGER, DROP TABLE and ALTER TABLE.
CREATE TRIGGER assessment_events_one_signoff_only BEFORE INSERT ON assessment_events
WHEN NEW.kind = 'signoff'
 AND EXISTS (SELECT 1 FROM assessment_events WHERE assessment_id = NEW.assessment_id AND kind = 'signoff')
BEGIN
  SELECT RAISE(ABORT, 'the assessment is already signed off');
END;
--> statement-breakpoint
-- M2. Every decision is a row that can never be removed and is returned on every read, so the number an owner can append to
-- one assessment is bounded. 200 is far above any real use (an assessment has at most eight ideas); it is an assumption,
-- and the same number is MAX_DECISIONS in modules/diagnose/src/db/assessments.ts, which a test keeps equal to this one.
CREATE TRIGGER assessment_events_decision_limit BEFORE INSERT ON assessment_events
WHEN NEW.kind = 'decision'
 AND (SELECT COUNT(*) FROM assessment_events WHERE assessment_id = NEW.assessment_id AND kind = 'decision') >= 200
BEGIN
  SELECT RAISE(ABORT, 'too many decisions on this assessment');
END;
--> statement-breakpoint
-- L2. 0006's "every item needs a decision" is true of an assessment with no items, so an empty assessment could be signed
-- off. Nothing was decided, so there is nothing to sign.
CREATE TRIGGER assessment_events_signoff_needs_an_item BEFORE INSERT ON assessment_events
WHEN NEW.kind = 'signoff'
 AND NOT EXISTS (
   SELECT 1 FROM assessments a, json_each(a.result, '$.items') j
   WHERE a.id = NEW.assessment_id
 )
BEGIN
  SELECT RAISE(ABORT, 'an assessment with no items cannot be signed off');
END;
