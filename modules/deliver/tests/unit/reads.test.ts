// What the data layer asks the database for when it reads one engagement or all of a company's: the single read must not load the
// whole company's plan and events (the independent review found that it did), and both must bind the company. A fake database that
// records each statement and its values; no SQL runs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { listEngagements, loadEngagement } from "../../src/db/engagements.ts";

type Call = { sql: string; binds: unknown[] };

function fakeDb(calls: Call[]): D1Database {
  const row = { id: "e1", requirement_id: "r1", provider_id: "p1", created_at: "x", provider_name: "P", provider_summary: "S", opportunity_id: "o", cluster: "c", spec: JSON.stringify({ title: "T" }) };
  return {
    prepare(sql: string) {
      return {
        bind(...binds: unknown[]) {
          calls.push({ sql: sql.replace(/\s+/g, " "), binds });
          return { all: async () => ({ results: /FROM engagements g/.test(sql) ? [row] : [] }) };
        },
      };
    },
  } as unknown as D1Database;
}

test("reading one engagement asks only for that engagement's milestones and events, and every statement carries the company", async () => {
  const calls: Call[] = [];
  const found = await loadEngagement(fakeDb(calls), "company-1", "e1");
  assert.equal(found?.id, "e1");
  assert.equal(calls.length, 3);
  const [head, milestones, events] = calls;
  assert.deepEqual(head.binds, ["company-1", "e1"]);
  for (const call of [milestones, events]) {
    assert.match(call.sql, /WHERE company_id = \? AND engagement_id = \?/);
    assert.deepEqual(call.binds, ["company-1", "e1"]);
  }
});

test("reading the company's list asks for the company's milestones and events, bound to the company alone", async () => {
  const calls: Call[] = [];
  await listEngagements(fakeDb(calls), "company-1");
  assert.equal(calls.length, 3);
  for (const call of calls) assert.equal(call.binds[0], "company-1");
  for (const call of calls.slice(1)) {
    assert.match(call.sql, /WHERE company_id = \? ORDER BY/);
    assert.deepEqual(call.binds, ["company-1"]);
  }
});

test("an id that is empty or longer than 64 characters is not looked up at all", async () => {
  const calls: Call[] = [];
  assert.equal(await loadEngagement(fakeDb(calls), "company-1", ""), null);
  assert.equal(await loadEngagement(fakeDb(calls), "company-1", "x".repeat(65)), null);
  assert.equal(calls.length, 0);
});
