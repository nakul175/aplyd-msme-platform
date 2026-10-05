// Where an owner is and what is their turn, from facts. Each rule is exercised on the facts that make it fire and on the facts that
// make the one before it fire instead, so a reordering of the rules fails here.
import assert from "node:assert/strict";
import { test } from "node:test";
import { NO_FACTS, STAGES, STAGE_IDS, milestoneStatesOf, nextStep, stageById, stageLine, stageStatuses } from "../../src/progress.ts";
import type { EngagementFacts, Facts } from "../../src/progress.ts";

const NOW = new Date("2026-10-05T10:00:00.000Z");
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();

const confirmed: Facts = { ...NO_FACTS, factory: { latestRevision: 2, anyConfirmed: true } };
const signedOff: Facts = { ...confirmed, assessment: { items: 5, decided: 5, signedOff: true } };
const engagement = (over: Partial<EngagementFacts> = {}): EngagementFacts => ({ planAgreed: true, closed: false, milestones: ["planned"], baselineRecorded: false, firstAcceptedAt: null, reviewsRecorded: [], ...over });
const withEngagement = (g: EngagementFacts, over: Partial<Facts> = {}): Facts => ({ ...signedOff, requirements: 1, requirementsWithoutProvider: 0, engagements: [g], ...over });

test("a company that has done nothing is asked to describe its factory", () => {
  const s = nextStep(NO_FACTS, NOW);
  assert.equal(s.key, "describe");
  assert.equal(s.stage, "describe");
  assert.equal(s.href, "/factory");
});

test("a draft that was never confirmed is asked to be confirmed, not described again", () => {
  assert.equal(nextStep({ ...NO_FACTS, factory: { latestRevision: 1, anyConfirmed: false } }, NOW).key, "confirm");
});

test("a confirmed description with no assessment is sent to make one", () => {
  const s = nextStep(confirmed, NOW);
  assert.equal(s.key, "diagnose");
  assert.equal(s.href, "/diagnose");
});

test("an assessment with undecided ideas says how many are left, and the plural is right", () => {
  assert.match(nextStep({ ...confirmed, assessment: { items: 5, decided: 2, signedOff: false } }, NOW).title, /^Decide on 3 ideas$/);
  assert.match(nextStep({ ...confirmed, assessment: { items: 5, decided: 4, signedOff: false } }, NOW).title, /^Decide on 1 idea$/);
});

test("when every idea is decided the next step is the sign-off", () => {
  assert.equal(nextStep({ ...confirmed, assessment: { items: 5, decided: 5, signedOff: false } }, NOW).key, "sign_off");
});

test("a signed-off assessment with nothing asked for is sent to say what is needed", () => {
  assert.equal(nextStep(signedOff, NOW).key, "make_requirement");
});

test("a requirement with no provider chosen is sent to choose one", () => {
  const s = nextStep({ ...signedOff, requirements: 1, requirementsWithoutProvider: 1 }, NOW);
  assert.equal(s.key, "choose_provider");
  assert.equal(s.stage, "procure");
});

test("a provider chosen and no plan yet is sent to agree a plan", () => {
  const s = nextStep(withEngagement(engagement({ planAgreed: false, milestones: [] })), NOW);
  assert.equal(s.key, "agree_plan");
  assert.equal(s.href, "/deliver");
});

test("an agreed plan with no starting number and nothing accepted is asked for the starting number", () => {
  assert.equal(nextStep(withEngagement(engagement()), NOW).key, "record_baseline");
});

test("once the starting number is recorded and work is under way, nothing is the owner's turn and the next review date is named", () => {
  const s = nextStep(withEngagement(engagement({ baselineRecorded: true })), NOW);
  assert.equal(s.key, "keep_going");
  assert.match(s.body, /Accept each milestone/);
  const later = nextStep(withEngagement(engagement({ baselineRecorded: true, milestones: ["accepted"], firstAcceptedAt: daysAgo(5) })), NOW);
  assert.equal(later.key, "keep_going");
  assert.match(later.body, /The next review opens on 2026-10-30\./, "30 days after the first acceptance");
});

