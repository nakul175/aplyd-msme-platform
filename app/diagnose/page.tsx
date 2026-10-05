import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { presentAssessment, DECISIONS, MAX_NOTE_LENGTH, notOwnerMessage } from "../../modules/diagnose/src/api/diagnose.ts";
import { listAssessments, loadAssessment, loadLatestAssessmentId } from "../../modules/diagnose/src/db/assessments.ts";
import type { Item } from "../../modules/diagnose/src/engine.ts";
import { MAX_ITEMS, POINTS } from "../../modules/diagnose/src/engine.ts";
import { afterSignOff, decisionWord, firstUndecided, hasAssessmentFrom, relationToConfirmed, scoreLine, signOffState, signOffWords } from "../../modules/diagnose/src/progress.ts";
import { loadLatest } from "../../modules/factory/src/db/revisions.ts";
import { loadFacts } from "../../modules/journey/src/facts.ts";
import { nextStep } from "../../modules/journey/src/progress.ts";
import type { AppEnv } from "../../modules/platform/src/env.ts";
import { resolveIdentityFromCookieHeader } from "../../modules/platform/src/identity/resolve.ts";
import { Arrow, Check } from "../_ui/icons.tsx";
import { Meter, Notice, Page, PageHead, SignedOut, Tag } from "../_ui/parts.tsx";
import "./diagnose.css";

export const dynamic = "force-dynamic";

type Search = { a?: string; saved?: string; signed?: string; problem?: string; needs?: string };

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const range = (r: { low: number; high: number }) => (r.low === r.high ? rupees(r.low) : `${rupees(r.low)} to ${rupees(r.high)}`);
const UNIT: Record<string, string> = { percent: "percent", days: "days", rupees_per_year: "rupees a year" };
const READINESS: Record<string, string> = { ready: "Ready to start", check: "A few things to check first", needs_first: "Needs something else first" };
const FIT: Record<string, string> = {
  within: "Fits within your yearly budget.",
  stretch: "Could stretch your yearly budget.",
  over: "Is more than your yearly budget.",
  unknown: "You did not give a budget, so this is not compared.",
};
const RISK: Record<string, string> = { low: "Low risk", medium: "Medium risk", high: "High risk" };
const DECISION_LABEL: Record<string, string> = { accept: "Accept: I want to do this", defer: "Later: not now", reject: "No: not for me" };
const SIGN_OFF_MEANS = "Signing off says you have read every idea and the decisions are yours. After that nothing on it can be changed. To change your mind, confirm a newer description and make a new assessment.";
const PROBLEMS: Record<string, string> = {
  decision: "That decision could not be saved. Choose one of the three answers; keep the note short.",
  signed: "This assessment is already signed off, so it cannot be changed.",
  undecided: "Every idea needs your decision before you can sign off.",
  note: "Keep the note under 500 characters.",
  changed: "A decision was added while you were signing off, so nothing was signed. Look at the ideas again and sign off once you have read them.",
  too_many: "This assessment holds as many decisions as it can. Sign it off, or confirm a newer description and make a new assessment.",
  no_items: "There is nothing in this assessment to sign off. Describe your problems again, confirm the description, and make a new assessment.",
  missing: "That assessment could not be found.",
};

function Money({ item }: { item: Item }) {
  const { costs, benefit, affordability } = item;
  return (
    <dl className="facts dg-facts">
      <dt>What it could do</dt>
      <dd>
        {benefit.measure}: <span className="num">{benefit.low} to {benefit.high}</span> {UNIT[benefit.unit]} <span className="muted">(SYNTHETIC placeholder, not an estimate)</span>
      </dd>
      <dt>One-time cost</dt>
      <dd className="num">{range(costs.oneTime)}</dd>
      <dt>Every year after</dt>
      <dd className="num">{range(costs.recurringPerYear)}</dd>
      <dt>First year in all</dt>
      <dd>
        <span className="num">{range(affordability.firstYear)}</span>. {FIT[affordability.state]}
      </dd>
    </dl>
  );
}

