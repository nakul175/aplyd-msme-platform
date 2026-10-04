// Every append-only table and the triggers that make it so. The health check refuses a database that lacks any of them,
// and a unit test checks this list against the migrations, so a table added with triggers cannot be left off it
// and a trigger cannot be dropped from a migration without a test noticing.
export const APPEND_ONLY_TABLES: Record<string, string[]> = {
  audit_events: ["audit_events_no_update", "audit_events_no_delete", "audit_events_no_replace"],
  factory_revisions: ["factory_revisions_no_update", "factory_revisions_no_delete", "factory_revisions_no_replace"],
};

export const ALL_APPEND_ONLY_TRIGGERS: string[] = Object.values(APPEND_ONLY_TABLES).flat();
