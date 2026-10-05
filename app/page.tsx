import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { loadFacts } from "../modules/journey/src/facts.ts";
import { STAGES, nextStep, stageLine, stageStatuses } from "../modules/journey/src/progress.ts";
import type { StageStatus } from "../modules/journey/src/progress.ts";
import { loadOwnCompany } from "../modules/platform/src/db/companies.ts";
import type { AppEnv } from "../modules/platform/src/env.ts";
import { resolveIdentityFromCookieHeader } from "../modules/platform/src/identity/resolve.ts";
import { Arrow, Check, Coin, Eye, Layers, Lock } from "./_ui/icons.tsx";
import { Tag } from "./_ui/parts.tsx";

export const dynamic = "force-dynamic";

const STATUS_WORD: Record<StageStatus, { text: string; tone?: "ok" | "turn" }> = {
  done: { text: "Done", tone: "ok" },
  current: { text: "Your turn", tone: "turn" },
  todo: { text: "Not yet" },
};

/** What an owner can rely on. Each line says what the service does today; none promises a result. */
function Promises() {
  return (
    <section className="card" aria-label="What you can rely on">
      <h2>What you can rely on</h2>
      <ul className="promise">
        <li>
          <Layers />
          <span>
            <strong>Nothing is overwritten.</strong> Your description keeps every saved version, and decisions and events are added to the record, never erased.
          </span>
        </li>
        <li>
          <Lock />
          <span>
            <strong>Other companies cannot see yours.</strong> The rule is kept on the server, not just hidden on the page.
          </span>
        </li>
        <li>
          <Eye />
          <span>
            <strong>You decide.</strong> The ideas are ranked by fixed rules you can read, and nothing goes on without your yes.
          </span>
        </li>
        <li>
          <Coin />
          <span>
            <strong>No money moves here.</strong> You write down what you agree and what you pay. The service holds and sends nothing.
          </span>
        </li>
      </ul>
    </section>
  );
}

export default async function Home() {
  const e = env as unknown as AppEnv;
  const identity = await resolveIdentityFromCookieHeader((await headers()).get("cookie"), e);

  if (!identity) {
    return (
      <>
        <section className="hero">
          <h1 className="brandline">APLYD MSME platform</h1>
          <p className="display">See which technology is worth trying in your factory.</p>
          <p>Tell us how your factory runs. You get a short, ranked list of what is worth doing. Then you write down what you need, keep the plan you agree with a provider, check each piece of work, and measure the result with your own numbers.</p>
          <div className="actions">
            <a className="btn turn big" href="/sign-in">
              Sign in
              <Arrow className="icon" />
            </a>
            <p>You are not signed in.</p>
          </div>
        </section>

        <section aria-labelledby="how">
          <h2 id="how">How it works</h2>
          <ol className="how" style={{ marginTop: "var(--s-3)" }}>
            {STAGES.map((s) => (
              <li key={s.id}>
                <strong>{s.short}</strong>
                <span>{s.what}</span>
              </li>
            ))}
          </ol>
        </section>

        <div className="grid-2">
          <Promises />
          <section className="card tint" aria-label="About this version">
            <h2>About this version</h2>
            <p>It is an early version, in English only. It works for one factory at a time, and it does not yet take photos or voice. Nothing here is a finding about a real factory.</p>
          </section>
        </div>
      </>
    );
  }

  const company = e.DB ? await loadOwnCompany(e.DB, identity) : null;
  const isOwner = identity.companyId !== null && identity.role === "owner";
  const isOperator = identity.role === "operator" && identity.companyId === null;
  const now = new Date();
  const facts = isOwner && e.DB && identity.companyId ? await loadFacts(e.DB, identity.companyId) : null;
  const next = facts ? nextStep(facts, now) : null;
  const status = facts ? stageStatuses(facts, now) : null;
  const CompanyCard = () => (
    <section className="card" aria-label="Company record">
      {company ? (
        <>
          <h2>{company.name}</h2>
          {company.synthetic ? (
            <p>
              <span className="tag">SYNTHETIC</span>
            </p>
          ) : null}
          <p className="muted">Record created {company.createdAt.slice(0, 10)}.</p>
        </>
      ) : (
        <p className="muted">No company is linked to this account, so there is no company record to show.</p>
      )}
    </section>
  );

  return (
    <>
      {next ? (
        <section className="hero" aria-label="Your next step">
          <p className="eyebrow">Your next step</p>
          <h1 className="display">{next.title}</h1>
          <p>{next.body}</p>
          <a className="btn turn big" href={next.href}>
            {next.cta}
            <Arrow className="icon" />
          </a>
        </section>
      ) : isOperator ? (
        <section className="hero" aria-label="The operator's work">
          <p className="eyebrow">The platform operator</p>
          <h1 className="display">Keep the list of providers</h1>
          <p>Add providers, say which ideas each one can do, and list them so owners can choose. One listing fee, the same for every provider. You see providers and counts, never a company&rsquo;s record.</p>
          <a className="btn turn big" href="/operator">
            Providers and the listing fee
            <Arrow className="icon" />
          </a>
        </section>
      ) : (
        <section className="hero" aria-label="Your account">
          <p className="eyebrow">APLYD MSME platform</p>
          <h1 className="display">You are signed in</h1>
          <p>{identity.companyId !== null ? "Only the owner of your company can work through the steps. You can see your company's record below." : "This account is not linked to a company, so there are no steps to work through here."}</p>
        </section>
      )}

      <p className="muted">
        Signed in as {identity.displayName} <span className="tag">{identity.role}</span>
      </p>

      {isOwner && status && facts ? (
        <div className="grid-2">
          <section aria-labelledby="steps">
            <h2 id="steps">Your five steps</h2>
            <ol className="stages" style={{ marginTop: "var(--s-3)" }}>
              {STAGES.map((s) => (
                <li key={s.id} className="stage" data-status={status[s.id]}>
                  <span className="dot" aria-hidden>
                    {status[s.id] === "done" ? <Check /> : s.n}
                  </span>
                  <div className="stage-body">
                    <div className="stage-top">
                      <a className="stage-link" href={s.href}>
                        {s.page}
                      </a>
                      <Tag tone={STATUS_WORD[status[s.id]].tone}>{STATUS_WORD[status[s.id]].text}</Tag>
                    </div>
                    <p className="stage-what">{s.what}</p>
                    <p className="stage-line">{stageLine(s.id, facts, now)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <div style={{ display: "grid", gap: "var(--s-4)" }}>
            <CompanyCard />
            <Promises />
          </div>
        </div>
      ) : (
        <CompanyCard />
      )}
    </>
  );
}
