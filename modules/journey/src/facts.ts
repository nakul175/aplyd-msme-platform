// Reads the facts that progress.ts works from, for one company. It calls the stage modules' own reads (each bound to the company id from the
// caller's identity, never from a URL) and writes nothing. It holds no query of its own, so it cannot read a row those reads would not.
import { listEngagements } from "../../deliver/src/db/engagements.ts";
import type { EngagementRecord } from "../../deliver/src/db/engagements.ts";
import { MILESTONE_KINDS } from "../../deliver/src/state.ts";
import type { MilestoneKind } from "../../deliver/src/state.ts";
import { standingDecisions } from "../../diagnose/src/digest.ts";
import { listAssessments, loadAssessment } from "../../diagnose/src/db/assessments.ts";
import { loadLatest } from "../../factory/src/db/revisions.ts";
import { listedProvidersFor } from "../../procure/src/db/providers.ts";
import { listRequirements } from "../../procure/src/db/requirements.ts";
import { listOutcomes } from "../../run/src/db/outcomes.ts";
import { milestoneStatesOf } from "./progress.ts";
import type { EngagementFacts, Facts } from "./progress.ts";

const isMilestoneKind = (k: string): k is MilestoneKind => (MILESTONE_KINDS as readonly string[]).includes(k);

/** The facts about one engagement that the stages after the choice of a provider are judged by. */
export function engagementFacts(g: EngagementRecord, outcomes: { kind: "baseline" | "review"; reviewNo: number | null }[]): EngagementFacts {
  const accepted = g.events.filter((e) => e.kind === "accepted").sort((a, b) => a.id - b.id)[0];
  const kindsByMilestone = g.milestones.map((m) => g.events.filter((e) => e.milestoneId === m.id && isMilestoneKind(e.kind)).sort((a, b) => a.id - b.id).map((e) => e.kind as MilestoneKind));
  return {
    planAgreed: g.events.some((e) => e.kind === "plan_agreed"),
    closed: g.events.some((e) => e.kind === "closed"),
    milestones: milestoneStatesOf(kindsByMilestone),
    baselineRecorded: outcomes.some((o) => o.kind === "baseline"),
    firstAcceptedAt: accepted?.at ?? null,
    reviewsRecorded: outcomes.flatMap((o) => (o.kind === "review" && o.reviewNo !== null ? [o.reviewNo] : [])),
  };
}

/**
 * Where the company stands. The assessment that counts is the newest one that was signed off; a newer one that was not is the owner's
 * to finish, but it is not nagged about while an older, signed-off one is what the work in progress came from.
 */
export async function loadFacts(db: D1Database, companyId: string): Promise<Facts> {
  const [latest, confirmed, assessments, requirements, engagements] = await Promise.all([
    loadLatest(db, companyId, "any"),
    loadLatest(db, companyId, "confirmed"),
    listAssessments(db, companyId),
    listRequirements(db, companyId),
    listEngagements(db, companyId),
  ]);
  const outcomes = await Promise.all(engagements.map((g) => listOutcomes(db, companyId, g.id)));
  const counted = assessments.find((a) => a.signedOffAt !== null) ?? assessments[0] ?? null;
  const active = requirements.filter((r) => r.withdrawnAt === null);
  const engaged = new Set(engagements.map((g) => g.requirementId));
  const withoutProvider = active.filter((r) => !engaged.has(r.id));
  const providerCounts = await Promise.all(withoutProvider.map(async (r) => (await listedProvidersFor(db, r.opportunityId, r.cluster)).length));

  // The ideas the owner accepted in the signed-off assessment that nothing has been asked for yet. A withdrawn requirement still counts as
  // asked for, as it does on the Choose page: a withdrawn requirement is not made again.
  let ideasToAsk = 0;
  if (counted?.signedOffAt) {
    const record = await loadAssessment(db, companyId, counted.id);
    if (record) {
      const asked = new Set(requirements.filter((r) => r.assessmentId === counted.id).map((r) => r.opportunityId));
      ideasToAsk = standingDecisions(record.result, record.events.filter((e) => e.kind === "decision")).filter((d) => d.decision === "accept" && !asked.has(d.opportunityId)).length;
    }
  }
  return {
    factory: { latestRevision: latest?.revision ?? null, confirmedRevision: confirmed?.revision ?? null },
    assessment: counted ? { items: counted.items, decided: counted.decided, signedOff: counted.signedOffAt !== null } : null,
    ideasToAsk,
    requirements: active.length,
    requirementsWithoutProvider: withoutProvider.length,
    requirementsToChoose: providerCounts.filter((n) => n > 0).length,
    engagements: engagements.map((g, i) => engagementFacts(g, outcomes[i])),
  };
}
