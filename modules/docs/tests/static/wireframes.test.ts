// docs/design/wireframes.html is one file a person opens by double-clicking it. It must need nothing from outside, must have a place for
// every screen the functional specification defines, and every link inside it must land somewhere.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const PAGE = readFileSync(join(ROOT, "docs", "design", "wireframes.html"), "utf8");
const FSD = readFileSync(join(ROOT, "docs", "fsd", "FSD.md"), "utf8");

const idsOf = (html: string): string[] => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);

test("the wireframes page needs nothing from outside: no script, no linked file, no address on the web, no font or image to fetch", () => {
  assert.match(PAGE, /^<!doctype html>/i, "the page starts with a doctype");
  assert.match(PAGE, /<html lang="en">/, "the page names its language");
  assert.match(PAGE, /<meta name="viewport" content="width=device-width, initial-scale=1">/, "the page is made for a narrow screen too");
  assert.match(PAGE, /<title>[^<]{3,}<\/title>/, "the page has a title");
  const found = {
    script: /<script/i.test(PAGE),
    linkedFile: /<link\b/i.test(PAGE),
    import: /@import/i.test(PAGE),
    source: /\ssrc=/i.test(PAGE),
    webAddress: /https?:\/\//i.test(PAGE),
    cssUrl: /url\(/i.test(PAGE),
    handler: /\son[a-z]+=/i.test(PAGE),
  };
  assert.deepEqual(Object.entries(found).filter(([, yes]) => yes).map(([what]) => what), []);
});

test("every screen in the functional specification has a place in the wireframes, and no id is used twice", () => {
  const screens = [...FSD.matchAll(/^### \d+\.\d+ (SCR-\d\d) /gm)].map((m) => m[1]!);
  assert.ok(screens.length >= 9, `the specification defines at least nine screens (found ${screens.length})`);
  const ids = idsOf(PAGE);
  assert.deepEqual(screens.filter((s) => !ids.includes(s.toLowerCase())), [], "a screen of the specification has no anchor in the wireframes");
  const twice = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(twice, [], "an id is used twice");
});

test("every link inside the page lands on an id in the page, and a link to another document names a file that exists", () => {
  const ids = new Set(idsOf(PAGE));
  const missing: string[] = [];
  for (const m of PAGE.matchAll(/\shref="([^"]*)"/g)) {
    const target = m[1]!;
    if (target.startsWith("#")) {
      if (!ids.has(target.slice(1))) missing.push(target);
      continue;
    }
    const file = target.split("#")[0]!;
    try {
      readFileSync(join(ROOT, "docs", "design", file));
    } catch {
      missing.push(target);
    }
  }
  assert.deepEqual(missing, []);
});