export default async function Diagnose({ searchParams }: { searchParams: Promise<Search> }) {
  const e = env as unknown as AppEnv;
  const q = await searchParams;
  const identity = await resolveIdentityFromCookieHeader((await headers()).get("cookie"), e);

  if (!identity) return <SignedOut title="What to do about it" reason="to see your assessment." />;
  if (!identity.companyId || identity.role !== "owner" || !e.DB) {
    return (
      <>
        <PageHead title="What to do about it" />
        <div className="card">
          <p className="muted">{notOwnerMessage(identity.companyId !== null)}</p>
          <p>
            <a href="/">Back</a>
          </p>
        </div>
      </>
    );
  }

  const db = e.DB;
  const companyId = identity.companyId;
  const [confirmed, all] = await Promise.all([loadLatest(db, companyId, "confirmed"), listAssessments(db, companyId)]);
  const wanted = q.a && q.a.length <= 64 ? q.a : await loadLatestAssessmentId(db, companyId);
  const record = wanted ? await loadAssessment(db, companyId, wanted) : null;
  const view = record ? await presentAssessment(record) : null;
  const decisionOf = new Map((view?.standing ?? []).map((s) => [s.opportunityId, s]));
  const signed = view?.signoff ?? null;
  const decided = view ? view.result.items.filter((i) => decisionOf.has(i.opportunityId)).length : 0;
  const total = view?.result.items.length ?? 0;
  const state = signOffState(decided, total, signed !== null);
  const ready = state === "ready";
  const nextIdea = view && !signed ? firstUndecided(view.result.items, new Set(decisionOf.keys())) : null;
  // After a sign-off the owner's turn is somewhere else: the same step the strip and the foot of the page name, with its own words on the button.
  const onward = signed ? afterSignOff(nextStep(await loadFacts(db, companyId), new Date())) : null;
  // The make button is the page's main action until an assessment exists for the confirmed description; after that it is a quiet way to make it again.
  const madeFromConfirmed = confirmed ? hasAssessmentFrom(all, confirmed.revision) : false;

  const MakeForm = ({ primary }: { primary: boolean }) =>
    confirmed ? (
      <form method="post" action={`/api/companies/${companyId}/assessments`} data-testid="make-form" className={primary ? "card tint dg-make-card" : "dg-make"}>
        {primary ? <h2>See what is worth doing</h2> : null}
        <p>
          Your confirmed description is version {confirmed.revision}, saved <span className="dg-date">{confirmed.createdAt.slice(0, 10)}</span>.
        </p>
        {primary ? <p className="muted">Your answers go through a fixed set of rules and come back as a short ranked list of ideas, each with its cost, its risk and what has to come first.</p> : null}
        <div className="actions">
          <button type="submit" className={primary ? "primary big" : undefined}>
            Make an assessment from version {confirmed.revision}
            {primary ? <Arrow className="icon" /> : null}
          </button>
        </div>
        <p className="help">Making it again from the same version gives the same assessment. Confirm a newer version of your description to get a new one.</p>
      </form>
    ) : null;

  return (
    <Page stage="diagnose" identity={identity} title="What to do about it" lede="Here is a short, ranked list of ideas for your factory: for each one you say yes, not yet or no, and then sign off.">
      {q.saved ? (
        <Notice role="status" tone="success" data-testid="saved">
          Your decision was saved.
        </Notice>
      ) : null}
      {q.signed === "1" ? (
        <Notice role="status" tone="success" data-testid="signed">
          Signed off. This assessment is now fixed and cannot be changed.
        </Notice>
      ) : null}
      {q.problem && Object.hasOwn(PROBLEMS, q.problem) ? (
        <Notice role="alert" tone="danger" data-testid="problem">
          {PROBLEMS[q.problem]}
        </Notice>
      ) : null}
      {q.needs === "confirm" ? (
        <Notice role="alert" tone="warn" data-testid="needs-confirm">
          There is no confirmed description yet.
        </Notice>
      ) : null}

      <p className="help dg-synthetic">
        <Tag>SYNTHETIC</Tag> The ideas and every figure on this page are placeholders written to test the service. They are not advice and not estimates.
      </p>

      {!confirmed ? (
        <section className="card tint" data-testid="no-description">
          <p>An assessment is made from a description of your factory that you have confirmed as accurate. You have not confirmed one yet.</p>
          <p>
            <a className="btn primary big" href="/factory">
              Describe your factory
              <Arrow className="icon" />
            </a>
          </p>
        </section>
      ) : madeFromConfirmed ? null : (
        <MakeForm primary />
      )}

      {view ? (
        <section className="dg-assessment" aria-label="Assessment" data-testid="assessment">
          <div className="dg-head">
            <h2>Assessment from version {view.factoryRevisionNo} of your description</h2>
            {confirmed && relationToConfirmed(view.factoryRevisionNo, confirmed.revision) === "older" ? (
              <p>
                <Tag tone="turn">Older version</Tag> Your newest confirmed description is version {confirmed.revision}.
              </p>
            ) : null}
            <p className="muted" data-testid="drafted-by">
              Drafted by a set of rules on {view.createdAt.slice(0, 10)}, not by an AI model. You check it: decide on each idea below, then sign it off. Library version {view.libraryVersion}, engine version {view.engineVersion}.
            </p>
            {view.result.inputs.problems.length ? <p className="dg-problems">Problems you named: {view.result.inputs.problems.join("; ")}.</p> : <p className="dg-problems">You named no problems, so there is nothing to match.</p>}
          </div>

          <section className={signed || ready ? "card tint dg-signoff-card" : "card dg-signoff-card"} aria-label="Sign-off" data-testid="signoff">
            {signed ? (
              <>
                <h3 className="dg-signed">
                  <Check className="dg-tick" />
                  Signed off
                </h3>
                <p>
                  Signed off on <span className="dg-date">{signed.at.slice(0, 10)}</span>. {signed.note ? `Your note: ${signed.note}` : ""}
                </p>
                <Meter data-testid="progress" done={decided} of={total} label={`${decided} of ${total} ideas decided.`} />
                {onward ? (
                  <div className="dg-onward">
                    <p>
                      <strong>Next:</strong> {onward.title}.
                    </p>
                    <div className="actions">
                      <a className="btn primary big" href={onward.href}>
                        {onward.cta}
                        <Arrow className="icon" />
                      </a>
                    </div>
                    <p className="help">{onward.body}</p>
                  </div>
                ) : null}
                <p className="muted help">
                  Fingerprint of what was signed: <code>{signed.digest.slice(0, 16)}</code> {signed.digestMatches ? "(checked just now: it matches)" : "(checked just now: IT DOES NOT MATCH what is stored)"}
                </p>
              </>
            ) : (
              <>
                <h3>Sign off</h3>
                <Meter data-testid="progress" done={decided} of={total} label={`${decided} of ${total} ideas decided.`} />
                <p>{signOffWords(state, decided, total)}</p>
                {nextIdea ? (
                  <p>
                    {decided > 0 ? (
                      <>
                        <a href={`#idea-${nextIdea}`}>Go to the next idea to decide</a>.{" "}
                      </>
                    ) : null}
                    You can change a decision until you sign off.
                  </p>
                ) : null}
                <form method="post" action={`/api/companies/${companyId}/assessments/${view.id}/signoff`} className="dg-signoff-form">
                  {ready ? (
                    <div className="question">
                      <label htmlFor="signoff-note" className="label">
                        A note (optional)
                      </label>
                      <input id="signoff-note" name="note" type="text" maxLength={MAX_NOTE_LENGTH} />
                    </div>
                  ) : null}
                  <div className="actions">
                    <button type="submit" className={ready ? "primary big" : undefined} disabled={!ready}>
                      Sign off this assessment
                      {ready ? <Arrow className="icon" /> : null}
                    </button>
                  </div>
                  {ready ? (
                    <p className="muted help">{SIGN_OFF_MEANS}</p>
                  ) : (
                    <details className="dg-more">
                      <summary>What signing off means</summary>
                      <p className="muted help">{SIGN_OFF_MEANS}</p>
                    </details>
                  )}
                </form>
              </>
            )}
          </section>

          {view.result.items.length === 0 ? (
            <Notice tone="warn" data-testid="no-items">
              Nothing in the library matches the problems you named. Naming "something else" cannot be matched.
            </Notice>
          ) : (
            <h2 className="dg-ideas-title">The ideas, ranked</h2>
          )}

          <ol className="items">
            {view.result.items.map((item) => {
              const d = decisionOf.get(item.opportunityId);
              return (
                <li key={item.opportunityId} id={`idea-${item.opportunityId}`} className={signed ? "card item dg-idea dg-fixed" : "card item dg-idea"} data-testid={`item-${item.opportunityId}`}>
                  <div className="dg-body">
                    <h3>
                      <span className="dg-rank">
                        {item.rank}
                        <span className="dg-stop">.</span>
                      </span>{" "}
                      {item.title}
                    </h3>
                    <p className="dg-tags">
                      {d ? (
                        <Tag tone={d.decision === "accept" ? "ok" : undefined}>
                          {d.decision === "accept" ? <Check className="dg-tagtick" /> : null}
                          Your decision: {decisionWord(d.decision)}
                        </Tag>
                      ) : (
                        <Tag tone={signed ? undefined : "turn"}>{signed ? "No decision" : "Not decided yet"}</Tag>
                      )}
                      {" "}
                      <Tag>{item.kind === "ai" ? "Uses AI" : "No AI needed"}</Tag>{" "}
                      <Tag tone={item.readiness.state === "ready" ? "ok" : undefined}>{READINESS[item.readiness.state]}</Tag>{" "}
                      <Tag tone={item.risk.level === "high" ? "danger" : undefined}>{RISK[item.risk.level]}</Tag>
                    </p>
                    <p className="dg-summary">{item.summary}</p>
                    {item.addresses.length ? (
                      <p className="dg-answers">
                        <strong>Answers:</strong> {item.addresses.join("; ")}.
                      </p>
                    ) : null}
                    <Money item={item} />
                    {item.readiness.needsFirst.length || item.readiness.toCheck.length ? (
                      <div className="dg-first">
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
                      </div>
                    ) : null}
                    <div className="dg-notes">
                      <p>
                        <strong>Hidden costs to expect:</strong> {item.costs.hidden.join("; ")}.
                      </p>
                      <p>
                        <strong>The risk:</strong> {item.risk.note}
                      </p>
                      <p className="muted">Why it is here: {item.why.join(" ")}</p>
                    </div>
                    <details className="dg-more">
                      <summary>Source and score</summary>
                      <p className="muted help">Source: {item.source === "assumption" ? "an assumption (SYNTHETIC)" : item.source}.</p>
                      <p className="muted help">How it scored: {scoreLine(item.scoreParts, item.score)}</p>
                    </details>
                  </div>

                  {signed ? (
                    <p className="dg-decision" data-testid={`decision-${item.opportunityId}`}>
                      <strong>Your decision:</strong> {d ? DECISION_LABEL[d.decision] : "none"}
                      {d?.note ? ` (${d.note})` : ""}
                    </p>
                  ) : (
                    <form method="post" action={`/api/companies/${companyId}/assessments/${view.id}/decisions`} className="dg-decide">
                      <input type="hidden" name="opportunity" value={item.opportunityId} />
                      <fieldset>
                        <legend>Your decision on this idea</legend>
                        <div className="options dg-three">
                          {DECISIONS.map((value) => (
                            <label key={value} className="option">
                              <input type="radio" name="decision" value={value} defaultChecked={d?.decision === value} required />
                              {DECISION_LABEL[value]}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <div className="question">
                        <label htmlFor={`note-${item.opportunityId}`} className="label">
                          A note for yourself (optional)
                        </label>
                        <input id={`note-${item.opportunityId}`} name="note" type="text" maxLength={MAX_NOTE_LENGTH} defaultValue={d?.note ?? ""} />
                      </div>
                      <div className="actions">
                        <button type="submit" className={item.opportunityId === nextIdea ? "primary" : undefined}>
                          Save decision on {item.title}
                        </button>
                      </div>
                    </form>
                  )}
                </li>
              );
            })}
          </ol>

          <details className="card">
            <summary>How the ideas were ranked</summary>
            <p>
              Each idea starts with {POINTS.perProblem} points for every problem you named that it addresses. Then it gains or loses points: for being ready to start ({POINTS.readiness.ready}), needing a check ({POINTS.readiness.check}) or needing
              something else first ({POINTS.readiness.needs_first}); for fitting your yearly budget ({POINTS.affordability.within}), stretching it ({POINTS.affordability.stretch}) or going over ({POINTS.affordability.over}); for risk (low {POINTS.risk.low}, medium{" "}
              {POINTS.risk.medium}, high {POINTS.risk.high}); and {POINTS.missingGapAnswer} when you did not answer a question needed to see whether you have the gap. The first {MAX_ITEMS} are shown. Whether an idea uses AI plays no part in the ranking.
            </p>
          </details>

          {view.result.leftOut.length ? (
            <details className="card" data-testid="left-out">
              <summary>Ideas left out ({view.result.leftOut.length})</summary>
              <ul>
                {view.result.leftOut.map((l) => (
                  <li key={l.opportunityId}>
                    <strong>{l.title}.</strong> {l.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}

      {confirmed || all.length ? (
        <section className="card dg-list-card" aria-label="Your assessments">
          <h2>Your assessments</h2>
          {all.length ? (
            <ul className="dg-list" data-testid="assessments">
              {all.map((a) => (
                <li key={a.id}>
                  <a href={`/diagnose?a=${encodeURIComponent(a.id)}`} aria-current={view?.id === a.id ? "page" : undefined}>
                    From version {a.factoryRevisionNo}
                  </a>{" "}
                  · <span className="dg-date">{a.createdAt.slice(0, 10)}</span> · {a.signedOffAt ? "signed off" : `${a.decided} of ${a.items} decided`}
                  {view?.id === a.id ? (
                    <>
                      {" "}
                      <Tag tone="brand">Shown above</Tag>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">None yet.</p>
          )}
          {confirmed && madeFromConfirmed ? <MakeForm primary={false} /> : null}
        </section>
      ) : null}
    </Page>
  );
}
