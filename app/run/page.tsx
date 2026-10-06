import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { listEngagements } from "../../modules/deliver/src/db/engagements.ts";
import { clusterLabel } from "../../modules/procure/src/clusters.ts";
import { presentOutcomes } from "../../modules/run/src/api/outcomes.ts";
import { IN_USE, MAX_NOTE_LENGTH, MAX_VALUE, UNIT_LABEL, VERDICTS } from "../../modules/run/src/state.ts";
import type { InUse, Verdict } from "../../modules/run/src/state.ts";
import { REVIEW_TAG, firstOpenReview, firstTurn, latestRecorded, recordedCount, resultsSummary } from "../../modules/run/src/view.ts";
import type { AppEnv } from "../../modules/platform/src/env.ts";
import { resolveIdentityFromCookieHeader } from "../../modules/platform/src/identity/resolve.ts";
import { Arrow, Check } from "../_ui/icons.tsx";
import { Meter, NotOwner, Notice, Page, SignedOut, Tag, ownerFacts, turnPlace } from "../_ui/parts.tsx";
import { nextStep } from "../../modules/journey/src/progress.ts";
import type { NextStep } from "../../modules/journey/src/progress.ts";
import "./run.css";

export const metadata = { title: "Measure" };
export const dynamic = "force-dynamic";

type Search = { saved?: string; problem?: string };

/** The refusal of a starting number. It names the unit when the page knows it, and never mentions reviews. */
const baselineRefused = (unit: string | null) =>
  `That could not be saved. The starting number box takes a number only${unit ? `, in ${unit}` : ""}: for example 42, not “42 late orders”. Give a whole number from 0 to ${MAX_VALUE.toLocaleString("en-IN")}.`;
const PROBLEMS: Record<string, string> = {
  invalid: `That could not be saved. Give a whole number from 0 to ${MAX_VALUE.toLocaleString("en-IN")}, and for a review say whether it did what was expected and whether it is still in use.`,
  baseline_exists: "You have already recorded the starting number for this. It is recorded once.",
  baseline_too_late: "The starting number has to be taken before the first milestone is accepted. It cannot be recorded afterwards.",
  baseline_closed: "This engagement is closed, so a starting number cannot be recorded for it.",
  baseline_no_plan: "Agree the plan on Delivery first. The starting number is recorded after the plan is agreed and before the first milestone is accepted.",
  review_exists: "That review is already recorded. Each review is recorded once.",
  nothing_accepted: "A review needs an accepted milestone. Accept one on Delivery first.",
  not_due: "That review is not due yet. It opens on the date shown.",
  missing: "That engagement could not be found.",
  baseline_invalid: baselineRefused(null),
  correction_invalid: `That correction could not be saved. Give the right number, a whole number from 0 to ${MAX_VALUE.toLocaleString("en-IN")}, and say in a few words why the first one was wrong.`,
};
const SAVED: Record<string, string> = {
  baseline: "The starting number is recorded.",
  review: "The review is recorded.",
  correction: "The correction is recorded. The number it corrects stays on record, marked as corrected.",
};
const VERDICT: Record<Verdict, string> = { met: "Did what the assessment expected", partly: "Did part of it", not_met: "Did not do what was expected" };
const USE: Record<InUse, string> = { yes: "Yes, still in use", no: "No, no longer in use" };
const num = (n: number) => n.toLocaleString("en-IN");
const signed = (n: number) => (n > 0 ? `+${num(n)}` : n < 0 ? `−${num(-n)}` : "0");

type Fixed = { recorded: number; corrections: readonly { at: string; value: number; reason: string }[] };

/** The number first recorded, struck through, and every correction in order; the last one is the current value. Drawn only when there is a correction. */
function Corrections({ item, unit, testId }: { item: Fixed; unit: string; testId: string }) {
  if (item.corrections.length === 0) return null;
  const last = item.corrections.length - 1;
  return (
    <ul className="ru-corrections" data-testid={testId} aria-label="Corrections">
      <li>
        <Tag>Corrected</Tag> First recorded: <s>{num(item.recorded)}</s> {unit}.
      </li>
      {item.corrections.map((c, i) => (
        <li key={i}>
          Corrected on <span className="ru-nw">{c.at.slice(0, 10)}</span> to {i === last ? <strong>{num(c.value)}</strong> : <s>{num(c.value)}</s>} {unit}
          {i === last ? "" : ", corrected again later"}. Why: {c.reason}
        </li>
      ))}
    </ul>
  );
}

