// Property tests of the journey rules in modules/journey/src/progress.ts. The example tests in progress.test.ts show what the rules do on
// the facts someone thought of. These show what they do on facts nobody thought of: tens of thousands of generated companies, and
// random walks in which a company only ever moves forward, each checked against the order of the rules as docs/design/LLD.md 4.7
// writes it down (RULES in tests/support/model.ts, written from that table and not from the code).
//
// Every case comes from a fixed seed. When a property fails, the message ends with the tier, the seed, the index and the facts, so the
// case can be rebuilt on its own: `cases("coherent", <seed>, <index + 1>)` in tests/support/model.ts yields it last. Nothing here uses
// a clock or a random source that is not seeded.
import assert from "node:assert/strict";
import { test } from "node:test";
import { NO_FACTS, STAGES, STAGE_IDS, isOwnersTurn, nextStep, stageStatuses, stageLine } from "../../src/progress.ts";
import type { Facts, StageId } from "../../src/progress.ts";
import { DAY, KEYS, KNOWN_PAGES, NOTHING_NEEDED_KEYS, NOW, OTHERS_ACT, OWNER_ACTION, PAGE_OF, REVIEW_AFTER_DAYS, RULES, STAGE_ORDER, canTakeBaseline, cases, deepFreeze, deliveryWaiting, describeCase, eventNamed, expectedLinePattern, expectedRule, expectedStatuses, isoAt, newWorld, openReviewsOf, badPlurals, rawWordsIn, rng, smallEngagements, smallPrefixes, stageWordsIn, walk, worldFacts } from "../support/model.ts";
import type { Case, Key, Tier } from "../support/model.ts";

// ---------------------------------------------------------------------------------------------------------------------------------
// The cases. Built once, used by every property. The seeds are fixed here and nowhere else.

const SEEDS: Record<Tier, { seed: number; count: number }> = {
  coherent: { seed: 20261005, count: 20_000 },
  odd: { seed: 20261006, count: 15_000 },
  wild: { seed: 20261007, count: 5_000 },
};
const ALL: Record<Tier, Case[]> = { coherent: [...cases("coherent", SEEDS.coherent.seed, SEEDS.coherent.count)], odd: [...cases("odd", SEEDS.odd.seed, SEEDS.odd.count)], wild: [...cases("wild", SEEDS.wild.seed, SEEDS.wild.count)] };
/** Facts that records could produce, and facts that records could not: the rules must still answer. Wild cases are only asked not to break. */
const SENSIBLE: Case[] = [...ALL.coherent, ...ALL.odd];
const EVERYTHING: Case[] = [...SENSIBLE, ...ALL.wild];

