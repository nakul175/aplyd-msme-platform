// Adds the demonstration to a running application, through its own requests. It signs in as the operator and as each company's owner and
// does what they would do on the pages: set the fee, list providers, describe a factory, make and sign off an assessment, ask for ideas,
// choose a provider, write and agree a plan, record a starting number, a delivery, an acceptance and a payment. Every check the pages meet
// is met here, and every step is an audit entry. The one exception is the people themselves (identities.ts).
//
// It is for a database that was just built: the append-only tables cannot be put back, so there is no way to run it twice. Run on a database
// that already holds the demonstration it stops at the first refusal and says which one.
import { DEMO_COMPANIES, DEMO_PROVIDERS, FIRST_CLUSTER, FIRST_IDEA, PLACEHOLDER_FEE_INR, SECOND_CLUSTER, SECOND_IDEA, STAGES } from "./cast.ts";
import type { DemoCompany, Stage } from "./cast.ts";
import { Session } from "./client.ts";
import { identityStatements } from "./identities.ts";

/** Throws unless the diagnosis ranks the two ideas the script is built on first and second, as the cast's answers are meant to make it. */
export function checkRanking(companyName: string, ideas: readonly string[]): void {
  if (ideas[0] !== FIRST_IDEA || ideas[1] !== SECOND_IDEA) throw new Error(`${companyName}: the diagnosis ranked ${ideas.slice(0, 2).join(", ")} first, not ${FIRST_IDEA}, ${SECOND_IDEA}. The cast's answers or the library changed.`);
}

/** Throws unless the operator's pool list is as the script says: the first idea's pool in the first cluster shown (it has reached five), the second idea's pool in the second cluster not shown. */
export function checkPools(pools: readonly { cluster: string; opportunityId: string }[]): { firstPoolShown: boolean; secondPoolHidden: boolean } {
  const firstPoolShown = pools.some((p) => p.cluster === FIRST_CLUSTER && p.opportunityId === FIRST_IDEA);
  const secondPoolHidden = !pools.some((p) => p.cluster === SECOND_CLUSTER && p.opportunityId === SECOND_IDEA);
  if (!firstPoolShown || !secondPoolHidden) throw new Error(`the pools are not as the script says: first pool shown ${firstPoolShown}, second pool hidden ${secondPoolHidden}`);
  return { firstPoolShown, secondPoolHidden };
}

export type DemoReport = {
  companies: number;
  providers: number;
  requests: number;
  firstPoolShown: boolean;
  secondPoolHidden: boolean;
};

const DAY = 86_400_000;
const dateOf = (now: Date, plusDays: number) => new Date(now.getTime() + plusDays * DAY).toISOString().slice(0, 10);
const reached = (stage: Stage, wanted: Stage) => STAGES.indexOf(stage) >= STAGES.indexOf(wanted);

type Counter = { n: number };

async function operatorPart(base: string, count: Counter): Promise<Record<number, string>> {
  const operator = await Session.signIn(base, "operator@synthetic.invalid");
  await operator.post("/api/operator/listing-terms", { feeInr: PLACEHOLDER_FEE_INR, note: "SYNTHETIC placeholder. No fee is decided (OQ-11). It is one number for every provider (D-03)." });
  count.n++;
  const ids: Record<number, string> = {};
  for (const p of DEMO_PROVIDERS) {
    const made = await operator.post<{ id: string }>("/api/operator/providers", { name: p.name, summary: p.summary, services: p.services });
    await operator.post(`/api/operator/providers/${encodeURIComponent(made.id)}/list`, { note: "SYNTHETIC demonstration provider" });
    ids[p.number] = made.id;
    count.n += 2;
  }
  return ids;
}

