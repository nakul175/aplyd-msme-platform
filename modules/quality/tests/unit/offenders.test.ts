// The rule that compares a run with the recorded list of known offenders, and the recorded lists themselves. No browser, no application.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ACCESSIBILITY_CHECKS, MAX_TABS_TO_FIRST_FIELD, PHONE_CHECKS } from "../support/findings.ts";
import { MIN_TARGET_PX, OFFSCREEN_BY_DESIGN, PAGES, PERSONAS, VIEWPORT } from "../support/matrix.ts";
import { UPDATE_ENV, diff, formatBaseline, message, sortEntries, toEntries } from "../support/offenders.ts";
import type { BaselineFile, Finding } from "../support/offenders.ts";

const f = (check: string, page: string, persona: string, key: string, detail = "d"): Finding => ({ check, page, persona, key, detail });
const ORDER = ["visitor", "owner-a", "owner-b", "operator"];

test("findings are grouped by check, page and key, with the people who have each fault in the order the people are listed", () => {
  const entries = toEntries([f("tap-target", "/run", "operator", "a Back"), f("tap-target", "/run", "visitor", "a Back", "first"), f("tap-target", "/run", "owner-b", "a Back"), f("page-overflow", "/", "owner-a", "document")], ORDER);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map((e) => e.check), ["page-overflow", "tap-target"]);
  assert.deepEqual(entries[1].personas, ["visitor", "owner-b", "operator"]);
  assert.equal(entries[1].detail, "first", "the detail is the first person's");
});

test("a new fault, and a fault that has gone, are each reported, per person, for the checks asked about and no others", () => {
  const recorded = toEntries([f("tap-target", "/run", "visitor", "a Back"), f("tap-target", "/run", "owner-a", "a Back"), f("focus-indicator", "/", "visitor", "button Go")]);
  const now = [f("tap-target", "/run", "visitor", "a Back"), f("tap-target", "/run", "operator", "a Back"), f("tap-target", "/run", "visitor", "button Save"), f("focus-indicator", "/", "owner-b", "button Other")];
  const d = diff(now, recorded, ["tap-target"]);
  assert.deepEqual(d.added, ["/run  operator  tap-target  a Back", "/run  visitor  tap-target  button Save"]);
  assert.deepEqual(d.removed, ["/run  owner-a  tap-target  a Back"]);
  assert.deepEqual(diff(now, recorded, ["clipped-control"]), { added: [], removed: [] }, "a check not asked about is not compared");
  const same = diff(toEntries(now).flatMap((e) => e.personas.map((p) => f(e.check, e.page, p, e.key))), toEntries(now), ["tap-target", "focus-indicator"]);
  assert.deepEqual(same, { added: [], removed: [] });
});

test("the message lists new faults and gone faults and says how to record the present state on purpose", () => {
  const text = message("x/phone.json", { added: ["/ visitor tap-target a"], removed: ["/run owner-a tap-target b"] });
  assert.match(text, /1 fault\(s\) found that are not on the list/);
  assert.match(text, /\+ \/ visitor tap-target a/);
  assert.match(text, /no longer found/);
  assert.match(text, /- \/run owner-a tap-target b/);
  assert.match(text, new RegExp(`${UPDATE_ENV}=1`));
});

test("a recorded list is written one fault to a line and reads back as it was written", () => {
  const file: BaselineFile = { about: "about", recordedOn: "2026-10-06", entries: toEntries([f("tap-target", "/run", "visitor", 'a "Back" -> /')], ORDER) };
  const text = formatBaseline(file);
  assert.deepEqual(JSON.parse(text), file);
  assert.equal(text.split("\n").filter((l) => l.includes('"check"')).length, 1);
  assert.deepEqual(JSON.parse(formatBaseline({ about: "a", recordedOn: "d", entries: [] })).entries, []);
});

test("the numbers the plan names are the numbers the measurements use", () => {
  assert.deepEqual({ ...VIEWPORT }, { width: 390, height: 844 });
  assert.equal(MIN_TARGET_PX, 44);
  assert.equal(MAX_TABS_TO_FIRST_FIELD, 10);
  assert.deepEqual([...OFFSCREEN_BY_DESIGN], ["a.skip"]);
  assert.deepEqual(PERSONAS.map((p) => p.id), ["visitor", "owner-a", "owner-b", "owner-c", "owner-d", "owner-e", "owner-f", "owner-g", "operator"]);
  assert.deepEqual([...PAGES], ["/", "/sign-in", "/factory", "/diagnose", "/procure", "/deliver", "/run", "/operator", "/demo"]);
});

test("every recorded list is well formed: known checks, pages and people, no repeats, sorted, and one file for each of the two suites", () => {
  const dir = join(import.meta.dirname, "..", "support", "known-offenders");
  assert.deepEqual(readdirSync(dir).sort(), ["accessibility.json", "phone.json"]);
  const checksOf: Record<string, readonly string[]> = { "phone.json": PHONE_CHECKS, "accessibility.json": ACCESSIBILITY_CHECKS };
  for (const name of Object.keys(checksOf)) {
    const raw = readFileSync(join(dir, name), "utf8");
    const file = JSON.parse(raw) as BaselineFile;
    assert.equal(raw, formatBaseline(file), `${name} is not in the form the writer produces (one fault to a line)`);
    assert.deepEqual(file.entries, sortEntries(file.entries), `${name} is not sorted by check, page and key`);
    assert.ok(file.about.length > 20 && /^\d{4}-\d{2}-\d{2}$/.test(file.recordedOn), `${name}: about and recordedOn`);
    const seen = new Set<string>();
    for (const e of file.entries) {
      assert.ok(checksOf[name].includes(e.check), `${name}: unknown check ${e.check}`);
      assert.ok((PAGES as readonly string[]).includes(e.page), `${name}: unknown page ${e.page}`);
      assert.ok(e.personas.length > 0 && e.personas.every((p) => PERSONAS.some((x) => x.id === p)), `${name}: unknown person in ${e.key}`);
      assert.equal(new Set(e.personas).size, e.personas.length, `${name}: a person twice in ${e.key}`);
      const id = JSON.stringify([e.check, e.page, e.key]);
      assert.ok(!seen.has(id), `${name}: ${id} twice`);
      seen.add(id);
      assert.ok(!/\d{6,}/.test(e.key), `${name}: ${e.key} holds a long number that may change from run to run`);
    }
  }
});
