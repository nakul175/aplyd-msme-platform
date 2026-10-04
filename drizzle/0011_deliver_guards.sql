-- The deliver tables are append-only, in the same three ways the earlier ones are (no UPDATE, no DELETE, no INSERT that would
-- replace a row), and the order in which things may happen to an engagement is enforced here as well as in the application, so no
-- other way of writing to the tables can break it. A no_replace trigger names EVERY unique key of its table, not only the id
-- (INSERT OR REPLACE resolves a conflict on any of them by deleting the other row without running DELETE triggers); a platform
-- test reads the keys from the migrated database and fails if a key has no trigger that looks at it.

CREATE TRIGGER engagements_no_update BEFORE UPDATE ON engagements
BEGIN
  SELECT RAISE(ABORT, 'engagements is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER engagements_no_delete BEFORE DELETE ON engagements
BEGIN
  SELECT RAISE(ABORT, 'engagements is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER engagements_no_replace BEFORE INSERT ON engagements
WHEN EXISTS (SELECT 1 FROM engagements WHERE id = NEW.id OR requirement_id = NEW.requirement_id OR (id = NEW.id AND company_id = NEW.company_id))
BEGIN
  SELECT RAISE(ABORT, 'engagements is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER milestones_no_update BEFORE UPDATE ON milestones
BEGIN
  SELECT RAISE(ABORT, 'milestones is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER milestones_no_delete BEFORE DELETE ON milestones
BEGIN
  SELECT RAISE(ABORT, 'milestones is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER milestones_no_replace BEFORE INSERT ON milestones
WHEN EXISTS (SELECT 1 FROM milestones WHERE id = NEW.id OR (engagement_id = NEW.engagement_id AND seq = NEW.seq) OR (id = NEW.id AND engagement_id = NEW.engagement_id))
BEGIN
  SELECT RAISE(ABORT, 'milestones is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER engagement_events_no_update BEFORE UPDATE ON engagement_events
BEGIN
  SELECT RAISE(ABORT, 'engagement_events is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER engagement_events_no_delete BEFORE DELETE ON engagement_events
BEGIN
  SELECT RAISE(ABORT, 'engagement_events is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER engagement_events_no_replace BEFORE INSERT ON engagement_events
WHEN NEW.id IS NOT NULL AND EXISTS (SELECT 1 FROM engagement_events WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'engagement_events is append-only');
END;
--> statement-breakpoint
-- An engagement needs a requirement of the company's that has not been withdrawn.
CREATE TRIGGER engagements_needs_an_open_requirement BEFORE INSERT ON engagements
WHEN NOT EXISTS (SELECT 1 FROM requirements WHERE id = NEW.requirement_id AND company_id = NEW.company_id)
  OR EXISTS (SELECT 1 FROM requirement_events WHERE requirement_id = NEW.requirement_id AND kind = 'withdraw')
BEGIN
  SELECT RAISE(ABORT, 'an engagement needs an open requirement');
END;
--> statement-breakpoint
-- It needs a provider that is listed now and serves that requirement's idea in its cluster. A provider unlisted later does not
-- end an engagement already made.
CREATE TRIGGER engagements_needs_a_listed_provider BEFORE INSERT ON engagements
WHEN NOT EXISTS (
       SELECT 1 FROM requirements r JOIN provider_services s ON s.opportunity_id = r.opportunity_id AND s.cluster = r.cluster
       WHERE r.id = NEW.requirement_id AND s.provider_id = NEW.provider_id)
  OR IFNULL((SELECT kind FROM provider_events WHERE provider_id = NEW.provider_id ORDER BY id DESC LIMIT 1), 'unlist') <> 'list'
BEGIN
  SELECT RAISE(ABORT, 'an engagement needs a listed provider that serves the requirement');
END;
--> statement-breakpoint
-- Once an owner has chosen a provider the requirement is not withdrawn: the engagement is closed instead.
CREATE TRIGGER requirement_events_not_after_engagement BEFORE INSERT ON requirement_events
WHEN EXISTS (SELECT 1 FROM engagements WHERE requirement_id = NEW.requirement_id)
BEGIN
  SELECT RAISE(ABORT, 'an engaged requirement cannot be withdrawn');
END;
--> statement-breakpoint
-- The plan is built before it is agreed, and fixed after.
CREATE TRIGGER milestones_plan_is_open BEFORE INSERT ON milestones
WHEN EXISTS (SELECT 1 FROM engagement_events WHERE engagement_id = NEW.engagement_id AND kind IN ('plan_agreed', 'closed'))
BEGIN
  SELECT RAISE(ABORT, 'the plan is agreed or the engagement is closed, so a milestone cannot be added');
END;
--> statement-breakpoint
-- At most 12 milestones in a plan (an assumption; the same number is MAX_MILESTONES in the code and in a CHECK on seq).
CREATE TRIGGER milestones_limit BEFORE INSERT ON milestones
WHEN (SELECT COUNT(*) FROM milestones WHERE engagement_id = NEW.engagement_id) >= 12
BEGIN
  SELECT RAISE(ABORT, 'too many milestones in this plan');
END;
--> statement-breakpoint
-- After the engagement is closed nothing more is recorded on it, and it is closed once.
CREATE TRIGGER engagement_events_closed_is_final BEFORE INSERT ON engagement_events
WHEN NEW.kind <> 'closed' AND EXISTS (SELECT 1 FROM engagement_events WHERE engagement_id = NEW.engagement_id AND kind = 'closed')
BEGIN
  SELECT RAISE(ABORT, 'the engagement is closed');
END;
--> statement-breakpoint
CREATE TRIGGER engagement_events_one_close BEFORE INSERT ON engagement_events
WHEN NEW.kind = 'closed' AND EXISTS (SELECT 1 FROM engagement_events WHERE engagement_id = NEW.engagement_id AND kind = 'closed')
BEGIN
  SELECT RAISE(ABORT, 'the engagement is already closed');
END;
--> statement-breakpoint
-- The plan is agreed once, and only when it has a milestone.
CREATE TRIGGER engagement_events_one_plan_agreement BEFORE INSERT ON engagement_events
WHEN NEW.kind = 'plan_agreed' AND EXISTS (SELECT 1 FROM engagement_events WHERE engagement_id = NEW.engagement_id AND kind = 'plan_agreed')
 AND NOT EXISTS (SELECT 1 FROM engagement_events WHERE engagement_id = NEW.engagement_id AND kind = 'closed')
BEGIN
  SELECT RAISE(ABORT, 'the plan is already agreed');
END;
--> statement-breakpoint
CREATE TRIGGER engagement_events_plan_needs_a_milestone BEFORE INSERT ON engagement_events
WHEN NEW.kind = 'plan_agreed' AND NOT EXISTS (SELECT 1 FROM milestones WHERE engagement_id = NEW.engagement_id)
 AND NOT EXISTS (SELECT 1 FROM engagement_events WHERE engagement_id = NEW.engagement_id AND kind = 'closed')
BEGIN
  SELECT RAISE(ABORT, 'a plan needs at least one milestone');
END;
--> statement-breakpoint
-- Nothing is delivered, accepted, rejected or paid before the owner has agreed the plan.
CREATE TRIGGER engagement_events_work_needs_an_agreed_plan BEFORE INSERT ON engagement_events
WHEN NEW.kind IN ('delivered', 'accepted', 'rejected', 'payment_recorded')
 AND NOT EXISTS (SELECT 1 FROM engagement_events WHERE engagement_id = NEW.engagement_id AND kind = 'plan_agreed')
 AND NOT EXISTS (SELECT 1 FROM engagement_events WHERE engagement_id = NEW.engagement_id AND kind = 'closed')
BEGIN
  SELECT RAISE(ABORT, 'the plan is not agreed yet');
END;
--> statement-breakpoint
-- Where several rules could refuse the same event, one answers: closed first, then 'plan not agreed', then the others (the order
-- in which SQLite runs triggers is not defined, so the rules are written not to overlap). A milestone goes: delivered, then accepted or rejected; a rejected one can be delivered again; an accepted one can be paid, once.
CREATE TRIGGER engagement_events_delivery_follows_nothing_or_a_rejection BEFORE INSERT ON engagement_events
WHEN NEW.kind = 'delivered'
 AND IFNULL((SELECT kind FROM engagement_events WHERE milestone_id = NEW.milestone_id ORDER BY id DESC LIMIT 1), 'rejected') <> 'rejected'
 AND EXISTS (SELECT 1 FROM engagement_events WHERE engagement_id = NEW.engagement_id AND kind = 'plan_agreed')
 AND NOT EXISTS (SELECT 1 FROM engagement_events WHERE engagement_id = NEW.engagement_id AND kind = 'closed')
BEGIN
  SELECT RAISE(ABORT, 'a milestone is delivered once, or again after it was rejected');
END;
--> statement-breakpoint
CREATE TRIGGER engagement_events_decision_needs_a_delivery BEFORE INSERT ON engagement_events
WHEN NEW.kind IN ('accepted', 'rejected')
 AND IFNULL((SELECT kind FROM engagement_events WHERE milestone_id = NEW.milestone_id ORDER BY id DESC LIMIT 1), 'none') <> 'delivered'
 AND EXISTS (SELECT 1 FROM engagement_events WHERE engagement_id = NEW.engagement_id AND kind = 'plan_agreed')
 AND NOT EXISTS (SELECT 1 FROM engagement_events WHERE engagement_id = NEW.engagement_id AND kind = 'closed')
BEGIN
  SELECT RAISE(ABORT, 'only a delivered milestone can be accepted or rejected');
END;
--> statement-breakpoint
CREATE TRIGGER engagement_events_payment_needs_an_acceptance BEFORE INSERT ON engagement_events
WHEN NEW.kind = 'payment_recorded'
 AND IFNULL((SELECT kind FROM engagement_events WHERE milestone_id = NEW.milestone_id ORDER BY id DESC LIMIT 1), 'none') <> 'accepted'
 AND EXISTS (SELECT 1 FROM engagement_events WHERE engagement_id = NEW.engagement_id AND kind = 'plan_agreed')
 AND NOT EXISTS (SELECT 1 FROM engagement_events WHERE engagement_id = NEW.engagement_id AND kind = 'closed')
BEGIN
  SELECT RAISE(ABORT, 'a payment is recorded once, for an accepted milestone');
END;
--> statement-breakpoint
-- A milestone is delivered at most 14 times (an assumption; the same number is MAX_DELIVERIES in the code). Without a cap a
-- delivery and a rejection could be repeated for ever, each adding two rows nobody can remove and every read returns. Each
-- delivery is followed by at most one decision, and there is one payment, so a milestone holds at most 29 events.
CREATE TRIGGER engagement_events_delivery_limit BEFORE INSERT ON engagement_events
WHEN NEW.kind = 'delivered'
 AND (SELECT COUNT(*) FROM engagement_events WHERE milestone_id = NEW.milestone_id AND kind = 'delivered') >= 14
 AND EXISTS (SELECT 1 FROM engagement_events WHERE engagement_id = NEW.engagement_id AND kind = 'plan_agreed')
 AND NOT EXISTS (SELECT 1 FROM engagement_events WHERE engagement_id = NEW.engagement_id AND kind = 'closed')
BEGIN
  SELECT RAISE(ABORT, 'too many deliveries of this milestone');
END;