test("a delivered milestone is the owner's turn before a review, a plan or anything else downstream", () => {
  const g = engagement({ milestones: ["delivered"], firstAcceptedAt: daysAgo(40), baselineRecorded: true });
  const s = nextStep(withEngagement(g, { requirementsWithoutProvider: 1 }), NOW);
  assert.equal(s.key, "judge_delivery");
  assert.equal(s.stage, "deliver");
});

test("a review whose day has come is the owner's turn, and the title counts them", () => {
  const one = nextStep(withEngagement(engagement({ milestones: ["accepted"], firstAcceptedAt: daysAgo(31), baselineRecorded: true })), NOW);
  assert.equal(one.key, "review_due");
  assert.equal(one.title, "Review 1 is open");
  const two = nextStep(withEngagement(engagement({ milestones: ["accepted"], firstAcceptedAt: daysAgo(91), baselineRecorded: true })), NOW);
  assert.equal(two.title, "2 reviews are open");
  const none = nextStep(withEngagement(engagement({ milestones: ["accepted"], firstAcceptedAt: daysAgo(29), baselineRecorded: true })), NOW);
  assert.equal(none.key, "keep_going", "day 29 is before the first review");
});

test("a review already recorded is not asked for again", () => {
  const g = engagement({ milestones: ["accepted"], firstAcceptedAt: daysAgo(31), baselineRecorded: true, reviewsRecorded: [1] });
  assert.equal(nextStep(withEngagement(g), NOW).key, "keep_going");
});

test("earlier stages come first: an unsigned assessment outranks any work in progress", () => {
  const f: Facts = { ...withEngagement(engagement({ milestones: ["delivered"] })), assessment: { items: 5, decided: 3, signedOff: false } };
  assert.equal(nextStep(f, NOW).key, "decide");
});

test("a finished engagement with all three reviews recorded leaves the owner up to date", () => {
  const g = engagement({ closed: true, milestones: ["paid"], firstAcceptedAt: daysAgo(200), baselineRecorded: true, reviewsRecorded: [1, 2, 3] });
  const s = nextStep(withEngagement(g), NOW);
  assert.equal(s.key, "caught_up");
  assert.equal(s.stage, "run");
});

test("exactly one stage is the owner's turn, except when the owner is up to date", () => {
  const cases: Facts[] = [
    NO_FACTS,
    confirmed,
    { ...confirmed, assessment: { items: 5, decided: 1, signedOff: false } },
    signedOff,
    withEngagement(engagement()),
    withEngagement(engagement({ milestones: ["delivered"] })),
  ];
  for (const f of cases) {
    const current = STAGE_IDS.filter((s) => stageStatuses(f, NOW)[s] === "current");
    assert.equal(current.length, 1, JSON.stringify(f));
    assert.equal(current[0], nextStep(f, NOW).stage);
  }
  const upToDate = withEngagement(engagement({ closed: true, milestones: ["paid"], firstAcceptedAt: daysAgo(200), baselineRecorded: true, reviewsRecorded: [1, 2, 3] }));
  assert.deepEqual(STAGE_IDS.filter((s) => stageStatuses(upToDate, NOW)[s] === "current"), []);
});

test("a stage that is finished is done, and one that has not come yet is not started", () => {
  const s = stageStatuses(signedOff, NOW);
  assert.deepEqual(s, { describe: "done", diagnose: "done", procure: "current", deliver: "todo", run: "todo" });
  assert.deepEqual(stageStatuses(NO_FACTS, NOW), { describe: "current", diagnose: "todo", procure: "todo", deliver: "todo", run: "todo" });
});

