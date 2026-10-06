// The companies and people of the demonstration. Everything here is SYNTHETIC: invented names, invented answers, addresses that cannot
// receive mail (.invalid), and no real factory, person or figure. The people are added the way the platform's own seed adds its two
// (there is no sign-up yet: how real owners sign in is undecided, OQ-13); everything they then do is done through the application's own
// requests, as that person, in seed.ts.
//
// The shape is chosen to show the floor of five (C-04) on purpose. Five companies ask for the first idea in the first cluster, so the
// number is shown ("at least 5"). Only three ask for the second idea in the second cluster, so a company that joins them is the
// fourth and the number is not shown. Company A, the one the presenter walks, has a confirmed description and nothing else.
import type { Answers } from "../../factory/src/questionnaire.ts";

export const FIRST_CLUSTER = "synthetic-cluster-1";
export const SECOND_CLUSTER = "synthetic-cluster-2";
/** The ranked first and second ideas the diagnosis gives every company below (a test pins this against the engine). */
export const FIRST_IDEA = "digital_job_log";
export const SECOND_IDEA = "inspection_checklist_and_gauges";

/** How far the seeder takes a company. Each stage includes the ones before it. */
export type Stage = "requirements" | "provider_chosen" | "plan_agreed" | "running";
export const STAGES: readonly Stage[] = ["requirements", "provider_chosen", "plan_agreed", "running"];

export type DemoCompany = {
  id: string;
  name: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  stage: Stage;
  /** Also asks for the second idea in the second cluster. */
  asksSecond: boolean;
  /** Which of the demonstration's providers (1 to 3) the company chose, from "provider_chosen" on. */
  provider: 1 | 2 | 3 | null;
  /** One line for the presenter: where this company is and why it is there. */
  story: string;
  answers: Answers;
};

const common = {
  sector: "textiles_garments",
  shifts: "one",
  state: "SYNTHETIC State",
  processes: ["cutting", "stitching_assembly", "packaging", "storage_dispatch"],
  orders_in: ["phone_whatsapp", "agents_traders"],
  production_tracking: "paper",
  quality_checks: "visual",
  maintenance: "when_it_breaks",
  accounts: "accounting_software",
  inventory: "paper",
  it_support: "owner_or_family",
  connectivity: "unreliable",
  data_kept: ["customer_orders", "energy_bills"],
  problems: ["late_deliveries", "rejects_rework", "payment_delays"],
  budget_band: "1_to_5_lakh",
  decides: "owner_family",
  readiness: "within_year",
} as const;

const answers = (own: { products: string; year_started: number; employees: string; district: string; equipment: string; own_words: string }): Answers => ({ ...common, processes: [...common.processes], orders_in: [...common.orders_in], data_kept: [...common.data_kept], problems: [...common.problems], ...own });

