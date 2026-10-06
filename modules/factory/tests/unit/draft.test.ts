// BR-DESC-03, FR-DESC-15 (S5-02): what an owner typed on a refused save is kept in a short-lived cookie and shown again; and the page address
// helpers (S3-02, S3-03). Pure code: the cookie text, its limits and its checks are tested here; the page and the post are in integration and browser.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DRAFT_COOKIE, DRAFT_SECONDS, MAX_PIECES, draftAnswers, draftCookies, draftFromForm, draftPieces, packDraft, readDraft, unpackDraft } from "../../src/draft.ts";
import { validateAnswers } from "../../src/questionnaire.ts";
import { firstTexts, isVersionNumber } from "../../src/search.ts";

const COMPANY = "company-a";
const form = (pairs: [string, string][]) => new URLSearchParams(pairs);

test("a form with nothing typed keeps nothing; a note alone is kept", () => {
  assert.equal(draftFromForm(form([["based_on", "1"], ["intent", "save"], ["a.products", "   "], ["note", ""]]), COMPANY), null);
  assert.deepEqual(draftFromForm(form([["note", "second shift"]]), COMPANY)?.note, "second shift");
});

test("what was typed survives the trip through the cookie, in English, in Hindi and with every kind of question", () => {
  const typed = draftFromForm(
    form([
      ["based_on", "3"],
      ["a.products", "SYNTHETIC school uniforms\nand aprons"],
      ["a.own_words", "मेरी फ़ैक्टरी में कपड़े बनते हैं"],
      ["a.year_started", "abc"],
      ["a.sector", "textiles_garments"],
      ["a.problems", "late_deliveries"],
      ["a.problems", "rejects_rework"],
      ["a.problems", "breakdowns"],
      ["a.problems", "energy_cost"],
      ["note", "second shift started"],
    ]),
    COMPANY,
  )!;
  const pieces = packDraft(typed)!;
  assert.ok(pieces.length >= 1 && pieces.length <= MAX_PIECES);
  for (const piece of pieces) assert.match(piece, /^[A-Za-z0-9_-]+$/, "a cookie value holds only these characters");
  const back = unpackDraft(pieces, COMPANY)!;
  assert.deepEqual(back, typed);
  const answers = draftAnswers(back);
  assert.equal(answers.own_words, "मेरी फ़ैक्टरी में कपड़े बनते हैं");
  assert.equal(answers.year_started, "abc", "text that is not a number stays as typed, so the owner sees what to change");
  assert.deepEqual(answers.problems, ["late_deliveries", "rejects_rework", "breakdowns", "energy_cost"], "four ticks are shown as four ticks");
  const checked = validateAnswers(answers, { confirm: false });
  assert.ok(!checked.ok);
  assert.deepEqual(Object.keys(!checked.ok ? checked.errors : {}).sort(), ["problems", "year_started"], "the page marks exactly these two questions");
});

test("answers too long for three cookies are not kept, and the longest legitimate description is", () => {
  const longest = draftFromForm(form([["a.products", "p".repeat(500)], ["a.equipment", "e".repeat(800)], ["a.own_words", "o".repeat(2000)], ["a.problem_other", "x".repeat(200)], ["note", "n".repeat(500)]]), COMPANY)!;
  assert.ok(packDraft(longest), "every answer at its limit fits");
  const huge = draftFromForm(form([["a.products", "सर्".repeat(1300)], ["a.equipment", "सर्".repeat(1300)], ["a.own_words", "सर्".repeat(1300)]]), COMPANY)!;
  assert.equal(packDraft(huge), null, "too long to keep: the page says so");
  for (const piece of packDraft(longest)!) assert.ok(piece.length <= 3000, "a piece stays inside a cookie");
});

test("the cookie lines: HttpOnly, Secure, same-site, scoped to /factory, two minutes; unused pieces are cleared", () => {
  const lines = draftCookies(["abc"]);
  assert.equal(lines.length, MAX_PIECES);
  assert.equal(lines[0], `${DRAFT_COOKIE}_0=abc; HttpOnly; Secure; SameSite=Strict; Path=/factory; Max-Age=${DRAFT_SECONDS}`);
  for (const cleared of lines.slice(1)) assert.match(cleared, /^aplyd_describe_draft_\d=; HttpOnly; Secure; SameSite=Strict; Path=\/factory; Max-Age=0$/);
  assert.ok(draftCookies(null).every((l) => l.endsWith("Max-Age=0")), "a save that went through clears all pieces");
  assert.ok(DRAFT_SECONDS <= 300, "short-lived");
});

test("a draft is read from a Cookie header only for the company that typed it", () => {
  const typed = draftFromForm(form([["a.products", "SYNTHETIC shirts"]]), COMPANY)!;
  const header = `session=xyz; ${packDraft(typed)!.map((p, i) => `${DRAFT_COOKIE}_${i}=${p}`).join("; ")}; other=1`;
  assert.deepEqual(readDraft(header, COMPANY)?.fields, { products: ["SYNTHETIC shirts"] });
  assert.equal(readDraft(header, "company-b"), null, "another company's owner on the same browser sees nothing of it");
  assert.equal(readDraft(null, COMPANY), null);
  assert.equal(readDraft("session=xyz", COMPANY), null);
  assert.deepEqual(draftPieces(`${DRAFT_COOKIE}_1=bb; ${DRAFT_COOKIE}_0=aa`), ["aa", "bb"], "in order, whatever the order in the header");
  assert.deepEqual(draftPieces(`${DRAFT_COOKIE}_1=bb`), [], "a missing first piece is no draft");
});

test("a forged or damaged cookie gives no draft, and one with extra names keeps only the questions in the questionnaire", () => {
  for (const bad of ["!!!", "bm90IGpzb24", "", "W10", "bnVsbA"]) assert.equal(unpackDraft([bad], COMPANY), null, bad);
  const text = (v: unknown) => btoa(JSON.stringify(v)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const sneaky = unpackDraft([text({ c: COMPANY, f: { products: ["ok"], __proto__: ["x"], not_a_question: ["y"], sector: [1, "textiles_garments", null], employees: "10_49" }, n: 7 })], COMPANY)!;
  assert.deepEqual(sneaky.fields, { products: ["ok"], sector: ["textiles_garments"] });
  assert.equal(sneaky.note, "");
  assert.equal(({} as Record<string, unknown>).x, undefined, "nothing reached Object.prototype");
});

test("S3-03: a repeated name in the address is read as its first text; anything else is absent", () => {
  const seen = firstTexts({ missing: ["a", "b"], saved: "3", stale: [], rev: ["", "x"], problem: 5, fields: undefined, other: "z" }, ["missing", "saved", "stale", "rev", "problem", "fields"]);
  assert.deepEqual(seen, { missing: "a", saved: "3", rev: "" });
  assert.deepEqual(firstTexts(null, ["saved"]), {});
  assert.deepEqual(firstTexts(Object.create(null, { saved: { value: "1", enumerable: true } }), ["saved"]), { saved: "1" });
  assert.deepEqual(firstTexts({ constructor: "x" }, ["constructor"]), { constructor: "x" }, "an own value is read");
  assert.deepEqual(firstTexts({}, ["constructor", "toString"]), {}, "a name an object inherits is not a value");
});

test("S3-02: only whole digits are printed as a version number", () => {
  for (const ok of ["1", "42", "999999999"]) assert.ok(isVersionNumber(ok), ok);
  for (const bad of [undefined, "", "1.", "1 Call +91 now", "-1", "1e3", "1234567890", "٣"]) assert.ok(!isVersionNumber(bad), String(bad));
});
