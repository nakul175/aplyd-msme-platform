// The opportunity library: things a small manufacturer could do about the problems the questionnaire lists.
//
// EVERYTHING IN THIS FILE IS SYNTHETIC. The titles, the conditions, the benefit ranges, the costs and the risks are
// placeholders written to exercise the engine. None of the figures is an estimate of anything, none comes from a source,
// and none may be shown to a real owner as advice. They are labelled "assumption" and the interface says SYNTHETIC. They
// are replaced only when the position on reusing the study's material (OQ-09) and the first sector (OQ-03) are settled
// and a named custodian stands behind the content (OQ-04). Until then a change here is a change to test content.
//
// The library lives in the repository, not in the database, on purpose: changing it is a reviewed pull request, there is
// no runtime publishing path, and every assessment stores a copy of what it used, so a later change never rewrites a
// past assessment.
//
// Nothing here is a compliance rule, and APLYD does not certify anything (C-01): the one compliance-related entry is
// about organising papers for a certificate that another body issues.

/** Bump when any entry changes in a way that could change a result. */
export const LIBRARY_VERSION = 1;

export type Condition =
  | { question: string; is: string[] } // a one-choice answer is one of these
  | { question: string; not: string[] } // a one-choice answer is none of these
  | { question: string; has: string } // a many-choice answer includes this
  | { question: string; lacks: string }; // a many-choice answer does not include this

export type Prerequisite = { text: string; when: Condition } | { text: string; opportunity: string };
export type Range = { low: number; high: number };
export type Benefit = { measure: string; unit: "percent" | "days" | "rupees_per_year"; low: number; high: number; basis: "assumption" };

export type Opportunity = {
  id: string;
  title: string;
  summary: string;
  kind: "ai" | "non_ai";
  /** Values of the `problems` question this addresses. */
  addresses: string[];
  /** The gap: every condition must hold for the opportunity to be suggested. */
  appliesWhen: Condition[];
  /** What must be true before it is worth doing. An unmet one makes the item "needs first". */
  prerequisites: Prerequisite[];
  benefit: Benefit;
  costs: { oneTime: Range; recurringPerYear: Range; hidden: string[] };
  risk: { level: "low" | "medium" | "high"; note: string };
  /** A source id from docs/sources.md, or "assumption". */
  source: "assumption" | `S${number}`;
};

const R = (low: number, high: number): Range => ({ low, high });
const B = (measure: string, unit: Benefit["unit"], low: number, high: number): Benefit => ({ measure, unit, low, high, basis: "assumption" });

