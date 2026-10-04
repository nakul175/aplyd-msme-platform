// Every reason a form post is sent back to a page with (?problem=<key>) has a message on that page: a key without one would show
// the person nothing at all. Checked for the owner's page (/procure) and the operator's page (/operator). The other direction, a
// message that nothing sends, is not checked here: the pages carry keys that other modules send.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ROOT } from "../../../platform/tests/support/sql-rules.ts";

const read = (file: string) => readFileSync(`${ROOT}${file}`, "utf8");
const shown = (page: string) => {
  const block = /const PROBLEMS: Record<string, string> = \{([\s\S]*?)\n\};/.exec(read(page))?.[1] ?? "";
  return new Set([...block.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]));
};
/** The reasons a data-layer function can refuse with, from its result type (one line). */
const reasons = (file: string, type: string) => {
  const line = new RegExp(`export type ${type} = [^\\n]*`).exec(read(file))?.[0] ?? "";
  return [...line.matchAll(/reason: ((?:"\w+"(?: \| )?)+)/g)].flatMap((m) => [...m[1].matchAll(/"(\w+)"/g)].map((x) => x[1]));
};

test("every ?problem= key the requirement endpoints redirect with has a message on /procure", () => {
  const api = read("modules/procure/src/api/requirements.ts");
  const literal = [...api.matchAll(/problem=(\w+)/g)].map((m) => m[1]);
  const created = reasons("modules/procure/src/db/requirements.ts", "CreateResult").filter((r) => r !== "not_found"); // sent as problem=${made.reason}
  const sent = new Set([...literal, ...created]);
  const messages = shown("app/procure/page.tsx");
  assert.ok(sent.size >= 6 && messages.size >= 6, `the scan found ${sent.size} keys sent and ${messages.size} shown`);
  assert.deepEqual([...sent].filter((k) => !messages.has(k)).sort(), [], "sent, with no message on /procure");
});

test("every ?problem= key the operator endpoints redirect with has a message on /operator", () => {
  const api = read("modules/procure/src/api/providers.ts");
  const literal = [...api.matchAll(/problem=(\w+)/g)].map((m) => m[1]);
  const listed = reasons("modules/procure/src/db/providers.ts", "ListResult").filter((r) => r !== "not_found"); // sent as problem=${result.reason}
  const sent = new Set([...literal, ...listed]);
  const messages = shown("app/operator/page.tsx");
  assert.ok(sent.size >= 6 && messages.size >= 6, `the scan found ${sent.size} keys sent and ${messages.size} shown`);
  assert.deepEqual([...sent].filter((k) => !messages.has(k)).sort(), [], "sent, with no message on /operator");
});
