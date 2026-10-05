// The demonstration's cast and providers, checked against the code they depend on: the questionnaire (every answer is valid), the engine (every
// company is ranked the same two ideas first), the clusters and the library (every name exists), and the floor of five (the shape the script
// describes is the shape the data has).
import assert from "node:assert/strict";
import { test } from "node:test";
import { diagnose } from "../../../diagnose/src/engine.ts";
import { LIBRARY } from "../../../diagnose/src/library.ts";
import { validateAnswers } from "../../../factory/src/questionnaire.ts";
import { AGGREGATE_FLOOR } from "../../../procure/src/pool.ts";
import { isCluster } from "../../../procure/src/clusters.ts";
import { DEMO_COMPANIES, DEMO_PROVIDERS, FIRST_CLUSTER, FIRST_IDEA, PLACEHOLDER_FEE_INR, SECOND_CLUSTER, SECOND_IDEA, STAGES, firstPool, secondPool } from "../../src/cast.ts";
import { identityStatements } from "../../src/identities.ts";

const PLATFORM_SEED_IDS = ["company-synthetic-a", "company-synthetic-b", "user-synthetic-owner-a", "user-synthetic-owner-b", "user-synthetic-operator"];
const PLATFORM_SEED_EMAILS = ["owner-a@synthetic.invalid", "owner-b@synthetic.invalid", "operator@synthetic.invalid"];

test("every person and company is marked SYNTHETIC, has an address that cannot receive mail, and a unique id", () => {
  const ids = [...DEMO_COMPANIES.flatMap((c) => [c.id, c.ownerId]), ...PLATFORM_SEED_IDS];
  assert.equal(new Set(ids).size, ids.length, "ids are unique, the platform's own seed included");
  const emails = [...DEMO_COMPANIES.map((c) => c.ownerEmail), ...PLATFORM_SEED_EMAILS];
  assert.equal(new Set(emails).size, emails.length);
  for (const c of DEMO_COMPANIES) {
    assert.match(c.name, /^SYNTHETIC /, c.name);
    assert.match(c.ownerName, /^SYNTHETIC /, c.ownerName);
    assert.match(c.ownerEmail, /^[a-z0-9-]+@synthetic\.invalid$/, c.ownerEmail);
    assert.match(c.id, /^company-synthetic-/);
    assert.match(c.ownerId, /^user-synthetic-/);
  }
  for (const p of DEMO_PROVIDERS) {
    assert.match(p.name, /^SYNTHETIC /);
    assert.match(p.summary, /^SYNTHETIC/);
  }
});

test("no text in the cast looks like a real address, phone number, web address or personal name field", () => {
  const text = JSON.stringify([DEMO_COMPANIES, DEMO_PROVIDERS]);
  assert.ok(!/https?:|www\./i.test(text), "no web address");
  assert.ok(!/\b\d{10}\b|\+91/.test(text), "no phone number");
  const addresses = text.match(/[\w.+-]+@[\w.-]+/g) ?? [];
  for (const a of addresses) assert.ok(a.endsWith("@synthetic.invalid"), a);
});

test("every company's answers are valid and complete enough to confirm, and every free-text answer says it is synthetic", () => {
  for (const c of DEMO_COMPANIES) {
    const v = validateAnswers(c.answers, { confirm: true });
    assert.ok(v.ok, `${c.name}: ${v.ok ? "" : JSON.stringify(v.errors)}`);
    for (const key of ["products", "equipment", "own_words", "district"]) assert.match(String(c.answers[key]), /SYNTHETIC/, `${c.name} ${key}`);
  }
});

test("the diagnosis ranks the same first and second idea for every company, and the first is not an AI idea", () => {
  for (const c of DEMO_COMPANIES) {
    const v = validateAnswers(c.answers, { confirm: true });
    assert.ok(v.ok);
    if (!v.ok) continue;
    const items = diagnose(v.answers).items;
    assert.equal(items[0].opportunityId, FIRST_IDEA, c.name);
    assert.equal(items[1].opportunityId, SECOND_IDEA, c.name);
    assert.equal(items[0].kind, "non_ai");
    assert.ok(items.some((i) => i.kind === "ai"), `${c.name}: at least one AI idea is shown, so the script's AI step has something to point at`);
  }
});

