// The seeder's two self-checks, on their own: it must refuse to finish when the cast and the application disagree about the ranking or the floor
// of five, because a demonstration whose script says one thing and whose pages show another is worse than none.
import assert from "node:assert/strict";
import { test } from "node:test";
import { FIRST_CLUSTER, FIRST_IDEA, SECOND_CLUSTER, SECOND_IDEA } from "../../src/cast.ts";
import { checkPools, checkRanking } from "../../src/seed.ts";

test("the ranking check accepts the two ideas first and second, in that order, and names the company and the ideas when it does not", () => {
  checkRanking("SYNTHETIC Company X", [FIRST_IDEA, SECOND_IDEA, "ai_job_scheduling"]);
  assert.throws(() => checkRanking("SYNTHETIC Company X", [SECOND_IDEA, FIRST_IDEA]), /SYNTHETIC Company X.*ranked inspection_checklist_and_gauges, digital_job_log first/);
  assert.throws(() => checkRanking("SYNTHETIC Company X", ["ai_job_scheduling", FIRST_IDEA, SECOND_IDEA]), /ranked ai_job_scheduling, digital_job_log first/);
  assert.throws(() => checkRanking("SYNTHETIC Company X", [FIRST_IDEA]), /ranked digital_job_log first/);
  assert.throws(() => checkRanking("SYNTHETIC Company X", []), /ranked\s+first/);
});

test("the pool check needs the first pool shown and the second hidden, and refuses either way round", () => {
  const first = { cluster: FIRST_CLUSTER, opportunityId: FIRST_IDEA };
  const second = { cluster: SECOND_CLUSTER, opportunityId: SECOND_IDEA };
  assert.deepEqual(checkPools([first]), { firstPoolShown: true, secondPoolHidden: true });
  assert.deepEqual(checkPools([first, { cluster: SECOND_CLUSTER, opportunityId: FIRST_IDEA }]), { firstPoolShown: true, secondPoolHidden: true }, "another pool does not count as the second");
  assert.throws(() => checkPools([]), /first pool shown false, second pool hidden true/);
  assert.throws(() => checkPools([first, second]), /first pool shown true, second pool hidden false/);
  assert.throws(() => checkPools([second]), /first pool shown false, second pool hidden false/);
  assert.throws(() => checkPools([{ cluster: SECOND_CLUSTER, opportunityId: FIRST_IDEA }]), /first pool shown false/, "the first idea in the wrong cluster is not the first pool");
});
