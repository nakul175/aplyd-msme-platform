import { env } from "cloudflare:workers";
import { notFound } from "next/navigation";
import { DEMO_COMPANIES, OPERATOR, WALKED_COMPANY, WITNESS_COMPANY } from "../../modules/demo/src/cast.ts";
import { DOES_NOT_SHOW, RESET_NOTE, STEPS } from "../../modules/demo/src/script.ts";
import { PageHead, Tag } from "../_ui/parts.tsx";
import "./demo.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Demonstration" };

const STAGE_TEXT = { requirements: "has asked for ideas", provider_chosen: "has chosen a provider", plan_agreed: "has an agreed plan", running: "is running: a delivery accepted and paid" } as const;

/** The presenter's script. It exists only when the application was started in demonstration mode; anywhere else this address is not found. */
export default function Demo() {
  if ((env as unknown as { APLYD_DEMO?: string }).APLYD_DEMO !== "true") notFound();
  const minutes = STEPS.reduce((n, s) => n + s.minutes, 0);
  return (
    <>
      <PageHead title="Demonstration" lede={<p>A script for the person presenting: who to sign in as, where to start, what to do and what to say, one step at a time.</p>} />
      <div className="notice" role="note" data-tone="warn">
        Everything in this demonstration is SYNTHETIC: invented companies, people, providers and figures. It is a walk through what the application does today, in about {minutes} minutes, led by a presenter.
      </div>
      <p>
        Sign in on the <a href="/sign-in">sign-in page</a>, choosing the person each step names. <a href="/">Home</a> has the links.
      </p>

      <section className="dm-section" aria-labelledby="dm-people">
        <h2 id="dm-people">The people</h2>
        <ul className="dm-people">
          <li className="card dm-person">
            <p>
              <strong>{OPERATOR.name}</strong> <Tag tone="brand">Operator</Tag>
            </p>
            <p className="muted">The platform operator. Sees providers, the one fee and the pools that have reached five.</p>
          </li>
          <li className="card dm-person">
            <p>
              <strong>{WALKED_COMPANY.owner}</strong> <span className="muted">({WALKED_COMPANY.name})</span> <Tag tone="turn">Walked live</Tag>
            </p>
            <p className="muted">The company walked live. Its description is confirmed; nothing else has been done.</p>
          </li>
          <li className="card dm-person">
            <p>
              <strong>{WITNESS_COMPANY.owner}</strong> <span className="muted">({WITNESS_COMPANY.name})</span> <Tag>Has nothing</Tag>
            </p>
            <p className="muted">A company with nothing, to show it sees none of the others.</p>
          </li>
          {DEMO_COMPANIES.map((c) => (
            <li key={c.id} className="card dm-person" data-testid={`cast-${c.id}`}>
              <p>
                <strong>{c.ownerName}</strong> <span className="muted">({c.name})</span>
              </p>
              <p>
                <Tag tone={c.stage === "running" ? "ok" : undefined}>{STAGE_TEXT[c.stage]}</Tag>
              </p>
              <p className="muted">{c.story}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="dm-section" aria-labelledby="dm-walk">
        <h2 id="dm-walk">The walk</h2>
        <ol className="items dm-steps">
          {STEPS.map((s) => (
            <li key={s.n} className="card item dm-step" data-testid={`step-${s.n}`}>
              <div className="dm-step-head">
                <h3>
                  <span className="dm-n">{s.n}.</span> {s.title}
                </h3>
                <Tag>{s.minutes} min</Tag>
              </div>
              <dl className="facts dm-where">
                <dt>Sign in as</dt>
                <dd>
                  <strong>{s.signInAs}</strong>
                </dd>
                <dt>Open</dt>
                <dd>
                  <strong>{s.open}</strong>, from the home page
                </dd>
              </dl>
              <div className="dm-do">
                <p className="label">What to do</p>
                <ol>
                  {s.do.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ol>
              </div>
              <div className="dm-say">
                <p className="label">What to say</p>
                <blockquote>
                  <p>{s.say}</p>
                </blockquote>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="dm-section" aria-labelledby="dm-not">
        <h2 id="dm-not">What this does not show</h2>
        <ul className="card dm-not">
          {DOES_NOT_SHOW.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      <section className="dm-section" aria-labelledby="dm-again">
        <h2 id="dm-again">Starting again</h2>
        <div className="card flat">
          <p>{RESET_NOTE}</p>
        </div>
      </section>
    </>
  );
}
