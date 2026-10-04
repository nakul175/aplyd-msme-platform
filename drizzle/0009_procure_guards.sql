-- The procure tables are append-only, in the same three ways the earlier ones are (no UPDATE, no DELETE, no INSERT that would
-- replace a row), and the rules about what may be inserted are enforced here as well as in the application, so no other way of
-- writing to the tables can break them.

CREATE TRIGGER requirements_no_update BEFORE UPDATE ON requirements
BEGIN
  SELECT RAISE(ABORT, 'requirements is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER requirements_no_delete BEFORE DELETE ON requirements
BEGIN
  SELECT RAISE(ABORT, 'requirements is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER requirements_no_replace BEFORE INSERT ON requirements
WHEN NEW.id IS NOT NULL AND EXISTS (SELECT 1 FROM requirements WHERE id = NEW.id OR (company_id = NEW.company_id AND assessment_id = NEW.assessment_id AND opportunity_id = NEW.opportunity_id))
BEGIN
  SELECT RAISE(ABORT, 'requirements is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER requirement_events_no_update BEFORE UPDATE ON requirement_events
BEGIN
  SELECT RAISE(ABORT, 'requirement_events is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER requirement_events_no_delete BEFORE DELETE ON requirement_events
BEGIN
  SELECT RAISE(ABORT, 'requirement_events is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER requirement_events_no_replace BEFORE INSERT ON requirement_events
WHEN NEW.id IS NOT NULL AND EXISTS (SELECT 1 FROM requirement_events WHERE id = NEW.id OR requirement_id = NEW.requirement_id)
BEGIN
  SELECT RAISE(ABORT, 'requirement_events is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER providers_no_update BEFORE UPDATE ON providers
BEGIN
  SELECT RAISE(ABORT, 'providers is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER providers_no_delete BEFORE DELETE ON providers
BEGIN
  SELECT RAISE(ABORT, 'providers is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER providers_no_replace BEFORE INSERT ON providers
WHEN NEW.id IS NOT NULL AND EXISTS (SELECT 1 FROM providers WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'providers is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER provider_services_no_update BEFORE UPDATE ON provider_services
BEGIN
  SELECT RAISE(ABORT, 'provider_services is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER provider_services_no_delete BEFORE DELETE ON provider_services
BEGIN
  SELECT RAISE(ABORT, 'provider_services is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER provider_services_no_replace BEFORE INSERT ON provider_services
WHEN NEW.id IS NOT NULL AND EXISTS (SELECT 1 FROM provider_services WHERE id = NEW.id OR (provider_id = NEW.provider_id AND opportunity_id = NEW.opportunity_id AND cluster = NEW.cluster))
BEGIN
  SELECT RAISE(ABORT, 'provider_services is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER provider_events_no_update BEFORE UPDATE ON provider_events
BEGIN
  SELECT RAISE(ABORT, 'provider_events is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER provider_events_no_delete BEFORE DELETE ON provider_events
BEGIN
  SELECT RAISE(ABORT, 'provider_events is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER provider_events_no_replace BEFORE INSERT ON provider_events
WHEN NEW.id IS NOT NULL AND EXISTS (SELECT 1 FROM provider_events WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'provider_events is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER listing_terms_no_update BEFORE UPDATE ON listing_terms
BEGIN
  SELECT RAISE(ABORT, 'listing_terms is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER listing_terms_no_delete BEFORE DELETE ON listing_terms
BEGIN
  SELECT RAISE(ABORT, 'listing_terms is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER listing_terms_no_replace BEFORE INSERT ON listing_terms
WHEN NEW.version IS NOT NULL AND EXISTS (SELECT 1 FROM listing_terms WHERE version = NEW.version)
BEGIN
  SELECT RAISE(ABORT, 'listing_terms is append-only');
END;
--> statement-breakpoint
-- A requirement is made from an assessment the owner signed off.
CREATE TRIGGER requirements_needs_signed_off_assessment BEFORE INSERT ON requirements
WHEN NOT EXISTS (SELECT 1 FROM assessment_events WHERE assessment_id = NEW.assessment_id AND company_id = NEW.company_id AND kind = 'signoff')
BEGIN
  SELECT RAISE(ABORT, 'a requirement needs a signed-off assessment');
END;
--> statement-breakpoint
-- ...and only for an item the owner accepted. After the sign-off no decision can be added, so the latest one is final.
CREATE TRIGGER requirements_needs_accepted_item BEFORE INSERT ON requirements
WHEN COALESCE(
  (SELECT decision FROM assessment_events WHERE assessment_id = NEW.assessment_id AND company_id = NEW.company_id AND kind = 'decision' AND opportunity_id = NEW.opportunity_id ORDER BY id DESC LIMIT 1),
  ''
) <> 'accept'
BEGIN
  SELECT RAISE(ABORT, 'a requirement needs an accepted item');
END;
--> statement-breakpoint
-- A listing carries the fee in force: the same number for every provider (D-03), and there is no listing while no fee is set.
CREATE TRIGGER provider_events_list_carries_the_fee_in_force BEFORE INSERT ON provider_events
WHEN NEW.kind = 'list'
 AND NOT EXISTS (
   SELECT 1 FROM listing_terms t
   WHERE t.version = NEW.terms_version AND t.fee_inr = NEW.fee_inr AND t.version = (SELECT MAX(version) FROM listing_terms)
 )
BEGIN
  SELECT RAISE(ABORT, 'a listing carries the fee in force');
END;
--> statement-breakpoint
-- A provider with nothing it serves is not listed.
CREATE TRIGGER provider_events_list_needs_a_service BEFORE INSERT ON provider_events
WHEN NEW.kind = 'list' AND NOT EXISTS (SELECT 1 FROM provider_services WHERE provider_id = NEW.provider_id)
BEGIN
  SELECT RAISE(ABORT, 'a provider needs a service before it is listed');
END;
--> statement-breakpoint
-- Listed, then unlisted, in turn: a listed provider is not listed again (which would record the fee twice), and an unlisted one is not unlisted.
CREATE TRIGGER provider_events_alternate BEFORE INSERT ON provider_events
WHEN COALESCE((SELECT kind FROM provider_events WHERE provider_id = NEW.provider_id ORDER BY id DESC LIMIT 1), 'unlist') = NEW.kind
BEGIN
  SELECT RAISE(ABORT, 'a provider is listed and unlisted in turn');
END;
