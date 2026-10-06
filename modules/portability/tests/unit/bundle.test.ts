// The export file's shape, built from hand-made rows of the kind the data layers return. No database: the builder is pure.
import assert from "node:assert/strict";
import { test } from "node:test";
import { EXPORT_FORMAT, EXPORT_VERSION, NOT_INCLUDED, README, SECTIONS, SECTION_TEXT, buildExport, exportFileName, recordTotal } from "../../src/bundle.ts";
import type { ExportBundle, ExportInput } from "../../src/bundle.ts";
import type { Result } from "../../../diagnose/src/engine.ts";
import { FORBIDDEN_KEY, keysOf } from "../support/forbidden.ts";

const A = "company-synthetic-a";
const NOW = new Date("2026-10-06T01:02:03.000Z");

function sample(): ExportInput {
  const result = {
    engine: "rules",
    engineVersion: 1,
    libraryVersion: 1,
    synthetic: true,
    inputs: { problems: ["late_deliveries"], budgetBand: "1_to_5_lakh", sector: "textiles_garments", readiness: "within_year" },
    items: [
      { rank: 1, opportunityId: "digital_job_log", title: "SYNTHETIC idea one" },
      { rank: 2, opportunityId: "stock_register", title: "SYNTHETIC idea two" },
    ],
    leftOut: [],
  } as unknown as Result;
  return {
    company: { id: A, name: "SYNTHETIC Company A", synthetic: true, createdAt: "2026-10-04T00:00:00.000Z" },
    revisions: [
      { revision: 2, createdAt: "2026-10-05T00:00:00.000Z", createdBy: "user-synthetic-owner-a", confirmed: true, questionnaireVersion: 1, answers: { products: "SYNTHETIC shirts" }, note: "second" },
      { revision: 1, createdAt: "2026-10-04T00:00:00.000Z", createdBy: "user-synthetic-owner-a", confirmed: false, questionnaireVersion: 1, answers: { products: "SYNTHETIC uniforms" }, note: "first" },
    ],
    assessments: [
      {
        id: "aaaaaaaa-0000-4000-8000-000000000001",
        factoryRevisionNo: 2,
        libraryVersion: 1,
        engineVersion: 1,
        createdAt: "2026-10-05T01:00:00.000Z",
        createdBy: "user-synthetic-owner-a",
        result,
        events: [
          { id: 9, at: "2026-10-05T01:09:00.000Z", userId: "user-synthetic-owner-a", kind: "signoff", opportunityId: null, decision: null, note: "", digest: "f".repeat(64) },
          { id: 7, at: "2026-10-05T01:07:00.000Z", userId: "user-synthetic-owner-a", kind: "decision", opportunityId: "digital_job_log", decision: "accept", note: "yes", digest: null },
          { id: 8, at: "2026-10-05T01:08:00.000Z", userId: "user-synthetic-owner-a", kind: "decision", opportunityId: "stock_register", decision: "reject", note: "", digest: null },
        ],
      },
    ],
    requirements: [
      {
        id: "bbbbbbbb-0000-4000-8000-000000000002",
        assessmentId: "aaaaaaaa-0000-4000-8000-000000000001",
        opportunityId: "stock_register",
        cluster: "synthetic-cluster-1",
        spec: { title: "SYNTHETIC two", summary: "s", kind: "non_ai", addresses: [], costs: { oneTime: { low: 1, high: 2 }, recurringPerYear: { low: 0, high: 0 }, hidden: [] }, source: "SYNTHETIC", libraryVersion: 1 },
        createdAt: "2026-10-05T02:00:00.000Z",
        createdBy: "user-synthetic-owner-a",
        withdrawnAt: "2026-10-05T03:00:00.000Z",
      },
      {
        id: "bbbbbbbb-0000-4000-8000-000000000001",
        assessmentId: "aaaaaaaa-0000-4000-8000-000000000001",
        opportunityId: "digital_job_log",
        cluster: "synthetic-cluster-1",
        spec: { title: "SYNTHETIC one", summary: "s", kind: "non_ai", addresses: [], costs: { oneTime: { low: 1, high: 2 }, recurringPerYear: { low: 0, high: 0 }, hidden: [] }, source: "SYNTHETIC", libraryVersion: 1 },
        createdAt: "2026-10-05T02:00:00.000Z",
        createdBy: "user-synthetic-owner-a",
        withdrawnAt: null,
      },
    ],
    engagements: [
      {
        id: "eeeeeeee-0000-4000-8000-000000000001",
        requirementId: "bbbbbbbb-0000-4000-8000-000000000001",
        providerId: "cccccccc-0000-4000-8000-000000000001",
        providerName: "SYNTHETIC Provider One",
        providerSummary: "SYNTHETIC summary written by the operator",
        opportunityId: "digital_job_log",
        cluster: "synthetic-cluster-1",
        title: "SYNTHETIC one",
        createdAt: "2026-10-05T04:00:00.000Z",
        milestones: [
          { id: "m2", seq: 2, title: "SYNTHETIC second", acceptanceTest: "t2", dueOn: "2026-12-01", agreedInr: 20000, createdAt: "2026-10-05T04:02:00.000Z" },
          { id: "m1", seq: 1, title: "SYNTHETIC first", acceptanceTest: "t1", dueOn: "2026-11-01", agreedInr: 10000, createdAt: "2026-10-05T04:01:00.000Z" },
        ],
        events: [
          { id: 12, at: "2026-10-05T05:02:00.000Z", userId: "user-synthetic-owner-a", kind: "delivered", milestoneId: "m1", amountInr: null, note: "" },
          { id: 11, at: "2026-10-05T05:01:00.000Z", userId: "user-synthetic-owner-a", kind: "plan_agreed", milestoneId: null, amountInr: null, note: "" },
          { id: 13, at: "2026-10-05T05:03:00.000Z", userId: "user-synthetic-owner-a", kind: "accepted", milestoneId: "m1", amountInr: null, note: "" },
        ],
      },
    ],
    outcomes: [
      {
        engagementId: "eeeeeeee-0000-4000-8000-000000000001",
        rows: [
          { id: 4, at: "2026-11-05T00:00:00.000Z", userId: "user-synthetic-owner-a", kind: "review", reviewNo: 1, value: 6, verdict: "met", inUse: "yes", note: "" },
          { id: 3, at: "2026-10-05T05:00:00.000Z", userId: "user-synthetic-owner-a", kind: "baseline", reviewNo: null, value: 10, verdict: null, inUse: null, note: "before" },
        ],
      },
    ],
  };
}

