import "./procure.css";
import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { presentEngagements } from "../../modules/deliver/src/api/engagements.ts";
import { presentAssessment } from "../../modules/diagnose/src/api/diagnose.ts";
import { listAssessments, loadAssessment } from "../../modules/diagnose/src/db/assessments.ts";
import { CLUSTERS, clusterLabel } from "../../modules/procure/src/clusters.ts";
import { MAX_NOTE_LENGTH, presentRequirements } from "../../modules/procure/src/api/requirements.ts";
import { askedLabel, askState, nothingLeftToAsk, procureCounts, procureSentence, procureTags, readyFirst, readyTone, requirementState } from "../../modules/procure/src/view.ts";
import type { AppEnv } from "../../modules/platform/src/env.ts";
import { resolveIdentityFromCookieHeader } from "../../modules/platform/src/identity/resolve.ts";
import { formatDate } from "../_ui/dates.ts";
import { Arrow, Check, Eye, Lock } from "../_ui/icons.tsx";
import { Meter, Notice, NotOwner, Page, SignedOut, Tag } from "../_ui/parts.tsx";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choose" };

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
  if (!identity.companyId || identity.role !== "owner" || !e.DB) return <NotOwner title="What you need" hasCompany={identity.companyId !== null} />;

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
    withdrawnAsked: alreadyAsked.filter((i) => asked.get(i.opportunityId)?.withdrawnAt != null).length,
    requirements: requirements.map((r) => ({ withdrawn: r.withdrawnAt !== null, engaged: engagedWith.has(r.id), providersListed: r.providers.length })),
  });
  // Ideas not yet asked for that have something to do or check first are not called "Ready to ask for" (S5-14). The assessment stored with the idea says so.
  const held = ready.filter((i) => askState(i.readiness).key !== "ready").length;
  const tags = procureTags(counts, held);
  // A requirement the owner just made shows its confirmation on its own card, where the redirect lands (S5-10). Any other value falls back to the top of the page.
  const madeHere = typeof q.made === "string" && requirements.some((r) => r.id === q.made);

  const ideasSection = (
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
              From your assessment of {formatDate(view.createdAt)}{view.signoff ? `, signed off ${formatDate(view.signoff.at)}` : ""}.
            </p>
            {ready.length > 0 ? (
              <>
                <p className="eyebrow">Ideas to ask for</p>
                <p className="help" data-testid="cluster-explained">
                  A cluster is a group of factories, in one place or in one association. Choose a cluster for each idea you want to ask for. You are counted only with companies that ask for the same idea in the same cluster, and you are shown only the providers listed for that cluster. The three clusters here are made up for the test (SYNTHETIC) and match no real place. The size of a pool is shown only from five companies.
                </p>
                <ul className="items">
                  {ready.map((item) => {
                    const state = askState(item.readiness);
                    return (
                    <li key={item.opportunityId} id={`idea-${item.opportunityId}`} className="card item" data-testid={`accepted-${item.opportunityId}`} data-ask={state.key}>
                      <div className="pr-top">
                        <h3>{item.title}</h3>
                        <div className="pr-tags">
                          <Tag tone={state.key === "ready" ? readyTone(counts) : undefined}>{state.tag}</Tag>
                          <Tag>{item.kind === "ai" ? "Uses AI" : "No AI needed"}</Tag>
                        </div>
                      </div>
                      <p>{item.summary}</p>
                      <p className="muted">
                        Cost, from the assessment: one-time <span className="num">{range(item.costs.oneTime)}</span>, every year after <span className="num">{range(item.costs.recurringPerYear)}</span> (SYNTHETIC placeholders).
                      </p>
                      {state.key !== "ready" ? (
                        <div className="pr-first" data-testid={`first-${item.opportunityId}`}>
                          {item.readiness.needsFirst.length ? (
                            <p>
                              <strong>Do first:</strong> {item.readiness.needsFirst.join("; ")}.
                            </p>
                          ) : null}
                          {item.readiness.toCheck.length ? (
                            <p>
                              <strong>Check:</strong> {item.readiness.toCheck.join("; ")}. You did not answer a question needed to judge this.
                            </p>
                          ) : null}
                          <p className="muted">This is what your assessment says comes first. You can still make the requirement now.</p>
                        </div>
                      ) : null}
                      <form method="post" action={`/api/companies/${companyId}/requirements`} className="pr-ask pr-wide">
                        <input type="hidden" name="assessment" value={view.id} />
                        <input type="hidden" name="opportunity" value={item.opportunityId} />
                        <div className="question">
                          <label htmlFor={`cluster-${item.opportunityId}`} className="label">
                            Which cluster do you ask in?
                          </label>
                          <p className="help" id={`cluster-help-${item.opportunityId}`}>
                            Choose the group of factories you want to be counted with.
                          </p>
                          <select aria-describedby={`cluster-help-${item.opportunityId}`} id={`cluster-${item.opportunityId}`} name="cluster" required defaultValue="">
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
                        <p className="help pr-final" data-testid={`final-${item.opportunityId}`}>
                          Check the cluster before you press the button. It cannot be changed afterwards.
                        </p>
                        <div className="actions">
                          <button type="submit" className="primary">
                            Make a requirement from {item.title}
                          </button>
                        </div>
                        <p className="help">This only records what you are asking for. You can withdraw it until you choose a provider, but you cannot change its cluster.</p>
                      </form>
                    </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <div className="card flat">
                <p>{nothingLeftToAsk(counts)}</p>
              </div>
            )}
            {[
              { heading: "Already asked for", items: alreadyAsked.filter((i) => asked.get(i.opportunityId)?.withdrawnAt == null) },
              { heading: "Withdrawn", items: alreadyAsked.filter((i) => asked.get(i.opportunityId)?.withdrawnAt != null) },
            ].map((group) =>
              group.items.length > 0 ? (
                <div key={group.heading} className="pr-group">
                  <p className="eyebrow">{group.heading}</p>
                  <ul className="items">
                    {group.items.map((item) => {
                      const r = asked.get(item.opportunityId)!;
                      return (
                        <li key={item.opportunityId} id={`idea-${item.opportunityId}`} className="card item" data-testid={`accepted-${item.opportunityId}`}>
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
                </div>
              ) : null,
            )}
          </>
        )}
      </section>
  );
  const requirementsSection = (
      <section className="pr-section" id="requirements" aria-labelledby="pr-requirements">
        <h2 id="pr-requirements">Your requirements</h2>
        {requirements.length > 0 ? (
          <p className="help" data-testid="pool-explained">
            A pool is the companies in one cluster that asked for the same idea. It shows you that others want the same thing. It is only a count: nothing is shared between companies, and a pool does not give you a price or an offer. A number is shown only from five companies.
          </p>
        ) : null}
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
                  <p className="pr-contact">
                    <strong>APLYD does not put you in touch with the provider. You will have to contact them yourself.</strong>
                  </p>
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
                <li key={r.id} id={`requirement-${r.id}`} className="card item" data-testid={`requirement-${r.opportunityId}`} data-state={state.key}>
                  {q.made === r.id ? (
                    <Notice role="status" tone="success" data-testid="made">
                      Your requirement was recorded. The providers listed for it, if any, are below.
                    </Notice>
                  ) : null}
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
                    <p className="muted">Withdrawn on {formatDate(r.withdrawnAt)}. It no longer counts in any pool.</p>
                  ) : chosen ? (
                    <>
                      <div data-testid="engaged" className="pr-block pr-wide">
                        <p>
                          <strong>You chose {chosen.providerName}.</strong> A requirement with a provider chosen stays: close the engagement on the delivery page if it ends.
                        </p>
                        <p className="pr-contact">
                          <strong>APLYD does not put you in touch with the provider. You will have to contact them yourself.</strong>
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
                          <p className="help">APLYD does not put you in touch with the provider. You will have to contact them yourself. This records your choice and opens a plan you write with them. It does not contact the provider, agree a price or move any money. You cannot change the provider for this requirement afterwards.</p>
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
  );

  return (
    <Page stage="procure" identity={identity} title="What you need" lede="Say what you need for each idea you accepted, then choose a provider.">
      {q.made && !madeHere ? (
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
          {counts.accepted > 0 ? <Meter done={counts.asked} of={counts.accepted} label={askedLabel(counts)} /> : null}
          {counts.needsChoice > 0 && counts.ready > 0 ? (
            <p>
              <a href="#requirements">Jump to your requirements</a>
            </p>
          ) : null}
        </section>
      ) : null}

      {requirements.length > 0 ? (
        <>
          {requirementsSection}
          {ideasSection}
        </>
      ) : (
        <>
          {ideasSection}
          {requirementsSection}
        </>
      )}

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