export const LIBRARY: Opportunity[] = [
  {
    id: "digital_job_log",
    title: "Keep every job on a simple shared log",
    summary: "Replace memory or paper job cards with one shared list that shows each order, its stage and its due date.",
    kind: "non_ai",
    addresses: ["late_deliveries", "rejects_rework"],
    appliesWhen: [{ question: "production_tracking", is: ["memory", "paper"] }],
    prerequisites: [],
    benefit: B("Orders delivered late", "percent", 10, 30),
    costs: { oneTime: R(20_000, 80_000), recurringPerYear: R(0, 24_000), hidden: ["Someone has to enter the data every shift", "Staff time to learn the routine"] },
    risk: { level: "low", note: "The log is only as good as the entries; it fails quietly when people stop writing in it." },
    source: "assumption",
  },
  {
    id: "inspection_checklist_and_gauges",
    title: "Check quality against a written list, with gauges",
    summary: "Write down what a good piece looks like, check each batch against it, and use simple gauges where the eye is not enough.",
    kind: "non_ai",
    addresses: ["rejects_rework"],
    appliesWhen: [{ question: "quality_checks", is: ["none", "visual"] }],
    prerequisites: [],
    benefit: B("Pieces rejected or reworked", "percent", 10, 25),
    costs: { oneTime: R(10_000, 100_000), recurringPerYear: R(5_000, 30_000), hidden: ["Gauges need checking from time to time", "Checking takes time on the line"] },
    risk: { level: "low", note: "A list nobody follows changes nothing." },
    source: "assumption",
  },
  {
    id: "preventive_maintenance_plan",
    title: "Service the main machines on a calendar",
    summary: "Set a service round for each main machine and keep a short record, so the common failures are caught before they stop work.",
    kind: "non_ai",
    addresses: ["breakdowns"],
    appliesWhen: [{ question: "maintenance", is: ["when_it_breaks"] }],
    prerequisites: [],
    benefit: B("Unplanned stoppage time", "percent", 15, 40),
    costs: { oneTime: R(10_000, 50_000), recurringPerYear: R(20_000, 100_000), hidden: ["Planned stoppages take machines out of use on purpose", "Spare parts must be kept"] },
    risk: { level: "low", note: "Servicing too little or too late looks like it works until a machine fails." },
    source: "assumption",
  },
  {
    id: "stock_register_min_max",
    title: "Keep a stock register with a lowest and a highest level",
    summary: "Record materials in and out, and set a lowest level that triggers a reorder, so work does not stop for want of material.",
    kind: "non_ai",
    addresses: ["stock_shortages", "working_capital"],
    appliesWhen: [{ question: "inventory", is: ["none", "paper"] }],
    prerequisites: [],
    benefit: B("Days work stopped for missing material", "days", 2, 10),
    costs: { oneTime: R(10_000, 60_000), recurringPerYear: R(0, 20_000), hidden: ["Counting stock takes time", "Cash is tied up in the lowest level"] },
    risk: { level: "low", note: "The register drifts from the shelf if entries are late." },
    source: "assumption",
  },
  {
    id: "energy_review_and_tariff_check",
    title: "Read the power bills and find where the power goes",
    summary: "Go through twelve months of bills, check the tariff and the contracted load, and find the machines that use the most.",
    kind: "non_ai",
    addresses: ["energy_cost"],
    appliesWhen: [],
    prerequisites: [{ text: "Keep the power bills for the last twelve months", when: { question: "data_kept", has: "energy_bills" } }],
    benefit: B("Power cost", "percent", 5, 15),
    costs: { oneTime: R(10_000, 60_000), recurringPerYear: R(0, 15_000), hidden: ["A meter on one machine or line may be needed to learn where the power goes"] },
    risk: { level: "low", note: "Savings depend on what the bills show, which is not known until they are read." },
    source: "assumption",
  },
  {
    id: "receivables_follow_up",
    title: "Follow up unpaid invoices on a fixed weekly routine",
    summary: "List who owes what and since when, and chase the oldest first, on the same day every week.",
    kind: "non_ai",
    addresses: ["payment_delays", "working_capital"],
    appliesWhen: [{ question: "accounts", is: ["paper", "spreadsheet"] }],
    prerequisites: [],
    benefit: B("Days to get paid", "days", 5, 20),
    costs: { oneTime: R(0, 20_000), recurringPerYear: R(0, 30_000), hidden: ["Chasing a customer can cost goodwill", "Someone must own the routine"] },
    risk: { level: "low", note: "A key customer may react badly to firmer follow-up." },
    source: "assumption",
  },
  {
    id: "accounting_software",
    title: "Move the accounts into accounting software",
    summary: "Keep invoices, payments and balances in software so the amounts owed are always up to date.",
    kind: "non_ai",
    addresses: ["payment_delays", "working_capital"],
    appliesWhen: [{ question: "accounts", is: ["paper", "spreadsheet"] }],
    prerequisites: [{ text: "Someone has to look after the software", when: { question: "it_support", not: ["nobody"] } }],
    benefit: B("Days to get paid", "days", 3, 12),
    costs: { oneTime: R(15_000, 80_000), recurringPerYear: R(5_000, 40_000), hidden: ["Moving old records across", "Training the person who keeps the accounts"] },
    risk: { level: "medium", note: "A move done badly can leave two sets of books." },
    source: "assumption",
  },
  {
    id: "skills_training_plan",
    title: "Write down the key jobs and train a second person for each",
    summary: "List the jobs the unit cannot run without, note how each is done, and train a second person so one absence does not stop work.",
    kind: "non_ai",
    addresses: ["skilled_labour"],
    appliesWhen: [],
    prerequisites: [],
    benefit: B("Days lost when a skilled person is absent", "days", 2, 10),
    costs: { oneTime: R(10_000, 80_000), recurringPerYear: R(10_000, 60_000), hidden: ["Trainer time comes out of production", "A trained person may leave"] },
    risk: { level: "medium", note: "Workers who are trained may be hired away." },
    source: "assumption",
  },
  {
    id: "safety_walkthrough",
    title: "Walk the floor with a safety checklist and fix the first five things",
    summary: "Go round every machine and walkway with a short checklist, list what could hurt someone, and fix the five worst first.",
    kind: "non_ai",
    addresses: ["safety"],
    appliesWhen: [],
    prerequisites: [],
    benefit: B("Near-misses and injuries", "percent", 10, 40),
    costs: { oneTime: R(5_000, 60_000), recurringPerYear: R(5_000, 30_000), hidden: ["Some fixes stop a machine for a day"] },
    risk: { level: "low", note: "A checklist walk is not an inspection by a competent person." },
    source: "assumption",
  },
  {
    id: "marketplace_listing",
    title: "List the products on one online marketplace",
    summary: "Put the main products, photos and prices on one online marketplace and answer enquiries within a day.",
    kind: "non_ai",
    addresses: ["finding_buyers"],
    appliesWhen: [{ question: "orders_in", lacks: "online_marketplace" }],
    prerequisites: [{ text: "A phone or computer with an internet connection that works most days", when: { question: "connectivity", is: ["reliable", "unreliable"] } }],
    benefit: B("Enquiries from new buyers per month", "percent", 5, 30),
    costs: { oneTime: R(5_000, 40_000), recurringPerYear: R(0, 40_000), hidden: ["Someone must reply to every enquiry quickly", "The marketplace may charge fees on the orders it brings"] },
    risk: { level: "medium", note: "Marketplace buyers push prices down." },
    source: "assumption",
  },
  {
    id: "paperwork_organiser",
    title: "Gather the papers for a certificate you apply for",
    summary: "List what the certificate you want asks for, collect the papers in one place and check them before you apply. The certificate is issued by another body, not by APLYD.",
    kind: "non_ai",
    addresses: ["compliance_certification"],
    appliesWhen: [],
    prerequisites: [],
    benefit: B("Applications sent back for missing papers", "percent", 20, 60),
    costs: { oneTime: R(5_000, 50_000), recurringPerYear: R(0, 20_000), hidden: ["Fees of the body that issues the certificate", "The rules that apply must be read from that body's own documents"] },
    risk: { level: "medium", note: "This entry states no rule. Whatever the issuing body requires is what counts." },
    source: "assumption",
  },
  {
    id: "financing_options_review",
    title: "Compare the working-capital loans and schemes open to a unit your size",
    summary: "List the loans and schemes available, what each costs and asks for, and compare them against the gap you actually have.",
    kind: "non_ai",
    addresses: ["working_capital"],
    appliesWhen: [],
    prerequisites: [],
    benefit: B("Cost of working capital", "percent", 5, 20),
    costs: { oneTime: R(0, 25_000), recurringPerYear: R(0, 0), hidden: ["Time spent on applications", "Collateral or guarantees a lender may ask for"] },
    risk: { level: "medium", note: "Borrowing more than the unit can repay makes the problem worse." },
    source: "assumption",
  },
  {
    id: "supplier_quotes_comparison",
    title: "Get three quotes for each main material and compare them",
    summary: "For the three materials you spend most on, ask at least three suppliers for the same specification and compare price, payment terms and delivery.",
    kind: "non_ai",
    addresses: ["material_cost"],
    appliesWhen: [],
    prerequisites: [],
    benefit: B("Cost of the materials compared", "percent", 2, 8),
    costs: { oneTime: R(0, 20_000), recurringPerYear: R(0, 20_000), hidden: ["A cheaper supplier may deliver late or vary in quality", "Time spent asking for quotes"] },
    risk: { level: "low", note: "The lowest price is not the lowest cost if quality or delivery slips." },
    source: "assumption",
  },
  {
    id: "camera_inspection_ai",
    title: "Use a camera and software to spot defects",
    summary: "Fix a camera over the line and train software on pictures of good and bad pieces, so common defects are flagged as they pass.",
    kind: "ai",
    addresses: ["rejects_rework"],
    appliesWhen: [{ question: "quality_checks", is: ["visual"] }],
    prerequisites: [
      { text: "First check quality against a written list, so there is a clear standard to teach the software", opportunity: "inspection_checklist_and_gauges" },
      { text: "Keep quality or rejection records, so there are examples to learn from", when: { question: "data_kept", has: "quality_records" } },
      { text: "Someone has to look after the equipment and software", when: { question: "it_support", not: ["nobody"] } },
    ],
    benefit: B("Defects that reach the customer", "percent", 20, 50),
    costs: { oneTime: R(200_000, 1_000_000), recurringPerYear: R(50_000, 200_000), hidden: ["Lighting and mounting suited to the line", "Labelling hundreds of example pictures", "Retraining when the product changes"] },
    risk: { level: "medium", note: "It misses defects it was not shown, and the line may need to be changed to suit the camera." },
    source: "assumption",
  },
  {
    id: "predictive_maintenance_ai",
    title: "Use sensors and software to warn before a machine fails",
    summary: "Fit sensors to the main machines and let software learn their normal running, so unusual readings raise a warning.",
    kind: "ai",
    addresses: ["breakdowns"],
    appliesWhen: [{ question: "maintenance", is: ["when_it_breaks", "fixed_schedule"] }],
    prerequisites: [
      { text: "First service the main machines on a calendar", opportunity: "preventive_maintenance_plan" },
      { text: "Keep machine running hours, so there is history to learn from", when: { question: "data_kept", has: "machine_hours" } },
      { text: "An internet connection that works most days", when: { question: "connectivity", is: ["reliable", "unreliable"] } },
    ],
    benefit: B("Unplanned stoppage time", "percent", 10, 30),
    costs: { oneTime: R(300_000, 1_500_000), recurringPerYear: R(60_000, 300_000), hidden: ["Sensors on old machines may need custom fitting", "Warnings must be followed by a person who can act"] },
    risk: { level: "high", note: "With little history the warnings are noisy; people stop trusting them." },
    source: "assumption",
  },
  {
    id: "demand_forecast_ai",
    title: "Forecast demand from past orders to plan material",
    summary: "Use the record of past orders to forecast what will be asked for, and plan material purchases from the forecast.",
    kind: "ai",
    addresses: ["stock_shortages", "late_deliveries"],
    appliesWhen: [{ question: "inventory", is: ["none", "paper", "spreadsheet"] }],
    prerequisites: [
      { text: "First keep a stock register, so there is a current stock figure to plan against", opportunity: "stock_register_min_max" },
      { text: "Keep customer orders in written or digital form", when: { question: "data_kept", has: "customer_orders" } },
    ],
    benefit: B("Days work stopped for missing material", "days", 2, 8),
    costs: { oneTime: R(100_000, 500_000), recurringPerYear: R(30_000, 150_000), hidden: ["Orders must be entered in the same way every time", "A forecast is wrong when a large customer changes its plan"] },
    risk: { level: "medium", note: "Orders that arrive by phone and in bursts are hard to forecast." },
    source: "assumption",
  },
  {
    id: "ai_job_scheduling",
    title: "Let software propose the order of jobs on the machines",
    summary: "Software proposes which job runs where and when, from due dates and machine times; a person approves the plan each day.",
    kind: "ai",
    addresses: ["late_deliveries"],
    appliesWhen: [{ question: "production_tracking", not: ["software"] }],
    prerequisites: [
      { text: "First keep every job on a simple shared log, so the software has current jobs to work from", opportunity: "digital_job_log" },
      { text: "Someone has to look after the software", when: { question: "it_support", not: ["nobody"] } },
    ],
    benefit: B("Orders delivered late", "percent", 10, 30),
    costs: { oneTime: R(150_000, 800_000), recurringPerYear: R(40_000, 200_000), hidden: ["Machine times must be measured and kept current", "Floor staff must follow the plan"] },
    risk: { level: "medium", note: "A plan that ignores how the floor really works is ignored." },
    source: "assumption",
  },
];

/** The yearly improvement budget the questionnaire's bands stand for, in rupees. The top of a band is an ASSUMPTION. null: no ceiling. */
export const BUDGET_CEILING: Record<string, number | null> = {
  under_1_lakh: 100_000,
  "1_to_5_lakh": 500_000,
  "5_to_25_lakh": 2_500_000,
  over_25_lakh: null,
};
