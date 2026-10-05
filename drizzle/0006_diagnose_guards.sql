-- assessments and assessment_events are append-only, in the same three ways audit_events and factory_revisions are
-- (no UPDATE, no DELETE, no INSERT that would replace a row), and the rules about decisions and sign-off are enforced
-- here as well as in the application, so no other way of writing to the tables can break them.

CREATE TRIGGER assessments_no_update BEFORE UPDATE ON assessments
BEGIN
  SELECT RAISE(ABORT, 'assessments is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER assessments_no_delete BEFORE DELETE ON assessments
BEGIN
  SELECT RAISE(ABORT, 'assessments is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER assessments_no_replace BEFORE INSERT ON assessments
WHEN EXISTS (
  SELECT 1 FROM assessments
  WHERE id = NEW.id
     OR (company_id = NEW.company_id AND factory_revision_no = NEW.factory_revision_no AND library_version = NEW.library_version AND engine_version = NEW.engine_version)
)
BEGIN
  SELECT RAISE(ABORT, 'assessments is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER assessment_events_no_update BEFORE UPDATE ON assessment_events
BEGIN
  SELECT RAISE(ABORT, 'assessment_events is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER assessment_events_no_delete BEFORE DELETE ON assessment_events
BEGIN
  SELECT RAISE(ABORT, 'assessment_events is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER assessment_events_no_replace BEFORE INSERT ON assessment_events
WHEN EXISTS (SELECT 1 FROM assessment_events WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'assessment_events is append-only');
END;
--> statement-breakpoint
-- An assessment can only be made from a version of the description that the owner confirmed as accurate.
CREATE TRIGGER assessments_needs_confirmed_description BEFORE INSERT ON assessments
WHEN NOT EXISTS (SELECT 1 FROM factory_revisions WHERE company_id = NEW.company_id AND revision_no = NEW.factory_revision_no AND confirmed = 1)
BEGIN
  SELECT RAISE(ABORT, 'an assessment needs a confirmed description');
END;
--> statement-breakpoint
-- A decision must name an item that is in the assessment.
CREATE TRIGGER assessment_events_decision_names_an_item BEFORE INSERT ON assessment_events
WHEN NEW.kind = 'decision'
 AND NOT EXISTS (
   SELECT 1 FROM assessments a, json_each(a.result, '$.items') j
   WHERE a.id = NEW.assessment_id AND json_extract(j.value, '$.opportunityId') = NEW.opportunity_id
 )
BEGIN
  SELECT RAISE(ABORT, 'a decision must name an item in the assessment');
END;
--> statement-breakpoint
-- After the sign-off the decisions cannot change.
CREATE TRIGGER assessment_events_signed_off_is_final BEFORE INSERT ON assessment_events
WHEN NEW.kind = 'decision'
 AND EXISTS (SELECT 1 FROM assessment_events WHERE assessment_id = NEW.assessment_id AND kind = 'signoff')
BEGIN
  SELECT RAISE(ABORT, 'the assessment is signed off');
END;
--> statement-breakpoint
-- The sign-off needs a decision on every item.
CREATE TRIGGER assessment_events_signoff_needs_every_decision BEFORE INSERT ON assessment_events
WHEN NEW.kind = 'signoff'
 AND EXISTS (
   SELECT 1 FROM assessments a, json_each(a.result, '$.items') j
   WHERE a.id = NEW.assessment_id
     AND NOT EXISTS (
       SELECT 1 FROM assessment_events d
       WHERE d.assessment_id = a.id AND d.kind = 'decision' AND d.opportunity_id = json_extract(j.value, '$.opportunityId')
     )
 )
BEGIN
  SELECT RAISE(ABORT, 'every item needs a decision before the sign-off');
END;