/** A collapsed form to correct a number already recorded. It posts a new record; the one it corrects is not changed. */
function CorrectForm({ companyId, engagementId, outcomeId, idPrefix, unit, testId }: { companyId: string; engagementId: string; outcomeId: number; idPrefix: string; unit: string; testId: string }) {
  return (
    <details className="ru-correct">
      <summary>Correct this number</summary>
      <form method="post" action={`/api/companies/${companyId}/engagements/${engagementId}/outcomes`} className="ru-form" data-testid={testId}>
        <input type="hidden" name="kind" value="correction" />
        <input type="hidden" name="outcome" value={String(outcomeId)} />
        <div className="question">
          <label htmlFor={`${idPrefix}-value`} className="label">
            The right number{unit ? ` (${unit})` : ""}
          </label>
          <input id={`${idPrefix}-value`} name="value" type="text" inputMode="numeric" required maxLength={10} />
        </div>
        <div className="question">
          <label htmlFor={`${idPrefix}-reason`} className="label">
            Why the first number was wrong
          </label>
          <input id={`${idPrefix}-reason`} name="reason" type="text" required maxLength={MAX_NOTE_LENGTH} />
        </div>
        <div className="actions">
          <button type="submit">Record the correction</button>
        </div>
        <p className="help">The number you recorded stays on record, marked as corrected. The corrected number is used from now on, including in the change since the starting number.</p>
      </form>
    </details>
  );
}

