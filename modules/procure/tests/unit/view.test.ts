// What the two pages say about where things stand. Each sentence is pinned, because a person reads the page's state from it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { askedLabel, distinctListedFees, nothingLeftToAsk, operatorSummary, procureCounts, procureSentence, procureTags, readyFirst, readyTone, requirementState, serviceGroups } from "../../src/view.ts";

test("a requirement is withdrawn, has a provider chosen, needs one chosen, or waits for one to be listed, in that order of precedence", () => {
  assert.equal(requirementState({ withdrawn: true, engaged: true, providersListed: 2 }).key, "withdrawn");
  assert.equal(requirementState({ withdrawn: false, engaged: true, providersListed: 0 }).key, "provider_chosen");
  assert.equal(requirementState({ withdrawn: false, engaged: false, providersListed: 1 }).key, "choose_provider");
  assert.equal(requirementState({ withdrawn: false, engaged: false, providersListed: 0 }).key, "waiting_for_listing");
});

test("only a requirement that needs a choice is the owner's turn; one with a provider is done; the others carry no colour", () => {
  assert.deepEqual(requirementState({ withdrawn: false, engaged: false, providersListed: 3 }).tone, "turn");
  assert.deepEqual(requirementState({ withdrawn: false, engaged: true, providersListed: 3 }).tone, "ok");
  assert.equal(requirementState({ withdrawn: false, engaged: false, providersListed: 0 }).tone, undefined);
  assert.equal(requirementState({ withdrawn: true, engaged: false, providersListed: 0 }).tone, undefined);
});

test("the tag words are the ones the page promises, and a withdrawn requirement is tagged Withdrawn once", () => {
  assert.equal(requirementState({ withdrawn: false, engaged: false, providersListed: 1 }).tag, "No provider chosen yet");
  assert.equal(requirementState({ withdrawn: false, engaged: false, providersListed: 0 }).tag, "No provider chosen yet");
  assert.equal(requirementState({ withdrawn: false, engaged: true, providersListed: 1 }).tag, "Provider chosen");
  assert.equal(requirementState({ withdrawn: true, engaged: false, providersListed: 0 }).tag, "Withdrawn");
});

test("nothing a requirement says about its state names a fee or a number of companies", () => {
  for (const withdrawn of [false, true]) {
    for (const engaged of [false, true]) {
      for (const providersListed of [0, 1, 4]) {
        const s = requirementState({ withdrawn, engaged, providersListed });
        assert.ok(!/fee|₹|\d/i.test(`${s.tag} ${s.next}`), `${s.key}: ${s.tag} ${s.next}`);
      }
    }
  }
});

test("the counts split the requirements by state, and ideas ready are the accepted ones not yet asked for", () => {
  const c = procureCounts({
    accepted: 5,
    asked: 3,
    requirements: [
      { withdrawn: false, engaged: false, providersListed: 2 },
      { withdrawn: false, engaged: false, providersListed: 0 },
      { withdrawn: false, engaged: true, providersListed: 1 },
      { withdrawn: true, engaged: false, providersListed: 0 },
    ],
  });
  assert.deepEqual(c, { accepted: 5, asked: 3, withdrawnAsked: 0, ready: 2, needsChoice: 1, waiting: 1, chosen: 1, withdrawn: 1 });
});

test("a withdrawn requirement is not counted as asked for, and its idea is not offered again (FND-255)", () => {
  const c = procureCounts({ accepted: 5, asked: 3, withdrawnAsked: 1, requirements: [{ withdrawn: false, engaged: false, providersListed: 2 }, { withdrawn: false, engaged: true, providersListed: 1 }, { withdrawn: true, engaged: false, providersListed: 0 }] });
  assert.deepEqual(c, { accepted: 5, asked: 2, withdrawnAsked: 1, ready: 2, needsChoice: 1, waiting: 0, chosen: 1, withdrawn: 1 });
  assert.equal(c.asked + c.withdrawnAsked + c.ready, c.accepted, "every accepted idea is asked for, taken back or still to ask for, once");
  assert.equal(askedLabel(c), "2 of 5 accepted ideas asked for. 1 withdrawn, which is not made again.");
  // Every idea asked for and then withdrawn: nothing counts as asked for.
  const all = procureCounts({ accepted: 2, asked: 2, withdrawnAsked: 2, requirements: [{ withdrawn: true, engaged: false, providersListed: 0 }, { withdrawn: true, engaged: false, providersListed: 0 }] });
  assert.equal(all.asked, 0);
  assert.equal(askedLabel(all), "0 of 2 accepted ideas asked for. 2 withdrawn, which is not made again.");
  // Nothing withdrawn: the words are as they were.
  assert.equal(askedLabel(procureCounts({ accepted: 1, asked: 1, requirements: [] })), "1 of 1 accepted idea asked for");
  assert.equal(askedLabel(procureCounts({ accepted: 5, asked: 3, requirements: [] })), "3 of 5 accepted ideas asked for");
  // The withdrawn number is held to the number asked, and a negative is held to nothing.
  assert.equal(procureCounts({ accepted: 3, asked: 1, withdrawnAsked: 9, requirements: [] }).withdrawnAsked, 1);
  assert.equal(procureCounts({ accepted: 3, asked: 1, withdrawnAsked: -4, requirements: [] }).withdrawnAsked, 0);
});