/** Runs `check` on each case. A failure is rethrown with the seed and the facts, so it can be rebuilt. */
function forEach(list: readonly Case[], check: (c: Case) => void): void {
  for (const c of list) {
    try {
      check(c);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${message}\n  case: ${describeCase(c)}`, { cause: error });
    }
  }
}

/**
 * The pairs of rules that no facts make true together, so that swapping the two in the code changes no answer. Each is exclusive by its own
 * conditions: rule 3 needs no assessment and rules 4 to 6 need one; rules 4 and 5 split on `items`; rules 13 and 14 need no engagement and no
 * request, so they cannot hold with the rules that need an engagement (7 to 11, 15, 16); rules 13 and 14 split on `ideasToAsk`, and rule 14
 * (`ideasToAsk` is 0) cannot hold with rule 18 (it is more than 0).
 */
const SWAPS_THAT_CHANGE_NOTHING = ["3/4", "3/5", "3/6", "4/5", "7/13", "7/14", "8/13", "8/14", "9/13", "9/14", "10/13", "10/14", "11/13", "11/14", "13/14", "13/15", "13/16", "14/15", "14/16", "14/18"];

test("the generators produce what they promise: at least 5,000 cases from fixed seeds, and every rule and every pair of rules that can fire together is reached", () => {
  assert.ok(SENSIBLE.length >= 5_000 && EVERYTHING.length >= 40_000, `${EVERYTHING.length} cases`);
  const fired = new Map<number, number>();
  const together = new Set<string>();
  const pairsOf = (holding: number[]) => {
    for (const i of holding) for (const j of holding) if (i < j) together.add(`${i}/${j}`);
  };
  for (const c of SENSIBLE) {
    const holding = RULES.filter((r) => r.holds(c.facts, c.now)).map((r) => r.n);
    fired.set(holding[0]!, (fired.get(holding[0]!) ?? 0) + 1);
    pairsOf(holding);
  }
  for (const r of RULES) assert.ok((fired.get(r.n) ?? 0) >= 25, `rule ${r.n} (${r.key}) fires in only ${fired.get(r.n) ?? 0} generated cases: the generator is too weak to guard it`);
  // A swap of two rules can only be seen on facts where both hold. The generated cases and a third of the small world's combinations
  // together reach every pair of rules except the ones that no facts can make hold together.
  for (const p of smallPrefixes()) for (const g of [null, ...smallEngagements().filter((_, i) => i % 3 === 0)]) pairsOf(RULES.filter((r) => r.holds({ ...p, engagements: g ? [g] : [] }, NOW)).map((r) => r.n));
  const never: string[] = [];
  for (const i of RULES) for (const j of RULES) if (i.n < j.n && !together.has(`${i.n}/${j.n}`)) never.push(`${i.n}/${j.n}`);
  assert.deepEqual(never, SWAPS_THAT_CHANGE_NOTHING, "pairs of rules no case makes true together: a new one means the generators are too weak for some swap, a missing one means a rule changed");
});

// ---------------------------------------------------------------------------------------------------------------------------------
// nextStep: total, deterministic, in the documented order

test("nextStep is total: it never throws and always names one documented key, a stage, the stage's page and non-empty words", () => {
  forEach(EVERYTHING, (c) => {
    const s = nextStep(c.facts, c.now);
    assert.ok(KEYS.includes(s.key), `key ${s.key} is not one of the 18 documented keys`);
    assert.deepEqual(Object.keys(s).sort(), ["body", "cta", "href", "key", "stage", "title"]);
    assert.ok(STAGE_ORDER.includes(s.stage), `stage ${s.stage}`);
    assert.ok(KNOWN_PAGES.includes(s.href), `href ${s.href} is not a page of the platform`);
    assert.equal(s.href, PAGE_OF[s.stage], "the link is the page of the step's stage");
    for (const part of [s.title, s.body, s.cta]) assert.ok(typeof part === "string" && part.trim().length > 0, "words are never empty");
  });
});

test("nextStep gives the same answer for the same facts and the same time, and leaves both alone", () => {
  const same = (x: unknown, y: unknown, what: string) => assert.equal(JSON.stringify(x), JSON.stringify(y), what);
  forEach(EVERYTHING, (c) => {
    // The facts are frozen all the way down, so a function that changed its input would throw instead of passing quietly.
    const frozen = deepFreeze(structuredClone(c.facts));
    const at = c.now.getTime();
    const first = nextStep(frozen, c.now);
    same(first, nextStep(structuredClone(c.facts), new Date(at)), "a copy of the facts and of the time gives the same step");
    same(first, nextStep(frozen, c.now), "a second call on the same objects gives the same step");
    assert.equal(c.now.getTime(), at, "the time that was passed in was not moved");
    if (c.index % 4 !== 0) return;
    same(stageStatuses(frozen, c.now), stageStatuses(structuredClone(c.facts), new Date(at)), "statuses");
    for (const id of STAGE_IDS) assert.equal(stageLine(id, frozen, c.now), stageLine(id, structuredClone(c.facts), new Date(at)), id);
  });
});

test("the clock matters only through the reviews: facts with no readable first acceptance give the same answers at any time", () => {
  let checked = 0;
  forEach(SENSIBLE, (c) => {
    if (c.facts.engagements.some((g) => !Number.isNaN(Date.parse(g.firstAcceptedAt ?? "")))) return;
    checked++;
    const later = new Date(c.now.getTime() + 400 * DAY);
    const earlier = new Date(c.now.getTime() - 400 * DAY);
    for (const t of [later, earlier]) {
      assert.deepEqual(nextStep(c.facts, t), nextStep(c.facts, c.now));
      assert.deepEqual(stageStatuses(c.facts, t), stageStatuses(c.facts, c.now));
      for (const id of STAGE_IDS) assert.equal(stageLine(id, c.facts, t), stageLine(id, c.facts, c.now), id);
    }
  });
  assert.ok(checked >= 5_000, `only ${checked} cases had no readable first acceptance`);
});

test("time only opens reviews: as the clock moves on the step changes only to an open review, an open review stays open, and only the Measure line changes", () => {
  forEach(SENSIBLE, (c) => {
    const a = nextStep(c.facts, c.now);
    for (const days of [0, 1, 45, 400]) {
      const later = new Date(c.now.getTime() + days * DAY + 1);
      const b = nextStep(c.facts, later);
      if (a.key !== b.key) assert.equal(b.key, "review_due", `the step changed from ${a.key} to ${b.key} with only time passing`);
      if (a.key === "review_due") assert.equal(b.key, "review_due", "an open review closed by itself");
      const open = (t: Date) => c.facts.engagements.reduce((n, g) => n + openReviewsOf(g, t).length, 0);
      assert.ok(open(later) >= open(c.now), "the number of open reviews went down with time");
      for (const id of STAGE_IDS) if (id !== "run") assert.equal(stageLine(id, c.facts, later), stageLine(id, c.facts, c.now), `the line under ${id} changed with time`);
    }
  });
});

test("rule order: the rule that fires is the first, in the documented order, whose own condition holds", () => {
  forEach(SENSIBLE, (c) => {
    const s = nextStep(c.facts, c.now);
    const rule = expectedRule(c.facts, c.now);
    assert.equal(s.key, rule.key, `rule ${rule.n} should fire`);
    assert.equal(s.stage, rule.stage, `the stage of rule ${rule.n}`);
    // Rule 7 and rule 11 give the same key; the title says which: "first" is rule 7, the delivery that is waiting.
    if (rule.n === 7) assert.match(s.title, /first$/, "rule 7 says the number comes first");
    if (rule.n === 11) assert.doesNotMatch(s.title, /first$/, "rule 11 is the number with no delivery waiting");
  });
});

test("rule order, pair by pair: when two rules hold together the earlier one fires and the later one does not", () => {
  let pairs = 0;
  forEach(SENSIBLE, (c) => {
    const holding = RULES.filter((r) => r.holds(c.facts, c.now));
    const s = nextStep(c.facts, c.now);
    for (const later of holding.slice(1)) {
      pairs++;
      // The key of the later rule may be the key of the earlier one (rules 7 and 11 share a key); the rule number is told apart by the title.
      if (later.key !== holding[0]!.key) assert.notEqual(s.key, later.key, `rule ${later.n} (${later.key}) fired although rule ${holding[0]!.n} holds too`);
    }
  });
  assert.ok(pairs > 20_000, `${pairs} pairs of rules held together`);
});

test("every one of the 18 keys is reached by the cases, and the documented order lists each rule once", () => {
  assert.deepEqual(RULES.map((r) => r.n), Array.from({ length: 19 }, (_, i) => i + 1));
  assert.deepEqual([...new Set(RULES.map((r) => r.key))].sort(), [...KEYS].sort());
  const reached = new Set<Key>();
  for (const c of SENSIBLE) reached.add(nextStep(c.facts, c.now).key);
  assert.deepEqual([...KEYS].filter((k) => !reached.has(k)), [], "keys no generated case reaches");
});

test("isOwnersTurn is false for exactly the three steps that say nothing is needed, whatever the facts", () => {
  forEach(EVERYTHING, (c) => {
    const s = nextStep(c.facts, c.now);
    assert.equal(isOwnersTurn(s), !NOTHING_NEEDED_KEYS.includes(s.key), s.key);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// What the steps promise

test("a delivery is offered for a decision only on an engagement that is open, and a closed engagement never gets one", () => {
  forEach(EVERYTHING, (c) => {
    const s = nextStep(c.facts, c.now);
    if (s.key === "judge_delivery") assert.ok(c.facts.engagements.some((g) => !g.closed && g.milestones.includes("delivered")), "judge_delivery with no open delivery");
    if (c.facts.engagements.every((g) => g.closed)) assert.notEqual(s.key, "judge_delivery", "every engagement is closed");
    if (c.facts.engagements.every((g) => g.closed || !g.milestones.includes("delivered"))) assert.notEqual(s.key, "judge_delivery");
  });
  // The same on engagements that differ only in being closed: closing one never makes a delivery wait.
  forEach(SENSIBLE, (c) => {
    const closedAll: Facts = { ...c.facts, engagements: c.facts.engagements.map((g) => ({ ...g, closed: true })) };
    assert.notEqual(nextStep(closedAll, c.now).key, "judge_delivery");
    assert.notEqual(nextStep(closedAll, c.now).key, "agree_plan", "a closed engagement is not asked for a plan");
    assert.notEqual(nextStep(closedAll, c.now).key, "close_engagement", "a closed engagement is not asked to be closed");
    assert.notEqual(nextStep(closedAll, c.now).key, "keep_going", "a closed engagement is not work under way");
  });
});

test("a provider to choose is offered only when at least one provider is listed for a request", () => {
  forEach(EVERYTHING, (c) => {
    const s = nextStep(c.facts, c.now);
    if (s.key === "choose_provider") assert.ok(c.facts.requirementsToChoose > 0, "choose_provider with no listed provider");
    if (c.facts.requirementsToChoose <= 0) assert.notEqual(s.key, "choose_provider");
  });
  // Taking every listing away from facts that were offered a choice never leaves a choice on offer.
  forEach(SENSIBLE, (c) => {
    if (nextStep(c.facts, c.now).key !== "choose_provider") return;
    const unlisted: Facts = { ...c.facts, requirementsToChoose: 0 };
    assert.notEqual(nextStep(unlisted, c.now).key, "choose_provider");
  });
});

test("'nothing needed' steps, and 'caught up' above all, are given only when nothing above them applies", () => {
  forEach(SENSIBLE, (c) => {
    const f = c.facts;
    const s = nextStep(f, c.now);
    const open = (f2: Facts) => f2.engagements.filter((g) => !g.closed);
    const dueNow = f.engagements.some((g) => openReviewsOf(g, c.now).length > 0);
    if (!NOTHING_NEEDED_KEYS.includes(s.key)) return;
    // Each of these is something the owner is asked for by a rule that ranks above all three of the quiet steps.
    assert.ok(f.assessment !== null && f.assessment.signedOff, "quiet only after a sign-off");
    assert.ok(!f.engagements.some(deliveryWaiting), "a delivery is waiting");
    assert.ok(!dueNow, "a review is open");
    assert.ok(!open(f).some((g) => !g.planAgreed), "an engagement has no plan");
    assert.ok(!f.engagements.some(canTakeBaseline), "a starting number can be recorded");
    assert.ok(f.requirementsToChoose <= 0, "a provider can be chosen");
    assert.ok(!(f.requirements === 0 && f.engagements.length === 0), "nothing has been asked for");
    assert.ok(!open(f).some((g) => g.milestones.length > 0 && g.milestones.every((m) => m === "accepted" || m === "paid")), "an engagement is ready to close");
    if (s.key === "waiting_for_listing") assert.ok(f.requirementsWithoutProvider > 0 && !open(f).some((g) => g.planAgreed));
    if (s.key === "keep_going") assert.ok(open(f).some((g) => g.planAgreed), "no work is under way");
    if (s.key === "caught_up") {
      // Rules 1 to 18 all fail, so every one of these holds.
      assert.equal(open(f).length, 0, "an engagement is still open");
      assert.ok(f.requirementsWithoutProvider <= 0, "a request still waits for a provider");
      assert.ok(f.ideasToAsk <= 0, "an accepted idea has not been asked for");
      assert.deepEqual(RULES.slice(0, 18).filter((r) => r.holds(f, c.now)).map((r) => r.n), []);
    }
  });
});

test("the other steps are given only on the facts that make them the owner's turn", () => {
  forEach(SENSIBLE, (c) => {
    const f = c.facts;
    const s = nextStep(f, c.now);
    switch (s.key) {
      case "describe": assert.equal(f.factory.latestRevision, null); break;
      case "confirm": assert.ok(f.factory.latestRevision !== null && f.factory.confirmedRevision === null); break;
      case "diagnose": assert.ok(f.factory.confirmedRevision !== null && f.assessment === null); break;
      case "no_ideas": assert.ok(f.assessment !== null && !f.assessment.signedOff && f.assessment.items === 0); break;
      case "decide": assert.ok(f.assessment !== null && !f.assessment.signedOff && f.assessment.decided < f.assessment.items); break;
      case "sign_off": assert.ok(f.assessment !== null && !f.assessment.signedOff && f.assessment.decided >= f.assessment.items && f.assessment.items > 0); break;
      case "make_requirement": assert.ok(f.requirements === 0 && f.engagements.length === 0 && f.ideasToAsk > 0); break;
      case "new_assessment": assert.ok(f.requirements === 0 && f.engagements.length === 0 && f.ideasToAsk === 0); break;
      case "agree_plan": assert.ok(f.engagements.some((g) => !g.planAgreed && !g.closed)); break;
      case "close_engagement": assert.ok(f.engagements.some((g) => !g.closed && g.planAgreed && g.milestones.length > 0 && g.milestones.every((m) => m === "accepted" || m === "paid"))); break;
      case "ask_for_more": assert.ok(f.ideasToAsk > 0 && f.requirementsWithoutProvider <= 0); break;
      case "record_baseline": assert.ok(f.engagements.some(canTakeBaseline)); break;
      case "review_due": assert.ok(f.engagements.some((g) => openReviewsOf(g, c.now).length > 0)); break;
      default: break;
    }
  });
});

test("a step that counts says the right count and the right plural: ideas to decide, reviews open, ideas to ask for", () => {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  forEach(SENSIBLE, (c) => {
    const s = nextStep(c.facts, c.now);
    if (s.key === "decide") {
      const left = c.facts.assessment!.items - c.facts.assessment!.decided;
      assert.equal(s.title, `Decide on ${plural(left, "idea", "ideas")}`);
    }
    if (s.key === "review_due") {
      const open = c.facts.engagements.flatMap((g) => openReviewsOf(g, c.now));
      assert.equal(s.title, open.length === 1 ? `Review ${open[0]} is open` : `${open.length} reviews are open`);
    }
    if (s.key === "ask_for_more") assert.equal(s.title, c.facts.ideasToAsk === 1 ? "One more idea is ready to ask for" : `${c.facts.ideasToAsk} more ideas are ready to ask for`);
  });
});

test("'work is under way' names the earliest review that is still to come, or says what is true when there is none", () => {
  let dated = 0;
  forEach(SENSIBLE, (c) => {
    const s = nextStep(c.facts, c.now);
    if (s.key !== "keep_going") return;
    assert.match(s.body, /^Nothing needs you today\. /);
    const coming: number[] = [];
    let accepting = false;
    for (const g of c.facts.engagements) {
      const t = Date.parse(g.firstAcceptedAt ?? "");
      if (Number.isNaN(t)) continue;
      accepting = true;
      for (const no of [1, 2, 3]) if (!g.reviewsRecorded.includes(no) && c.now.getTime() < t + REVIEW_AFTER_DAYS[no - 1]! * DAY) coming.push(t + REVIEW_AFTER_DAYS[no - 1]! * DAY);
    }
    if (coming.length > 0) {
      dated++;
      const earliest = Math.min(...coming);
      const said = /The next review opens on (\d{4}-\d{2}-\d{2})\./.exec(s.body);
      assert.ok(said, `no date in: ${s.body}`);
      // The date is the earliest one. A day either side is allowed, because the page may name the day in India or in UTC.
      assert.ok(Math.abs(Date.parse(said![1]!) - Date.parse(isoAt(earliest).slice(0, 10))) <= DAY, `${said![1]} is not the day of the earliest review, ${isoAt(earliest)}`);
    } else if (accepting) assert.match(s.body, /Every review you can record so far is recorded\./);
    else assert.match(s.body, /Accept each milestone as it is delivered/);
  });
  assert.ok(dated >= 100, `only ${dated} cases had a review still to come`);
});

// ---------------------------------------------------------------------------------------------------------------------------------
// The five stages

test("stageStatuses names all five stages, in order, each done, current or todo", () => {
  assert.deepEqual([...STAGE_IDS], [...STAGE_ORDER]);
  assert.deepEqual(STAGES.map((s) => [s.id, s.n, s.href]), STAGE_ORDER.map((id, i) => [id, i + 1, PAGE_OF[id]]));
  forEach(EVERYTHING, (c) => {
    const st = stageStatuses(c.facts, c.now);
    assert.deepEqual(Object.keys(st), [...STAGE_ORDER]);
    assert.deepEqual(Object.keys(st), STAGES.map((s) => s.id));
    for (const id of STAGE_IDS) assert.ok(["done", "current", "todo"].includes(st[id]), `${id} is ${st[id]}`);
  });
});

test("stageStatuses marks at most one stage as the owner's turn, and only when the step is the owner's turn", () => {
  forEach(EVERYTHING, (c) => {
    const st = stageStatuses(c.facts, c.now);
    const s = nextStep(c.facts, c.now);
    const current = STAGE_ORDER.filter((id) => st[id] === "current");
    assert.ok(current.length <= 1, `current: ${current.join(", ")}`);
    if (isOwnersTurn(s)) assert.deepEqual(current, [s.stage], "the owner's turn is marked on the step's stage");
    else assert.deepEqual(current, [], "no stage is marked when nothing is needed");
  });
});

test("the strip never shows a finished stage after one that has not been started", () => {
  forEach(EVERYTHING, (c) => {
    const st = stageStatuses(c.facts, c.now);
    STAGE_ORDER.forEach((id, j) => {
      if (st[id] === "done") assert.ok(!STAGE_ORDER.slice(0, j).some((before) => st[before] === "todo"), `${id} is done after a stage that is not started: ${JSON.stringify(st)}`);
    });
  });
});

test("a finished stage follows the owner's turn only when the owner is sent back to an earlier stage by a step the documents name", () => {
  // The statuses are chosen so that the stage that is the owner's turn is shown as current even if it was finished before. So "current" can
  // stand before a "done": Describe is current for new_assessment while Decide is done, and Choose is current for ask_for_more while
  // Deliver is done. docs/design/LLD.md 4.7 says so ("the current test comes first"). On facts that records could produce, no other step does it.
  const afterCurrent = new Map<Key, number>();
  forEach(ALL.coherent, (c) => {
    const st = stageStatuses(c.facts, c.now);
    const s = nextStep(c.facts, c.now);
    if (STAGE_ORDER.some((id, j) => st[id] === "done" && STAGE_ORDER.slice(0, j).some((before) => st[before] === "current"))) afterCurrent.set(s.key, (afterCurrent.get(s.key) ?? 0) + 1);
  });
  assert.deepEqual([...afterCurrent.keys()].sort(), ["ask_for_more", "new_assessment"]);
});

test("a stage is done only when its own test holds and every stage before it is finished (the table of the stages, not the code)", () => {
  forEach(SENSIBLE, (c) => {
    assert.deepEqual(stageStatuses(c.facts, c.now), expectedStatuses(c.facts, c.now));
  });
});

test("a stage can be done only if the stages before it are done or are the owner's turn, even when facts contradict each other", () => {
  forEach(EVERYTHING, (c) => {
    const st = stageStatuses(c.facts, c.now);
    // Describe is the first stage: it is done exactly when a version is confirmed, unless it is the owner's turn.
    if (st.describe === "done") assert.ok(c.facts.factory.confirmedRevision !== null);
    if (c.facts.factory.confirmedRevision === null && st.describe !== "current") assert.equal(st.describe, "todo");
    if (st.diagnose === "done") assert.ok(c.facts.assessment?.signedOff === true, "diagnose is done with no signed-off assessment");
    if (st.procure === "done") assert.ok(c.facts.engagements.length > 0 && c.facts.requirementsWithoutProvider === 0, "procure is done with nothing chosen or a request waiting");
    if (st.deliver === "done") assert.ok(c.facts.engagements.length > 0 && c.facts.engagements.every((g) => g.closed), "deliver is done with work still open");
    if (st.run === "done") assert.ok(c.facts.engagements.length > 0, "run is done with no engagement");
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Words an owner reads

/** The whole numbers in the line under each stage, in the order they are written, worked out from the facts by the table of FR-UX-21. */
function numbersInLine(stage: StageId, f: Facts, now: Date): number[] {
  const accepted = f.engagements.reduce((n, g) => n + g.milestones.filter((m) => m === "accepted" || m === "paid").length, 0);
  const total = f.engagements.reduce((n, g) => n + g.milestones.length, 0);
  const recorded = f.engagements.reduce((n, g) => n + g.reviewsRecorded.length, 0);
  const open = f.engagements.reduce((n, g) => n + openReviewsOf(g, now).length, 0);
  switch (stage) {
    case "describe": {
      const { latestRevision: latest, confirmedRevision: confirmed } = f.factory;
      if (latest === null) return [];
      return confirmed === null || confirmed === latest ? [latest] : [confirmed, latest];
    }
    case "diagnose":
      if (f.factory.confirmedRevision === null || f.assessment === null || f.assessment.items === 0) return [];
      return [f.assessment.decided, f.assessment.items];
    case "procure":
      return f.assessment?.signedOff !== true || f.requirements === 0 ? [] : [f.requirements, f.engagements.length];
    case "deliver":
      return f.engagements.length === 0 || !f.engagements.some((g) => g.planAgreed) ? [] : [accepted, total];
    case "run":
      if (f.engagements.length === 0) return [];
      if (open > 0) return [open];
      return f.engagements.length === 1 ? [recorded] : [f.engagements.filter((g) => g.baselineRecorded).length, f.engagements.length, recorded];
  }
}

test("the line under each stage never shows a raw key, a stage id, 'undefined', 'null' or 'NaN', its numbers are the facts' numbers and its plurals are right", () => {
  forEach(SENSIBLE, (c) => {
    for (const id of STAGE_IDS) {
      const line = stageLine(id, c.facts, c.now);
      assert.ok(typeof line === "string" && line.trim().length > 0, `${id}: empty line`);
      assert.deepEqual(rawWordsIn(line), [], `${id}: "${line}"`);
      assert.deepEqual(stageWordsIn(line), [], `${id}: "${line}" names a stage by its id`);
      assert.deepEqual(badPlurals(line), [], `${id}: "${line}" has a count with the wrong plural`);
      assert.deepEqual((line.match(/\d+/g) ?? []).map(Number), numbersInLine(id, c.facts, c.now), `${id}: "${line}"`);
    }
  });
  // On hostile input (negative or huge counts) the line still comes back as text and never as a raw key.
  forEach(ALL.wild, (c) => {
    for (const id of STAGE_IDS) {
      const line = stageLine(id, c.facts, c.now);
      assert.equal(typeof line, "string");
      assert.deepEqual(rawWordsIn(line).filter((w) => w !== "NaN" && w !== "Infinity"), [], `${id}: "${line}"`);
    }
  });
});

test("the line under each stage says what the facts say, by the documented order of conditions", () => {
  forEach(SENSIBLE, (c) => {
    for (const id of STAGE_IDS) {
      const line = stageLine(id, c.facts, c.now);
      assert.match(line, expectedLinePattern(id, c.facts, c.now), `${id}: "${line}"`);
    }
  });
});

test("the words of every step are plain: no raw key, no 'undefined', no 'null', no unfilled template, the right plural", () => {
  forEach(SENSIBLE, (c) => {
    const s = nextStep(c.facts, c.now);
    for (const part of [s.title, s.body, s.cta]) {
      assert.deepEqual(rawWordsIn(part), [], `${s.key}: "${part}"`);
      assert.deepEqual(badPlurals(part), [], `${s.key}: "${part}" has a count with the wrong plural`);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Moving forward. A company that only ever adds progress is never sent back to an earlier stage, except by the steps listed here.

const index = (stage: StageId) => STAGE_ORDER.indexOf(stage);

/**
 * The steps from which the owner may be sent to an earlier stage after a step that only added progress, written as the rule behind each:
 * - into no_ideas or new_assessment: the owner is sent back to Describe because there is nothing to decide on or nothing left to ask for
 *   (rules 4 and 14);
 * - out of a Measure step (record_baseline, review_due): the number or the review is done and the delivery or the request that comes next is
 *   a step of an earlier stage, because Measure steps sit beside Deliver and not after it;
 * - out of a Deliver step into a Choose step (choose_provider, waiting_for_listing, ask_for_more): the work on one engagement is finished or
 *   closed and a request that was behind it comes up (ask_for_more is the case the documents name).
 * Everything else must not move to an earlier stage.
 */
function backwardIsDocumented(from: { key: Key; stage: StageId }, to: { key: Key; stage: StageId }): boolean {
  if (to.key === "no_ideas" || to.key === "new_assessment") return true;
  if (from.stage === "run") return to.stage === "deliver" || to.stage === "procure";
  if (from.stage === "deliver") return to.stage === "procure";
  return false;
}

test("one company walked from nothing to a finished engagement: the next step never returns to an earlier stage except by the documented steps", () => {
  const f = (over: Partial<Facts>): Facts => ({ ...NO_FACTS, ...over });
  const eng = (over: Partial<Facts["engagements"][number]>): Facts["engagements"][number] => ({ planAgreed: true, closed: false, milestones: ["planned", "planned"], baselineRecorded: false, firstAcceptedAt: null, reviewsRecorded: [], ...over });
  const signed = { factory: { latestRevision: 1, confirmedRevision: 1 }, assessment: { items: 4, decided: 4, signedOff: true } } as const;
  const asked = { ...signed, ideasToAsk: 0, requirements: 1, requirementsWithoutProvider: 0, requirementsToChoose: 0 };
  const acc = isoAt(NOW.getTime());
  const t31 = new Date(NOW.getTime() + 31 * DAY);
  const chain: { name: string; facts: Facts; now?: Date; key: Key }[] = [
    { name: "nothing done", facts: NO_FACTS, key: "describe" },
    { name: "a draft is saved", facts: f({ factory: { latestRevision: 1, confirmedRevision: null } }), key: "confirm" },
    { name: "the description is confirmed", facts: f({ factory: { latestRevision: 1, confirmedRevision: 1 } }), key: "diagnose" },
    { name: "an assessment is made", facts: f({ factory: { latestRevision: 1, confirmedRevision: 1 }, assessment: { items: 4, decided: 0, signedOff: false } }), key: "decide" },
    { name: "three ideas are decided", facts: f({ factory: { latestRevision: 1, confirmedRevision: 1 }, assessment: { items: 4, decided: 3, signedOff: false } }), key: "decide" },
    { name: "all four are decided", facts: f({ factory: { latestRevision: 1, confirmedRevision: 1 }, assessment: { items: 4, decided: 4, signedOff: false } }), key: "sign_off" },
    { name: "signed off, one idea accepted", facts: f({ ...signed, ideasToAsk: 1 }), key: "make_requirement" },
    { name: "a request is made, no provider is listed", facts: f({ ...signed, ideasToAsk: 0, requirements: 1, requirementsWithoutProvider: 1 }), key: "waiting_for_listing" },
    { name: "a provider is listed", facts: f({ ...signed, ideasToAsk: 0, requirements: 1, requirementsWithoutProvider: 1, requirementsToChoose: 1 }), key: "choose_provider" },
    { name: "the provider is chosen", facts: f({ ...asked, engagements: [eng({ planAgreed: false, milestones: [] })] }), key: "agree_plan" },
    { name: "the plan is agreed", facts: f({ ...asked, engagements: [eng({})] }), key: "record_baseline" },
    { name: "the starting number is written down", facts: f({ ...asked, engagements: [eng({ baselineRecorded: true })] }), key: "keep_going" },
    { name: "the first milestone is delivered", facts: f({ ...asked, engagements: [eng({ baselineRecorded: true, milestones: ["delivered", "planned"] })] }), key: "judge_delivery" },
    { name: "the first milestone is accepted", facts: f({ ...asked, engagements: [eng({ baselineRecorded: true, milestones: ["accepted", "planned"], firstAcceptedAt: acc })] }), key: "keep_going" },
    { name: "the second is delivered", facts: f({ ...asked, engagements: [eng({ baselineRecorded: true, milestones: ["accepted", "delivered"], firstAcceptedAt: acc })] }), key: "judge_delivery" },
    { name: "the second is accepted: every milestone is accepted", facts: f({ ...asked, engagements: [eng({ baselineRecorded: true, milestones: ["accepted", "accepted"], firstAcceptedAt: acc })] }), key: "close_engagement" },
    { name: "31 days later the first review is open", facts: f({ ...asked, engagements: [eng({ baselineRecorded: true, milestones: ["paid", "accepted"], firstAcceptedAt: acc })] }), now: t31, key: "review_due" },
    { name: "the first review is recorded", facts: f({ ...asked, engagements: [eng({ baselineRecorded: true, milestones: ["paid", "paid"], firstAcceptedAt: acc, reviewsRecorded: [1] })] }), now: t31, key: "close_engagement" },
    { name: "the work is closed", facts: f({ ...asked, engagements: [eng({ closed: true, baselineRecorded: true, milestones: ["paid", "paid"], firstAcceptedAt: acc, reviewsRecorded: [1] })] }), now: t31, key: "caught_up" },
  ];
  const used = new Set<string>();
  let before: { key: Key; stage: StageId } | null = null;
  for (const link of chain) {
    const s = nextStep(link.facts, link.now ?? NOW);
    assert.equal(s.key, link.key, `after "${link.name}"`);
    if (before !== null && index(s.stage) < index(before.stage)) {
      assert.ok(backwardIsDocumented(before, s), `after "${link.name}" the next step went back from ${before.key} (${before.stage}) to ${s.key} (${s.stage})`);
      used.add(`${before.key} > ${s.key}`);
    }
    before = { key: s.key, stage: s.stage };
  }
  // The only steps back in this chain are the Measure steps handing on to the delivery that goes on.
  assert.deepEqual([...used].sort(), ["record_baseline > keep_going", "review_due > close_engagement"]);
  // The same company with two more ideas accepted but not asked for ends with ask_for_more, a documented step back from Deliver to Choose.
  const last = chain[chain.length - 1]!;
  const more = nextStep({ ...last.facts, ideasToAsk: 2 }, last.now ?? NOW);
  assert.equal(more.key, "ask_for_more");
  assert.ok(backwardIsDocumented({ key: "close_engagement", stage: "deliver" }, more));
});

test("random companies walked forward, event by event: every state answers by the documented order, and no step goes back to an earlier stage except the documented ones", () => {
  const WALKS = 1_500;
  const STEPS = 70;
  let states = 0;
  const reached = new Set<Key>();
  const backward = new Map<string, number>();
  for (let seed = 1; seed <= WALKS; seed++) {
    let before: { key: Key; stage: StageId } | null = null;
    let lastEvent: string | null = null;
    try {
      walk(seed, STEPS, (facts, now, event, world) => {
        states++;
        const s = nextStep(facts, now);
        const rule = expectedRule(facts, now);
        assert.equal(s.key, rule.key, "the documented order");
        assert.deepEqual(stageStatuses(facts, now), expectedStatuses(facts, now));
        // A step that asks something of the owner asks for something the platform lets the owner do in this very state.
        const asks = OWNER_ACTION[s.key];
        if (asks) assert.ok(asks.some((name) => eventNamed(name).possible(world)), `${s.key} asks for something that cannot be done: ${asks.join(" or ")}`);
        reached.add(s.key);
        if (before !== null && index(s.stage) < index(before.stage)) {
          assert.ok(backwardIsDocumented(before, s), `the step went back from ${before.key} (${before.stage}) to ${s.key} (${s.stage}) after the event "${event}"`);
          backward.set(`${before.key} > ${s.key}`, (backward.get(`${before.key} > ${s.key}`) ?? 0) + 1);
        }
        before = { key: s.key, stage: s.stage };
        lastEvent = event;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${message}\n  walk: seed=${seed} steps=${STEPS} (walk(${seed}, ${STEPS}, ...) in tests/support/model.ts); last event "${lastEvent}"`, { cause: error });
    }
  }
  assert.equal(states, WALKS * (STEPS + 1));
  assert.deepEqual([...KEYS].filter((k) => !reached.has(k)), [], "keys the walks never reached");
  assert.ok(backward.size >= 5, `only ${backward.size} different steps back were seen: the walks are too short to try the rule`);
});

