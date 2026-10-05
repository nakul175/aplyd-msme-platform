// The export file: one company's records in one documented JSON shape (BR-DATA-03). Pure: it takes rows the other modules' data
// layers have already read for the signed-in person's own company and only picks, orders and explains them. Every field is copied by
// name, so a column added to a data layer later is not exported until someone adds it here on purpose. What is left out, and why, is
// written into the file itself (NOT_INCLUDED). Everything is SYNTHETIC until real data is allowed (OQ-09).
import type { AssessmentRecord, EventRow as AssessmentEvent } from "../../diagnose/src/db/assessments.ts";
import type { Result } from "../../diagnose/src/engine.ts";
import type { EngagementRecord } from "../../deliver/src/db/engagements.ts";
import type { Answers } from "../../factory/src/questionnaire.ts";
import type { Revision } from "../../factory/src/db/revisions.ts";
import type { CompanyRecord } from "../../platform/src/db/companies.ts";
import type { RequirementRecord, Spec } from "../../procure/src/db/requirements.ts";
import type { OutcomeRow } from "../../run/src/db/outcomes.ts";

/** The name of the format. A program that reads the file checks this first. */
export const EXPORT_FORMAT = "aplyd-msme-company-records";
/** Raised when a field is renamed, removed or changes meaning. Adding a field does not raise it. */
export const EXPORT_VERSION = 1;

/** What the data layers return for one company, before it is put in order. */
export type ExportInput = {
  company: CompanyRecord;
  revisions: Revision[];
  assessments: AssessmentRecord[];
  requirements: RequirementRecord[];
  engagements: EngagementRecord[];
  outcomes: { engagementId: string; rows: OutcomeRow[] }[];
};

/** The sections of the file that hold records, in the order they appear. */
export const SECTIONS = ["company", "factoryDescriptions", "assessments", "requirements", "engagements", "measurements"] as const;
export type Section = (typeof SECTIONS)[number];

/** What each section holds, in the owner's words. The same text is in the file and on the page. */
export const SECTION_TEXT: Record<Section, { title: string; text: string }> = {
  company: {
    title: "Your company",
    text: "The company record: its id, its name, when it was set up, and whether it is SYNTHETIC test data.",
  },
  factoryDescriptions: {
    title: "Your factory, every version",
    text: "Every version of the factory description you saved, oldest first. Each has its number, when it was saved, by whom (an account id), whether you confirmed it as accurate, and your answers to the questionnaire.",
  },
  assessments: {
    title: "Ideas and your decisions",
    text: "Each list of ideas made from a confirmed description, oldest first. The ideas are in result.items, ranked. Under each list are your decisions on the ideas (accept, defer or reject, with your note) and your sign-off, with its fingerprint.",
  },
  requirements: {
    title: "What you asked for",
    text: "Each request you made from an idea you accepted, oldest first, including the ones you withdrew. A withdrawn request has withdrawn set to true and the time it was withdrawn.",
  },
  engagements: {
    title: "Providers you chose and the plans",
    text: "Each provider you chose for a request, oldest first: the provider's id and name, the milestones of the plan with the test and the price you agreed, and everything you recorded on it (plan agreed, delivered, accepted, rejected, payments you made yourself, closed).",
  },
  measurements: {
    title: "Your numbers",
    text: "The starting number and the reviews you recorded for each engagement, in the order you recorded them. Each names its engagement. These are numbers you typed; the platform measures nothing.",
  },
};

/** What the file does not hold, and why. Shown on the page too. */
export const NOT_INCLUDED: { what: string; why: string }[] = [
  { what: "Other companies' records.", why: "They belong to those companies. One company never sees another company's records." },
  { what: "How many other companies asked for the same thing.", why: "Those counts are made from other companies' records." },
  { what: "The list of providers and the terms they are listed on.", why: "These are kept by the platform, not by your company. The name of each provider you chose is in the file." },
  { what: "The platform's own log of sign-ins and actions.", why: "The platform keeps it to check who did what. This version of the file does not include it." },
  { what: "The names and email addresses of the people on your account.", why: "This version names a person by their account id only." },
  { what: "Sign-in details and the platform's keys.", why: "These are never put in a file." },
];

export type Readme = {
  title: string;
  about: string[];
  format: string;
  sections: Record<Section, string>;
  notIncluded: { what: string; why: string }[];
};

