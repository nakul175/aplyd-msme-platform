// The shared style sheet (app/globals.css) and the style sheets of the pages this agent owns, held to three rules the contrast guard of the
// journey module does not measure: secondary text and control edges on a tinted ground keep headroom; a colour made with color-mix() has a
// plain colour before it for a browser that cannot mix; the mark in a notice is decoration with an empty alternative text.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const read = (file: string) => readFileSync(`${root}${file}`, "utf8");
const GLOBALS = read("app/globals.css");
const OWNED_SHEETS = ["app/globals.css", "app/factory/factory.css", "app/procure/procure.css", "app/operator/operator.css", "app/demo/demo.css"];

function tokens(css: string, open: string): Record<string, string> {
  const start = css.indexOf(open);
  assert.ok(start >= 0, `block not found: ${open}`);
  const end = css.indexOf("}", start);
  const found: Record<string, string> = {};
  for (const m of css.slice(start, end).matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)) found[m[1]!] = m[2]!;
  return found;
}
const light = tokens(GLOBALS, ":root {");
const dark = { ...light, ...tokens(GLOBALS, ':root[data-theme="dark"] {') };
const darkViaMedia = { ...light, ...tokens(GLOBALS, ':root:not([data-theme="light"]) {') };

const channel = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

const TINTS = ["brand-tint", "ok-tint", "danger-tint", "warn-tint", "turn-tint", "surface-2"];
const PLAIN = ["surface", "bg"];

for (const [name, set] of [["light", light], ["dark (chosen)", dark], ["dark (from the system)", darkViaMedia]] as const) {
  test(`${name}: secondary text on a tinted ground reads at 6.9 to 1 or more, well above the 4.5 the guard asks for`, () => {
    assert.ok(set["muted-tint"], "--muted-tint exists");
    const thin = [...TINTS, ...PLAIN].map((g) => [g, ratio(set["muted-tint"]!, set[g]!)] as const).filter(([, r]) => r < 6.9);
    assert.deepEqual(thin.map(([g, r]) => `muted-tint on ${g}: ${r.toFixed(2)}`), []);
  });
  test(`${name}: the edge of a control on a tinted ground reads at 3.5 to 1 or more, above the 3 the guard asks for`, () => {
    assert.ok(set["edge-tint"], "--edge-tint exists");
    const thin = [...TINTS, ...PLAIN].map((g) => [g, ratio(set["edge-tint"]!, set[g]!)] as const).filter(([, r]) => r < 3.5);
    assert.deepEqual(thin.map(([g, r]) => `edge-tint on ${g}: ${r.toFixed(2)}`), []);
  });
}

test("the dark set chosen by a person and the one chosen by the system hold the same two new colours", () => {
  for (const k of ["muted-tint", "edge-tint"]) assert.equal(darkViaMedia[k], dark[k], `--${k}`);
  assert.notEqual(dark["muted-tint"], light["muted-tint"], "the dark set redefines them");
});

test("a notice and the tinted card use the stronger secondary text and control edge inside themselves", () => {
  for (const selector of [/\.notice \{[^}]*--muted: var\(--muted-tint\);[^}]*--line-strong: var\(--edge-tint\);/, /\.card\.tint \{[^}]*--muted: var\(--muted-tint\);[^}]*--line-strong: var\(--edge-tint\);/]) assert.match(GLOBALS, selector);
});

/** The declarations of every rule of a style sheet, as [selector, property, value] in order; a media query's rules are read as the rules they hold. */
function declarations(css: string): { selector: string; prop: string; value: string; block: number }[] {
  const out: { selector: string; prop: string; value: string; block: number }[] = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let block = 0;
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    block += 1;
    const selector = m[1]!.trim();
    for (const decl of m[2]!.split(/;(?![^(]*\))/)) {
      const i = decl.indexOf(":");
      if (i > 0 && decl.trim()) out.push({ selector, prop: decl.slice(0, i).trim(), value: decl.slice(i + 1).trim(), block });
    }
  }
  return out;
}

test("every colour made with color-mix() has a plain colour for the same property before it, in the same rule", () => {
  const missing: string[] = [];
  for (const file of OWNED_SHEETS) {
    const list = declarations(read(file));
    list.forEach((d, i) => {
      if (!d.value.includes("color-mix(")) return;
      const before = list.slice(0, i).filter((e) => e.block === d.block && e.prop === d.prop && !e.value.includes("color-mix("));
      if (before.length === 0) missing.push(`${file}: ${d.selector} { ${d.prop} }`);
    });
  }
  assert.deepEqual(missing, []);
  assert.ok(declarations(GLOBALS).filter((d) => d.value.includes("color-mix(")).length >= 20, "the check found the mixes it is meant to check");
});

test("the mark in a notice, and the number on a section of the description, say nothing to a screen reader: the words beside them carry the meaning", () => {
  const marks = declarations(GLOBALS).filter((d) => /\.notice[^{]*::before/.test(d.selector) && d.prop === "content");
  assert.ok(marks.length >= 5, `found ${marks.length} notice marks`);
  for (const m of marks) assert.match(m.value, /^"[^"]*" \/ ""$|^"[^"]*"$/, `${m.selector}`);
  // Each mark has the plain version first and the version with an empty alternative text after it.
  for (const selector of new Set(marks.map((m) => m.selector))) {
    const mine = marks.filter((m) => m.selector === selector).map((m) => m.value);
    assert.equal(mine.length, 2, selector);
    assert.ok(!mine[0]!.includes("/") && /\/ ""$/.test(mine[1]!), `${selector}: ${mine.join(" then ")}`);
  }
  const factory = declarations(read("app/factory/factory.css")).filter((d) => d.prop === "content" && d.value.startsWith("counter("));
  assert.deepEqual(factory.map((d) => d.value), ["counter(fcs)", 'counter(fcs) / ""']);
});
