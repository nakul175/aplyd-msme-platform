// Turns what the probe measured in a page into findings, and runs the two measurements that need the browser from outside the page: pressing
// Tab, and reading the browser's own accessibility tree. A finding is one fault on one page for one person.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CDPSession, Page } from "playwright-core";
import type { Finding } from "./offenders.ts";
import type { FocusStop, PhoneMeasure, StructureMeasure } from "./probe.ts";
import { MIN_TARGET_PX, OFFSCREEN_BY_DESIGN, TOLERANCE_PX } from "./matrix.ts";

/** BR-UX-05 and the plan for this layer: the first form control must be reached by Tab within this many presses. */
export const MAX_TABS_TO_FIRST_FIELD = 10;

type Where = { persona: string; page: string };
const make = (w: Where, check: string, key: string, detail: string): Finding => ({ check, page: w.page, persona: w.persona, key, detail });

export const PHONE_CHECKS = ["page-not-served", "page-overflow", "wide-element", "tap-target", "clipped-control", "covered-control"] as const;
export const ACCESSIBILITY_CHECKS = [
  "main-count",
  "h1-count",
  "heading-skip",
  "note-banner-count",
  "html-lang",
  "page-title",
  "zoom-blocked",
  "field-label",
  "image-alt",
  "ax-name-empty",
  "tab-to-first-field",
  "focus-indicator",
  "focus-obscured",
  "skip-link",
] as const;

export function phoneFindings(w: Where, m: PhoneMeasure): Finding[] {
  const out: Finding[] = [];
  if (m.documentOverflows) {
    const widest = m.wide[0];
    out.push(make(w, "page-overflow", "document", `the page scrolls sideways: it is ${m.scrollWidth}px wide on a ${m.clientWidth}px screen${widest ? `; widest element ${widest.key} (${widest.width}px)` : ""}`));
  }
  for (const e of m.wide.slice(0, 12)) out.push(make(w, "wide-element", e.key, `${e.width}px wide, from ${e.left}px to ${e.right}px on a ${m.clientWidth}px screen`));
  for (const s of m.small)
    out.push(make(w, "tap-target", s.key, `${s.hit.w}x${s.hit.h}px by way of ${s.via}${s.own.w !== s.hit.w || s.own.h !== s.hit.h ? ` (the control itself ${s.own.w}x${s.own.h})` : ""}; needs ${MIN_TARGET_PX}x${MIN_TARGET_PX}${s.count > 1 ? `; ${s.count} options in the group` : ""}`));
  for (const c of m.clipped) out.push(make(w, "clipped-control", c.key, `reaches from ${c.left}px to ${c.right}px on a ${m.clientWidth}px screen`));
  for (const c of m.covered) out.push(make(w, "covered-control", c.key, `its centre is covered by ${c.by}`));
  return out;
}

export function structureFindings(w: Where, s: StructureMeasure): Finding[] {
  const out: Finding[] = [];
  if (s.mains !== 1) out.push(make(w, "main-count", `${s.mains} main elements`, `exactly one is expected, ${s.mains} found`));
  if (s.h1s !== 1) out.push(make(w, "h1-count", `${s.h1s} h1 elements`, `exactly one is expected, ${s.h1s} found`));
  for (const k of s.headingSkips) out.push(make(w, "heading-skip", k.key, k.detail));
  if (s.notes !== 1) out.push(make(w, "note-banner-count", `${s.notes} role=note elements`, `exactly one banner is expected, ${s.notes} found`));
  if (!s.lang) out.push(make(w, "html-lang", "html has no lang", "the language of the page is not stated"));
  if (!s.title) out.push(make(w, "page-title", "page has no title", "the title is empty"));
  if (s.zoomBlocked) out.push(make(w, "zoom-blocked", `viewport: ${s.viewportContent}`, "the viewport tag stops the person from zooming in"));
  for (const f of s.fieldsWithoutLabel) out.push(make(w, "field-label", f.key, f.detail));
  for (const i of s.imagesWithoutAlt) out.push(make(w, "image-alt", i.key, i.detail));
  return out;
}

export type KeyboardMeasure = { focusables: number; stops: FocusStop[]; firstFieldAfter: number | null; skipLink: { present: boolean; onScreen: boolean } };

/**
 * Presses Tab once for every focusable element and a little more (a radio group is one stop, so this is enough), and reads what took
 * focus and whether a ring or shadow appeared. Starts from the top of the page. The list ends where focus comes round to the first stop.
 */