export const README: Readme = {
  title: "Your company's records from the APLYD MSME platform",
  about: [
    "This file holds every record your company made on the APLYD MSME platform, as they were when the file was made.",
    "The file is yours. Anyone who has it can read your records, so keep it where only you can open it.",
    "Making this file does not close your account and does not remove anything. Your records stay on the platform.",
    "Every record in this version of the platform is SYNTHETIC test data. Nothing in it is about a real company.",
  ],
  format:
    "JSON, as UTF-8 text. Times are in UTC, written like 2026-10-04T00:00:00.000Z. A due date is written like 2026-11-30. Money is a whole number of rupees. Every record keeps its id from the platform, so records can be matched to each other. counts says how many records each section holds.",
  sections: Object.fromEntries(SECTIONS.map((s) => [s, SECTION_TEXT[s].text])) as Record<Section, string>,
  notIncluded: NOT_INCLUDED,
};

export type ExportCounts = {
  factoryDescriptions: number;
  assessments: number;
  ideas: number;
  decisions: number;
  signOffs: number;
  requirements: number;
  withdrawnRequirements: number;
  engagements: number;
  milestones: number;
  engagementEvents: number;
  measurements: number;
};

type Decision = { id: number; at: string; userId: string; opportunityId: string | null; decision: AssessmentEvent["decision"]; note: string };
type SignOff = { id: number; at: string; userId: string; digest: string | null; note: string };

export type ExportBundle = {
  format: typeof EXPORT_FORMAT;
  version: number;
  synthetic: true;
  tag: "SYNTHETIC";
  exportedAt: string;
  companyId: string;
  readme: Readme;
  counts: ExportCounts;
  company: { id: string; name: string; synthetic: boolean; createdAt: string };
  factoryDescriptions: { revision: number; createdAt: string; createdBy: string; confirmed: boolean; questionnaireVersion: number; note: string; answers: Answers }[];
  assessments: {
    id: string;
    factoryRevisionNo: number;
    libraryVersion: number;
    engineVersion: number;
    createdAt: string;
    createdBy: string;
    result: Result;
    decisions: Decision[];
    signOffs: SignOff[];
  }[];
  requirements: { id: string; assessmentId: string; opportunityId: string; cluster: string; createdAt: string; createdBy: string; withdrawn: boolean; withdrawnAt: string | null; spec: Spec }[];
  engagements: {
    id: string;
    requirementId: string;
    opportunityId: string;
    cluster: string;
    title: string;
    chosenProvider: { id: string; name: string };
    createdAt: string;
    milestones: { id: string; seq: number; title: string; acceptanceTest: string; dueOn: string; agreedInr: number; createdAt: string }[];
    events: { id: number; at: string; userId: string; kind: string; milestoneId: string | null; amountInr: number | null; note: string }[];
  }[];
  measurements: { engagementId: string; id: number; at: string; userId: string; kind: string; reviewNo: number | null; value: number; verdict: string | null; inUse: string | null; note: string }[];
};

// Plain comparisons, so the order does not depend on the locale of the machine that made the file.
const cmp = (a: string | number, b: string | number): number => (a < b ? -1 : a > b ? 1 : 0);
const byTimeThenId = (a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) => cmp(a.createdAt, b.createdAt) || cmp(a.id, b.id);
const byId = (a: { id: number }, b: { id: number }) => cmp(a.id, b.id);

/**
 * Puts one company's records in the documented shape. The same input always gives the same file apart from `exportedAt`, whatever
 * order the rows came in: every list is sorted here, oldest first.
 */
