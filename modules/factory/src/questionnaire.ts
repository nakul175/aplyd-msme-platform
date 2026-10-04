// The Describe questionnaire: what the platform asks an owner about the factory, and the rules every saved answer must meet.
// Pure code, no database. The server validates with this on every save, whatever the browser sent.
//
// Every option list below is an ASSUMPTION written for this slice, not taken from a source. The sector list follows the four
// sectors the study covers (S4) plus "something else", and is open until the first sector is chosen (OQ-03). The
// size and spend bands are round numbers chosen so an owner can answer without looking anything up. None is a legal
// definition of an MSME. Change them by adding a new questionnaire version; old revisions keep the version they were saved with.

export const QUESTIONNAIRE_VERSION = 1;

export type Option = { value: string; label: string };

type Base = { key: string; label: string; help?: string };
export type TextField = Base & { kind: "text"; maxLength: number; long?: boolean };
export type NumberField = Base & { kind: "number"; min: number; max: number; unit?: string };
export type ChoiceField = Base & { kind: "choice"; options: Option[] };
export type MultiField = Base & { kind: "multi"; options: Option[]; maxChoices?: number };
export type Field = TextField | NumberField | ChoiceField | MultiField;

export type Section = { id: string; title: string; intro?: string; fields: Field[] };

export type Answer = string | number | string[];
export type Answers = Record<string, Answer>;

const o = (value: string, label: string): Option => ({ value, label });

