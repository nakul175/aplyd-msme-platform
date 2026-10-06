import assert from "node:assert/strict";
import { test } from "node:test";
import { REVIEW_TAG, firstOpenReview, firstTurn, latestRecorded, recordedCount, resultsSummary } from "../../src/view.ts";
import type { ResultsView } from "../../src/view.ts";

const slot = (state: ResultsView["reviews"][number]["state"], dueAt: string | null = null) => ({ state, dueAt });

test("every state of a review has a label, and only an open review is marked as the owner's turn", () => {
  assert.deepEqual(Object.keys(REVIEW_TAG).sort(), ["due", "not_due", "recorded", "waiting"]);
  assert.deepEqual(Object.entries(REVIEW_TAG).filter(([, v]) => v.tone === "turn").map(([k]) => k), ["due"]);
  assert.deepEqual([REVIEW_TAG.waiting.text, REVIEW_TAG.not_due.text, REVIEW_TAG.due.text, REVIEW_TAG.recorded.text], ["Waiting", "Not open yet", "Open now", "Recorded"]);
});

test("the latest review is the highest-numbered one with a record, not the last one that exists", () => {
  const r = (no: number, record: unknown) => ({ no, record });
  assert.equal(latestRecorded([r(1, { value: 5 }), r(2, null), r(3, null)])?.no, 1);
  assert.equal(latestRecorded([r(1, { value: 5 }), r(2, { value: 6 }), r(3, null)])?.no, 2);
  assert.equal(latestRecorded([r(1, null), r(2, null), r(3, null)]), null);
  assert.equal(latestRecorded([]), null);
});

test("recorded reviews are counted by state", () => {
  assert.equal(recordedCount([{ state: "recorded" }, { state: "due" }, { state: "not_due" }]), 1);
  assert.equal(recordedCount([]), 0);
});

test("when two reviews are open at once the first one is the main button, and with none open there is none", () => {
  assert.equal(firstOpenReview([{ no: 1, state: "recorded" }, { no: 2, state: "due" }, { no: 3, state: "due" }]), 2);
  assert.equal(firstOpenReview([{ no: 1, state: "recorded" }, { no: 2, state: "not_due" }, { no: 3, state: "waiting" }]), null);
  assert.equal(firstOpenReview([]), null);
});

test("an open review is the owner's turn and comes before everything else", () => {
  const s = resultsSummary([{ canRecordBaseline: true, reviews: [slot("due", "2026-11-04T00:00:00.000Z"), slot("due", "2026-12-04T00:00:00.000Z"), slot("not_due", "2027-02-01T00:00:00.000Z")] }]);
  assert.deepEqual([s.open, s.baselineToRecord, s.yourTurn], [2, 1, true]);
  assert.equal(s.sentence, "2 reviews are open now.");
  assert.equal(resultsSummary([{ canRecordBaseline: false, reviews: [slot("due"), slot("not_due", "2027-02-01T00:00:00.000Z"), slot("not_due", "2027-05-01T00:00:00.000Z")] }]).sentence, "1 review is open now.");
});

test("a starting number that can still be recorded is the owner's turn when no review is open", () => {
  const s = resultsSummary([{ canRecordBaseline: true, reviews: [slot("waiting"), slot("waiting"), slot("waiting")] }]);
  assert.deepEqual([s.open, s.baselineToRecord, s.yourTurn], [0, 1, true]);
  assert.equal(s.sentence, "Write down your starting number before the first milestone is accepted.");
});

test("when nothing is open the page says when the next review opens, the earliest date across all engagements, in UTC", () => {
  const s = resultsSummary([
    { canRecordBaseline: false, reviews: [slot("recorded", "2026-10-30T10:00:00.000Z"), slot("not_due", "2027-03-01T23:59:00.000Z"), slot("not_due", "2027-06-01T00:00:00.000Z")] },
    { canRecordBaseline: false, reviews: [slot("not_due", "2026-12-05T00:00:00.000Z"), slot("not_due", "2027-03-05T00:00:00.000Z"), slot("not_due", "2027-06-05T00:00:00.000Z")] },
  ]);
  assert.deepEqual([s.open, s.nextOpens, s.yourTurn], [0, "2026-12-05", false]);
  assert.equal(s.sentence, "Nothing needs you today. The next review opens on 2026-12-05.");
});

test("with nothing accepted and a starting number recorded, the page explains when the reviews begin; with every review recorded it says so", () => {
  assert.match(resultsSummary([{ canRecordBaseline: false, reviews: [slot("waiting"), slot("waiting"), slot("waiting")] }]).sentence, /^Nothing needs you today\. The reviews are counted from the day you accept your first milestone\.$/);
  const done = resultsSummary([{ canRecordBaseline: false, reviews: [slot("recorded"), slot("recorded"), slot("recorded")] }]);
  assert.deepEqual([done.yourTurn, done.sentence], [false, "Every review is recorded."]);
  assert.equal(resultsSummary([]).yourTurn, false);
});

test("the link at the top goes to an open review before a starting number to record, and to nothing when it is nobody's turn", () => {
  const rv = (...states: ("waiting" | "not_due" | "due" | "recorded")[]) => states.map((state, i) => ({ no: i + 1, state }));
  assert.deepEqual(firstTurn([{ id: "e1", canRecordBaseline: true, reviews: rv("waiting", "waiting", "waiting") }, { id: "e2", canRecordBaseline: false, reviews: rv("recorded", "due", "due") }]), { kind: "review", engagementId: "e2", no: 2 });
  assert.deepEqual(firstTurn([{ id: "e1", canRecordBaseline: false, reviews: rv("waiting", "waiting", "waiting") }, { id: "e2", canRecordBaseline: true, reviews: rv("waiting", "waiting", "waiting") }]), { kind: "baseline", engagementId: "e2" });
  assert.equal(firstTurn([{ id: "e1", canRecordBaseline: false, reviews: rv("recorded", "not_due", "not_due") }]), null);
  assert.equal(firstTurn([]), null);
});

test("when the owner's next step is on another page, the summary says so instead of saying nothing needs the owner (S5-06)", () => {
  const s = resultsSummary([{ canRecordBaseline: false, reviews: [slot("waiting"), slot("waiting"), slot("waiting")] }], "A delivery is waiting for your decision");
  assert.equal(s.sentence, "Nothing on this page needs you today. Your next step is on another page: “A delivery is waiting for your decision”, at the foot of this page.");
  assert.doesNotMatch(s.sentence, /^Nothing needs you today/);
  assert.equal(resultsSummary([{ canRecordBaseline: true, reviews: [] }], "Anything").sentence, "Write down your starting number before the first milestone is accepted.", "what is the owner's turn on this page still comes first");
  assert.equal(resultsSummary([{ canRecordBaseline: false, reviews: [slot("due")] }], "Anything").sentence, "1 review is open now.");
});