async function companyPart(base: string, company: DemoCompany, providerIds: Record<number, string>, now: Date, count: Counter): Promise<void> {
  const owner = await Session.signIn(base, company.ownerEmail);
  const root = `/api/companies/${encodeURIComponent(company.id)}`;
  const post = async <T = Record<string, any>>(path: string, body: unknown = {}) => {
    count.n++;
    return owner.post<T>(`${root}${path}`, body);
  };

  // Describe: one confirmed version.
  await post("/factory/revisions", { answers: company.answers, note: "SYNTHETIC demonstration description", confirm: true, basedOn: 0 });

  // Diagnose: an assessment, every idea decided as accepted, signed off.
  const made = await post<{ id: string }>("/assessments", {});
  const assessment = await owner.get<{ result: { items: { opportunityId: string }[] } }>(`${root}/assessments/${encodeURIComponent(made.id)}`);
  const ideas = assessment.result.items.map((i) => i.opportunityId);
  checkRanking(company.name, ideas);
  for (const id of ideas) await post(`/assessments/${encodeURIComponent(made.id)}/decisions`, { opportunityId: id, decision: "accept", note: "" });
  await post(`/assessments/${encodeURIComponent(made.id)}/signoff`, { note: "SYNTHETIC demonstration sign-off" });

  // Procure: the first idea in the first cluster; for some, the second idea in the second.
  const first = await post<{ id: string }>("/requirements", { assessmentId: made.id, opportunityId: FIRST_IDEA, cluster: FIRST_CLUSTER });
  if (company.asksSecond) await post("/requirements", { assessmentId: made.id, opportunityId: SECOND_IDEA, cluster: SECOND_CLUSTER });
  if (!reached(company.stage, "provider_chosen")) return;

  // Deploy: a provider, and for some a plan.
  if (company.provider === null) throw new Error(`${company.name} reaches ${company.stage} but names no provider`);
  const engaged = await post<{ id: string }>(`/requirements/${encodeURIComponent(first.id)}/engagement`, { providerId: providerIds[company.provider] });
  const engagement = `/engagements/${encodeURIComponent(engaged.id)}`;
  if (!reached(company.stage, "plan_agreed")) return;
  const running = reached(company.stage, "running");
  const m1 = await post<{ id: string }>(`${engagement}/milestones`, { title: "Job log set up on the shop floor", acceptanceTest: "Ten real jobs are entered and a supervisor finds each of them again", dueOn: dateOf(now, 30), agreedInr: 125000 });
  const m2 = running ? await post<{ id: string }>(`${engagement}/milestones`, { title: "Every shift enters its jobs for a week", acceptanceTest: "Seven days of entries from all shifts, with no day missing", dueOn: dateOf(now, 60), agreedInr: 75000 }) : null;
  await post(`${engagement}/events`, { kind: "plan_agreed", note: "SYNTHETIC demonstration plan" });
  if (!running || m2 === null) return;

  // Run: the starting number before anything is accepted, then a delivery, an acceptance and a payment the owner made themselves.
  await post(`${engagement}/outcomes`, { kind: "baseline", value: 42, note: "SYNTHETIC. Orders delivered late in the last quarter, counted from paper sheets." });
  await post(`${engagement}/events`, { kind: "delivered", milestoneId: m1.id, note: "SYNTHETIC. The provider said it was done." });
  await post(`${engagement}/events`, { kind: "accepted", milestoneId: m1.id, note: "SYNTHETIC. Ten jobs entered and found again." });
  await post(`${engagement}/events`, { kind: "payment_recorded", milestoneId: m1.id, amountInr: 125000, note: "SYNTHETIC. Paid by the owner, outside the platform." });
  await post(`${engagement}/events`, { kind: "delivered", milestoneId: m2.id, note: "SYNTHETIC. Delivered; not yet checked." });
}

/**
 * Adds the demonstration. `db` is used for the people only. `baseUrl` is the application, which must be reachable and must accept synthetic
 * sign-in. Returns what it did, and throws, naming the request, the first time the application refuses one.
 */
export async function seedDemo(options: { db: D1Database; baseUrl: string; now?: Date }): Promise<DemoReport> {
  const now = options.now ?? new Date();
  const count: Counter = { n: 0 };
  for (const statement of identityStatements()) await options.db.prepare(statement).run();

  const providerIds = await operatorPart(options.baseUrl, count);
  for (const company of DEMO_COMPANIES) await companyPart(options.baseUrl, company, providerIds, now, count);

  // A self-check: the demonstration is only worth showing if the floor behaves as the script says it does.
  const operator = await Session.signIn(options.baseUrl, "operator@synthetic.invalid");
  const { pools } = await operator.get<{ pools: { cluster: string; opportunityId: string }[] }>("/api/operator/pools");
  const { firstPoolShown, secondPoolHidden } = checkPools(pools);
  return { companies: DEMO_COMPANIES.length, providers: DEMO_PROVIDERS.length, requests: count.n, firstPoolShown, secondPoolHidden };
}
