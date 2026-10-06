// The presenter's script for the demonstration: who to sign in as, where to go, what to press, what to point out. It is data, shown on /demo
// when the application runs in demonstration mode (APLYD_DEMO=true), and checked by tests: every person and every label it names must exist
// (a label that changes on a page and not here fails the static test), and every claim about the seeded state is checked against the seeder.
//
// It is SYNTHETIC throughout. It describes what the application does today and says what it does not do; it makes no claim about results
// for a real factory.
import { DEMO_COMPANIES, FIRST_CLUSTER, OPERATOR, SECOND_CLUSTER, WALKED_COMPANY, WITNESS_COMPANY } from "./cast.ts";

export type Step = {
  n: number;
  title: string;
  minutes: number;
  /** The name on the sign-in page. */
  signInAs: string;
  /** Where to start: a link on the home page, by its exact text. */
  open: string;
  /** What to do, in order. */
  do: string[];
  /** What to point out. */
  say: string;
  /** Exact texts the steps name on buttons, links and fields; the static test finds each in the page sources. */
  labels: string[];
};

const C = DEMO_COMPANIES.find((c) => c.stage === "running")!;

export const STEPS: Step[] = [
  {
    n: 1,
    title: "The other side: the operator",
    minutes: 2,
    signInAs: OPERATOR.name,
    open: "Providers and the listing fee",
    do: [
      "Show the one listing fee, which the page states, and the three listed providers, each with what it serves.",
      "Show the pools that have reached five companies: the first idea in the first cluster is there; the second idea in the second cluster is not.",
    ],
    say: "One fee for every provider. Nothing the owner chooses changes what APLYD earns (D-03). The fee is a placeholder: no fee is decided (OQ-11). The operator sees providers and counts, never a company's record.",
    labels: ["Providers and the listing fee", "Set the fee, in rupees"],
  },
  {
    n: 2,
    title: "Describe the factory",
    minutes: 2,
    signInAs: WALKED_COMPANY.owner,
    open: "Describe your factory",
    do: ["Show version 1, already confirmed.", "Change one answer, for example what the unit makes, and press the confirm button: version 2 is saved and the first stays."],
    say: "The owner answers in plain words. Every save is a new version and none is overwritten. Not built yet: voice, photos, the owner's own language.",
    labels: ["Describe your factory", "What do you make?", "Confirm this is accurate"],
  },
  {
    n: 3,
    title: "What to do about it",
    minutes: 3,
    signInAs: WALKED_COMPANY.owner,
    open: "What to do about it",
    do: [
      "Make an assessment from version 2: five ideas, ranked, with the owner's own problems each one answers.",
      "Open the costs, the risk and the source of each: the benefits are assumptions and say so. An idea that uses AI is marked, and an idea that needs something else first says what comes first.",
      "Accept all five (or reject one of the AI ideas, to show the decision is the owner's), then sign the assessment off.",
    ],
    say: "A rule-based ranking, not a model: the same answers always give the same list, and a person can check it by hand. An AI idea gets no advantage for being AI. The library is SYNTHETIC.",
    labels: ["What to do about it", "Sign off this assessment"],
  },
  {
    n: 4,
    title: "What you need, and the floor of five",
    minutes: 2,
    signInAs: WALKED_COMPANY.owner,
    open: "What you need",
    do: [
      `For the first idea, read the line that says what a cluster is, choose the cluster "SYNTHETIC cluster 1" and make the requirement. The page says that at least 5 companies in the cluster have asked for the same thing, and lists the providers offered for it.`,
      `For the second idea, choose "SYNTHETIC cluster 2" and make the requirement. The page says that fewer than 5 have asked and shows no number.`,
    ],
    say: "A cluster is a group of factories, and the three here are made up. The cluster cannot be changed after the button is pressed. A pool's size is shown only from five companies, and then only in steps of five, so a small pool never identifies who is in it (C-04). The providers shown are those the operator listed.",
    labels: ["What you need", "Which cluster do you ask in?", "Which provider do you want to work with?"],
  },
  {
    n: 5,
    title: "Choose a provider and agree a plan",
    minutes: 2,
    signInAs: WALKED_COMPANY.owner,
    open: "What you need",
    do: [
      "Read the line at the top of the providers: APLYD does not put the owner in touch with the provider, so the owner has to contact them.",
      "Choose one of the providers listed for the first idea.",
      "On the delivery page add one milestone: what is delivered, how the owner will check it, a date and a price. Type the date as year, month, day (for example 2026-12-15) and the price as digits only (for example 50000), with no commas. Then agree the plan.",
    ],
    say: "The owner writes the test they will accept the work by before any work starts. The platform holds and moves no money here and does not contact the provider: the owner records what happens.",
    labels: ["Add this milestone", "Agree this plan"],
  },
  {
    n: 6,
    title: "Results",
    minutes: 2,
    signInAs: WALKED_COMPANY.owner,
    open: "Results",
    do: [
      "Record the starting number before anything is accepted. The box takes a percent, as a whole number: type 40, meaning 40 percent of last quarter's orders went out late, and say in the second box how it was counted. Do not type words or a unit.",
      "On the delivery page record that the milestone was delivered and accept it; back on the results page, show the days on which the 30, 90 and 180 day reviews open.",
    ],
    say: "The numbers are the owner's own, typed in; nothing is measured by the platform. A review cannot be recorded until its day, and the application's clock cannot be moved, so the three reviews are shown as dates only.",
    labels: ["Results", "The number today, before the work", "Record the starting number", "Delivery"],
  },
  {
    n: 7,
    title: "A month in: a company that is further on",
    minutes: 1,
    signInAs: C.ownerName,
    open: "Delivery",
    do: ["Show the plan with two milestones, the first accepted and paid, the second delivered and waiting for the owner's decision.", "On the results page show the starting number and the review dates."],
    say: `${C.name} was added before the demonstration began, through the same requests, so what you see is what the pages produce for a company that has gone the whole way.`,
    labels: ["Delivery", "Results"],
  },
  {
    n: 8,
    title: "Another company sees none of it",
    minutes: 1,
    signInAs: WITNESS_COMPANY.owner,
    open: "What to do about it",
    do: ["Open each stage's page: Describe, What to do about it, What you need, Delivery, Results. None shows another company's description, plan, number or provider choice."],
    say: "The scope rule is on the server, not in the pages: one company's owner cannot read another company's record, and the operator's role does not override that.",
    labels: ["Describe your factory", "What to do about it", "What you need", "Delivery", "Results"],
  },
];

export const DOES_NOT_SHOW = [
  "Real data. Every company, person, provider, figure and idea here is invented and marked SYNTHETIC.",
  "Real sign-in. The sign-in page lets anyone choose any synthetic person; how a real owner signs in is undecided (OQ-13).",
  "The ten-owner test. The pages have been walked by one test and by this script, never by a real owner reading them.",
  "A result for a real factory. The benefit ranges are assumptions in a synthetic library, not measurements.",
  "A review. The 30, 90 and 180 day reviews open on their dates; the application's clock cannot be moved, so they are shown as dates only.",
  "The fee level. The fee is a placeholder: no fee is decided.",
  "Voice, photos, the owner's own language, or a person other than the owner reviewing an assessment.",
];

export const RESET_NOTE = "Everything on this page is rebuilt when the application starts. To return to this starting point, restart the application; anything entered during a presentation is then gone. The tables are append-only, so nothing can be put back by deleting rows.";

export const CLUSTERS_USED = { first: FIRST_CLUSTER, second: SECOND_CLUSTER };
