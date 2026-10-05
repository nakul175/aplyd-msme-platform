import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { loadOwnCompany } from "../modules/platform/src/db/companies.ts";
import type { AppEnv } from "../modules/platform/src/env.ts";
import { resolveIdentityFromCookieHeader } from "../modules/platform/src/identity/resolve.ts";

export const dynamic = "force-dynamic";

export default async function Home() {
  const e = env as unknown as AppEnv;
  const identity = await resolveIdentityFromCookieHeader((await headers()).get("cookie"), e);
  const company = identity && e.DB ? await loadOwnCompany(e.DB, identity) : null;

  if (!identity) {
    return (
      <>
        <h1>APLYD MSME platform</h1>
        <p className="muted">You are not signed in.</p>
        <p>
          <a href="/sign-in">Sign in</a>
        </p>
      </>
    );
  }

  return (
    <>
      <h1>APLYD MSME platform</h1>
      <p>
        Signed in as {identity.displayName} <span className="tag">{identity.role}</span>
      </p>
      <section className="card" aria-label="Company record">
        {company ? (
          <>
            <h2>{company.name}</h2>
            {company.synthetic ? <span className="tag">SYNTHETIC</span> : null}
            <p className="muted">Record created {company.createdAt.slice(0, 10)}.</p>
          </>
        ) : (
          <p className="muted">No company is linked to this account, so there is no company record to show.</p>
        )}
      </section>
      {identity.companyId && identity.role === "owner" ? (
        <p>
          <a href="/factory">Describe your factory</a>
        </p>
      ) : null}
      {identity.companyId && identity.role === "owner" ? (
        <p>
          <a href="/diagnose">What to do about it</a>
        </p>
      ) : null}
      {identity.companyId && identity.role === "owner" ? (
        <p>
          <a href="/procure">What you need</a>
        </p>
      ) : null}
      {identity.role === "operator" && identity.companyId === null ? (
        <p>
          <a href="/operator">Providers and the listing fee</a>
        </p>
      ) : null}
      <form method="post" action="/api/session">
        <input type="hidden" name="intent" value="sign-out" />
        <button type="submit">Sign out</button>
      </form>
    </>
  );
}
