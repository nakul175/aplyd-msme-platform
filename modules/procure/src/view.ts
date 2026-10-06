// What the two pages of this module say about where things stand, worked out from what they already read and never stored. Pure
// functions: the pages draw what these return, and a test pins each sentence, so a person can check by hand why a page says what it says.
//
// Nothing here reads a pool's size, a fee or another company's record. A requirement's state is a fact about the owner's own
// requirement; the operator's summary is counts of providers and pools that the operator's page already holds.

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// ---- the owner's page

export type RequirementStateKey = "withdrawn" | "provider_chosen" | "choose_provider" | "waiting_for_listing";

export type RequirementState = {
  key: RequirementStateKey;
  /** The words on the status tag. */
  tag: string;
  /** `turn` when it is the owner's turn, `ok` when it is done, none when it waits for somebody else or is closed. */
  tone: "ok" | "turn" | undefined;
  /** One sentence: what is the owner's next action, or why there is none. */
  next: string;
};

/** Where one requirement stands, and the one next action. A provider chosen wins over everything else but a withdrawal. */
export function requirementState(input: { withdrawn: boolean; engaged: boolean; providersListed: number }): RequirementState {
  if (input.withdrawn) return { key: "withdrawn", tag: "Withdrawn", tone: undefined, next: "Nothing more to do here." };
  if (input.engaged) return { key: "provider_chosen", tag: "Provider chosen", tone: "ok", next: "Done here. The next step is the plan, on the delivery page." };
  if (input.providersListed > 0) return { key: "choose_provider", tag: "No provider chosen yet", tone: "turn", next: "Your turn: choose the provider you want to work with." };
  return { key: "waiting_for_listing", tag: "No provider chosen yet", tone: undefined, next: "Waiting for a provider to be listed for this. Nothing is needed from you yet." };
}

export type ProcureCounts = {
  /** Ideas accepted in the latest signed-off assessment. */
  accepted: number;
  /** Of those, the ones asked for and not taken back. A withdrawn requirement is not counted: the owner took it back (FND-255). */
  asked: number;
  /** Of those, the ones whose requirement was withdrawn. A withdrawn requirement is not made again, so these are neither asked for nor ready. */
  withdrawnAsked: number;
  /** Of those, the ones that have no requirement yet. */
  ready: number;
  /** Open requirements for which the owner's turn is to choose a provider. */
  needsChoice: number;
  /** Open requirements with no provider listed for them yet. */
  waiting: number;
  chosen: number;
  withdrawn: number;
};

export type RequirementFacts = { withdrawn: boolean; engaged: boolean; providersListed: number };

/**
 * The counts the top of the page shows. `input.asked` is the accepted ideas that have a requirement of any kind and `input.withdrawnAsked`
 * the ones among them whose requirement was withdrawn; neither can be more than the number before it, and a larger one is a caller's
 * mistake and is held to it. A withdrawn requirement counts as taken back, not as asked for, and its idea is not offered again.
 */
export function procureCounts(input: { accepted: number; asked: number; withdrawnAsked?: number; requirements: RequirementFacts[] }): ProcureCounts {
  const accepted = Math.max(0, input.accepted);
  const withAny = Math.min(Math.max(0, input.asked), accepted);
  const withdrawnAsked = Math.min(Math.max(0, input.withdrawnAsked ?? 0), withAny);
  const counts: ProcureCounts = { accepted, asked: withAny - withdrawnAsked, withdrawnAsked, ready: accepted - withAny, needsChoice: 0, waiting: 0, chosen: 0, withdrawn: 0 };
  for (const r of input.requirements) {
    const key = requirementState(r).key;
    if (key === "withdrawn") counts.withdrawn += 1;
    else if (key === "provider_chosen") counts.chosen += 1;
    else if (key === "choose_provider") counts.needsChoice += 1;
    else counts.waiting += 1;
  }
  return counts;
}

/** The one sentence at the top of the page. A provider to choose comes before a new idea to ask for, as on the home page. */
export function procureSentence(c: ProcureCounts): string {
  const open = c.needsChoice + c.waiting + c.chosen;
  if (c.needsChoice > 0) {
    const first = c.needsChoice === 1 ? "Next: choose a provider for the requirement below that has none yet." : `Next: choose a provider for the ${c.needsChoice} requirements below that have none yet.`;
    return c.ready > 0 ? `${first} You can also ask for ${plural(c.ready, "more idea", "more ideas")}.` : first;
  }
  if (c.ready > 0 && open === 0) return c.withdrawn > 0 ? "Next: pick an idea below and say which cluster you ask in. Withdrawn requirements are not made again." : "Next: pick an idea below and say which cluster you ask in.";
  if (c.ready > 0) return `Nothing is waiting for you. You can ask for ${plural(c.ready, "more idea", "more ideas")} below.`;
  if (c.waiting > 0) return "Nothing is needed from you now. A provider has to be listed before you can choose one.";
  if (c.chosen > 0) return "Every open requirement has a provider. The next step is the plan, on the delivery page.";
  return "Nothing is open.";
}