const empty = (): ExportInput => ({ company: { id: A, name: "SYNTHETIC Company A", synthetic: true, createdAt: "2026-10-04T00:00:00.000Z" }, revisions: [], assessments: [], requirements: [], engagements: [], outcomes: [] });

const reversed = (input: ExportInput): ExportInput => ({
  ...input,
  revisions: [...input.revisions].reverse(),
  assessments: input.assessments.map((a) => ({ ...a, events: [...a.events].reverse() })).reverse(),
  requirements: [...input.requirements].reverse(),
  engagements: input.engagements.map((g) => ({ ...g, milestones: [...g.milestones].reverse(), events: [...g.events].reverse() })).reverse(),
  outcomes: input.outcomes.map((o) => ({ ...o, rows: [...o.rows].reverse() })).reverse(),
});

test("the file names its format and version, the company, the time it was made, and is marked SYNTHETIC", () => {
  const b = buildExport(sample(), NOW);
  assert.equal(b.format, EXPORT_FORMAT);
  assert.equal(b.format, "aplyd-msme-company-records");
  assert.equal(b.version, EXPORT_VERSION);
  assert.equal(b.version, 1);
  assert.equal(b.synthetic, true);
  assert.equal(b.tag, "SYNTHETIC");
  assert.equal(b.exportedAt, "2026-10-06T01:02:03.000Z");
  assert.equal(b.companyId, A);
  assert.deepEqual(b.company, { id: A, name: "SYNTHETIC Company A", synthetic: true, createdAt: "2026-10-04T00:00:00.000Z" });
  assert.deepEqual(Object.keys(b), ["format", "version", "synthetic", "tag", "exportedAt", "companyId", "readme", "counts", ...SECTIONS]);
});

