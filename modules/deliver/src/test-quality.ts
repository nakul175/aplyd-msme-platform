// How well a milestone's acceptance test can be applied by someone other than the owner (BR-DEPL-08). A pure function, so a test can
// check it. It only looks for the parts of a test that someone else would need: a number to compare with and the unit the number is in.
// It is a rough reading of the words, not a judgement: a flag never stops a milestone being saved, and a test with no flag is not
// thereby a good one. The word lists are assumptions written for this check, not a standard.

export type TestFlag = "empty" | "no_number" | "no_unit";

/** Number words an owner may write instead of digits. */
const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen",
  "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty",
  "ninety", "hundred", "thousand", "lakh", "lakhs", "crore", "half", "double", "twice",
];

/** Units and the things a test counts. Singular and plural both match. */
const UNIT_WORDS = [
  "percent", "per cent", "percentage", "second", "minute", "min", "mins", "hour", "hr", "hrs", "day", "week", "month", "year", "shift",
  "kg", "kilogram", "gram", "tonne", "ton", "quintal", "litre", "liter", "ml", "mm", "cm", "metre", "meter", "km", "inch", "foot", "feet",
  "kwh", "kw", "watt", "volt", "amp", "degree", "celsius", "rupee", "rs", "inr", "lakh",
  "unit", "piece", "pcs", "part", "item", "job", "order", "entry", "entries", "batch", "lot", "box", "bag", "carton", "roll", "sheet",
  "invoice", "bill", "record", "reject", "rejection", "defect", "error", "return", "complaint", "worker", "machine", "line", "product",
];
const UNIT_SYMBOLS = /[%₹°]/;

const words = (text: string) => text.toLowerCase().match(/[a-z]+(?: cent)?/g) ?? [];
const isUnit = (w: string) => UNIT_WORDS.some((u) => w === u || w === `${u}s` || w === `${u}es`);

/**
 * The parts an acceptance test is missing, in the order the page names them. `empty` alone for an empty test; otherwise `no_number`
 * when it has no digit and no number word, and `no_unit` when it names no unit or counted thing ("days", "pieces", "percent", "%").
 */
export function testQuality(text: string): TestFlag[] {
  const t = text.trim();
  if (t.length === 0) return ["empty"];
  const ws = words(t);
  const flags: TestFlag[] = [];
  if (!/\d/.test(t) && !ws.some((w) => NUMBER_WORDS.includes(w))) flags.push("no_number");
  if (!UNIT_SYMBOLS.test(t) && !/\d\s*(?:mm|cm|m|g|kg|l|ml|h|s)\b/i.test(t) && !ws.some(isUnit) && !/\bper cent\b/i.test(t)) flags.push("no_unit");
  return flags;
}

/** One plain sentence for a flagged test, for the Delivery page; null when nothing is flagged. */
export function testFlagSentence(flags: readonly TestFlag[]): string | null {
  if (flags.includes("empty")) return "This milestone has no test yet. Write what will be measured, the number that counts as done, and its unit.";
  const missing = [flags.includes("no_number") ? "number" : null, flags.includes("no_unit") ? "unit" : null].filter((x) => x !== null);
  if (missing.length === 0) return null;
  return `This test has no ${missing.join(" and no ")}, so someone else could not tell whether it was met. When you decide on this milestone, write in your note what you counted or measured.`;
}