export const SECTIONS: Section[] = [
  {
    id: "about",
    title: "About your unit",
    fields: [
      {
        key: "sector",
        kind: "choice",
        label: "Which kind of manufacturing is it?",
        options: [o("textiles_garments", "Textiles and garments"), o("electronics", "Electronics"), o("medical_devices", "Medical devices"), o("pharma", "Pharmaceuticals"), o("other", "Something else")],
      },
      { key: "sector_other", kind: "text", label: "If something else, what?", maxLength: 100 },
      { key: "products", kind: "text", label: "What do you make?", help: "Your main products, in your own words.", maxLength: 500, long: true },
      { key: "year_started", kind: "number", label: "Which year did the unit start?", min: 1900, max: 2026 },
      {
        key: "employees",
        kind: "choice",
        label: "How many people work in the unit?",
        options: [o("1_9", "1 to 9"), o("10_49", "10 to 49"), o("50_249", "50 to 249"), o("250_plus", "250 or more")],
      },
      {
        key: "shifts",
        kind: "choice",
        label: "How many shifts do you run a day?",
        options: [o("one", "One"), o("two", "Two"), o("three", "Three, or round the clock")],
      },
      { key: "state", kind: "text", label: "State", maxLength: 100 },
      { key: "district", kind: "text", label: "District or industrial area", maxLength: 100 },
    ],
  },
  {
    id: "work",
    title: "How work gets done",
    fields: [
      {
        key: "processes",
        kind: "multi",
        label: "Which of these steps happen in your unit?",
        help: "Choose all that apply.",
        options: [
          o("cutting", "Cutting"),
          o("stitching_assembly", "Stitching or assembly"),
          o("machining", "Machining"),
          o("moulding_casting", "Moulding or casting"),
          o("fabrication_welding", "Fabrication or welding"),
          o("surface_finishing", "Surface finishing, dyeing or coating"),
          o("electronics_assembly", "Electronics assembly"),
          o("packaging", "Packaging"),
          o("testing_inspection", "Testing or inspection"),
          o("storage_dispatch", "Storage and dispatch"),
          o("other_process", "Something else"),
        ],
      },
      { key: "equipment", kind: "text", label: "Your main machines and equipment, and roughly how many of each", maxLength: 800, long: true },
      {
        key: "orders_in",
        kind: "multi",
        label: "How do orders reach you?",
        options: [o("phone_whatsapp", "Phone or WhatsApp"), o("email", "Email"), o("walk_in", "Customers walk in"), o("online_marketplace", "An online marketplace"), o("tenders", "Tenders"), o("agents_traders", "Agents or traders"), o("erp", "Customer's own system")],
      },
      {
        key: "production_tracking",
        kind: "choice",
        label: "How do you keep track of what is being made?",
        options: [o("memory", "In our heads"), o("paper", "On paper or a register"), o("spreadsheet", "In a spreadsheet"), o("software", "In software")],
      },
      {
        key: "quality_checks",
        kind: "choice",
        label: "How is quality checked?",
        options: [o("none", "It is not checked formally"), o("visual", "By eye"), o("instruments", "With instruments or gauges"), o("third_party_lab", "By an outside laboratory")],
      },
      {
        key: "maintenance",
        kind: "choice",
        label: "How are machines maintained?",
        options: [o("when_it_breaks", "When they break"), o("fixed_schedule", "On a fixed schedule"), o("condition_based", "Based on how they are running")],
      },
    ],
  },
  {
    id: "systems",
    title: "What you use today",
    fields: [
      {
        key: "accounts",
        kind: "choice",
        label: "How do you keep accounts?",
        options: [o("paper", "On paper"), o("spreadsheet", "In a spreadsheet"), o("accounting_software", "In accounting software"), o("erp", "In a full business system")],
      },
      {
        key: "inventory",
        kind: "choice",
        label: "How do you keep track of materials and finished stock?",
        options: [o("none", "We do not"), o("paper", "On paper"), o("spreadsheet", "In a spreadsheet"), o("software", "In software")],
      },
      {
        key: "it_support",
        kind: "choice",
        label: "Who looks after computers and software?",
        options: [o("nobody", "Nobody"), o("owner_or_family", "The owner or family"), o("local_freelancer", "A local technician"), o("vendor_support", "The software vendor"), o("in_house", "Our own staff")],
      },
      {
        key: "connectivity",
        kind: "choice",
        label: "How reliable is your internet?",
        options: [o("none", "We have none"), o("unreliable", "It often fails"), o("reliable", "It mostly works")],
      },
      {
        key: "data_kept",
        kind: "multi",
        label: "Which records do you keep in written or digital form?",
        options: [o("production_counts", "How much was made"), o("machine_hours", "Machine running hours"), o("quality_records", "Quality or rejection records"), o("energy_bills", "Power bills"), o("customer_orders", "Customer orders"), o("none", "None of these")],
      },
    ],
  },
  {
    id: "problems",
    title: "What is hurting most",
    intro: "Choose up to three. It does not matter whether technology could fix them.",
    fields: [
      {
        key: "problems",
        kind: "multi",
        label: "Your biggest problems",
        maxChoices: 3,
        options: [
          o("late_deliveries", "Late deliveries"),
          o("rejects_rework", "Rejections and rework"),
          o("breakdowns", "Machine breakdowns"),
          o("energy_cost", "Power and fuel cost"),
          o("material_cost", "Cost of raw material"),
          o("skilled_labour", "Finding and keeping skilled workers"),
          o("payment_delays", "Customers paying late"),
          o("compliance_certification", "Certificates, standards and rules"),
          o("finding_buyers", "Finding new buyers"),
          o("stock_shortages", "Running out of material or stock"),
          o("safety", "Safety of people and machines"),
          o("working_capital", "Not enough working capital"),
          o("other_problem", "Something else"),
        ],
      },
      { key: "problem_other", kind: "text", label: "If something else, what?", maxLength: 200 },
      { key: "own_words", kind: "text", label: "In your own words: describe your factory and what you would fix first", maxLength: 2000, long: true },
    ],
  },
  {
    id: "limits",
    title: "What you can spend and decide",
    fields: [
      {
        key: "budget_band",
        kind: "choice",
        label: "About how much could you put into improvements in a year?",
        options: [o("under_1_lakh", "Under 1 lakh rupees"), o("1_to_5_lakh", "1 to 5 lakh rupees"), o("5_to_25_lakh", "5 to 25 lakh rupees"), o("over_25_lakh", "More than 25 lakh rupees"), o("not_sure", "I am not sure")],
      },
      {
        key: "decides",
        kind: "choice",
        label: "Who decides on spending like this?",
        options: [o("owner_alone", "I do"), o("owner_family", "I do, with my family"), o("partners_board", "Partners or a board")],
      },
      {
        key: "readiness",
        kind: "choice",
        label: "How soon would you act on a good plan?",
        options: [o("ready_now", "Right away"), o("within_year", "Within a year"), o("just_exploring", "I am only exploring")],
      },
    ],
  },
];

