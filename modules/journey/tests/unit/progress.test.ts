// Where an owner is and what is their turn, from facts. Each rule is exercised on the facts that make it fire and on the facts that
// make the one before it fire instead, so a reordering of the rules fails here.
import assert from "node:assert/strict";
import { test } from "node:test";
import { NO_FACTS, STAGES, STAGE_IDS, isOwnersTurn, milestoneStatesOf, nextStep, stageById, stageLine, stageStatuses } from "../../src/progress.ts";
import type { EngagementFacts, Facts } from "../../src/progress.ts";

const NOW = new Date("2026-10-05T10:00:00.000Z");
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();

const confirmed: Facts = { ...NO_FACTS, factory: { latestRevision: 2, confirmedRevision: 2 } };
/** Five ideas decided and signed off, all five accepted and none asked for yet. */
const signedOff: Facts = { ...confirmed, assessment: { items: 5, decided: 5, signedOff: true }, ideasToAsk: 5 };
const engagement = (over: Partial<EngagementFacts> = {}): EngagementFacts => ({ planAgreed: true, closed: false, milestones: ["planned"], baselineRecorded: false, firstAcceptedAt: null, reviewsRecorded: [], ...over });
/** One requirement, its provider chosen and this engagement under way; every other accepted idea is asked for. */
const withEngagement = (g: EngagementFacts, over: Partial<Facts> = {}): Facts => ({ ...signedOff, ideasToAsk: 0, requirements: 1, requirementsWithoutProvider: 0, requirementsToChoose: 0, engagements: [g], ...over });

test("a company that has done nothing is asked to describe its factory", () => {
  const s = nextStep(NO_FACTS, NOW);
  assert.equal(s.key, "describe");
  assert.equal(s.stage, "describe");
  assert.equal(s.href, "/factory");
});

test("a draft that was never confirmed is asked to be confirmed, not described again", () => {
  assert.equal(nextStep({ ...NO_FACTS, factory: { latestRevision: 1, confirmedRevision: null } }, NOW).key, "confirm");
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
  const s = nextStep({ ...signedOff, ideasToAsk: 4, requirements: 1, requirementsWithoutProvider: 1, requirementsToChoose: 1 }, NOW);
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
  const later = nextStep(withEngagement(engagement({ baselineRecorded: true, milestones: ["accepted", "planned"], firstAcceptedAt: daysAgo(5) })), NOW);
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
  const none = nextStep(withEngagement(engagement({ milestones: ["accepted", "planned"], firstAcceptedAt: daysAgo(29), baselineRecorded: true })), NOW);
  assert.equal(none.key, "keep_going", "day 29 is before the first review");
});