export function buildExport(input: ExportInput, now: Date): ExportBundle {
  const { company } = input;

  const factoryDescriptions = [...input.revisions]
    .sort((a, b) => cmp(a.revision, b.revision))
    .map((r) => ({ revision: r.revision, createdAt: r.createdAt, createdBy: r.createdBy, confirmed: r.confirmed, questionnaireVersion: r.questionnaireVersion, note: r.note, answers: r.answers }));

  const assessments = [...input.assessments].sort(byTimeThenId).map((a) => {
    const events = [...a.events].sort(byId);
    return {
      id: a.id,
      factoryRevisionNo: a.factoryRevisionNo,
      libraryVersion: a.libraryVersion,
      engineVersion: a.engineVersion,
      createdAt: a.createdAt,
      createdBy: a.createdBy,
      result: a.result,
      decisions: events.filter((e) => e.kind === "decision").map((e) => ({ id: e.id, at: e.at, userId: e.userId, opportunityId: e.opportunityId, decision: e.decision, note: e.note })),
      signOffs: events.filter((e) => e.kind === "signoff").map((e) => ({ id: e.id, at: e.at, userId: e.userId, digest: e.digest, note: e.note })),
    };
  });

  const requirements = [...input.requirements].sort(byTimeThenId).map((r) => ({
    id: r.id,
    assessmentId: r.assessmentId,
    opportunityId: r.opportunityId,
    cluster: r.cluster,
    createdAt: r.createdAt,
    createdBy: r.createdBy,
    withdrawn: r.withdrawnAt !== null,
    withdrawnAt: r.withdrawnAt,
    spec: r.spec,
  }));

  const engagements = [...input.engagements].sort(byTimeThenId).map((g) => ({
    id: g.id,
    requirementId: g.requirementId,
    opportunityId: g.opportunityId,
    cluster: g.cluster,
    title: g.title,
    chosenProvider: { id: g.providerId, name: g.providerName },
    createdAt: g.createdAt,
    milestones: [...g.milestones]
      .sort((a, b) => cmp(a.seq, b.seq) || cmp(a.id, b.id))
      .map((m) => ({ id: m.id, seq: m.seq, title: m.title, acceptanceTest: m.acceptanceTest, dueOn: m.dueOn, agreedInr: m.agreedInr, createdAt: m.createdAt })),
    events: [...g.events].sort(byId).map((e) => ({ id: e.id, at: e.at, userId: e.userId, kind: e.kind, milestoneId: e.milestoneId, amountInr: e.amountInr, note: e.note })),
  }));

  // Measurements follow the order of the engagements they belong to; within one engagement, the order they were recorded.
  const place = new Map(engagements.map((g, i) => [g.id, i]));
  const measurements = input.outcomes
    .flatMap((o) => o.rows.map((r) => ({ engagementId: o.engagementId, id: r.id, at: r.at, userId: r.userId, kind: r.kind, reviewNo: r.reviewNo, value: r.value, verdict: r.verdict, inUse: r.inUse, note: r.note })))
    .sort((a, b) => cmp(place.get(a.engagementId) ?? Number.MAX_SAFE_INTEGER, place.get(b.engagementId) ?? Number.MAX_SAFE_INTEGER) || cmp(a.engagementId, b.engagementId) || cmp(a.id, b.id));

  const counts: ExportCounts = {
    factoryDescriptions: factoryDescriptions.length,
    assessments: assessments.length,
    ideas: assessments.reduce((n, a) => n + (a.result.items?.length ?? 0), 0),
    decisions: assessments.reduce((n, a) => n + a.decisions.length, 0),
    signOffs: assessments.reduce((n, a) => n + a.signOffs.length, 0),
    requirements: requirements.length,
    withdrawnRequirements: requirements.filter((r) => r.withdrawn).length,
    engagements: engagements.length,
    milestones: engagements.reduce((n, g) => n + g.milestones.length, 0),
    engagementEvents: engagements.reduce((n, g) => n + g.events.length, 0),
    measurements: measurements.length,
  };

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    synthetic: true,
    tag: "SYNTHETIC",
    exportedAt: now.toISOString(),
    companyId: company.id,
    readme: README,
    counts,
    company: { id: company.id, name: company.name, synthetic: company.synthetic, createdAt: company.createdAt },
    factoryDescriptions,
    assessments,
    requirements,
    engagements,
    measurements,
  };
}

/** Records in the file, the company record included. Ideas are part of an assessment and are not counted again. */
export function recordTotal(c: ExportCounts): number {
  return 1 + c.factoryDescriptions + c.assessments + c.decisions + c.signOffs + c.requirements + c.engagements + c.milestones + c.engagementEvents + c.measurements;
}

/** The name the browser saves the file under. Only letters, digits and hyphens, so the header cannot be broken by an odd id. */
export function exportFileName(companyId: string, now: Date): string {
  const safe = companyId.replace(/[^A-Za-z0-9-]/g, "-").slice(0, 64) || "company";
  return `aplyd-records-${safe}-${now.toISOString().slice(0, 10)}.json`;
}
