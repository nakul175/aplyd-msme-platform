import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { presentAssessment, DECISIONS, MAX_NOTE_LENGTH, notOwnerMessage } from "../../modules/diagnose/src/api/diagnose.ts";
import { listAssessments, loadAssessment, loadLatestAssessmentId } from "../../modules/diagnose/src/db/assessments.ts";
import type { Item } from "../../modules/diagnose/src/engine.ts";
import { MAX_ITEMS, POINTS } from "../../modules/diagnose/src/engine.ts";
import { loadLatest } from "../../modules/factory/src/db/revisions.ts";
import type { AppEnv } from "../../modules/platform/src/env.ts";
import { resolveIdentityFromCookieHeader } from "../../modules/platform/src/identity/resolve.ts";

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
    <dl className="facts">
      <dt>What it could do</dt>
      <dd>
        {benefit.measure}: {benefit.low} to {benefit.high} {UNIT[benefit.unit]} <span className="muted">(SYNTHETIC placeholder, not an estimate)</span>
      </dd>
      <dt>One-time cost</dt>
      <dd>{range(costs.oneTime)}</dd>
      <dt>Every year after</dt>
      <dd>{range(costs.recurringPerYear)}</dd>
      <dt>First year in all</dt>
      <dd>
        {range(affordability.firstYear)}. {FIT[affordability.state]}
      </dd>
    </dl>
  );
}