test("the clusters, ideas and provider services all exist", () => {
  assert.ok(isCluster(FIRST_CLUSTER) && isCluster(SECOND_CLUSTER) && (FIRST_CLUSTER as string) !== SECOND_CLUSTER);
  const ideas = new Set(LIBRARY.map((o) => o.id));
  assert.ok(ideas.has(FIRST_IDEA) && ideas.has(SECOND_IDEA) && (FIRST_IDEA as string) !== SECOND_IDEA);
  for (const p of DEMO_PROVIDERS) {
    assert.ok(p.services.length >= 1 && p.services.length <= 20);
    for (const s of p.services) assert.ok(ideas.has(s.opportunityId) && isCluster(s.cluster), `${p.name}: ${s.opportunityId} in ${s.cluster}`);
    const keys = p.services.map((s) => `${s.opportunityId}/${s.cluster}`);
    assert.equal(new Set(keys).size, keys.length, `${p.name} names a service twice`);
  }
  assert.deepEqual(DEMO_PROVIDERS.map((p) => p.number), [1, 2, 3]);
});

test("the floor of five is shown on purpose: one pool is over it, one is under it even with the walked company added", () => {
  assert.ok(firstPool().length >= AGGREGATE_FLOOR, "the first pool shows its number");
  assert.ok(secondPool().length >= 1);
  assert.ok(secondPool().length + 1 < AGGREGATE_FLOOR, "with the company the presenter walks added, the second pool is still under the floor");
  assert.ok(firstPool().length < 2 * AGGREGATE_FLOOR, "the first pool, with the walked company, says 'at least 5' and not 'at least 10'");
});

test("each stage is used, only one company is the finished example, and a provider is named exactly from the stage that needs one", () => {
  for (const stage of STAGES) assert.ok(DEMO_COMPANIES.some((c) => c.stage === stage), `no company at ${stage}`);
  assert.equal(DEMO_COMPANIES.filter((c) => c.stage === "running").length, 1);
  for (const c of DEMO_COMPANIES) {
    const needsProvider = STAGES.indexOf(c.stage) >= STAGES.indexOf("provider_chosen");
    assert.equal(c.provider !== null, needsProvider, c.name);
    if (c.provider !== null) {
      const p = DEMO_PROVIDERS.find((x) => x.number === c.provider);
      assert.ok(p?.services.some((s) => s.opportunityId === FIRST_IDEA && s.cluster === FIRST_CLUSTER), `${c.name}'s provider serves the first idea in the first cluster`);
    }
  }
});

test("the first idea in the first cluster is offered by at least two providers, so the presenter's company is given a choice", () => {
  const offered = DEMO_PROVIDERS.filter((p) => p.services.some((s) => s.opportunityId === FIRST_IDEA && s.cluster === FIRST_CLUSTER));
  assert.ok(offered.length >= 2);
  const second = DEMO_PROVIDERS.filter((p) => p.services.some((s) => s.opportunityId === SECOND_IDEA && s.cluster === SECOND_CLUSTER));
  assert.ok(second.length >= 1, "the second idea in the second cluster is offered by someone");
});

test("the fee is one whole number of rupees, within the application's bound", () => {
  assert.ok(Number.isInteger(PLACEHOLDER_FEE_INR) && PLACEHOLDER_FEE_INR >= 1 && PLACEHOLDER_FEE_INR <= 10_000_000);
});

test("the people are added with INSERT OR IGNORE, once each, with quotes escaped", () => {
  const statements = identityStatements();
  assert.equal(statements.length, DEMO_COMPANIES.length * 2);
  for (const s of statements) assert.match(s, /^INSERT OR IGNORE INTO (companies|users) /);
  assert.equal(statements.filter((s) => s.includes("INTO companies")).length, DEMO_COMPANIES.length);
  assert.ok(statements.every((s) => !/;\s*\n/.test(s)), "no statement holds a semicolon and line break, which the seed splitter would cut at");
  assert.ok(statements.every((s) => !/DROP|DELETE|UPDATE /i.test(s)));
});