test("the sentence for no idea left to ask for does not say that a withdrawn idea was asked for", () => {
  const some = { ...none, accepted: 3, asked: 2, withdrawnAsked: 1, ready: 0 };
  assert.equal(nothingLeftToAsk({ ...none, accepted: 2, asked: 2 }), "You have asked for every idea you accepted. Your requirements are below.");
  assert.equal(nothingLeftToAsk(some), "You have asked for every other idea you accepted, and withdrew 1. A withdrawn requirement is not made again. Your requirements are below.");
  assert.equal(nothingLeftToAsk({ ...none, accepted: 1, withdrawnAsked: 1 }), "You withdrew the requirement you made, and a withdrawn requirement is not made again. To ask again, make a new assessment.");
  assert.equal(nothingLeftToAsk({ ...none, accepted: 2, withdrawnAsked: 2 }), "You withdrew every requirement you made, and a withdrawn requirement is not made again. To ask again, make a new assessment.");
  for (const c of [some, { ...none, accepted: 1, withdrawnAsked: 1 }]) assert.ok(!/asked for every idea you accepted/.test(nothingLeftToAsk(c)), "no false claim");
});

test("more asked than accepted is held to the accepted number, and a negative is held to nothing", () => {
  assert.deepEqual(procureCounts({ accepted: 2, asked: 9, requirements: [] }).ready, 0);
  assert.deepEqual(procureCounts({ accepted: -1, asked: -1, requirements: [] }), { accepted: 0, asked: 0, withdrawnAsked: 0, ready: 0, needsChoice: 0, waiting: 0, chosen: 0, withdrawn: 0 });
});

const none = { accepted: 0, asked: 0, withdrawnAsked: 0, ready: 0, needsChoice: 0, waiting: 0, chosen: 0, withdrawn: 0 };

test("the sentence puts a provider to choose before a new idea to ask for", () => {
  assert.equal(procureSentence({ ...none, accepted: 5, asked: 1, ready: 4, needsChoice: 1 }), "Next: choose a provider for the requirement below that has none yet. You can also ask for 4 more ideas.");
  assert.equal(procureSentence({ ...none, accepted: 5, asked: 2, ready: 3, needsChoice: 2 }), "Next: choose a provider for the 2 requirements below that have none yet. You can also ask for 3 more ideas.");
  assert.equal(procureSentence({ ...none, accepted: 1, asked: 1, needsChoice: 1 }), "Next: choose a provider for the requirement below that has none yet.");
  assert.equal(procureSentence({ ...none, accepted: 2, asked: 1, ready: 1, needsChoice: 1 }), "Next: choose a provider for the requirement below that has none yet. You can also ask for 1 more idea.");
});

test("with nothing asked for yet the sentence says what to do first", () => {
  assert.equal(procureSentence({ ...none, accepted: 5, ready: 5 }), "Next: pick an idea below and say which cluster you ask in.");
  assert.match(procureSentence({ ...none, accepted: 5, asked: 1, ready: 4, withdrawn: 1 }), /^Next: pick an idea below and say which cluster you ask in\. Withdrawn requirements are not made again\.$/);
});

test("when nothing is the owner's turn the sentence says who is being waited for, or that every open requirement has a provider", () => {
  assert.equal(procureSentence({ ...none, accepted: 3, asked: 1, ready: 2, chosen: 1 }), "Nothing is waiting for you. You can ask for 2 more ideas below.");
  assert.equal(procureSentence({ ...none, accepted: 1, asked: 1, waiting: 1 }), "Nothing is needed from you now. A provider has to be listed before you can choose one.");
  assert.equal(procureSentence({ ...none, accepted: 1, asked: 1, chosen: 1 }), "Every open requirement has a provider. The next step is the plan, on the delivery page.");
  assert.equal(procureSentence({ ...none, accepted: 1, asked: 1, withdrawn: 1 }), "Nothing is open.");
});

