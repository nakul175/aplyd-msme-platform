import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { presentEngagements } from "../../modules/deliver/src/api/engagements.ts";
import { presentAssessment } from "../../modules/diagnose/src/api/diagnose.ts";
import { listAssessments, loadAssessment } from "../../modules/diagnose/src/db/assessments.ts";
import { CLUSTERS, clusterLabel } from "../../modules/procure/src/clusters.ts";
import { MAX_NOTE_LENGTH, presentRequirements } from "../../modules/procure/src/api/requirements.ts";
import type { AppEnv } from "../../modules/platform/src/env.ts";
import { resolveIdentityFromCookieHeader } from "../../modules/platform/src/identity/resolve.ts";

export const dynamic = "force-dynamic";

type Search = { made?: string; withdrawn?: string; problem?: string };

const PROBLEMS: Record<string, string> = {
  request: "That requirement could not be made. Choose a cluster from the list.",
  not_signed_off: "Only an assessment you have signed off can be turned into requirements.",
  not_accepted: "Only an idea you accepted can be turned into a requirement.",
  note: "Keep the note under 500 characters.",
  withdrawn: "That requirement was already withdrawn.",
  missing: "That requirement could not be found.",
  engaged: "You have chosen a provider for that requirement, so it cannot be withdrawn. Close the engagement on the delivery page instead.",
  engage: "Choose a provider from the list.",
  provider_unavailable: "That provider is no longer listed for this requirement. Choose another from the list.",
  already_engaged: "You have already chosen a provider for this requirement.",
};
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const range = (r: { low: number; high: number }) => (r.low === r.high ? rupees(r.low) : `${rupees(r.low)} to ${rupees(r.high)}`);

