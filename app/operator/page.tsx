import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { LIBRARY } from "../../modules/diagnose/src/library.ts";
import { CLUSTERS, clusterLabel } from "../../modules/procure/src/clusters.ts";
import { MAX_FEE_INR, MAX_NAME_LENGTH, MAX_NOTE_LENGTH, MAX_SUMMARY_LENGTH, presentPools } from "../../modules/procure/src/api/providers.ts";
import { currentTerms, listAllProviders, listTermsHistory } from "../../modules/procure/src/db/providers.ts";
import type { AppEnv } from "../../modules/platform/src/env.ts";
import { resolveIdentityFromCookieHeader } from "../../modules/platform/src/identity/resolve.ts";

export const dynamic = "force-dynamic";

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
const distinctListedFees = (providers: { listed: boolean; listedFeeInr: number | null }[]) => new Set(providers.filter((p) => p.listed && p.listedFeeInr !== null).map((p) => p.listedFeeInr)).size;
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const titleOf = (id: string) => LIBRARY.find((o) => o.id === id)?.title ?? id;

export default async function Operator({ searchParams }: { searchParams: Promise<Search> }) {
  const e = env as unknown as AppEnv;
  const q = await searchParams;
  const identity = await resolveIdentityFromCookieHeader((await headers()).get("cookie"), e);

  if (!identity) {
    return (
      <>
        <h1>Providers and the listing fee</h1>
        <p>
          <a href="/sign-in">Sign in</a> as a platform operator.
        </p>
      </>
    );
  }
  if (identity.role !== "operator" || identity.companyId !== null || !e.DB) {
    return (
      <>
        <h1>Providers and the listing fee</h1>
        <p className="muted">This page is for a platform operator.</p>
        <p>
          <a href="/">Back</a>
        </p>
      </>
    );
  }

  const db = e.DB;
  const [terms, history, providers, pools] = await Promise.all([currentTerms(db), listTermsHistory(db), listAllProviders(db), presentPools(db)]);

  return (
    <>
      <h1>Providers and the listing fee</h1>
      <p className="muted">
        <span className="tag">SYNTHETIC</span> Every provider here is a placeholder. No company is named or shown on this page (the pools below are counts of companies, and only from five), and no money is collected: a listing records the fee that is due and nothing more.
      </p>

      {q.made ? (
        <p role="status" className="notice" data-testid="made">
          The provider was added. It is not listed until you list it.
        </p>
      ) : null}
      {q.listed === "1" ? (
        <p role="status" className="notice" data-testid="listed">
          The provider is listed, at the fee in force.
        </p>
      ) : null}
      {q.unlisted === "1" ? (
        <p role="status" className="notice" data-testid="unlisted">
          The provider is no longer listed. Its earlier listing stays on record.
        </p>
      ) : null}
      {q.fee === "1" ? (
        <p role="status" className="notice" data-testid="fee-saved">
          The listing fee was saved as a new version.
        </p>
      ) : null}
      {q.problem && Object.hasOwn(PROBLEMS, q.problem) ? (
        <p role="alert" className="notice" data-testid="problem">
          {PROBLEMS[q.problem]}
        </p>
      ) : null}

      <section className="card" aria-label="Listing fee" data-testid="fee">
        <h2>The listing fee</h2>
        <p>
          One fee at a time, the same for every provider listed under it. It does not depend on what a provider serves, on how many owners ask for it, or on which provider an owner chooses (D-03). A provider keeps the fee it was listed at when the fee changes, so providers listed at different times can pay different fees; this page says so when they do.
        </p>
        {terms ? (
          <p data-testid="fee-now">
            In force: <strong>{rupees(terms.feeInr)}</strong> (version {terms.version}, set {terms.at.slice(0, 10)}).
          </p>
        ) : (
          <p data-testid="fee-now">The fee has not been decided (OQ-11), so no provider can be listed.</p>
        )}
        <form method="post" action="/api/operator/listing-terms">
          <p>
            <label htmlFor="fee-inr" className="label">
              Set the fee, in rupees
            </label>
            <input id="fee-inr" name="feeInr" type="text" inputMode="numeric" required />
          </p>
          <p>
            <label htmlFor="fee-note" className="label">
              Why (optional)
            </label>
            <input id="fee-note" name="note" type="text" maxLength={MAX_NOTE_LENGTH} />
          </p>
          <button type="submit">Save as a new version</button>
          <p className="muted help">A new version applies to providers listed from now on. Providers already listed keep the fee they were listed at.</p>
        </form>
        {history.length > 1 ? (
          <p className="muted">
            Earlier versions: {history.slice(1).map((h) => `v${h.version} ${rupees(h.feeInr)}`).join(", ")}.
          </p>
        ) : null}
      </section>

      <section className="card" aria-label="Add a provider">
        <h2>Add a provider</h2>
        <form method="post" action="/api/operator/providers">
          <p>
            <label htmlFor="provider-name" className="label">
              Name
            </label>
            <input id="provider-name" name="name" type="text" maxLength={MAX_NAME_LENGTH} required />
          </p>
          <p>
            <label htmlFor="provider-summary" className="label">
              What it does (optional)
            </label>
            <input id="provider-summary" name="summary" type="text" maxLength={MAX_SUMMARY_LENGTH} />
          </p>
          <fieldset className="options">
            <legend>Ideas it serves</legend>
            {LIBRARY.map((o) => (
              <label key={o.id} className="option">
                <input type="checkbox" name="opportunity" value={o.id} />
                {o.title}
              </label>
            ))}
          </fieldset>
          <fieldset className="options">
            <legend>Clusters it serves</legend>
            {CLUSTERS.map((c) => (
              <label key={c.id} className="option">
                <input type="checkbox" name="cluster" value={c.id} />
                {c.label}
              </label>
            ))}
          </fieldset>
          <button type="submit">Add provider</button>
        </form>
      </section>

      <h2>Providers</h2>
      {distinctListedFees(providers) > 1 ? (
        <p role="status" className="notice" data-testid="fee-differs">
          The providers now listed are paying {distinctListedFees(providers)} different fees, because the fee changed after some of them were listed. Each fee is shown on its provider below.
        </p>
      ) : null}
      {providers.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <ul className="items" data-testid="providers">
          {providers.map((p) => (
            <li key={p.id} className="card item" data-testid={`provider-${p.name}`}>
              <h3>{p.name}</h3>
              <p>
                <span className="tag">{p.listed ? "Listed" : "Not listed"}</span> {p.listed && p.listedFeeInr !== null ? <span className="tag">Fee {rupees(p.listedFeeInr)}</span> : null}
              </p>
              {p.summary ? <p>{p.summary}</p> : null}
              <p className="muted">
                Serves: {p.services.map((s) => `${titleOf(s.opportunityId)} (${clusterLabel(s.cluster)})`).join("; ")}.
              </p>
              {p.listed ? (
                <form method="post" action={`/api/operator/providers/${p.id}/unlist`}>
                  <button type="submit">Unlist {p.name}</button>
                </form>
              ) : (
                <form method="post" action={`/api/operator/providers/${p.id}/list`}>
                  <button type="submit">List {p.name}</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <section className="card" aria-label="Pools" data-testid="pools">
        <h2>Pools you can take to providers</h2>
        <p className="muted">Only pools of at least five companies are shown, and only as a count: no company is named (C-04).</p>
        {pools.length === 0 ? (
          <p>No pool has reached five companies.</p>
        ) : (
          <ul>
            {pools.map((p) => (
              <li key={`${p.cluster}|${p.opportunityId}`}>
                {titleOf(p.opportunityId)}, {clusterLabel(p.cluster)}: {p.companies} companies
              </li>
            ))}
          </ul>
        )}
      </section>
      <p>
        <a href="/">Home</a>
      </p>
    </>
  );
}
