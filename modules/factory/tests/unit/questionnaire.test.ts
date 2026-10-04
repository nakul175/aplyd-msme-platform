import assert from "node:assert/strict";
import { test } from "node:test";
import { FIELDS, QUESTIONNAIRE_VERSION, REQUIRED_TO_CONFIRM, SECTIONS, answersFromForm, validateAnswers } from "../../src/questionnaire.ts";

const complete = {
  sector: "textiles_garments",
  products: "  Shirts  ",
  employees: "10_49",
  processes: ["cutting", "packaging"],
  problems: ["late_deliveries", "rejects_rework"],
};

test("the questionnaire is well formed: unique keys, unique option values, labels everywhere, required questions exist", () => {
  assert.equal(QUESTIONNAIRE_VERSION, 1);
  const keys = FIELDS.map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length, "keys are unique");
  assert.equal(new Set(SECTIONS.map((s) => s.id)).size, SECTIONS.length);
  for (const f of FIELDS) {
    assert.ok(f.label.trim().length > 0, f.key);
    assert.match(f.key, /^[a-z][a-z0-9_]*$/, `key ${f.key}`);
    if (f.kind === "choice" || f.kind === "multi") {
      const values = f.options.map((o) => o.value);
      assert.ok(values.length >= 2, f.key);
      assert.equal(new Set(values).size, values.length, `${f.key} option values are unique`);
      for (const o of f.options) assert.ok(o.label.trim().length > 0, `${f.key}/${o.value}`);
    }
    if (f.kind === "text") assert.ok(f.maxLength > 0 && f.maxLength <= 2000, f.key);
    if (f.kind === "number") assert.ok(f.min < f.max, f.key);
  }
  for (const k of REQUIRED_TO_CONFIRM) assert.ok(keys.includes(k), `required question ${k} exists`);
});

test("good answers are accepted, text is trimmed, and empty answers count as unknown", () => {
  const r = validateAnswers({ ...complete, equipment: "   ", year_started: null, orders_in: [], shifts: "" }, { confirm: true });
  assert.ok(r.ok);
  assert.deepEqual(r.answers, { sector: "textiles_garments", products: "Shirts", employees: "10_49", processes: ["cutting", "packaging"], problems: ["late_deliveries", "rejects_rework"] });
});

test("a draft needs only one answer; nothing at all is refused", () => {
  assert.ok(validateAnswers({ sector: "pharma" }, { confirm: false }).ok);
  for (const empty of [{}, { equipment: "  " }, { processes: [] }]) {
    const r = validateAnswers(empty, { confirm: false });
    assert.ok(!r.ok);
    assert.match(r.errors.answers, /nothing to save/i);
  }
});

test("confirming needs every required question answered, and each missing one is named", () => {
  const r = validateAnswers({ sector: "pharma" }, { confirm: true });
  assert.ok(!r.ok);
  assert.deepEqual(Object.keys(r.errors).sort(), ["employees", "problems", "processes", "products"]);
  assert.ok(validateAnswers(complete, { confirm: true }).ok);
});

test("a question that does not exist is refused, including names that are special in JavaScript", () => {
  for (const key of ["colour", "__proto__", "constructor", "toString", "hasOwnProperty"]) {
    const raw = JSON.parse(`{"sector":"pharma","${key}":"x"}`);
    const r = validateAnswers(raw, { confirm: false });
    assert.ok(!r.ok, key);
    assert.match(r.errors[key], /does not exist/);
  }
});

test("answers of the wrong type are refused with a message for that question", () => {
  const cases: [string, unknown][] = [
    ["products", 7],
    ["products", ["a"]],
    ["products", { a: 1 }],
    ["year_started", "2009"],
    ["year_started", 2009.5],
    ["year_started", 1800],
    ["year_started", 2027],
    ["year_started", Number.NaN],
    ["sector", "steel"],
    ["sector", ["pharma"]],
    ["sector", 3],
    ["processes", "cutting"],
    ["processes", [1]],
    ["processes", ["welding_in_space"]],
    ["processes", ["cutting", "cutting"]],
    ["problems", ["late_deliveries", "rejects_rework", "breakdowns", "energy_cost"]],
  ];
  for (const [key, value] of cases) {
    const r = validateAnswers({ [key]: value }, { confirm: false });
    assert.ok(!r.ok, `${key}=${JSON.stringify(value)}`);
    assert.ok(r.errors[key], `${key}=${JSON.stringify(value)} has a message for ${key}`);
  }
});