export type StatusTag = { text: string; tone: "ok" | "turn" | "brand" | undefined };

/**
 * An idea ready to ask for is the owner's turn only while nothing else has been asked for. Once a requirement exists, asking for
 * more ideas is the owner's choice and the owner's turn is that requirement, so a ready idea is marked in the service's colour and not in marigold.
 */
export function readyTone(c: ProcureCounts): "turn" | "brand" {
  return c.needsChoice + c.waiting + c.chosen === 0 ? "turn" : "brand";
}

/** The words beside the bar. A requirement that was withdrawn is not counted as asked for; it is said once, apart. */
export function askedLabel(c: ProcureCounts): string {
  const base = `${c.asked} of ${c.accepted} accepted ${c.accepted === 1 ? "idea" : "ideas"} asked for`;
  return c.withdrawnAsked > 0 ? `${base}. ${c.withdrawnAsked} withdrawn, which is not made again.` : base;
}

/** What the page says in place of the list of ideas to ask for, when none is left. A withdrawn idea is not offered again, and is not "asked for". */
export function nothingLeftToAsk(c: ProcureCounts): string {
  if (c.withdrawnAsked === 0) return "You have asked for every idea you accepted. Your requirements are below.";
  if (c.asked === 0) return `You withdrew ${c.withdrawnAsked === 1 ? "the requirement" : "every requirement"} you made, and a withdrawn requirement is not made again. To ask again, make a new assessment.`;
  return `You have asked for every other idea you accepted, and withdrew ${c.withdrawnAsked}. A withdrawn requirement is not made again. Your requirements are below.`;
}

/** The tags under the sentence: what is the owner's turn first, then what waits for somebody else, then what is done or closed. Counts of zero are left out. */
export function procureTags(c: ProcureCounts): StatusTag[] {
  const tags: StatusTag[] = [];
  if (c.ready > 0) tags.push({ text: `${plural(c.ready, "idea", "ideas")} ready to ask for`, tone: readyTone(c) });
  if (c.needsChoice > 0) tags.push({ text: `${plural(c.needsChoice, "requirement needs", "requirements need")} a provider`, tone: "turn" });
  if (c.waiting > 0) tags.push({ text: `${c.waiting} waiting for a provider to be listed`, tone: undefined });
  if (c.chosen > 0) tags.push({ text: `${plural(c.chosen, "provider", "providers")} chosen`, tone: "ok" });
  if (c.withdrawn > 0) tags.push({ text: `${c.withdrawn} withdrawn`, tone: undefined });
  return tags;
}

/** Accepted ideas, those with no requirement yet first. Otherwise the order they came in. */
export function readyFirst<T extends { opportunityId: string }>(items: readonly T[], askedIds: ReadonlySet<string>): { ready: T[]; asked: T[] } {
  return { ready: items.filter((i) => !askedIds.has(i.opportunityId)), asked: items.filter((i) => askedIds.has(i.opportunityId)) };
}

// ---- the operator's page

export type FeeState = { state: "undecided" } | { state: "set"; feeInr: number; version: number };

export type OperatorSummary = {
  fee: FeeState;
  providers: number;
  listed: number;
  /** Pools of five companies or more, which is all the operator is ever shown. */
  poolsAtFloor: number;
};

export function operatorSummary(input: { terms: { feeInr: number; version: number } | null; providers: { listed: boolean }[]; pools: number }): OperatorSummary {
  return {
    fee: input.terms ? { state: "set", feeInr: input.terms.feeInr, version: input.terms.version } : { state: "undecided" },
    providers: input.providers.length,
    listed: input.providers.filter((p) => p.listed).length,
    poolsAtFloor: input.pools,
  };
}

/** How many different fees the providers now listed are paying. More than one when the fee changed after some of them were listed. */
export function distinctListedFees(providers: { listed: boolean; listedFeeInr: number | null }[]): number {
  return new Set(providers.filter((p) => p.listed && p.listedFeeInr !== null).map((p) => p.listedFeeInr)).size;
}

/**
 * What a provider serves, one entry per idea with its clusters together: "Idea (Cluster 1, Cluster 2)". Ideas come in the order they
 * first appear, and a cluster is named once however often it is repeated.
 */
export function serviceGroups(services: readonly { opportunityId: string; cluster: string }[], titleOf: (id: string) => string, clusterOf: (id: string) => string): string[] {
  const byIdea = new Map<string, string[]>();
  for (const s of services) {
    const clusters = byIdea.get(s.opportunityId) ?? [];
    const name = clusterOf(s.cluster);
    if (!clusters.includes(name)) clusters.push(name);
    byIdea.set(s.opportunityId, clusters);
  }
  return [...byIdea].map(([id, clusters]) => `${titleOf(id)} (${clusters.join(", ")})`);
}