export default async function Run({ searchParams }: { searchParams: Promise<Search> }) {
  const e = env as unknown as AppEnv;
  const q = await searchParams;
  const identity = await resolveIdentityFromCookieHeader((await headers()).get("cookie"), e);

  if (!identity) return <SignedOut title="Results" reason="to see what your engagements did." />;
  if (!identity.companyId || identity.role !== "owner" || !e.DB) return <NotOwner title="Results" hasCompany={identity.companyId !== null} />;

  const companyId = identity.companyId;
  const now = new Date();
  const engagements = await listEngagements(e.DB, companyId);
  const views = await Promise.all(engagements.map(async (g) => ({ g, o: await presentOutcomes(e.DB as D1Database, companyId, g, now) })));
  const base = (id: string) => `/api/companies/${companyId}/engagements/${id}/outcomes`;
  const turn = firstTurn(views.map(({ g, o }) => ({ id: g.id, canRecordBaseline: o.canRecordBaseline, reviews: o.reviews })));
  // The owner's turn, from the same rule as the home page: at the top when it is done on this page (its button goes to the form), and
  // then the page's own summary is not drawn, because the card says the same thing.
  const facts = await ownerFacts(identity);
  const next = facts ? nextStep(facts, now) : null;
  const here: Partial<Record<NextStep["key"], string>> = {};
  const toBaseline = views.find(({ o }) => o.canRecordBaseline);
  if (toBaseline) here.record_baseline = `#bl-${toBaseline.g.id}`;
  const toReview = views.map(({ g, o }) => ({ id: g.id, no: firstOpenReview(o.reviews) })).find((x) => x.no !== null);
  if (toReview) here.review_due = `#rv-${toReview.id}-${toReview.no}`;
  const place = turnPlace(next, "run", here);
  const summary = resultsSummary(
    views.map(({ o }) => ({ canRecordBaseline: o.canRecordBaseline, reviews: o.reviews })),
    place === "foot" && next ? next.title : null,
  );
  // The unit the starting number is typed in, named when every engagement that can take one uses the same unit.
  const baselineUnits = [...new Set(views.filter(({ o }) => o.canRecordBaseline && o.expected).map(({ o }) => UNIT_LABEL[o.expected!.unit]))];
  const baselineUnit = baselineUnits.length === 1 ? baselineUnits[0] : null;
  const problemText = q.problem === "baseline_invalid" && baselineUnit ? baselineRefused(baselineUnit) : q.problem && Object.hasOwn(PROBLEMS, q.problem) ? PROBLEMS[q.problem] : null;
  const turnIn = turn ? views.find(({ g }) => g.id === turn.engagementId)?.g : undefined;

  return (
    <Page stage="run" identity={identity} facts={facts} here={here} title="Results" lede="See what you expected, what you measured before the work, and what you measured after.">
      {q.saved && Object.hasOwn(SAVED, q.saved) ? (
        <Notice role="status" tone="success" data-testid="saved">
          {SAVED[q.saved]}
        </Notice>
      ) : null}
      {problemText ? (
        <Notice role="alert" tone="danger" data-testid="problem">
          {problemText}
        </Notice>
      ) : null}

      <p className="ru-typed">
        <Tag>SYNTHETIC</Tag> Every number here is one you type: nothing on this page measures anything, and the provider does not use this service.
      </p>

      {views.length === 0 ? (
        <div className="card">
          <p className="muted" data-testid="no-engagements">
            Nothing to look at yet. Choose a provider for one of your requirements on <a href="/procure">What you need</a>, agree a plan on <a href="/deliver">Delivery</a>, and come back.
          </p>
        </div>
      ) : (
        <>
          {place === "top" ? null : (
          <section className="card tint ru-summary" aria-label="Where things stand" data-testid="summary">
            <div className="ru-tags">{summary.yourTurn ? <Tag tone="turn">Your turn</Tag> : <Tag tone="ok">Nothing to do now</Tag>}</div>
            <p>{summary.sentence}</p>
            {turn ? (
              <div className="actions">
                <a className="btn" href={turn.kind === "review" ? `#rv-${turn.engagementId}-${turn.no}` : `#bl-${turn.engagementId}`}>
                  {turn.kind === "review" ? `Go to review ${turn.no}` : "Go to the starting number"}
                  {views.length > 1 && turnIn ? ` of ${turnIn.title}` : ""}
                </a>
              </div>
            ) : null}
          </section>
          )}

          <ul className="items" data-testid="outcomes">
            {views.map(({ g, o }) => {
              const unit = o.expected ? UNIT_LABEL[o.expected.unit] : "";
              const latest = latestRecorded(o.reviews);
              const baselineDone = o.baseline !== null;
              const reviewsDone = recordedCount(o.reviews);
              const mainReview = firstOpenReview(o.reviews);
              return (
                <li key={g.id} className="card item ru-eng" data-testid={`outcome-${g.requirementId}`}>
                  <div className="ru-head">
                    <div className="ru-id">
                      <h2>{g.title}</h2>
                      <p className="ru-provider">
                        Provider: <strong>{g.providerName}</strong>
                      </p>
                      <p className="ru-cluster">
                        <Tag>{clusterLabel(g.cluster)}</Tag>
                      </p>
                    </div>
                    <Meter done={reviewsDone} of={o.reviews.length} label={`${reviewsDone} of ${o.reviews.length} reviews recorded`} />
                  </div>

                  <section className="ru-block">
                    <div className="ru-block-head">
                      <span className="ru-dot" aria-hidden>
                        1
                      </span>
                      <h3>What was expected</h3>
                    </div>
                    {o.expected ? (
                      <div className="ru-expected">
                        <p data-testid="expected">
                          <strong>What the assessment expected:</strong> {o.expected.measure}, {num(o.expected.low)} to {num(o.expected.high)} {unit}. {o.expected.synthetic ? <span className="tag">SYNTHETIC</span> : null}
                        </p>
                      </div>
                    ) : (
                      <p className="muted">The assessment this came from could not be read, so there is no expected range to show.</p>
                    )}
                  </section>

                  <section id={`bl-${g.id}`} className="ru-block" data-done={baselineDone ? "yes" : undefined}>
                    <div className="ru-block-head">
                      <span className="ru-dot" aria-hidden>
                        {baselineDone ? <Check /> : 2}
                      </span>
                      <h3>Before the work</h3>
                      {baselineDone ? <Tag tone="ok">Recorded</Tag> : o.canRecordBaseline ? <Tag tone="turn">Your turn</Tag> : o.baselineBlocked === "no_plan" ? <Tag>Not yet</Tag> : <Tag>Not recorded</Tag>}
                    </div>
                    {o.baseline ? (
                      <>
                        <p className="ru-baseline" data-testid="baseline">
                          Starting number: <strong>{num(o.baseline.value)}</strong> {unit}, recorded <span className="ru-nw">{o.baseline.at.slice(0, 10)}</span>.{o.baseline.note ? ` ${o.baseline.note}` : ""}
                        </p>
                        <Corrections item={o.baseline} unit={unit} testId="baseline-corrections" />
                        <CorrectForm companyId={companyId} engagementId={g.id} outcomeId={o.baseline.id} idPrefix={`correct-bl-${g.id}`} unit={unit} testId="form-correct-baseline" />
                      </>
                    ) : o.canRecordBaseline ? (
                      <form method="post" action={base(g.id)} className="ru-form" data-testid="form-baseline">
                        <input type="hidden" name="kind" value="baseline" />
                        <div className="question">
                          <label htmlFor={`baseline-value-${g.id}`} className="label">
                            The number today, before the work{unit ? ` (${unit})` : ""}
                          </label>
                          <p className="help" id={`baseline-help-${g.id}`}>
                            {o.expected ? `The same thing the assessment measured: ${o.expected.measure}. ` : ""}A whole number, typed by you.
                          </p>
                          <input id={`baseline-value-${g.id}`} name="value" type="text" inputMode="numeric" required maxLength={10} aria-describedby={`baseline-help-${g.id}`} />
                        </div>
                        <div className="question">
                          <label htmlFor={`baseline-note-${g.id}`} className="label">
                            How you worked it out (optional)
                          </label>
                          <input id={`baseline-note-${g.id}`} name="note" type="text" maxLength={MAX_NOTE_LENGTH} />
                        </div>
                        <div className="actions">
                          <button type="submit" className="primary">
                            Record the starting number
                          </button>
                        </div>
                        <p className="help">It is recorded once and cannot be changed. It has to be taken before the first milestone is accepted.</p>
                      </form>
                    ) : o.baselineBlocked === "no_plan" ? (
                      <p className="muted" data-testid="baseline-needs-plan">
                        Agree the plan on <a href="/deliver">Delivery</a> first. Then record the starting number here, before the first milestone is accepted.
                      </p>
                    ) : o.baselineBlocked === "closed" ? (
                      <p className="muted" data-testid="baseline-closed">
                        This engagement was closed before any milestone was accepted, so there is no starting number to record.
                      </p>
                    ) : (
                      <Notice tone="info" data-testid="no-baseline">
                        No starting number was recorded before the first milestone was accepted, and it cannot be added now. The reviews below are still worth recording; there is just nothing to compare them with.
                      </Notice>
                    )}
                  </section>

                  <section className="ru-block" data-done={reviewsDone === o.reviews.length ? "yes" : undefined}>
                    <div className="ru-block-head">
                      <span className="ru-dot" aria-hidden>
                        {reviewsDone === o.reviews.length ? <Check /> : 3}
                      </span>
                      <h3>After the work</h3>
                    </div>
                    {o.firstAcceptedAt === null ? (
                      <p className="muted" data-testid="waiting">
                        Nothing has been accepted yet. The reviews start counting from the day you accept your first milestone on <a href="/deliver">Delivery</a>.
                      </p>
                    ) : (
                      <p className="muted">You first accepted a milestone on {o.firstAcceptedAt.slice(0, 10)}.</p>
                    )}
                    <p className="help">Reviews are 30, 90 and 180 days after that day. Dates are shown in UTC.</p>

                    {latest?.record ? (
                      <div className="ru-figures">
                        <dl className="ru-stats">
                          {o.baseline ? (
                            <div className="ru-stat">
                              <dt>Starting number</dt>
                              <dd>
                                <b className="num">{num(o.baseline.value)}</b>
                                <span>{unit}</span>
                              </dd>
                            </div>
                          ) : null}
                          <div className="ru-stat">
                            <dt>Latest number</dt>
                            <dd>
                              <b className="num">{num(latest.record.value)}</b>
                              <span>{`${unit}, review ${latest.no}`}</span>
                            </dd>
                          </div>
                          {o.changeSinceBaseline !== null ? (
                            <div className="ru-stat">
                              <dt>Change since start</dt>
                              <dd>
                                <b className="num">{signed(o.changeSinceBaseline)}</b>
                                <span>{unit}</span>
                              </dd>
                            </div>
                          ) : null}
                        </dl>
                        {o.changeSinceBaseline !== null ? (
                          <p className="help" data-testid="change">
                            <strong>Change since the starting number:</strong> {signed(o.changeSinceBaseline)} {unit}, on your latest review. Whether that is better or worse depends on what is measured; this page does not say.
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    <ol className="ru-reviews" data-testid="reviews">
                      {o.reviews.map((r) => (
                        <li key={r.no} id={`rv-${g.id}-${r.no}`} className="ru-review" data-state={r.state} data-testid={`review-${r.no}`}>
                          <div className="ru-review-head">
                            <span className="ru-dot" aria-hidden>
                              {r.state === "recorded" ? <Check /> : null}
                            </span>
                            <div className="ru-review-id">
                              <h4>
                                Review {r.no}: {r.days} days after
                              </h4>
                              <Tag tone={REVIEW_TAG[r.state].tone}>{REVIEW_TAG[r.state].text}</Tag>
                            </div>
                          </div>
                          {r.state === "recorded" && r.record ? (
                            <>
                              <p className="ru-record" data-testid={`review-${r.no}-record`}>
                                <span className="ru-tags">
                                  <span className="tag">{VERDICT[r.record.verdict]}</span> <span className="tag">{USE[r.record.inUse]}</span>
                                </span>
                                Number: <strong>{num(r.record.value)}</strong> {unit}, recorded <span className="ru-nw">{r.record.at.slice(0, 10)}</span>.{r.record.note ? ` ${r.record.note}` : ""}
                              </p>
                              <Corrections item={r.record} unit={unit} testId={`review-${r.no}-corrections`} />
                              <CorrectForm companyId={companyId} engagementId={g.id} outcomeId={r.record.id} idPrefix={`correct-${g.id}-${r.no}`} unit={unit} testId={`form-correct-review-${r.no}`} />
                            </>
                          ) : r.state === "waiting" ? (
                            <p className="muted">Starts when you accept your first milestone.</p>
                          ) : r.state === "not_due" && r.dueAt ? (
                            <p className="muted" data-testid={`review-${r.no}-due`}>
                              Opens on {r.dueAt.slice(0, 10)}.
                            </p>
                          ) : (
                            <form method="post" action={base(g.id)} className="ru-form" data-testid={`form-review-${r.no}`}>
                              <input type="hidden" name="kind" value="review" />
                              <input type="hidden" name="review" value={String(r.no)} />
                              <div className="question">
                                <label htmlFor={`value-${g.id}-${r.no}`} className="label">
                                  The number now{unit ? ` (${unit})` : ""}
                                </label>
                                <p className="help" id={`value-help-${g.id}-${r.no}`}>
                                  Measure the same thing you measured before the work. A whole number, typed by you.
                                </p>
                                <input id={`value-${g.id}-${r.no}`} name="value" type="text" inputMode="numeric" required maxLength={10} aria-describedby={`value-help-${g.id}-${r.no}`} />
                              </div>
                              <div className="field-row two">
                                <div className="question">
                                  <label htmlFor={`verdict-${g.id}-${r.no}`} className="label">
                                    Did it do what the assessment expected?
                                  </label>
                                  <select id={`verdict-${g.id}-${r.no}`} name="verdict" required defaultValue="">
                                    <option value="" disabled>
                                      Choose
                                    </option>
                                    {VERDICTS.map((v) => (
                                      <option key={v} value={v}>
                                        {VERDICT[v]}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="question">
                                  <label htmlFor={`in-use-${g.id}-${r.no}`} className="label">
                                    Is it still in use?
                                  </label>
                                  <select id={`in-use-${g.id}-${r.no}`} name="in_use" required defaultValue="">
                                    <option value="" disabled>
                                      Choose
                                    </option>
                                    {IN_USE.map((v) => (
                                      <option key={v} value={v}>
                                        {USE[v]}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              <div className="question">
                                <label htmlFor={`note-${g.id}-${r.no}`} className="label">
                                  Anything to add (optional)
                                </label>
                                <input id={`note-${g.id}-${r.no}`} name="note" type="text" maxLength={MAX_NOTE_LENGTH} />
                              </div>
                              <div className="actions">
                                <button type="submit" className={r.no === mainReview ? "primary" : undefined}>
                                  Record review {r.no}
                                </button>
                              </div>
                              <p className="help">Each review is recorded once and cannot be changed.</p>
                            </form>
                          )}
                        </li>
                      ))}
                    </ol>
                  </section>

                  {o.next ? (
                    <div className="ru-next">
                      <Arrow />
                      <p data-testid="next">
                        <strong>Next in your plan:</strong> {o.next.title}. <a href="/procure">Make a requirement for it</a>.
                      </p>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <details className="card ru-about">
        <summary>About these numbers and dates</summary>
        <p>The expected range comes from the assessment, whose figures are placeholders written to test the service, not findings. You review 30, 90 and 180 days after you first accepted a milestone. Those day counts are assumptions, and dates are shown in UTC (a day can differ from the day on an Indian calendar).</p>
      </details>

      <nav className="actions" aria-label="More pages">
        <a className="btn" href="/deliver">
          Delivery
        </a>
        <a className="btn" href="/procure">
          What you need
        </a>
        <a className="btn quiet" href="/">
          Home
        </a>
      </nav>
    </Page>
  );
}
