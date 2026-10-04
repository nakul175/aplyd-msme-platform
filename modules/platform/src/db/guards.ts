// Every append-only table and the triggers that make it so, and the triggers that enforce a business rule inside the
// database. The health check refuses a database that lacks any of them, and a unit test checks these lists against the
// migrations, so a table added with triggers cannot be left off and a trigger cannot be dropped from a migration
// without a test noticing.
export const APPEND_ONLY_TABLES: Record<string, string[]> = {
  audit_events: ["audit_events_no_update", "audit_events_no_delete", "audit_events_no_replace"],
  factory_revisions: ["factory_revisions_no_update", "factory_revisions_no_delete", "factory_revisions_no_replace"],
  assessments: ["assessments_no_update", "assessments_no_delete", "assessments_no_replace"],
  assessment_events: ["assessment_events_no_update", "assessment_events_no_delete", "assessment_events_no_replace"],
  requirements: ["requirements_no_update", "requirements_no_delete", "requirements_no_replace"],
  requirement_events: ["requirement_events_no_update", "requirement_events_no_delete", "requirement_events_no_replace"],
  providers: ["providers_no_update", "providers_no_delete", "providers_no_replace"],
  provider_services: ["provider_services_no_update", "provider_services_no_delete", "provider_services_no_replace"],
  provider_events: ["provider_events_no_update", "provider_events_no_delete", "provider_events_no_replace"],
  listing_terms: ["listing_terms_no_update", "listing_terms_no_delete", "listing_terms_no_replace"],
};

/** Triggers that enforce a rule about what may be inserted, by table. */
export const RULE_TRIGGERS: Record<string, string[]> = {
  assessments: ["assessments_needs_confirmed_description"],
  assessment_events: [
    "assessment_events_decision_names_an_item",
    "assessment_events_signed_off_is_final",
    "assessment_events_signoff_needs_every_decision",
    "assessment_events_one_signoff_only",
    "assessment_events_decision_limit",
    "assessment_events_signoff_needs_an_item",
  ],
  requirements: ["requirements_needs_signed_off_assessment", "requirements_needs_accepted_item"],
  provider_events: ["provider_events_list_carries_the_fee_in_force", "provider_events_list_needs_a_service", "provider_events_alternate"],
};

export const ALL_APPEND_ONLY_TRIGGERS: string[] = Object.values(APPEND_ONLY_TABLES).flat();
export const ALL_REQUIRED_TRIGGERS: string[] = [...ALL_APPEND_ONLY_TRIGGERS, ...Object.values(RULE_TRIGGERS).flat()];