test("a review already recorded is not asked for again", () => {
  const g = engagement({ milestones: ["accepted", "planned"], firstAcceptedAt: daysAgo(31), baselineRecorded: true, reviewsRecorded: [1] });
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
  const facts: Facts[] = [NO_FACTS, { ...NO_FACTS, factory: { latestRevision: 1, confirmedRevision: null } }, confirmed, { ...confirmed, assessment: { items: 0, decided: 0, signedOff: false } }, { ...confirmed, assessment: { items: 5, decided: 1, signedOff: false } }, { ...confirmed, assessment: { items: 5, decided: 5, signedOff: false } }, signedOff, { ...signedOff, ideasToAsk: 0 }, { ...signedOff, ideasToAsk: 4, requirements: 1, requirementsWithoutProvider: 1, requirementsToChoose: 1 }, { ...signedOff, ideasToAsk: 4, requirements: 1, requirementsWithoutProvider: 1 }, withEngagement(engagement({ milestones: ["accepted"], firstAcceptedAt: daysAgo(5), baselineRecorded: true })), withEngagement(engagement({ baselineRecorded: true, milestones: ["accepted", "planned"] })), withEngagement(engagement({ baselineRecorded: true, milestones: ["accepted", "planned"] }), { ideasToAsk: 2 }), withEngagement(engagement({ milestones: ["delivered"] })), withEngagement(engagement({ planAgreed: false })), withEngagement(engagement()), withEngagement(engagement({ baselineRecorded: true })), withEngagement(engagement({ milestones: ["delivered"] })), withEngagement(engagement({ milestones: ["accepted"], firstAcceptedAt: daysAgo(31) })), withEngagement(engagement({ closed: true, milestones: ["paid"], reviewsRecorded: [1, 2, 3], firstAcceptedAt: daysAgo(200) }))];
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
  assert.equal(stageLine("describe", { ...NO_FACTS, factory: { latestRevision: 3, confirmedRevision: null } }, NOW), "A draft is saved (version 3). Not confirmed yet.");
  assert.equal(stageLine("diagnose", NO_FACTS, NOW), "Waits for a confirmed description");
  assert.equal(stageLine("diagnose", signedOff, NOW), "Signed off. You decided on 5 of 5 ideas.");
  assert.equal(stageLine("diagnose", { ...confirmed, assessment: { items: 1, decided: 1, signedOff: true } }, NOW), "Signed off. You decided on 1 of 1 idea.", "one idea is singular");
  assert.equal(stageLine("diagnose", { ...confirmed, assessment: { items: 3, decided: 0, signedOff: false } }, NOW), "Decided on 0 of 3 ideas. Not signed off.");
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

// ---------------------------------------------------------------------------------------------------------------------------------
// Faults an independent review of the first version found (5 October 2026). Each test is the state that showed it.

const closedWithDelivery = engagement({ closed: true, milestones: ["delivered", "planned"] });

test("a closed engagement's delivery is not waiting for a decision, and it does not hide the steps after it", () => {
  const s = nextStep(withEngagement(closedWithDelivery), NOW);
  assert.notEqual(s.key, "judge_delivery", "nothing can be decided on a closed engagement");
  const another = nextStep(withEngagement(closedWithDelivery, { requirements: 2, requirementsWithoutProvider: 1, requirementsToChoose: 1 }), NOW);
  assert.equal(another.key, "choose_provider", "a later rule can still fire");
});

test("a delivery waiting while the starting number is not written down says to write it first, because accepting would lose it", () => {
  const first = nextStep(withEngagement(engagement({ milestones: ["delivered"] })), NOW);
  assert.equal(first.key, "record_baseline");
  assert.equal(first.stage, "run");
  assert.match(first.body, /before the first milestone is accepted/);
  const written = nextStep(withEngagement(engagement({ milestones: ["delivered"], baselineRecorded: true })), NOW);
  assert.equal(written.key, "judge_delivery", "once it is written down the delivery is next");
  const alreadyAccepted = nextStep(withEngagement(engagement({ milestones: ["accepted", "delivered"], firstAcceptedAt: daysAgo(3) })), NOW);
  assert.equal(alreadyAccepted.key, "judge_delivery", "after the first acceptance the number can no longer be recorded, so it is not asked for");
});

test("a closed engagement is not asked for a starting number", () => {
  const s = nextStep(withEngagement(engagement({ closed: true, milestones: ["planned"] })), NOW);
  assert.notEqual(s.key, "record_baseline");
});

test("a signed-off assessment with nothing left to ask for says so, and sends the owner to describe again, not to an empty page", () => {
  for (const f of [{ ...signedOff, ideasToAsk: 0 }, { ...signedOff, ideasToAsk: 0, requirements: 0 }]) {
    const s = nextStep(f, NOW);
    assert.equal(s.key, "new_assessment");
    assert.equal(s.stage, "describe");
    assert.equal(s.href, "/factory");
    assert.equal(stageStatuses(f, NOW).describe, "current");
  }
  assert.equal(nextStep(signedOff, NOW).key, "make_requirement", "with an idea to ask for, it is the request that is next");
});

test("an assessment with no ideas is not sent to sign off", () => {
  const f: Facts = { ...confirmed, assessment: { items: 0, decided: 0, signedOff: false } };
  const s = nextStep(f, NOW);
  assert.equal(s.key, "no_ideas");
  assert.equal(s.stage, "describe");
  assert.equal(stageLine("diagnose", f, NOW), "No idea fits your answers yet.");
});

test("a requirement with no provider listed for it is waiting, not the owner's turn to choose", () => {
  const f: Facts = { ...signedOff, ideasToAsk: 4, requirements: 1, requirementsWithoutProvider: 1, requirementsToChoose: 0 };
  const s = nextStep(f, NOW);
  assert.equal(s.key, "waiting_for_listing");
  assert.equal(isOwnersTurn(s), false);
  assert.deepEqual(STAGE_IDS.filter((id) => stageStatuses(f, NOW)[id] === "current"), []);
  const busy = nextStep({ ...withEngagement(engagement({ baselineRecorded: true, milestones: ["accepted", "planned"], firstAcceptedAt: daysAgo(5) }), { requirements: 2, requirementsWithoutProvider: 1 }) }, NOW);
  assert.equal(busy.key, "keep_going", "work under way, with its next review date, comes before a requirement that waits");
});

test("'work is under way' is not the owner's turn, points to the work, and says only what is true", () => {
  const f = withEngagement(engagement({ baselineRecorded: true, milestones: ["planned", "planned"] }));
  const s = nextStep(f, NOW);
  assert.equal(s.key, "keep_going");
  assert.equal(isOwnersTurn(s), false);
  assert.equal(s.href, "/deliver", "the work is accepted on the delivery page");
  assert.deepEqual(STAGE_IDS.filter((id) => stageStatuses(f, NOW)[id] === "current"), [], "no stage is marked as the owner's turn");
  assert.match(s.body, /review dates start from the first one you accept/, "nothing accepted yet");
  const dated = nextStep(withEngagement(engagement({ baselineRecorded: true, milestones: ["accepted", "planned"], firstAcceptedAt: daysAgo(5) })), NOW);
  assert.match(dated.body, /The next review opens on 2026-10-30\./);
  const allReviewed = nextStep(withEngagement(engagement({ baselineRecorded: true, milestones: ["accepted", "planned"], firstAcceptedAt: daysAgo(200), reviewsRecorded: [1, 2, 3] })), NOW);
  assert.equal(allReviewed.key, "keep_going");
  assert.ok(!/review dates start from the first one you accept/.test(allReviewed.body), "the first acceptance was 200 days ago");
  assert.match(allReviewed.body, /Every review you can record so far is recorded\./);
});

test("when every milestone is accepted the owner is told to close the work, and a closed one is finished", () => {
  const open = withEngagement(engagement({ baselineRecorded: true, milestones: ["accepted", "paid"], firstAcceptedAt: daysAgo(5) }));
  const s = nextStep(open, NOW);
  assert.equal(s.key, "close_engagement");
  assert.equal(s.stage, "deliver");
  assert.equal(stageStatuses(open, NOW).deliver, "current");
  const closed = withEngagement(engagement({ closed: true, baselineRecorded: true, milestones: ["accepted", "paid"], firstAcceptedAt: daysAgo(5) }));
  assert.equal(stageStatuses(closed, NOW).deliver, "done");
  assert.notEqual(nextStep(closed, NOW).key, "close_engagement");
});

test("accepted ideas that were never asked for keep the owner from being told they are up to date", () => {
  const finished = engagement({ closed: true, milestones: ["paid"], firstAcceptedAt: daysAgo(200), baselineRecorded: true, reviewsRecorded: [1, 2, 3] });
  const more = nextStep(withEngagement(finished, { ideasToAsk: 4 }), NOW);
  assert.equal(more.key, "ask_for_more");
  assert.equal(more.title, "4 more ideas are ready to ask for");
  assert.equal(nextStep(withEngagement(finished, { ideasToAsk: 1 }), NOW).title, "One more idea is ready to ask for");
  assert.equal(nextStep(withEngagement(finished), NOW).key, "caught_up");
});

test("the strip never shows a finished step after one that is not", () => {
  const cases: Facts[] = [
    withEngagement(engagement({ closed: true, milestones: ["planned", "accepted"], baselineRecorded: true, firstAcceptedAt: daysAgo(180), reviewsRecorded: [1, 2, 3] })),
    withEngagement(engagement({ baselineRecorded: true, milestones: ["accepted"], firstAcceptedAt: daysAgo(200), reviewsRecorded: [1, 2, 3] }), { requirements: 2, requirementsWithoutProvider: 1, requirementsToChoose: 1 }),
    withEngagement(engagement({ closed: true, milestones: ["paid"], baselineRecorded: true, firstAcceptedAt: daysAgo(200), reviewsRecorded: [1, 2, 3] })),
    withEngagement(engagement({ planAgreed: false, closed: true, milestones: [] })),
    signedOff,
    NO_FACTS,
  ];
  for (const f of cases) {
    const st = stageStatuses(f, NOW);
    const done = STAGE_IDS.map((id) => st[id] === "done");
    for (let i = 1; i < done.length; i++) assert.ok(!done[i] || done[i - 1], `${STAGE_IDS[i]} is done after ${STAGE_IDS[i - 1]}, which is not: ${JSON.stringify(st)}`);
  }
  const fullyDone = withEngagement(engagement({ closed: true, milestones: ["paid"], baselineRecorded: true, firstAcceptedAt: daysAgo(200), reviewsRecorded: [1, 2, 3] }));
  assert.deepEqual(stageStatuses(fullyDone, NOW), { describe: "done", diagnose: "done", procure: "done", deliver: "done", run: "done" });
});

test("a newer draft after a confirmed version is not called confirmed", () => {
  const f: Facts = { ...NO_FACTS, factory: { latestRevision: 2, confirmedRevision: 1 } };
  assert.equal(stageLine("describe", f, NOW), "Version 1 is confirmed. Version 2 is a newer draft.");
  assert.equal(nextStep(f, NOW).key, "diagnose", "the confirmed version is what the ideas are worked out from");
});

test("a first-acceptance time that cannot be read does not stop the page", () => {
  for (const bad of ["", "not a date"]) {
    const f = withEngagement(engagement({ baselineRecorded: true, milestones: ["accepted", "planned"], firstAcceptedAt: bad }));
    assert.doesNotThrow(() => nextStep(f, NOW));
    assert.doesNotThrow(() => stageLine("run", f, NOW));
  }
});

test("the line under Measure does not say a starting number is still to come once it can no longer be recorded", () => {
  assert.equal(stageLine("run", withEngagement(engagement({ milestones: ["accepted", "planned"], firstAcceptedAt: daysAgo(3) })), NOW), "No starting number was recorded. 0 reviews recorded.");
  assert.equal(stageLine("run", withEngagement(engagement()), NOW), "No starting number yet. 0 reviews recorded.");
  const two: Facts = { ...withEngagement(engagement({ baselineRecorded: true })), engagements: [engagement({ baselineRecorded: true }), engagement()] };
  assert.equal(stageLine("run", two, NOW), "1 of 2 starting numbers recorded. 0 reviews recorded.");
  assert.equal(stageLine("deliver", withEngagement(engagement({ planAgreed: false, closed: true, milestones: [] })), NOW), "Closed before a plan was agreed.");
});

test("only the steps that need nothing from the owner are not the owner's turn", () => {
  const keys = ["keep_going", "waiting_for_listing", "caught_up"] as const;
  for (const k of keys) assert.equal(isOwnersTurn({ key: k }), false);
  for (const k of ["describe", "confirm", "diagnose", "no_ideas", "decide", "sign_off", "judge_delivery", "review_due", "agree_plan", "record_baseline", "choose_provider", "make_requirement", "new_assessment", "close_engagement", "ask_for_more"] as const) assert.equal(isOwnersTurn({ key: k }), true, k);
});
