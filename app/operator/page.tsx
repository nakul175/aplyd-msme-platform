import "./operator.css";
import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { LIBRARY } from "../../modules/diagnose/src/library.ts";
import { CLUSTERS, clusterLabel } from "../../modules/procure/src/clusters.ts";
import { MAX_FEE_INR, MAX_NAME_LENGTH, MAX_NOTE_LENGTH, MAX_SUMMARY_LENGTH, presentPools } from "../../modules/procure/src/api/providers.ts";
import { currentTerms, listAllProviders, listTermsHistory } from "../../modules/procure/src/db/providers.ts";
import { distinctListedFees, operatorSummary, serviceGroups } from "../../modules/procure/src/view.ts";
import type { AppEnv } from "../../modules/platform/src/env.ts";
import { resolveIdentityFromCookieHeader } from "../../modules/platform/src/identity/resolve.ts";
import { Notice, PageHead, SignedOut, Tag } from "../_ui/parts.tsx";

export const dynamic = "force-dynamic";
export const metadata = { title: "Providers" };

type Search = { made?: string; listed?: string; unlisted?: string; fee?: string; problem?: string };

const PROBLEMS: Record<string, string> = {
  provider: "That provider could not be added. Give a name and choose at least one idea and one cluster.",
  fee: `The fee must be a whole number of rupees from 1 to ${MAX_FEE_INR.toLocaleString("en-IN")}.`,
  note: "Keep the note under 500 characters.",
  fee_undecided: "No listing fee has been set, so nothing can be listed yet.",
  no_service: "A provider that serves nothing cannot be listed.",
  already_listed: "That provider is already listed.",
  not_listed: "That provider is not listed.",
  missing: "That provider could not be found.",
};
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const titleOf = (id: string) => LIBRARY.find((o) => o.id === id)?.title ?? id;

