// What an owner types into the Delivery forms, read the way an owner in India writes it. Pure functions, so a test can check each case.
// Nothing here guesses: a value that could mean two things is refused, and the page then says which box to fix.
import { MAX_AMOUNT_INR, isCalendarDate } from "./state.ts";

/**
 * A whole number of rupees from what was typed: "50000", "50,000", "5,00,000", "₹50,000", "Rs 50,000", "Rs. 50000" or "INR 50000", with an
 * optional "/-" at the end. Commas are dropped wherever they are, so Indian and international grouping both work. Anything else (paise,
 * words, a minus sign, a number outside 1 to MAX_AMOUNT_INR) gives null. A number passed as a number (JSON) is checked the same way.
 */
export function parseRupees(raw: unknown): number | null {
  let n: number;
  if (typeof raw === "number") n = raw;
  else if (typeof raw === "string") {
    const text = raw
      .trim()
      .replace(/^(?:₹|rs\.?|inr)\s*/i, "")
      .replace(/\s*\/-$/, "");
    if (!/^\d[\d,]*$/.test(text)) return null;
    const digits = text.replace(/,/g, "");
    if (digits.length > 9) return null;
    n = Number(digits);
  } else return null;
  return Number.isInteger(n) && n >= 1 && n <= MAX_AMOUNT_INR ? n : null;
}

/**
 * A due date as the record keeps it (YYYY-MM-DD) from what was typed: "2026-12-15" as the date box sends it, or "15/12/2026", "15-12-2026"
 * and "15.12.2026" written day first, as dates are written in India. A day that does not exist gives null.
 */
export function parseDueDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (isCalendarDate(text)) return text;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return isCalendarDate(iso) ? iso : null;
}

/** The boxes of "Add a milestone", in the order the form shows them; the names are the form's field names. */
export const MILESTONE_BOXES = ["title", "test", "due", "amount"] as const;
export type MilestoneBox = (typeof MILESTONE_BOXES)[number];

/** The name of each box as the form labels it, for "Check these boxes: ...". */
export const BOX_NAME: Record<MilestoneBox, string> = { title: "What is delivered", test: "How you will check it", due: "Due date", amount: "Price" };

/** The sentence that names the boxes to fix, in the form's order. */
export function boxesToFix(failed: readonly string[]): string {
  const names = MILESTONE_BOXES.filter((b) => failed.includes(b)).map((b) => `“${BOX_NAME[b]}”`);
  if (names.length === 0) return "";
  return names.length === 1 ? `Check the box ${names[0]}.` : `Check these boxes: ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}.`;
}

/**
 * What the owner typed into "Add a milestone" when it was refused, kept for one look at the page so nothing has to be typed again. It is
 * carried in a short-lived cookie that only the Delivery page receives (Path=/deliver), never in the address, and it is cleared by the next
 * milestone that is saved. Values are cut to the box's own limit, so the cookie stays small.
 */
export type MilestoneDraft = { engagementId: string; values: Record<MilestoneBox, string>; failed: MilestoneBox[] };

export const DRAFT_COOKIE = "aplyd_milestone_draft";
const DRAFT_SECONDS = 300;
const LIMIT: Record<MilestoneBox, number> = { title: 120, test: 500, due: 20, amount: 20 };

export function draftCookie(draft: MilestoneDraft): string {
  const values = Object.fromEntries(MILESTONE_BOXES.map((b) => [b, (draft.values[b] ?? "").slice(0, LIMIT[b])]));
  const body = encodeURIComponent(JSON.stringify({ e: draft.engagementId.slice(0, 64), v: values, f: draft.failed }));
  return `${DRAFT_COOKIE}=${body}; HttpOnly; Secure; SameSite=Strict; Path=/deliver; Max-Age=${DRAFT_SECONDS}`;
}

export const clearedDraftCookie = (): string => `${DRAFT_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/deliver; Max-Age=0`;

/** The draft from a Cookie header, or null when there is none or it is not one this module wrote. */
export function readDraft(cookieHeader: string | null): MilestoneDraft | null {
  if (!cookieHeader) return null;
  const pair = cookieHeader
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${DRAFT_COOKIE}=`));
  if (!pair) return null;
  try {
    const raw = JSON.parse(decodeURIComponent(pair.slice(DRAFT_COOKIE.length + 1))) as { e?: unknown; v?: Record<string, unknown>; f?: unknown };
    if (typeof raw.e !== "string" || !raw.v || typeof raw.v !== "object" || !Array.isArray(raw.f)) return null;
    const values = Object.fromEntries(MILESTONE_BOXES.map((b) => [b, typeof raw.v![b] === "string" ? (raw.v![b] as string).slice(0, LIMIT[b]) : ""])) as Record<MilestoneBox, string>;
    const failed = MILESTONE_BOXES.filter((b) => (raw.f as unknown[]).includes(b));
    return { engagementId: raw.e, values, failed };
  } catch {
    return null;
  }
}