export const DEMO_COMPANIES: DemoCompany[] = [
  {
    id: "company-synthetic-c",
    name: "SYNTHETIC Company C",
    ownerId: "user-synthetic-owner-c",
    ownerEmail: "owner-c@synthetic.invalid",
    ownerName: "SYNTHETIC Owner C",
    stage: "running",
    asksSecond: false,
    provider: 1,
    story: "The finished example. Described, assessed, signed off, asked for the first idea, chose a provider, agreed a two-milestone plan, recorded a starting number, accepted the first milestone and recorded a payment it made itself; the second milestone is delivered and waiting.",
    answers: answers({ products: "SYNTHETIC school uniforms and aprons", year_started: 2011, employees: "10_49", district: "SYNTHETIC District C", equipment: "SYNTHETIC 30 sewing machines and 3 cutting tables", own_words: "SYNTHETIC text. Orders go out late because nobody can see which job is waiting for what." }),
  },
  {
    id: "company-synthetic-d",
    name: "SYNTHETIC Company D",
    ownerId: "user-synthetic-owner-d",
    ownerEmail: "owner-d@synthetic.invalid",
    ownerName: "SYNTHETIC Owner D",
    stage: "plan_agreed",
    asksSecond: true,
    provider: 2,
    story: "Agreed a plan with a provider and is waiting for the first delivery. Also asked for the second idea in the second cluster.",
    answers: answers({ products: "SYNTHETIC cotton shirts for export agents", year_started: 2006, employees: "50_249", district: "SYNTHETIC District D", equipment: "SYNTHETIC 80 sewing machines, 6 cutting tables", own_words: "SYNTHETIC text. Rework at the end of the month eats the margin." }),
  },
  {
    id: "company-synthetic-e",
    name: "SYNTHETIC Company E",
    ownerId: "user-synthetic-owner-e",
    ownerEmail: "owner-e@synthetic.invalid",
    ownerName: "SYNTHETIC Owner E",
    stage: "provider_chosen",
    asksSecond: true,
    provider: 1,
    story: "Chose a provider and has not written a plan yet. Also asked for the second idea in the second cluster.",
    answers: answers({ products: "SYNTHETIC kurta fabric, cut and stitched to order", year_started: 2015, employees: "10_49", district: "SYNTHETIC District E", equipment: "SYNTHETIC 22 sewing machines", own_words: "SYNTHETIC text. Buyers pay late and we cannot say which order is waiting on which payment." }),
  },
  {
    id: "company-synthetic-f",
    name: "SYNTHETIC Company F",
    ownerId: "user-synthetic-owner-f",
    ownerEmail: "owner-f@synthetic.invalid",
    ownerName: "SYNTHETIC Owner F",
    stage: "requirements",
    asksSecond: true,
    provider: null,
    story: "Asked for the first idea and for the second idea in the second cluster, and has chosen nobody yet.",
    answers: answers({ products: "SYNTHETIC aprons and uniforms for schools", year_started: 2019, employees: "1_9", district: "SYNTHETIC District F", equipment: "SYNTHETIC 9 sewing machines", own_words: "SYNTHETIC text. Everything is on paper job cards that get lost." }),
  },
  {
    id: "company-synthetic-g",
    name: "SYNTHETIC Company G",
    ownerId: "user-synthetic-owner-g",
    ownerEmail: "owner-g@synthetic.invalid",
    ownerName: "SYNTHETIC Owner G",
    stage: "requirements",
    asksSecond: false,
    provider: null,
    story: "Asked for the first idea only.",
    answers: answers({ products: "SYNTHETIC cotton uniforms", year_started: 2008, employees: "10_49", district: "SYNTHETIC District G", equipment: "SYNTHETIC 26 sewing machines, 2 cutting tables", own_words: "SYNTHETIC text. Late deliveries lose us the repeat orders." }),
  },
];

/** The companies that ask for the first idea in the first cluster (all of them), and for the second idea in the second cluster. */
export const firstPool = (): DemoCompany[] => DEMO_COMPANIES;
export const secondPool = (): DemoCompany[] => DEMO_COMPANIES.filter((c) => c.asksSecond);

/** The platform's own two synthetic companies, which the presenter uses: A is walked live, B is the one who must see none of it. */
export const WALKED_COMPANY = { name: "SYNTHETIC Company A", owner: "SYNTHETIC Owner A", email: "owner-a@synthetic.invalid" };
export const WITNESS_COMPANY = { name: "SYNTHETIC Company B", owner: "SYNTHETIC Owner B", email: "owner-b@synthetic.invalid" };
export const OPERATOR = { name: "SYNTHETIC Operator", email: "operator@synthetic.invalid" };

export type DemoProvider = { number: 1 | 2 | 3; name: string; summary: string; services: { opportunityId: string; cluster: string }[] };
/** Three invented providers. Between them they serve the two ideas in both clusters, so a company in either cluster is offered a choice. */
export const DEMO_PROVIDERS: DemoProvider[] = [
  { number: 1, name: "SYNTHETIC Provider 1", summary: "SYNTHETIC. Sets up a shared job log on the shop floor.", services: [{ opportunityId: FIRST_IDEA, cluster: FIRST_CLUSTER }, { opportunityId: FIRST_IDEA, cluster: SECOND_CLUSTER }, { opportunityId: SECOND_IDEA, cluster: SECOND_CLUSTER }] },
  { number: 2, name: "SYNTHETIC Provider 2", summary: "SYNTHETIC. Job logs and simple order tracking for small units.", services: [{ opportunityId: FIRST_IDEA, cluster: FIRST_CLUSTER }] },
  { number: 3, name: "SYNTHETIC Provider 3", summary: "SYNTHETIC. Inspection checklists and gauges.", services: [{ opportunityId: SECOND_IDEA, cluster: FIRST_CLUSTER }, { opportunityId: SECOND_IDEA, cluster: SECOND_CLUSTER }] },
];

/** A placeholder, in rupees, for the one flat listing fee. No fee is decided (OQ-11). It is the same for every provider (D-03). */
export const PLACEHOLDER_FEE_INR = 1500;
