// The colours are in app/globals.css as tokens, in a light and a dark set. Every pair a page puts text on a ground, and every border a
// person needs to see to find a control, is read from that file and measured (WCAG 2.2 relative luminance): 4.5 to 1 for text, 3 to 1 for
// the edge of a control. A colour changed in one set and not checked fails here, not in front of a reader who cannot read it.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const CSS = readFileSync(fileURLToPath(new URL("../../../../app/globals.css", import.meta.url)), "utf8");

/** The `--name: #rrggbb` declarations of the block that starts at `open` and ends at its closing brace. */
function tokens(open: string): Record<string, string> {
  const start = CSS.indexOf(open);
  assert.ok(start >= 0, `block not found: ${open}`);
  const end = CSS.indexOf("}", start);
  const found: Record<string, string> = {};
  for (const m of CSS.slice(start, end).matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)) found[m[1]!] = m[2]!;
  return found;
}

const light = tokens(":root {");
const dark = { ...light, ...tokens(':root[data-theme="dark"] {') };
const darkViaMedia = { ...light, ...tokens(':root:not([data-theme="light"]) {') };

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
export function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** [text token, ground token]: text on a ground it is drawn on in globals.css. */
const TEXT: [string, string][] = [
  ["fg", "bg"], ["fg", "surface"], ["fg", "surface-2"], ["fg", "brand-tint"], ["fg", "ok-tint"], ["fg", "danger-tint"],
  ["muted", "bg"], ["muted", "surface"], ["muted", "surface-2"], ["muted", "brand-tint"],
  ["brand", "bg"], ["brand", "surface"], ["brand", "brand-tint"], ["brand-hover", "surface"], ["brand-hover", "brand-tint"],
  ["brand-fg", "brand"], ["brand-fg", "brand-hover"],
  ["turn-ink", "turn"], ["turn-text", "turn-tint"], ["turn-text", "warn-tint"],
  ["ok", "ok-tint"], ["ok", "surface"], ["danger", "danger-tint"], ["danger", "surface"],
  ["banner-fg", "banner-bg"], ["warn-text", "warn-tint"],
  ["hero-fg", "hero-a"], ["hero-fg", "hero-b"], ["hero-muted", "hero-a"], ["hero-muted", "hero-b"], ["turn", "hero-a"], ["turn", "hero-b"],
  ["surface", "ok"], ["surface", "danger"],
];
/** [edge token, ground token]: the border of a control, or the mark of a state, which has to be seen against what it sits on. */
const EDGE: [string, string][] = [["line-strong", "surface"], ["line-strong", "bg"], ["brand", "surface"], ["brand", "bg"], ["turn-edge", "surface"], ["turn-edge", "bg"]];

for (const [name, set] of [["light", light], ["dark (chosen)", dark], ["dark (from the system)", darkViaMedia]] as const) {
  test(`${name}: every text and ground pair reads at 4.5 to 1`, () => {
    const low: string[] = [];
    for (const [t, g] of TEXT) {
      assert.ok(set[t] && set[g], `token missing: --${t} or --${g}`);
      const r = ratio(set[t]!, set[g]!);
      if (r < 4.5) low.push(`${t} on ${g}: ${r.toFixed(2)}`);
    }
    assert.deepEqual(low, []);
  });
  test(`${name}: the edge of a control and a state mark reads at 3 to 1 against its ground`, () => {
    const low: string[] = [];
    for (const [t, g] of EDGE) {
      const r = ratio(set[t]!, set[g]!);
      if (r < 3) low.push(`${t} on ${g}: ${r.toFixed(2)}`);
    }
    assert.deepEqual(low, []);
  });
}

test("the dark set chosen by a person and the dark set chosen by the system are the same colours", () => {
  const names = Object.keys(dark).filter((k) => dark[k] !== light[k] || darkViaMedia[k] !== light[k]);
  assert.ok(names.length > 10, "the dark set redefines the tokens");
  for (const k of names) assert.equal(darkViaMedia[k], dark[k], `--${k} differs between the two dark blocks`);
});

test("the ratio function agrees with the known values", () => {
  assert.equal(ratio("#000000", "#ffffff").toFixed(1), "21.0");
  assert.equal(ratio("#777777", "#ffffff").toFixed(2), "4.48");
});