test("an owner who does what each step asks, while providers and the operator do their part, always reaches the end and never goes round in a circle", () => {
  const TERMINAL: Key[] = ["caught_up", "new_assessment", "no_ideas"];
  const LIMIT = 600;
  const endings = new Map<Key, number>();
  let finishedAll = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const r = rng(seed * 7919);
    const w = newWorld();
    const seen = new Set<string>();
    const trace: string[] = [];
    let ended: Key | null = null;
    for (let i = 0; i < LIMIT && ended === null; i++) {
      const facts = worldFacts(w);
      const s = nextStep(facts, w.now);
      const fingerprint = `${JSON.stringify(facts)}@${w.now.getTime()}`;
      const here = () => `seed=${seed} after ${i} moves; last moves: ${trace.slice(-6).join(" > ")}; facts=${JSON.stringify(facts)}`;
      assert.ok(!seen.has(fingerprint), `the same state came round again: ${here()}`);
      seen.add(fingerprint);
      // Reviews still to come on finished work are waited for: the owner is not up to date until every review that can be recorded is.
      const waitingForReviews = s.key === "caught_up" && w.engagements.some((g) => g.firstAcceptedAt !== null && g.reviewsRecorded.length < 3);
      if (TERMINAL.includes(s.key) && !waitingForReviews) {
        ended = s.key;
        break;
      }
      const asks = OWNER_ACTION[s.key];
      let name: string;
      if (asks) {
        const possible = asks.filter((a) => eventNamed(a).possible(w));
        assert.ok(possible.length > 0, `${s.key} asks for something that cannot be done: ${here()}`);
        // Now and then the owner rejects a delivery instead of accepting it.
        name = s.key === "judge_delivery" && r.chance(0.15) ? "reject a delivery" : possible[0]!;
      } else {
        const others = (OTHERS_ACT[s.key] ?? ["let some days pass"]).filter((a) => eventNamed(a).possible(w));
        assert.ok(others.length > 0, `${s.key}: nobody can do anything: ${here()}`);
        name = others[0]!;
      }
      trace.push(name);
      eventNamed(name).apply(w, r);
      // A rejection is the one move that can lead back to a state seen before (the provider delivers again, as the plan allows), so the
      // states seen so far are forgotten; every other move adds progress, and a state that returns after one is a circle.
      if (name === "reject a delivery") seen.clear();
    }
    assert.ok(ended !== null, `did not end within ${LIMIT} moves: seed=${seed}; last moves: ${trace.slice(-8).join(" > ")}`);
    endings.set(ended, (endings.get(ended) ?? 0) + 1);
    if (ended === "caught_up") {
      // Everything was done: all five stages are finished and nothing is the owner's turn.
      const facts = worldFacts(w);
      assert.deepEqual(stageStatuses(facts, w.now), { describe: "done", diagnose: "done", procure: "done", deliver: "done", run: "done" }, `seed=${seed}: ${JSON.stringify(facts)}`);
      finishedAll++;
    }
  }
  assert.ok(finishedAll >= 100, `only ${finishedAll} of 400 companies finished everything`);
  assert.ok(endings.has("new_assessment") && endings.has("no_ideas"), "the walks reached both of the steps that send the owner back to Describe");
});