test("the five stages are in the order of the platform, numbered 1 to 5, with links the pages already have", () => {
  assert.deepEqual(STAGES.map((s) => s.id), ["describe", "diagnose", "procure", "deliver", "run"]);
  assert.deepEqual(STAGES.map((s) => s.n), [1, 2, 3, 4, 5]);
  assert.deepEqual(STAGES.map((s) => s.href), ["/factory", "/diagnose", "/procure", "/deliver", "/run"]);
  assert.deepEqual(STAGES.map((s) => s.page), ["Describe your factory", "What to do about it", "What you need", "Delivery", "Results"]);
  assert.equal(stageById("run").short, "Measure");
});

test("a strip label never contains the name of a page's link, so a test or a person who looks for a page by its name finds one link", () => {
  for (const a of STAGES) for (const b of STAGES) assert.ok(!a.short.toLowerCase().includes(b.page.toLowerCase()), `"${a.short}" contains the page name "${b.page}"`);
});

test("a button's words are never a page's name either", () => {
  const facts: Facts[] = [NO_FACTS, { ...NO_FACTS, factory: { latestRevision: 1, anyConfirmed: false } }, confirmed, { ...confirmed, assessment: { items: 5, decided: 1, signedOff: false } }, { ...confirmed, assessment: { items: 5, decided: 5, signedOff: false } }, signedOff, { ...signedOff, requirements: 1, requirementsWithoutProvider: 1 }, withEngagement(engagement({ planAgreed: false })), withEngagement(engagement()), withEngagement(engagement({ baselineRecorded: true })), withEngagement(engagement({ milestones: ["delivered"] })), withEngagement(engagement({ milestones: ["accepted"], firstAcceptedAt: daysAgo(31) })), withEngagement(engagement({ closed: true, milestones: ["paid"], reviewsRecorded: [1, 2, 3], firstAcceptedAt: daysAgo(200) }))];
  const names = STAGES.map((s) => s.page.toLowerCase());
  for (const f of facts) {
    const cta = nextStep(f, NOW).cta.toLowerCase();
    for (const n of names) assert.ok(!cta.includes(n), `"${cta}" contains the page name "${n}"`);
  }
});

test("milestone states come from the events of each milestone", () => {
  assert.deepEqual(milestoneStatesOf([[], ["delivered"], ["delivered", "accepted"], ["delivered", "accepted", "payment_recorded"], ["delivered", "rejected"]]), ["planned", "delivered", "accepted", "paid", "rejected"]);
});

test("the line under each stage says where it stands", () => {
  assert.equal(stageLine("describe", NO_FACTS, NOW), "Not started");
  assert.equal(stageLine("describe", confirmed, NOW), "Confirmed. Newest version is 2.");
  assert.equal(stageLine("describe", { ...NO_FACTS, factory: { latestRevision: 3, anyConfirmed: false } }, NOW), "A draft is saved (version 3). Not confirmed yet.");
  assert.equal(stageLine("diagnose", NO_FACTS, NOW), "Waits for a confirmed description");
  assert.equal(stageLine("diagnose", signedOff, NOW), "Signed off. You decided on 5 of 5 ideas.");
  assert.equal(stageLine("procure", confirmed, NOW), "Waits for your signed-off decisions");
  assert.equal(stageLine("procure", signedOff, NOW), "Nothing asked for yet");
  const g = engagement({ milestones: ["accepted", "planned"], firstAcceptedAt: daysAgo(31), baselineRecorded: true });
  const f = withEngagement(g);
  assert.equal(stageLine("procure", f, NOW), "1 requirement, 1 provider chosen.");
  assert.equal(stageLine("deliver", f, NOW), "1 of 2 milestones accepted.");
  assert.equal(stageLine("run", f, NOW), "1 review is open.");
  assert.equal(stageLine("deliver", withEngagement(engagement({ planAgreed: false, milestones: [] })), NOW), "Plan not agreed yet");
  assert.equal(stageLine("run", withEngagement(engagement({ baselineRecorded: true })), NOW), "Starting number recorded. 0 reviews recorded.");
});