test("the tags list the owner's turn first, then what waits, then what is done, and leave out a zero", () => {
  const tags = procureTags({ ...none, accepted: 6, asked: 2, ready: 4, needsChoice: 1, waiting: 2, chosen: 1, withdrawn: 1 });
  assert.deepEqual(
    tags.map((t) => `${t.tone ?? "plain"}: ${t.text}`),
    ["brand: 4 ideas ready to ask for", "turn: 1 requirement needs a provider", "plain: 2 waiting for a provider to be listed", "ok: 1 provider chosen", "plain: 1 withdrawn"],
  );
  assert.deepEqual(procureTags(none), []);
  assert.deepEqual(procureTags({ ...none, ready: 1 }).map((t) => t.text), ["1 idea ready to ask for"]);
});

test("accepted ideas are split into those ready to ask for and those already asked, each in the order they came", () => {
  const items = [{ opportunityId: "a" }, { opportunityId: "b" }, { opportunityId: "c" }, { opportunityId: "d" }];
  const { ready, asked } = readyFirst(items, new Set(["b", "d"]));
  assert.deepEqual(ready.map((i) => i.opportunityId), ["a", "c"]);
  assert.deepEqual(asked.map((i) => i.opportunityId), ["b", "d"]);
  assert.deepEqual(readyFirst(items, new Set()).asked, []);
});

test("the operator's summary counts providers and listed providers, and says the fee is undecided until a version exists", () => {
  assert.deepEqual(operatorSummary({ terms: null, providers: [], pools: 0 }), { fee: { state: "undecided" }, providers: 0, listed: 0, poolsAtFloor: 0 });
  assert.deepEqual(operatorSummary({ terms: { feeInr: 1500, version: 2 }, providers: [{ listed: true }, { listed: false }, { listed: true }], pools: 1 }), { fee: { state: "set", feeInr: 1500, version: 2 }, providers: 3, listed: 2, poolsAtFloor: 1 });
});

test("providers listed at one fee pay one fee; a fee changed after a listing makes two; an unlisted provider's old fee does not count", () => {
  assert.equal(distinctListedFees([]), 0);
  assert.equal(distinctListedFees([{ listed: true, listedFeeInr: 1500 }, { listed: true, listedFeeInr: 1500 }]), 1);
  assert.equal(distinctListedFees([{ listed: true, listedFeeInr: 1500 }, { listed: true, listedFeeInr: 2500 }]), 2);
  assert.equal(distinctListedFees([{ listed: true, listedFeeInr: 1500 }, { listed: false, listedFeeInr: 2500 }, { listed: true, listedFeeInr: null }]), 1);
});

test("what a provider serves is one entry per idea with its clusters together, in the order first seen, each cluster once", () => {
  const title = (id: string) => ({ a: "Idea A", b: "Idea B" })[id] ?? id;
  const cluster = (id: string) => ({ c1: "Cluster 1", c2: "Cluster 2" })[id] ?? id;
  assert.deepEqual(serviceGroups([{ opportunityId: "a", cluster: "c2" }], title, cluster), ["Idea A (Cluster 2)"]);
  assert.deepEqual(
    serviceGroups([{ opportunityId: "a", cluster: "c1" }, { opportunityId: "b", cluster: "c1" }, { opportunityId: "a", cluster: "c2" }, { opportunityId: "a", cluster: "c1" }], title, cluster),
    ["Idea A (Cluster 1, Cluster 2)", "Idea B (Cluster 1)"],
  );
  assert.deepEqual(serviceGroups([], title, cluster), []);
});

test("an idea ready to ask for is the owner's turn only while no requirement is open; once one is, asking for more is an option and the idea is marked in the service's colour", () => {
  assert.equal(readyTone({ ...none, accepted: 5, ready: 5 }), "turn");
  assert.equal(readyTone({ ...none, accepted: 5, asked: 1, ready: 4, withdrawn: 1 }), "turn");
  assert.equal(readyTone({ ...none, accepted: 5, asked: 1, ready: 4, needsChoice: 1 }), "brand");
  assert.equal(readyTone({ ...none, accepted: 5, asked: 1, ready: 4, waiting: 1 }), "brand");
  assert.equal(readyTone({ ...none, accepted: 5, asked: 1, ready: 4, chosen: 1 }), "brand");
});
