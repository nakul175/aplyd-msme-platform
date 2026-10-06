import { env } from "cloudflare:workers";
import { notFound } from "next/navigation";
import { DEMO_COMPANIES, OPERATOR, WALKED_COMPANY, WITNESS_COMPANY } from "../../modules/demo/src/cast.ts";
import { DOES_NOT_SHOW, RESET_NOTE, STEPS } from "../../modules/demo/src/script.ts";

export const dynamic = "force-dynamic";

const STAGE_TEXT = { requirements: "has asked for ideas", provider_chosen: "has chosen a provider", plan_agreed: "has an agreed plan", running: "is running: a delivery accepted and paid" } as const;

/** The presenter's script. It exists only when the application was started in demonstration mode; anywhere else this address is not found. */
export default function Demo() {
  if ((env as unknown as { APLYD_DEMO?: string }).APLYD_DEMO !== "true") notFound();
  const minutes = STEPS.reduce((n, s) => n + s.minutes, 0);
  return (
    <>
      <h1>Demonstration</h1>
      <p className="notice" role="note">
        Everything in this demonstration is SYNTHETIC: invented companies, people, providers and figures. It is a walk through what the application does today, in about {minutes} minutes, led by a presenter.
      </p>
      <p>
        Sign in on the <a href="/sign-in">sign-in page</a>, choosing the person each step names. <a href="/">Home</a> has the links.
      </p>

      <h2>The people</h2>
      <ul>
        <li>
          <strong>{OPERATOR.name}</strong>: the platform operator. Sees providers, the one fee and the pools that have reached five.
        </li>
        <li>
          <strong>{WALKED_COMPANY.owner}</strong> ({WALKED_COMPANY.name}): the company walked live. Its description is confirmed; nothing else has been done.
        </li>
        <li>
          <strong>{WITNESS_COMPANY.owner}</strong> ({WITNESS_COMPANY.name}): a company with nothing, to show it sees none of the others.
        </li>
        {DEMO_COMPANIES.map((c) => (
          <li key={c.id} data-testid={`cast-${c.id}`}>
            <strong>{c.ownerName}</strong> ({c.name}): {STAGE_TEXT[c.stage]}. {c.story}
          </li>
        ))}
      </ul>

      <h2>The walk</h2>
      <ol className="items">
        {STEPS.map((s) => (
          <li key={s.n} className="card item" data-testid={`step-${s.n}`}>
            <h3>
              {s.n}. {s.title} <span className="tag">{s.minutes} min</span>
            </h3>
            <p>
              Sign in as <strong>{s.signInAs}</strong>, then open <strong>{s.open}</strong>.
            </p>
            <ul>
              {s.do.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
            <p className="notice">{s.say}</p>
          </li>
        ))}
      </ol>

      <h2>What this does not show</h2>
      <ul>
        {DOES_NOT_SHOW.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>

      <h2>Starting again</h2>
      <p>{RESET_NOTE}</p>
    </>
  );
}