export default async function Operator({ searchParams }: { searchParams: Promise<Search> }) {
  const e = env as unknown as AppEnv;
  const q = await searchParams;
  const identity = await resolveIdentityFromCookieHeader((await headers()).get("cookie"), e);

  if (!identity) return <SignedOut title="Providers and the listing fee" reason="as a platform operator." />;
  if (identity.role !== "operator" || identity.companyId !== null || !e.DB) {
    return (
      <>
        <PageHead title="Providers and the listing fee" />
        <div className="card">
          <p className="muted">This page is for a platform operator.</p>
          <p>
            <a href="/">Back</a>
          </p>
        </div>
      </>
    );
  }

  const db = e.DB;
  const [terms, history, providers, pools] = await Promise.all([currentTerms(db), listTermsHistory(db), listAllProviders(db), presentPools(db)]);
  const summary = operatorSummary({ terms, providers, pools: pools.length });
  const fees = distinctListedFees(providers);

  return (
    <>
      <PageHead title="Providers and the listing fee" lede="Add providers, list them so owners can choose, and set the one listing fee." />

      {q.made ? (
        <Notice role="status" tone="success" data-testid="made">
          The provider was added. It is not listed until you list it.
        </Notice>
      ) : null}
      {q.listed === "1" ? (
        <Notice role="status" tone="success" data-testid="listed">
          The provider is listed, at the fee in force.
        </Notice>
      ) : null}
      {q.unlisted === "1" ? (
        <Notice role="status" tone="success" data-testid="unlisted">
          The provider is no longer listed. Its earlier listing stays on record.
        </Notice>
      ) : null}
      {q.fee === "1" ? (
        <Notice role="status" tone="success" data-testid="fee-saved">
          The listing fee was saved as a new version.
        </Notice>
      ) : null}
      {q.problem && Object.hasOwn(PROBLEMS, q.problem) ? (
        <Notice role="alert" tone="danger" data-testid="problem">
          {PROBLEMS[q.problem]}
        </Notice>
      ) : null}

      <p className="help op-note">
        <Tag>SYNTHETIC</Tag> Every provider here is a placeholder. No company is named or shown on this page (the pools below are counts of companies, and only from five), and no money is collected: a listing records the fee that is due and nothing more.
      </p>

      <section className="card op-stats" aria-label="At a glance" data-testid="at-a-glance">
        <div className="op-stat">
          <p className="op-stat-label">Listing fee</p>
          <p className="op-stat-value num">{summary.fee.state === "set" ? rupees(summary.fee.feeInr) : "Not decided"}</p>
          <p className="op-stat-sub">{summary.fee.state === "set" ? `Version ${summary.fee.version}, a SYNTHETIC placeholder.` : "No provider can be listed yet."}</p>
        </div>
        <div className="op-stat">
          <p className="op-stat-label">Providers listed</p>
          <p className="op-stat-value num">{summary.providers === 0 ? "None" : `${summary.listed} of ${summary.providers}`}</p>
          <p className="op-stat-sub">{summary.providers === 0 ? "No provider has been added yet." : summary.listed === summary.providers ? "Every provider is listed." : "Owners see only the listed ones."}</p>
        </div>
        <div className="op-stat">
          <p className="op-stat-label">Pools at the floor</p>
          <p className="op-stat-value num">{summary.poolsAtFloor}</p>
          <p className="op-stat-sub">Pools of five or more companies.</p>
        </div>
      </section>

      <section className="card" aria-labelledby="op-terms" data-testid="fee">
        <h2 id="op-terms">Listing terms</h2>
        <div className="op-fee-now">
          {terms ? <Tag tone="ok">Fee in force</Tag> : <Tag tone="turn">Fee not decided</Tag>}
          {terms ? (
            <p data-testid="fee-now">
              In force: <strong>{rupees(terms.feeInr)}</strong> (version {terms.version}, set <span className="op-nw">{terms.at.slice(0, 10)}</span>).
            </p>
          ) : (
            <p data-testid="fee-now">The fee has not been decided (OQ-11), so no provider can be listed.</p>
          )}
        </div>
        <p className="help">Any fee set here is a SYNTHETIC placeholder, not a proposal: the real fee is an open question (OQ-11).</p>
        <p className="help">
          One fee at a time, the same for every provider listed under it. It does not depend on what a provider serves, on how many owners ask for it, or on which provider an owner chooses (D-03). A provider keeps the fee it was listed at when the fee changes, so providers listed at different times can pay different fees; this page says so when they do.
        </p>
        <form method="post" action="/api/operator/listing-terms" className="op-form op-wide">
          <div className="field-row two">
            <div className="question">
              <label htmlFor="fee-inr" className="label">
                Set the fee, in rupees
              </label>
              <input id="fee-inr" name="feeInr" type="text" inputMode="numeric" required />
            </div>
            <div className="question">
              <label htmlFor="fee-note" className="label">
                Why (optional)
              </label>
              <input id="fee-note" name="note" type="text" maxLength={MAX_NOTE_LENGTH} />
            </div>
          </div>
          <div className="actions">
            <button type="submit" className="primary">
              Save as a new version
            </button>
          </div>
          <p className="help">A new version applies to providers listed from now on. Providers already listed keep the fee they were listed at.</p>
        </form>
        {history.length > 1 ? (
          <p className="muted">
            Earlier versions: {history.slice(1).map((h) => `v${h.version} ${rupees(h.feeInr)}`).join(", ")}.
          </p>
        ) : null}
      </section>

      <section className="op-section" aria-labelledby="op-providers">
        <h2 id="op-providers">Providers</h2>
        {fees > 1 ? (
          <Notice role="status" tone="warn" data-testid="fee-differs">
            The providers now listed are paying {fees} different fees, because the fee changed after some of them were listed. Each fee is shown on its provider below.
          </Notice>
        ) : null}
        {providers.length === 0 ? (
          <div className="card">
            <p>None yet. Add one in the form below, then list it so owners can choose it.</p>
          </div>
        ) : (
          <div className="table-wrap" data-testid="providers">
            <table className="op-table">
              <thead>
                <tr>
                  <th scope="col">Provider</th>
                  <th scope="col">What it serves</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="sr">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {providers.map((p) => {
                  const serves = serviceGroups(p.services, titleOf, clusterLabel);
                  return (
                    <tr key={p.id} data-testid={`provider-${p.name}`}>
                      <td>
                        <span className="op-name">{p.name}</span>
                        {p.summary ? <span className="op-sub">{p.summary}</span> : null}
                      </td>
                      <td data-label="What it serves">{serves.length > 0 ? `Serves: ${serves.join("; ")}.` : "Serves nothing yet."}</td>
                      <td data-label="Status">
                        <div className="op-tags">
                          <Tag tone={p.listed ? "ok" : undefined}>{p.listed ? "Listed" : "Not listed"}</Tag>
                          {p.listed && p.listedFeeInr !== null ? <Tag>Fee {rupees(p.listedFeeInr)}</Tag> : null}
                        </div>
                      </td>
                      <td>
                        {p.listed ? (
                          <form method="post" action={`/api/operator/providers/${p.id}/unlist`}>
                            <button type="submit" aria-label={`Unlist ${p.name}`}>
                              Unlist
                            </button>
                          </form>
                        ) : (
                          <form method="post" action={`/api/operator/providers/${p.id}/list`}>
                            <button type="submit" className="primary" aria-label={`List ${p.name}`}>
                              List
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="op-add">
        <h2 id="op-add">Add a provider</h2>
        <form method="post" action="/api/operator/providers" className="op-form op-wide">
          <div className="field-row two">
            <div className="question">
              <label htmlFor="provider-name" className="label">
                Name
              </label>
              <input id="provider-name" name="name" type="text" maxLength={MAX_NAME_LENGTH} required />
            </div>
            <div className="question">
              <label htmlFor="provider-summary" className="label">
                What it does (optional)
              </label>
              <input id="provider-summary" name="summary" type="text" maxLength={MAX_SUMMARY_LENGTH} />
            </div>
          </div>
          <fieldset className="op-group">
            <legend className="label">Ideas it serves</legend>
            <div className="options cols">
              {LIBRARY.map((o) => (
                <label key={o.id} className="option">
                  <input type="checkbox" name="opportunity" value={o.id} />
                  {o.title}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="op-group">
            <legend className="label">Clusters it serves</legend>
            <div className="options cols">
              {CLUSTERS.map((c) => (
                <label key={c.id} className="option">
                  <input type="checkbox" name="cluster" value={c.id} />
                  {c.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="actions">
            <button type="submit" className="primary">
              Add provider
            </button>
          </div>
          <p className="help">Choose at least one idea and one cluster. The provider is not listed until you list it, in the table above.</p>
        </form>
      </section>

      <section className="card" aria-labelledby="op-pools" data-testid="pools">
        <h2 id="op-pools">Pools at the floor</h2>
        <p className="help">These are the pools you can take to providers.</p>
        <p className="muted">Only pools of at least five companies are shown, and only as a count: no company is named (C-04).</p>
        {pools.length === 0 ? (
          <p>No pool has reached five companies.</p>
        ) : (
          <ul className="op-pools">
            {pools.map((p) => (
              <li key={`${p.cluster}|${p.opportunityId}`}>
                {titleOf(p.opportunityId)}, {clusterLabel(p.cluster)}: <span className="num">{p.companies}</span> companies
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="op-end">
        <p>
          <a href="/">Home</a>
        </p>
      </div>
    </>
  );
}