test("every section is in the file, and the readme in the file explains each one and what is left out", () => {
  const b = buildExport(sample(), NOW) as unknown as Record<string, unknown>;
  for (const s of SECTIONS) assert.ok(s in b, `section ${s}`);
  assert.deepEqual(Object.keys(README.sections), [...SECTIONS]);
  for (const s of SECTIONS) {
    assert.ok(README.sections[s].length > 40, `the readme explains ${s}`);
    assert.equal(README.sections[s], SECTION_TEXT[s].text);
    assert.ok(SECTION_TEXT[s].title.length > 0);
  }
  assert.ok(README.about.some((l) => /does not close your account/.test(l)), "the file says exporting does not close the account");
  assert.ok(README.about.some((l) => /The file is yours/.test(l)), "the file says it is the owner's own");
  assert.ok(README.about.some((l) => /SYNTHETIC/.test(l)));
  assert.match(README.format, /JSON/);
  assert.ok(NOT_INCLUDED.length >= 5 && NOT_INCLUDED.every((n) => n.what.length > 0 && n.why.length > 0));
  assert.deepEqual((b.readme as typeof README).notIncluded, NOT_INCLUDED);
});

test("every record of every section is there: all versions, the ideas with decisions and sign-offs, withdrawn requests, the plan, its events and the numbers", () => {
  const b = buildExport(sample(), NOW);
  assert.deepEqual(b.factoryDescriptions.map((r) => r.revision), [1, 2]);
  assert.deepEqual(b.factoryDescriptions[0]!.answers, { products: "SYNTHETIC uniforms" });
  assert.equal(b.assessments.length, 1);
  assert.equal(b.assessments[0]!.result.items.length, 2);
  assert.deepEqual(b.assessments[0]!.decisions.map((d) => [d.id, d.opportunityId, d.decision]), [[7, "digital_job_log", "accept"], [8, "stock_register", "reject"]]);
  assert.deepEqual(b.assessments[0]!.signOffs.map((s) => [s.id, s.digest]), [[9, "f".repeat(64)]]);
  assert.deepEqual(b.requirements.map((r) => [r.id.slice(-1), r.withdrawn, r.withdrawnAt]), [["1", false, null], ["2", true, "2026-10-05T03:00:00.000Z"]]);
  assert.equal(b.engagements.length, 1);
  assert.deepEqual(b.engagements[0]!.chosenProvider, { id: "cccccccc-0000-4000-8000-000000000001", name: "SYNTHETIC Provider One" });
  assert.deepEqual(b.engagements[0]!.milestones.map((m) => [m.seq, m.agreedInr]), [[1, 10000], [2, 20000]]);
  assert.deepEqual(b.engagements[0]!.events.map((e) => e.kind), ["plan_agreed", "delivered", "accepted"]);
  assert.deepEqual(b.measurements.map((m) => [m.engagementId.slice(-1), m.kind, m.value]), [["1", "baseline", 10], ["1", "review", 6]]);
});

test("the counts are the number of records in each section, and the total counts each record once", () => {
  const b = buildExport(sample(), NOW);
  assert.deepEqual(b.counts, {
    factoryDescriptions: 2,
    assessments: 1,
    ideas: 2,
    decisions: 2,
    signOffs: 1,
    requirements: 2,
    withdrawnRequirements: 1,
    engagements: 1,
    milestones: 2,
    engagementEvents: 3,
    measurements: 2,
  });
  assert.equal(recordTotal(b.counts), 1 + 2 + 1 + 2 + 1 + 2 + 1 + 2 + 3 + 2);
});

test("a company with nothing recorded still gets every section, empty, and counts of zero", () => {
  const b = buildExport(empty(), NOW);
  for (const s of SECTIONS.filter((x) => x !== "company")) assert.deepEqual((b as unknown as Record<string, unknown>)[s], [], s);
  assert.equal(b.company.id, A);
  assert.ok(Object.values(b.counts).every((n) => n === 0));
  assert.equal(recordTotal(b.counts), 1);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(b)));
});

