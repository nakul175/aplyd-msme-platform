import "./procure.css";
import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { presentEngagements } from "../../modules/deliver/src/api/engagements.ts";
import { presentAssessment } from "../../modules/diagnose/src/api/diagnose.ts";
import { listAssessments, loadAssessment } from "../../modules/diagnose/src/db/assessments.ts";
import { CLUSTERS, clusterLabel } from "../../modules/procure/src/clusters.ts";
import { MAX_NOTE_LENGTH, presentRequirements } from "../../modules/procure/src/api/requirements.ts";
import { procureCounts, procureSentence, procureTags, readyFirst, readyTone, requirementState } from "../../modules/procure/src/view.ts";
import type { AppEnv } from "../../modules/platform/src/env.ts";
import { resolveIdentityFromCookieHeader } from "../../modules/platform/src/identity/resolve.ts";
import { Arrow, Check, Eye, Lock } from "../_ui/icons.tsx";
import { Meter, Notice, NotOwner, Page, SignedOut, Tag } from "../_ui/parts.tsx";

export const dynamic = "force-dynamic";

type Search = { made?: string; withdrawn?: string; problem?: string };

const PROBLEMS: Record<string, string> = {
  request: "That requirement could not be made. Choose a cluster from the list.",
  not_signed_off: "Only an assessment you have signed off can be turned into requirements.",
  not_accepted: "Only an idea you accepted can be turned into a requirement.",
  already_made: "You have already made this requirement. It is listed below, in the cluster you chose the first time.",
  previously_withdrawn: "You withdrew this requirement earlier, and a withdrawn requirement is not made again. To ask again, make a new assessment.",
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

  if (!identity) return <SignedOut title="What you need" reason="to see your requirements." />;
  if (!identity.companyId || identity.role !== "owner" || !e.DB) return <NotOwner title="What you need" />;

  const db = e.DB;
  const companyId = identity.companyId;
  const [assessments, requirements, engagements] = await Promise.all([listAssessments(db, companyId), presentRequirements(db, companyId), presentEngagements(db, companyId)]);
  const engagedWith = new Map(engagements.map((g) => [g.requirementId, g]));
  const latestSigned = assessments.find((a) => a.signedOffAt !== null) ?? null;
  const record = latestSigned ? await loadAssessment(db, companyId, latestSigned.id) : null;
  const view = record ? await presentAssessment(record) : null;
  const accepted = view ? view.result.items.filter((i) => view.standing.some((s) => s.opportunityId === i.opportunityId && s.decision === "accept")) : [];
  const asked = new Map(requirements.filter((r) => view && r.assessmentId === view.id).map((r) => [r.opportunityId, r]));
  const { ready, asked: alreadyAsked } = readyFirst(accepted, new Set(asked.keys()));
  const counts = procureCounts({
    accepted: accepted.length,
    asked: alreadyAsked.length,
    requirements: requirements.map((r) => ({ withdrawn: r.withdrawnAt !== null, engaged: engagedWith.has(r.id), providersListed: r.providers.length })),
  });
  const tags = procureTags(counts);

  return (
    <Page stage="procure" identity={identity} title="What you need" lede="Say what you need for each idea you accepted, then choose a provider.">
      {q.made ? (
        <Notice role="status" tone="success" data-testid="made">
          Your requirement was recorded.
        </Notice>
      ) : null}
      {q.withdrawn === "1" ? (
        <Notice role="status" tone="success" data-testid="withdrawn">
          Your requirement was withdrawn. It stays on record, marked as withdrawn.
        </Notice>
      ) : null}
      {q.problem && Object.hasOwn(PROBLEMS, q.problem) ? (
        <Notice role="alert" tone="danger" data-testid="problem">
          {PROBLEMS[q.problem]}
        </Notice>
      ) : null}

      <p className="help pr-note">
        <Tag>SYNTHETIC</Tag> The ideas, the clusters and the providers on this page are placeholders written to test the service. No quote, price, contract or payment exists here: this only records what you are asking for.
      </p>

      {accepted.length > 0 || requirements.length > 0 ? (
        <section className="card tint pr-summary" aria-label="Where this stands" data-testid="procure-state">
          <p className="pr-sentence">{procureSentence(counts)}</p>
          {tags.length > 0 ? (
            <div className="pr-tags">
              {tags.map((t) => (
                <Tag key={t.text} tone={t.tone}>
                  {t.text}
                </Tag>
              ))}
            </div>
          ) : null}
          {counts.accepted > 0 ? <Meter done={counts.asked} of={counts.accepted} label={`${counts.asked} of ${counts.accepted} accepted ${counts.accepted === 1 ? "idea" : "ideas"} asked for`} /> : null}
          {counts.needsChoice > 0 && counts.ready > 0 ? (
            <p>
              <a href="#requirements">Jump to your requirements</a>
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="pr-section" aria-labelledby="pr-ideas" data-testid="accepted">
        <h2 id="pr-ideas">Ideas you accepted</h2>
        {!view ? (
          <div className="card">
            <p>
              A requirement is made from an idea you accepted in an assessment you signed off. You have not signed one off yet. <a href="/diagnose">Go to your assessment</a>
            </p>
            <p className="muted">Start there: decide on each idea (yes, not yet or no), sign off, then come back here to say what you need.</p>
          </div>
        ) : accepted.length === 0 ? (
          <div className="card">
            <p>You signed off your latest assessment without accepting any idea, so there is nothing to ask for. To change your mind, confirm a newer description and make a new assessment.</p>
          </div>
        ) : (
          <>
            <p className="help">
              From your assessment of {view.createdAt.slice(0, 10)}, signed off {view.signoff?.at.slice(0, 10)}.
            </p>
            {ready.length > 0 ? (
              <>
                <p className="eyebrow">Ready to ask for</p>
                <p className="help">Choose a cluster for each idea you want to ask for. You are pooled only with companies that ask for the same idea in the same cluster. The size of a pool is shown only from five companies.</p>
                <ul className="items">
                  {ready.map((item) => (
                    <li key={item.opportunityId} className="card item" data-testid={`accepted-${item.opportunityId}`}>
                      <div className="pr-top">
                        <h3>{item.title}</h3>
                        <div className="pr-tags">
                          <Tag tone={readyTone(counts)}>Ready to ask for</Tag>
                          <Tag>{item.kind === "ai" ? "Uses AI" : "No AI needed"}</Tag>
                        </div>
                      </div>
                      <p>{item.summary}</p>
                      <p className="muted">
                        Cost, from the assessment: one-time <span className="num">{range(item.costs.oneTime)}</span>, every year after <span className="num">{range(item.costs.recurringPerYear)}</span> (SYNTHETIC placeholders).
                      </p>
                      <form method="post" action={`/api/companies/${companyId}/requirements`} className="pr-ask pr-wide">
                        <input type="hidden" name="assessment" value={view.id} />
                        <input type="hidden" name="opportunity" value={item.opportunityId} />
                        <div className="question">
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
                        </div>
                        <div className="actions">
                          <button type="submit" className="primary">
                            Make a requirement from {item.title}
                          </button>
                        </div>
                        <p className="help">This only records what you are asking for. You can withdraw it until you choose a provider, but you cannot change its cluster.</p>
                      </form>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="card flat">
                <p>You have asked for every idea you accepted. Your requirements are below.</p>
              </div>
            )}
            {alreadyAsked.length > 0 ? (
              <>
                <p className="eyebrow">Already asked for</p>
                <ul className="items">
                  {alreadyAsked.map((item) => {
                    const r = asked.get(item.opportunityId)!;
                    return (
                      <li key={item.opportunityId} className="card item" data-testid={`accepted-${item.opportunityId}`}>
                        <div className="pr-top">
                          <h3>{item.title}</h3>
                          <div className="pr-tags">
                            <Tag tone={r.withdrawnAt ? undefined : "ok"}>{r.withdrawnAt ? "Withdrawn" : "Asked for"}</Tag>
                          </div>
                        </div>
                        <p className="pr-done">
                          <Check />
                          <span>
                            <strong>Requirement recorded</strong> for {clusterLabel(r.cluster)}
                            {r.withdrawnAt ? ", then withdrawn." : "."}
                          </span>
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : null}
          </>
        )}
      </section>

      <section className="pr-section" id="requirements" aria-labelledby="pr-requirements">
        <h2 id="pr-requirements">Your requirements</h2>
        {requirements.length === 0 ? (
          <div className="card">
            <p data-testid="no-requirements">None yet. {accepted.length > 0 ? "Make one from an idea above: it appears here with the providers listed for it." : "A requirement starts from an idea you accepted."}</p>
          </div>
        ) : (
          <ul className="items" data-testid="requirements">
            {requirements.map((r) => {
              const chosen = engagedWith.get(r.id);
              const state = requirementState({ withdrawn: r.withdrawnAt !== null, engaged: chosen !== undefined, providersListed: r.providers.length });
              const pool = (
                <div className="pr-pool">
                  {r.pool && r.pool.shown ? <Eye /> : <Lock />}
                  <div>
                    <p className="pr-pool-title">Others asking for the same thing</p>
                    <p data-testid="pool">
                      {r.pool && r.pool.shown
                        ? `At least ${r.pool.atLeast} companies in this cluster have asked for the same thing.`
                        : `Fewer than ${r.pool?.floor ?? 5} companies have asked for this in your cluster, so the number is not shown to anyone, to protect the companies that asked.`}
                    </p>
                  </div>
                </div>
              );
              const providers = (
                <div className="pr-block" data-testid="providers">
                  <h4>Providers listed for this</h4>
                  <p className="help">(SYNTHETIC; in name order. APLYD's earnings do not depend on which one you choose.)</p>
                  {r.providers.length === 0 ? (
                    <p className="muted">No provider is listed for this in your cluster yet. When one is listed for this idea in your cluster, it appears here.</p>
                  ) : (
                    <ul className="pr-prov">
                      {r.providers.map((p) => (
                        <li key={p.id}>
                          <strong>{p.name}</strong>
                          {p.summary ? ` — ${p.summary}` : ""}
                          <span className="pr-serves">
                            Serves this idea in <span className="pr-nw">{clusterLabel(r.cluster)}</span>.
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
              return (
                <li key={r.id} className="card item" data-testid={`requirement-${r.opportunityId}`} data-state={state.key}>
                  <div className="pr-top">
                    <h3>{r.title}</h3>
                    <div className="pr-tags">
                      <Tag>{clusterLabel(r.cluster)}</Tag>
                      {r.withdrawnAt ? (
                        <Tag>Withdrawn</Tag>
                      ) : (
                        <>
                          <Tag>Open</Tag>
                          <Tag tone={state.tone}>{state.tag}</Tag>
                        </>
                      )}
                    </div>
                  </div>
                  {r.withdrawnAt ? (
                    <p className="muted">Withdrawn on {r.withdrawnAt.slice(0, 10)}. It no longer counts in any pool.</p>
                  ) : chosen ? (
                    <>
                      <div data-testid="engaged" className="pr-block pr-wide">
                        <p>
                          <strong>You chose {chosen.providerName}.</strong> A requirement with a provider chosen stays: close the engagement on the delivery page if it ends.
                        </p>
                        <div className="actions">
                          <a className="btn" href="/deliver">
                            Go to delivery
                            <Arrow className="icon" />
                          </a>
                        </div>
                      </div>
                      <details className="pr-more">
                        <summary>Others asking, and providers listed for this</summary>
                        {pool}
                        {providers}
                      </details>
                    </>
                  ) : (
                    <>
                      <p className="pr-next" data-tone={state.tone}>
                        {state.next}
                      </p>
                      {providers}
                      {r.providers.length > 0 ? (
                        <form method="post" action={`/api/companies/${companyId}/requirements/${r.id}/engagement`} data-testid="choose-provider" className="pr-choose pr-wide">
                          <div className="question">
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
                          </div>
                          <div className="actions">
                            <button type="submit" className="primary">
                              Choose a provider for {r.title}
                            </button>
                          </div>
                          <p className="help">This records your choice and opens a plan you write with them. It does not contact the provider, agree a price or move any money. You cannot change the provider for this requirement afterwards.</p>
                        </form>
                      ) : null}
                      {pool}
                      <form method="post" action={`/api/companies/${companyId}/requirements/${r.id}/withdraw`} className="pr-withdraw pr-wide">
                        <div className="question">
                          <label htmlFor={`withdraw-note-${r.id}`} className="label">
                            A note for yourself (optional)
                          </label>
                          <input id={`withdraw-note-${r.id}`} name="note" type="text" maxLength={MAX_NOTE_LENGTH} />
                        </div>
                        <div className="actions">
                          <button type="submit" className="danger">
                            Withdraw {r.title}
                          </button>
                        </div>
                        <p className="help">A withdrawn requirement stays on record and is not made again. To ask again, make a new assessment.</p>
                      </form>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="pr-end">
        <p>
          <a href="/diagnose">Back to your assessment</a>
        </p>
        <p>
          <a href="/">Home</a>
        </p>
      </div>
    </Page>
  );
}