export default async function Diagnose({ searchParams }: { searchParams: Promise<Search> }) {
  const e = env as unknown as AppEnv;
  const q = await searchParams;
  const identity = await resolveIdentityFromCookieHeader((await headers()).get("cookie"), e);

  if (!identity) {
    return (
      <>
        <h1>What to do about it</h1>
        <p>
          <a href="/sign-in">Sign in</a> to see your assessment.
        </p>
      </>
    );
  }
  if (!identity.companyId || identity.role !== "owner" || !e.DB) {
    return (
      <>
        <h1>What to do about it</h1>
        <p className="muted">{notOwnerMessage(identity.companyId !== null)}</p>
        <p>
          <a href="/">Back</a>
        </p>
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

  return (
    <>
      <h1>What to do about it</h1>
      <p className="muted">
        <span className="tag">SYNTHETIC</span> The ideas and every figure on this page are placeholders written to test the service. They are not advice and not estimates.
      </p>

      {q.saved ? (
        <p role="status" className="notice" data-testid="saved">
          Your decision was saved.
        </p>
      ) : null}
      {q.signed === "1" ? (
        <p role="status" className="notice" data-testid="signed">
          Signed off. This assessment is now fixed and cannot be changed.
        </p>
      ) : null}
      {q.problem && Object.hasOwn(PROBLEMS, q.problem) ? (
        <p role="alert" className="notice" data-testid="problem">
          {PROBLEMS[q.problem]}
        </p>
      ) : null}
      {q.needs === "confirm" ? (
        <p role="alert" className="notice" data-testid="needs-confirm">
          There is no confirmed description yet.
        </p>
      ) : null}

      {!confirmed ? (
        <section className="card" data-testid="no-description">
          <p>An assessment is made from a description of your factory that you have confirmed as accurate. You have not confirmed one yet.</p>
          <p>
            <a href="/factory">Describe your factory</a>
          </p>
        </section>
      ) : (
        <form method="post" action={`/api/companies/${companyId}/assessments`} data-testid="make-form">
          <p>
            Your confirmed description is version {confirmed.revision}, saved {confirmed.createdAt.slice(0, 10)}.
          </p>
          <button type="submit">Make an assessment from version {confirmed.revision}</button>
          <p className="muted help">Making it again from the same version gives the same assessment. Confirm a newer version of your description to get a new one.</p>
        </form>
      )}

      {view ? (
        <section aria-label="Assessment" data-testid="assessment">
          <h2>Assessment from version {view.factoryRevisionNo} of your description</h2>
          <p className="muted" data-testid="drafted-by">
            Drafted by a set of rules on {view.createdAt.slice(0, 10)}, not by an AI model. You check it: decide on each idea below, then sign it off. Library version {view.libraryVersion}, engine version {view.engineVersion}.
          </p>
          {view.result.inputs.problems.length ? <p>Problems you named: {view.result.inputs.problems.join("; ")}.</p> : <p>You named no problems, so there is nothing to match.</p>}

          {view.result.items.length === 0 ? (
            <p className="notice" data-testid="no-items">
              Nothing in the library matches the problems you named. Naming "something else" cannot be matched.
            </p>
          ) : null}

          <ol className="items">
            {view.result.items.map((item) => {
              const d = decisionOf.get(item.opportunityId);
              return (
                <li key={item.opportunityId} className="card item" data-testid={`item-${item.opportunityId}`}>
                  <h3>
                    {item.rank}. {item.title}
                  </h3>
                  <p>
                    <span className="tag">{item.kind === "ai" ? "Uses AI" : "No AI needed"}</span> <span className="tag">{RISK[item.risk.level]}</span> <span className="tag">{READINESS[item.readiness.state]}</span>
                  </p>
                  <p>{item.summary}</p>
                  <p className="muted">Why it is here: {item.why.join(" ")}</p>
                  <Money item={item} />
                  <p>
                    <strong>Hidden costs to expect:</strong> {item.costs.hidden.join("; ")}.
                  </p>
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
                  <p>
                    <strong>The risk:</strong> {item.risk.note}
                  </p>
                  <p className="muted help">Source: {item.source === "assumption" ? "an assumption (SYNTHETIC)" : item.source}.</p>

                  {signed ? (
                    <p data-testid={`decision-${item.opportunityId}`}>
                      <strong>Your decision:</strong> {d ? DECISION_LABEL[d.decision] : "none"}
                      {d?.note ? ` (${d.note})` : ""}
                    </p>
                  ) : (
                    <form method="post" action={`/api/companies/${companyId}/assessments/${view.id}/decisions`}>
                      <input type="hidden" name="opportunity" value={item.opportunityId} />
                      <fieldset className="options">
                        <legend>Your decision on this idea{d ? `: ${DECISION_LABEL[d.decision]}` : ""}</legend>
                        {DECISIONS.map((value) => (
                          <label key={value} className="option">
                            <input type="radio" name="decision" value={value} defaultChecked={d?.decision === value} required />
                            {DECISION_LABEL[value]}
                          </label>
                        ))}
                      </fieldset>
                      <p>
                        <label htmlFor={`note-${item.opportunityId}`} className="label">
                          A note for yourself (optional)
                        </label>
                        <input id={`note-${item.opportunityId}`} name="note" type="text" maxLength={MAX_NOTE_LENGTH} defaultValue={d?.note ?? ""} />
                      </p>
                      <button type="submit">Save decision on {item.title}</button>
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

          <section className="card" aria-label="Sign-off" data-testid="signoff">
            {signed ? (
              <>
                <h3>Signed off</h3>
                <p>
                  Signed off on {signed.at.slice(0, 10)}. {signed.note ? `Your note: ${signed.note}` : ""}
                </p>
                <p className="muted help">
                  Fingerprint of what was signed: <code>{signed.digest.slice(0, 16)}</code> {signed.digestMatches ? "(checked just now: it matches)" : "(checked just now: IT DOES NOT MATCH what is stored)"}
                </p>
              </>
            ) : (
              <>
                <h3>Sign off</h3>
                <p data-testid="progress">
                  {decided} of {total} ideas decided.
                </p>
                <form method="post" action={`/api/companies/${companyId}/assessments/${view.id}/signoff`}>
                  <p>
                    <label htmlFor="signoff-note" className="label">
                      A note (optional)
                    </label>
                    <input id="signoff-note" name="note" type="text" maxLength={MAX_NOTE_LENGTH} />
                  </p>
                  <button type="submit" disabled={total === 0 || decided < total}>
                    Sign off this assessment
                  </button>
                  <p className="muted help">Signing off says you have read every idea and the decisions are yours. After that nothing on it can be changed. To change your mind, confirm a newer description and make a new assessment.</p>
                </form>
              </>
            )}
          </section>
        </section>
      ) : null}

      <h2>Your assessments</h2>
      {all.length ? (
        <ul data-testid="assessments">
          {all.map((a) => (
            <li key={a.id}>
              <a href={`/diagnose?a=${encodeURIComponent(a.id)}`}>From version {a.factoryRevisionNo}</a> · {a.createdAt.slice(0, 10)} · {a.signedOffAt ? "signed off" : `${a.decided} of ${a.items} decided`}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">None yet.</p>
      )}
      <p>
        <a href="/">Back</a>
      </p>
    </>
  );
}