export const FIELDS: Field[] = SECTIONS.flatMap((s) => s.fields);
const BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));

/** Needed before an owner can confirm a revision as accurate. A draft can be saved with any subset. */
export const REQUIRED_TO_CONFIRM = ["sector", "products", "employees", "processes", "problems"] as const;

export const MAX_NOTE_LENGTH = 500;

export type Validation = { ok: true; answers: Answers } | { ok: false; errors: Record<string, string> };

// Sets an own property even for a name such as __proto__, which a plain assignment would treat as "change the prototype" and drop.
const put = (target: object, key: string, value: unknown) => Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// Control characters other than tab and newline have no place in an answer. A string with NUL or escape codes is refused, not cleaned.
const hasControlCharacters = (s: string) => /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(s);

/**
 * Checks answers against the questionnaire. Unknown keys, wrong types, unlisted options, too many choices and
 * over-long text are refused with a message per key. Text is trimmed; an empty text, an empty list or null means "unknown"
 * and is dropped. When `confirm` is true the required questions must be answered.
 */
export function validateAnswers(raw: unknown, options: { confirm: boolean }): Validation {
  if (!isPlainObject(raw)) return { ok: false, errors: { answers: "Answers must be an object." } };
  const errors: Record<string, string> = {};
  const answers: Answers = {};

  for (const [key, value] of Object.entries(raw)) {
    const field = BY_KEY.get(key);
    if (!field) {
      put(errors, key, "This question does not exist.");
      continue;
    }
    if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) continue;

    if (field.kind === "text") {
      if (typeof value !== "string") put(errors, key, "Answer in words.");
      else if (hasControlCharacters(value)) put(errors, key, "This answer has characters that cannot be saved.");
      else if (value.trim().length > field.maxLength) put(errors, key, `Keep this under ${field.maxLength} characters.`);
      else if (value.trim() !== "") put(answers, key, value.trim());
    } else if (field.kind === "number") {
      if (typeof value !== "number" || !Number.isInteger(value)) put(errors, key, "Give a whole number.");
      else if (value < field.min || value > field.max) put(errors, key, `Give a number from ${field.min} to ${field.max}.`);
      else put(answers, key, value);
    } else if (field.kind === "choice") {
      if (typeof value !== "string" || !field.options.some((op) => op.value === value)) put(errors, key, "Choose one of the options.");
      else put(answers, key, value);
    } else {
      if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) put(errors, key, "Choose from the options.");
      else {
        const picked = value as string[];
        const unique = new Set(picked);
        if (unique.size !== picked.length) put(errors, key, "An option was chosen twice.");
        else if (picked.some((v) => !field.options.some((op) => op.value === v))) put(errors, key, "Choose from the options.");
        else if (field.maxChoices !== undefined && picked.length > field.maxChoices) put(errors, key, `Choose at most ${field.maxChoices}.`);
        else put(answers, key, picked);
      }
    }
  }

  if (Object.keys(errors).length === 0 && Object.keys(answers).length === 0) put(errors, "answers", "There is nothing to save yet. Answer at least one question.");
  if (options.confirm) {
    for (const key of REQUIRED_TO_CONFIRM) {
      if (!Object.hasOwn(answers, key) && !Object.hasOwn(errors, key)) put(errors, key, "Answer this before you confirm the description.");
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, answers };
}

/** Turns a submitted HTML form into answers. Numbers arrive as text, and a repeated field name is a multiple choice. Anything that is not a question is ignored here and refused later if it matters. */
export function answersFromForm(form: URLSearchParams): Answers {
  const raw: Record<string, unknown> = {};
  for (const field of FIELDS) {
    const name = `a.${field.key}`;
    const values = form.getAll(name);
    if (values.length === 0) continue;
    if (field.kind === "multi") raw[field.key] = values;
    else if (field.kind === "number") {
      const text = values[0].trim();
      if (text === "") continue;
      raw[field.key] = /^-?\d+$/.test(text) ? Number(text) : text; // a non-number stays text and is refused by validateAnswers
    } else raw[field.key] = values[0];
  }
  return raw as Answers;
}