export async function pressTab(page: Page): Promise<KeyboardMeasure> {
  await page.evaluate(() => window.scrollTo(0, 0));
  const focusables = await page.evaluate(() => window.__quality.focusStart());
  for (let i = 0; i < focusables + 2; i++) {
    await page.keyboard.press("Tab");
    await page.evaluate(() => window.__quality.focusCheck());
  }
  const all = await page.evaluate(() => window.__quality.focusRead());
  const wrapped = all.findIndex((s, i) => i > 0 && s.key === all[0].key);
  const stops = wrapped === -1 ? all : all.slice(0, wrapped);
  const first = stops.findIndex((s) => s.isField);
  // After the run, not before: focusing the skip link by hand would move the point Tab starts from.
  const skipLink = await page.evaluate((s) => window.__quality.skipLinkOnScreenWhenFocused(s), OFFSCREEN_BY_DESIGN[0]);
  return { focusables, stops, firstFieldAfter: first === -1 ? null : first + 1, skipLink };
}

export function keyboardFindings(w: Where, k: KeyboardMeasure, pageHasFields: boolean): Finding[] {
  const out: Finding[] = [];
  if (pageHasFields && (k.firstFieldAfter === null || k.firstFieldAfter > MAX_TABS_TO_FIRST_FIELD))
    out.push(make(w, "tab-to-first-field", `the first form control is not reached within ${MAX_TABS_TO_FIRST_FIELD} Tab presses`, k.firstFieldAfter === null ? "Tab never reaches a form control" : `it takes ${k.firstFieldAfter} presses`));
  for (const s of k.stops) if (s.indicator === null) out.push(make(w, "focus-indicator", s.key, "no outline or shadow appears on it, on its ::before or ::after, or on its three nearest parents, when it takes focus by Tab"));
  for (const s of k.stops) if (s.obscuredBy !== null) out.push(make(w, "focus-obscured", s.key, `when it takes focus by Tab, its centre is covered by ${s.obscuredBy}`));
  if (!k.skipLink.present) out.push(make(w, "skip-link", "no skip link", "the page has no link that skips to the main content"));
  else {
    if (!k.skipLink.onScreen) out.push(make(w, "skip-link", "not on screen when focused", "the skip link stays off the screen when it takes focus"));
    if (!k.stops[0]?.key.startsWith('a "Skip')) out.push(make(w, "skip-link", "not the first Tab stop", `the first Tab stop is ${k.stops[0]?.key ?? "nothing"}`));
  }
  return out;
}

/** Roles whose name a person who cannot see the page depends on. */
export const NAMED_ROLES = ["link", "button", "textbox", "combobox", "radio", "checkbox", "spinbutton", "searchbox", "DisclosureTriangle", "listbox", "menuitem", "tab", "switch"];

/** Every node of the browser's accessibility tree with one of those roles and no name, found by the browser's own naming rules. */
export async function unnamedInteractive(session: CDPSession): Promise<{ role: string; key: string }[]> {
  const { nodes } = (await session.send("Accessibility.getFullAXTree")) as { nodes: { ignored?: boolean; role?: { value: string }; name?: { value?: string }; backendDOMNodeId?: number }[] };
  const out: { role: string; key: string }[] = [];
  for (const n of nodes) {
    if (n.ignored || !n.role || !NAMED_ROLES.includes(n.role.value)) continue;
    if ((n.name?.value ?? "").trim() !== "") continue;
    let key = `${n.role.value} (not located)`;
    if (n.backendDOMNodeId !== undefined) {
      try {
        const { object } = (await session.send("DOM.resolveNode", { backendNodeId: n.backendDOMNodeId })) as { object: { objectId?: string } };
        const answer = (await session.send("Runtime.callFunctionOn", { objectId: object.objectId, functionDeclaration: "function () { return window.__quality.keyOf(this); }", returnByValue: true })) as { result: { value?: string } };
        key = answer.result.value ?? key;
      } catch {
        /* keep the role as the key */
      }
    }
    out.push({ role: n.role.value, key });
  }
  return out;
}

export function axFindings(w: Where, unnamed: { role: string; key: string }[]): Finding[] {
  return unnamed.map((u) => make(w, "ax-name-empty", u.key, `the browser's accessibility tree gives this ${u.role} an empty name`));
}

/** Where the numbers of a run go for the integrator: the repository's reports/ folder, which is not tracked. */
export function writeReport(name: string, data: unknown): string {
  const dir = join(import.meta.dirname, "..", "..", "..", "..", "reports");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `quality-${name}.json`);
  writeFileSync(file, JSON.stringify(data, null, 1) + "\n");
  return file;
}

export const THRESHOLDS = { MIN_TARGET_PX, TOLERANCE_PX, MAX_TABS_TO_FIRST_FIELD } as const;
