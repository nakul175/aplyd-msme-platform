-- factory_revisions is append-only, in the same three ways audit_events is (0001, 0002): no UPDATE, no DELETE, and no
-- INSERT that would replace a row. REPLACE deletes a conflicting row without firing DELETE triggers, and here a row
-- conflicts on its id AND on (company_id, revision_no), so both are checked.
CREATE TRIGGER factory_revisions_no_update BEFORE UPDATE ON factory_revisions
BEGIN
  SELECT RAISE(ABORT, 'factory_revisions is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER factory_revisions_no_delete BEFORE DELETE ON factory_revisions
BEGIN
  SELECT RAISE(ABORT, 'factory_revisions is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER factory_revisions_no_replace BEFORE INSERT ON factory_revisions
WHEN EXISTS (SELECT 1 FROM factory_revisions WHERE id = NEW.id OR (company_id = NEW.company_id AND revision_no = NEW.revision_no))
BEGIN
  SELECT RAISE(ABORT, 'factory_revisions is append-only');
END;