test("the order is stable: the same rows in any order give the same file, oldest first", () => {
  const forward = JSON.stringify(buildExport(sample(), NOW));
  assert.equal(JSON.stringify(buildExport(reversed(sample()), NOW)), forward);
  assert.equal(JSON.stringify(buildExport(sample(), NOW)), forward, "building twice gives the same text");
  // Two requests made in the same millisecond are ordered by id.
  const b = buildExport(sample(), NOW);
  assert.equal(b.requirements[0]!.createdAt, b.requirements[1]!.createdAt);
  assert.ok(b.requirements[0]!.id < b.requirements[1]!.id);
  // Measurements follow their engagement's place, then the order recorded.
  const two = sample();
  const second = { ...two.engagements[0]!, id: "eeeeeeee-0000-4000-8000-000000000000", createdAt: "2026-10-05T06:00:00.000Z", milestones: [], events: [] };
  two.engagements.push(second);
  two.outcomes.unshift({ engagementId: second.id, rows: [{ id: 1, at: "2026-10-05T06:01:00.000Z", userId: "u", kind: "baseline", reviewNo: null, value: 1, verdict: null, inUse: null, note: "" }] });
  const ordered = buildExport(two, NOW);
  assert.deepEqual(ordered.engagements.map((g) => g.id.slice(-1)), ["1", "0"]);
  assert.deepEqual(ordered.measurements.map((m) => [m.engagementId.slice(-1), m.id]), [["1", 3], ["1", 4], ["0", 1]]);
});

test("no key anywhere in the file is a provider register, a listing, a fee, terms, a secret, a session, an email, the audit log or a pool", () => {
  const keys = keysOf(buildExport(sample(), NOW));
  assert.ok(keys.length > 100, `the walk found ${keys.length} keys`);
  assert.deepEqual(keys.filter((k) => FORBIDDEN_KEY.test(k.key)).map((k) => k.path), []);
  // The pattern itself catches what it is for.
  for (const bad of ["providers", "providerSummary", "services", "listingTerms", "listed", "feeInr", "listedFeeInr", "terms", "sessionSecret", "email", "auditEvents", "pool"]) assert.match(bad, FORBIDDEN_KEY, bad);
  for (const fine of ["chosenProvider", "agreedInr", "amountInr", "companyId", "createdBy"]) assert.doesNotMatch(fine, FORBIDDEN_KEY, fine);
});

test("a field a data layer carries that the file does not name is left out: the provider's own summary, or a fee added later", () => {
  const input = sample();
  const g = input.engagements[0]! as (typeof input.engagements)[number] & Record<string, unknown>;
  g.feeInr = 1739;
  g.listedFeeInr = 1739;
  (input.company as Record<string, unknown>).secret = "not-a-real-secret";
  (input.requirements[0] as Record<string, unknown>).poolCompanies = 7;
  const b = buildExport(input, NOW);
  const text = JSON.stringify(b);
  assert.doesNotMatch(text, /SYNTHETIC summary written by the operator/);
  assert.doesNotMatch(text, /1739|not-a-real-secret|poolCompanies/);
  assert.deepEqual(keysOf(b).filter((k) => FORBIDDEN_KEY.test(k.key)), []);
});

test("every company id in the file is the company's own", () => {
  const b: ExportBundle = buildExport(sample(), NOW);
  const ids = keysOf(b).filter((k) => /^companyId$|^company$/.test(k.key));
  assert.ok(ids.length >= 2);
  assert.equal(b.companyId, A);
  assert.equal(b.company.id, A);
  assert.doesNotMatch(JSON.stringify(b), /company-synthetic-b/);
});

test("the file name holds the company id and the date, and nothing that could break the header", () => {
  assert.equal(exportFileName(A, NOW), "aplyd-records-company-synthetic-a-2026-10-06.json");
  assert.equal(exportFileName('a"b;c\r\nd/e', NOW), "aplyd-records-a-b-c--d-e-2026-10-06.json");
  assert.equal(exportFileName("", NOW), "aplyd-records-company-2026-10-06.json");
  assert.match(exportFileName("x".repeat(500), NOW), /^aplyd-records-x{64}-2026-10-06\.json$/);
});
