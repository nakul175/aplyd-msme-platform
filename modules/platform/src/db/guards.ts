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
  engagements: ["engagements_no_update", "engagements_no_delete", "engagements_no_replace"],
  milestones: ["milestones_no_update", "milestones_no_delete", "milestones_no_replace"],
  engagement_events: ["engagement_events_no_update", "engagement_events_no_delete", "engagement_events_no_replace"],
  outcome_events: ["outcome_events_no_update", "outcome_events_no_delete", "outcome_events_no_replace"],
};

/** Triggers that enforce a rule about what may be inserted, by table. */
export const RULE_TRIGGERS: Record<string, string[]> = {
  factory_revisions: ["factory_revisions_answers_are_an_object", "factory_revisions_no_gaps", "factory_revisions_limit", "factory_revisions_note_is_short"],
  listing_terms: ["listing_terms_fee_is_whole", "listing_terms_note_is_short"],
  provider_services: ["provider_services_closed_after_first_listing"],
  assessments: ["assessments_needs_confirmed_description"],
  assessment_events: [
    "assessment_events_decision_names_an_item",
    "assessment_events_signed_off_is_final",
    "assessment_events_signoff_needs_every_decision",
    "assessment_events_one_signoff_only",
    "assessment_events_decision_limit",
    "assessment_events_signoff_needs_an_item",
    "assessment_events_decision_needs_a_value",
    "assessment_events_note_is_short",
  ],
  requirements: ["requirements_needs_signed_off_assessment", "requirements_needs_accepted_item"],
  provider_events: ["provider_events_list_carries_the_fee_in_force", "provider_events_list_needs_a_service", "provider_events_alternate", "provider_events_note_is_short"],
  requirement_events: ["requirement_events_not_after_engagement", "requirement_events_note_is_short"],
  engagements: ["engagements_needs_an_open_requirement", "engagements_needs_a_listed_provider"],
  milestones: ["milestones_plan_is_open", "milestones_limit", "milestones_numbers_are_whole", "milestones_due_is_a_date", "milestones_text_is_not_blank"],
  outcome_events: [
    "outcome_events_value_is_whole",
    "outcome_events_one_baseline_only",
    "outcome_events_one_review_each",
    "outcome_events_baseline_before_acceptance",
    "outcome_events_review_needs_an_acceptance",
    "outcome_events_review_is_due",
  ],
  engagement_events: [
    "engagement_events_closed_is_final",
    "engagement_events_one_close",
    "engagement_events_one_plan_agreement",
    "engagement_events_plan_needs_a_milestone",
    "engagement_events_work_needs_an_agreed_plan",
    "engagement_events_delivery_follows_nothing_or_a_rejection",
    "engagement_events_decision_needs_a_delivery",
    "engagement_events_payment_needs_an_acceptance",
    "engagement_events_delivery_limit",
    "engagement_events_amount_is_whole",
    "engagement_events_payment_has_an_amount",
    "engagement_events_note_is_short",
  ],
};

export const ALL_APPEND_ONLY_TRIGGERS: string[] = Object.values(APPEND_ONLY_TABLES).flat();
export const ALL_REQUIRED_TRIGGERS: string[] = [...ALL_APPEND_ONLY_TRIGGERS, ...Object.values(RULE_TRIGGERS).flat()];

/** Every required trigger with the table it must be on, so a trigger of the right name on another table is not mistaken for the real one. */
export const REQUIRED_TRIGGERS_BY_TABLE: { table: string; name: string }[] = [APPEND_ONLY_TABLES, RULE_TRIGGERS].flatMap((byTable) =>
  Object.entries(byTable).flatMap(([table, names]) => names.map((name) => ({ table, name }))),
);