export default async function Procure({ searchParams }: { searchParams: Promise<Search> }) {
  const e = env as unknown as AppEnv;
  const q = await searchParams;
  const identity = await resolveIdentityFromCookieHeader((await headers()).get("cookie"), e);

  if (!identity) {
    return (
      <>
        <h1>What you need</h1>
        <p>
          <a href="/sign-in">Sign in</a> to see your requirements.
        </p>
      </>
    );
  }
  if (!identity.companyId || identity.role !== "owner" || !e.DB) {
    return (
      <>
        <h1>What you need</h1>
        <p className="muted">This page is for the owner of a company. Your account is not linked to one.</p>
        <p>
          <a href="/">Back</a>
        </p>
      </>
    );
  }

  const db = e.DB;
  const companyId = identity.companyId;
  const [assessments, requirements, engagements] = await Promise.all([listAssessments(db, companyId), presentRequirements(db, companyId), presentEngagements(db, companyId)]);
  const engagedWith = new Map(engagements.map((g) => [g.requirementId, g]));
  const latestSigned = assessments.find((a) => a.signedOffAt !== null) ?? null;
  const record = latestSigned ? await loadAssessment(db, companyId, latestSigned.id) : null;
  const view = record ? await presentAssessment(record) : null;
  const accepted = view ? view.result.items.filter((i) => view.standing.some((s) => s.opportunityId === i.opportunityId && s.decision === "accept")) : [];
  const asked = new Map(requirements.filter((r) => view && r.assessmentId === view.id).map((r) => [r.opportunityId, r]));

  return (
    <>
      <h1>What you need</h1>
      <p className="muted">
        <span className="tag">SYNTHETIC</span> The ideas, the clusters and the providers on this page are placeholders written to test the service. No quote, price, contract or payment exists here: this only records what you are asking for.
      </p>

      {q.made ? (
        <p role="status" className="notice" data-testid="made">
          Your requirement was recorded.
        </p>
      ) : null}
      {q.withdrawn === "1" ? (
        <p role="status" className="notice" data-testid="withdrawn">
          Your requirement was withdrawn. It stays on record, marked as withdrawn.
        </p>
      ) : null}
      {q.problem && PROBLEMS[q.problem] ? (
        <p role="alert" className="notice" data-testid="problem">
          {PROBLEMS[q.problem]}
        </p>
      ) : null}

      <section className="card" aria-label="Ideas you accepted" data-testid="accepted">
        <h2>Ideas you accepted</h2>
        {!view ? (
          <p>
            A requirement is made from an idea you accepted in an assessment you signed off. You have not signed one off yet. <a href="/diagnose">Go to your assessment</a>
          </p>
        ) : accepted.length === 0 ? (
          <p>You signed off your latest assessment without accepting any idea, so there is nothing to ask for. To change your mind, confirm a newer description and make a new assessment.</p>
        ) : (
          <>
            <p className="muted">From your assessment of {view.createdAt.slice(0, 10)}, signed off {view.signoff?.at.slice(0, 10)}.</p>
            <ul className="items">
              {accepted.map((item) => {
                const r = asked.get(item.opportunityId);
                return (
                  <li key={item.opportunityId} className="card item" data-testid={`accepted-${item.opportunityId}`}>
                    <h3>{item.title}</h3>
                    <p>
                      <span className="tag">{item.kind === "ai" ? "Uses AI" : "No AI needed"}</span>
                    </p>
                    <p>{item.summary}</p>
                    <p className="muted">
                      Cost, from the assessment: one-time {range(item.costs.oneTime)}, every year after {range(item.costs.recurringPerYear)} (SYNTHETIC placeholders).
                    </p>
                    {r ? (
                      <p>
                        <strong>Requirement recorded</strong> for {clusterLabel(r.cluster)}
                        {r.withdrawnAt ? ", then withdrawn." : "."}
                      </p>
                    ) : (
                      <form method="post" action={`/api/companies/${companyId}/requirements`}>
                        <input type="hidden" name="assessment" value={view.id} />
                        <input type="hidden" name="opportunity" value={item.opportunityId} />
                        <p>
                          <label htmlFor={`cluster-${item.opportunityId}`} className="label">
                            Which cluster do you ask in?
                          </label>
                          <select id={`cluster-${item.opportunityId}`} name="cluster" required defaultValue="">
                            <option value="" disabled>
                              Choose a cluster
                            </option>
                            {CLUSTERS.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </p>
                        <button type="submit">Make a requirement from {item.title}</button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <h2>Your requirements</h2>
      {requirements.length === 0 ? (
        <p className="muted" data-testid="no-requirements">
          None yet.
        </p>
      ) : (
        <ul className="items" data-testid="requirements">
          {requirements.map((r) => (
            <li key={r.id} className="card item" data-testid={`requirement-${r.opportunityId}`}>
              <h3>{r.title}</h3>
              <p>
                <span className="tag">{clusterLabel(r.cluster)}</span> <span className="tag">{r.withdrawnAt ? "Withdrawn" : "Open"}</span>
              </p>
              {r.withdrawnAt ? (
                <p className="muted">Withdrawn on {r.withdrawnAt.slice(0, 10)}. It no longer counts in any pool.</p>
              ) : (
                <>
                  <p data-testid="pool">
                    {r.pool && r.pool.shown
                      ? `${r.pool.companies} companies in this cluster have asked for the same thing.`
                      : `Fewer than ${r.pool?.floor ?? 5} companies have asked for this in your cluster, so the number is not shown to anyone, to protect the companies that asked.`}
                  </p>
                  <div data-testid="providers">
                    <strong>Providers listed for this</strong> <span className="muted">(SYNTHETIC; in name order. APLYD's earnings do not depend on which one you choose.)</span>
                    {r.providers.length === 0 ? (
                      <p className="muted">No provider is listed for this in your cluster yet.</p>
                    ) : (
                      <ul>
                        {r.providers.map((p) => (
                          <li key={p.id}>
                            {p.name}
                            {p.summary ? ` — ${p.summary}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {engagedWith.get(r.id) ? (
                    <p data-testid="engaged">
                      <strong>You chose {engagedWith.get(r.id)?.providerName}.</strong> <a href="/deliver">Go to delivery</a>. A requirement with a provider chosen stays; close the engagement there if it ends.
                    </p>
                  ) : (
                    <>
                      {r.providers.length > 0 ? (
                        <form method="post" action={`/api/companies/${companyId}/requirements/${r.id}/engagement`} data-testid="choose-provider">
                          <p>
                            <label htmlFor={`provider-${r.id}`} className="label">
                              Which provider do you want to work with?
                            </label>
                            <select id={`provider-${r.id}`} name="provider" required defaultValue="">
                              <option value="" disabled>
                                Choose a provider
                              </option>
                              {r.providers.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </p>
                          <p className="muted">This records your choice and opens a plan you write with them. It does not contact the provider, agree a price or move any money.</p>
                          <button type="submit">Choose a provider for {r.title}</button>
                        </form>
                      ) : null}
                      <form method="post" action={`/api/companies/${companyId}/requirements/${r.id}/withdraw`}>
                        <p>
                          <label htmlFor={`withdraw-note-${r.id}`} className="label">
                            A note for yourself (optional)
                          </label>
                          <input id={`withdraw-note-${r.id}`} name="note" type="text" maxLength={MAX_NOTE_LENGTH} />
                        </p>
                        <button type="submit">Withdraw {r.title}</button>
                      </form>
                    </>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <p>
        <a href="/diagnose">Back to your assessment</a> · <a href="/">Home</a>
      </p>
    </>
  );
}