test("text is limited in length and may not hold control characters", () => {
  assert.ok(validateAnswers({ products: "x".repeat(500) }, { confirm: false }).ok);
  assert.ok(!validateAnswers({ products: "x".repeat(501) }, { confirm: false }).ok);
  assert.ok(validateAnswers({ products: `${" ".repeat(50)}${"x".repeat(500)}${" ".repeat(50)}` }, { confirm: false }).ok, "the limit applies after trimming");
  assert.ok(validateAnswers({ products: "two\nlines\tand a tab" }, { confirm: false }).ok);
  for (const bad of ["a\u0000b", "a\u001bb", "a\u007fb", "a\u0008b"]) assert.ok(!validateAnswers({ products: bad }, { confirm: false }).ok, JSON.stringify(bad));
});

test("text may not change its own direction or hide characters, but Indian scripts and emoji still go through", () => {
  for (const bad of ["ab\u202ecd", "ab\u202acd", "ab\u2066cd", "ab\u2069cd", "a\u200bb", "a\u200eb", "a\u200fb", "a\u061cb", "a\u2060b", "a\ufeffb"]) {
    assert.ok(!validateAnswers({ products: bad }, { confirm: false }).ok, JSON.stringify(bad));
  }
  for (const good of ["क्\u200dष और नमस्ते", "ക്\u200cഷ", "family \u{1F468}\u200d\u{1F469}\u200d\u{1F467}", "plain text, ₹1,500"]) {
    assert.ok(validateAnswers({ products: good }, { confirm: false }).ok, JSON.stringify(good));
  }
});

test("answers that are not an object are refused", () => {
  for (const bad of [null, undefined, "x", 7, [], [{ sector: "pharma" }]]) assert.ok(!validateAnswers(bad, { confirm: false }).ok, JSON.stringify(bad));
});

test("a form becomes answers: repeated names are a multiple choice, numbers are read, blanks and strangers are dropped", () => {
  const form = new URLSearchParams();
  form.append("a.sector", "pharma");
  form.append("a.processes", "cutting");
  form.append("a.processes", "packaging");
  form.append("a.year_started", " 2009 ");
  form.append("a.equipment", "");
  form.append("a.shifts", "");
  form.append("based_on", "3");
  form.append("intent", "save");
  form.append("a.colour", "blue");
  form.append("sector", "steel");
  const answers = answersFromForm(form);
  assert.deepEqual(answers, { sector: "pharma", processes: ["cutting", "packaging"], year_started: 2009, equipment: "", shifts: "" });
  const r = validateAnswers(answers, { confirm: false });
  assert.ok(r.ok);
  assert.deepEqual(r.answers, { sector: "pharma", processes: ["cutting", "packaging"], year_started: 2009 });
});

test("a number field holding text is refused, not turned into zero", () => {
  const form = new URLSearchParams({ "a.year_started": "abc" });
  const r = validateAnswers(answersFromForm(form), { confirm: false });
  assert.ok(!r.ok);
  assert.ok(r.errors.year_started);
  assert.ok(!validateAnswers(answersFromForm(new URLSearchParams({ "a.year_started": "2009.5" })), { confirm: false }).ok);
  assert.ok(!validateAnswers(answersFromForm(new URLSearchParams({ "a.year_started": "1e3" })), { confirm: false }).ok);
});

test("every option of every choice question is accepted on its own", () => {
  for (const f of FIELDS) {
    if (f.kind === "choice") for (const o of f.options) assert.ok(validateAnswers({ [f.key]: o.value }, { confirm: false }).ok, `${f.key}/${o.value}`);
    if (f.kind === "multi") for (const o of f.options) assert.ok(validateAnswers({ [f.key]: [o.value] }, { confirm: false }).ok, `${f.key}/${o.value}`);
  }
});
