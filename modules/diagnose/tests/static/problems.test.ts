// Every reason the API sends a form post back to the page with (?problem=<key>) has a message on the page, and every message
// on the page is sent by something. A key without a message would show the person nothing at all.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ROOT } from "../../../platform/tests/support/sql-rules.ts";

const read = (file: string) => readFileSync(`${ROOT}${file}`, "utf8");

test("every ?problem= key the diagnose API redirects with has a message on the page, and every message is used", () => {
  const sent = new Set([...read("modules/diagnose/src/api/diagnose.ts").matchAll(/problem=(\w+)/g)].map((m) => m[1]));
  const block = /const PROBLEMS: Record<string, string> = \{([\s\S]*?)\n\};/.exec(read("app/diagnose/page.tsx"))?.[1] ?? "";
  const shown = new Set([...block.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]));
  assert.ok(sent.size >= 8 && shown.size >= 8, `the scan found ${sent.size} keys sent and ${shown.size} shown`);
  assert.deepEqual([...sent].filter((k) => !shown.has(k)).sort(), [], "sent, with no message on the page");
  assert.deepEqual([...shown].filter((k) => !sent.has(k)).sort(), [], "a message nothing sends");
});
