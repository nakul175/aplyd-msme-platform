import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { listEngagements } from "../../modules/deliver/src/db/engagements.ts";
import { clusterLabel } from "../../modules/procure/src/clusters.ts";
import { presentOutcomes } from "../../modules/run/src/api/outcomes.ts";
import { IN_USE, MAX_NOTE_LENGTH, MAX_VALUE, UNIT_LABEL, VERDICTS } from "../../modules/run/src/state.ts";
import type { InUse, Verdict } from "../../modules/run/src/state.ts";
import type { AppEnv } from "../../modules/platform/src/env.ts";
import { resolveIdentityFromCookieHeader } from "../../modules/platform/src/identity/resolve.ts";

export const dynamic = "force-dynamic";

type Search = { saved?: string; problem?: string };

const PROBLEMS: Record<string, string> = {
  invalid: `That could not be saved. Give a whole number from 0 to ${MAX_VALUE.toLocaleString("en-IN")}, and for a review say whether it did what was expected and whether it is still in use.`,
  baseline_exists: "You have already recorded the starting number for this. It is recorded once.",
  baseline_too_late: "The starting number has to be taken before the first milestone is accepted. It cannot be recorded afterwards.",
  review_exists: "That review is already recorded. Each review is recorded once.",
  nothing_accepted: "A review needs an accepted milestone. Accept one on Delivery first.",
  not_due: "That review is not due yet. It opens on the date shown.",
  missing: "That engagement could not be found.",
};
const SAVED: Record<string, string> = {
  baseline: "The starting number is recorded.",
  review: "The review is recorded.",
};
const VERDICT: Record<Verdict, string> = { met: "Did what the assessment expected", partly: "Did part of it", not_met: "Did not do what was expected" };
const USE: Record<InUse, string> = { yes: "Yes, still in use", no: "No, no longer in use" };
const num = (n: number) => n.toLocaleString("en-IN");
const signed = (n: number) => (n > 0 ? `+${num(n)}` : n < 0 ? `−${num(-n)}` : "0");

export default async function Run({ searchParams }: { searchParams: Promise<Search> }) {
  const e = env as unknown as AppEnv;
  const q = await searchParams;
  const identity = await resolveIdentityFromCookieHeader((await headers()).get("cookie"), e);

  if (!identity) {
    return (
      <>
        <h1>Results</h1>
        <p>
          <a href="/sign-in">Sign in</a> to see what your engagements did.
        </p>
      </>
    );
  }
  if (!identity.companyId || identity.role !== "owner" || !e.DB) {
    return (
      <>
        <h1>Results</h1>
        <p className="muted">This page is for the owner of a company. Your account is not linked to one.</p>
        <p>
          <a href="/">Back</a>
        </p>
      </>
    );
  }

  const companyId = identity.companyId;
  const now = new Date();
  const engagements = await listEngagements(e.DB, companyId);
  const views = await Promise.all(engagements.map(async (g) => ({ g, o: await presentOutcomes(e.DB as D1Database, companyId, g, now) })));
  const base = (id: string) => `/api/companies/${companyId}/engagements/${id}/outcomes`;

  return (
    <>
      <h1>Results</h1>
      <p className="muted">
        <span className="tag">SYNTHETIC</span> What you expected, what you measured before the work, and what you measured after. Every number here is one you type: nothing on this page measures anything, and the provider does not use this service. The expected range comes from the assessment, whose figures are placeholders written to test the service, not findings. You review 30, 90 and 180 days after you first accepted a milestone. Those day counts are assumptions.
      </p>

      {q.saved && SAVED[q.saved] ? (
        <p role="status" className="notice" data-testid="saved">
          {SAVED[q.saved]}
        </p>
      ) : null}
      {q.problem && PROBLEMS[q.problem] ? (
        <p role="alert" className="notice" data-testid="problem">
          {PROBLEMS[q.problem]}
        </p>
      ) : null}

      {views.length === 0 ? (
        <p className="muted" data-testid="no-engagements">
          Nothing to look at yet. Choose a provider for one of your requirements on <a href="/procure">What you need</a>, agree a plan on <a href="/deliver">Delivery</a>, and come back.
        </p>
      ) : (
        <ul className="items" data-testid="outcomes">
          {views.map(({ g, o }) => {
            const unit = o.expected ? UNIT_LABEL[o.expected.unit] : "";
            return (
              <li key={g.id} className="card item" data-testid={`outcome-${g.requirementId}`}>
                <h2>{g.title}</h2>
                <p>
                  <span className="tag">{clusterLabel(g.cluster)}</span> Provider: <strong>{g.providerName}</strong>
                </p>
                {o.expected ? (
                  <p data-testid="expected">
                    <strong>What the assessment expected:</strong> {o.expected.measure}, {num(o.expected.low)} to {num(o.expected.high)} {unit}.
                  </p>
                ) : (
                  <p className="muted">The assessment this came from could not be read, so there is no expected range to show.</p>
                )}

                <h3>Before the work</h3>
                {o.baseline ? (
                  <p data-testid="baseline">
                    Starting number: <strong>{num(o.baseline.value)}</strong> {unit}, recorded {o.baseline.at.slice(0, 10)}.{o.baseline.note ? ` ${o.baseline.note}` : ""}
                  </p>
                ) : o.canRecordBaseline ? (
                  <form method="post" action={base(g.id)} data-testid="form-baseline">
                    <input type="hidden" name="kind" value="baseline" />
                    <p>
                      <label htmlFor={`baseline-value-${g.id}`} className="label">
                        The number today, before the work{unit ? ` (${unit})` : ""}
                      </label>
                      <input id={`baseline-value-${g.id}`} name="value" type="text" inputMode="numeric" required maxLength={10} />
                    </p>
                    <p>
                      <label htmlFor={`baseline-note-${g.id}`} className="label">
                        How you worked it out (optional)
                      </label>
                      <input id={`baseline-note-${g.id}`} name="note" type="text" maxLength={MAX_NOTE_LENGTH} />
                    </p>
                    <p className="muted">It is recorded once and cannot be changed. It has to be taken before the first milestone is accepted.</p>
                    <button type="submit">Record the starting number</button>
                  </form>
                ) : (
                  <p className="muted" data-testid="no-baseline">
                    No starting number was recorded before the first milestone was accepted, and it cannot be added now. The reviews below are still worth recording; there is just nothing to compare them with.
                  </p>
                )}

                <h3>After the work</h3>
                {o.firstAcceptedAt === null ? (
                  <p className="muted" data-testid="waiting">
                    Nothing has been accepted yet. The reviews start counting from the day you accept your first milestone on <a href="/deliver">Delivery</a>.
                  </p>
                ) : (
                  <p className="muted">You first accepted a milestone on {o.firstAcceptedAt.slice(0, 10)}.</p>
                )}
                <ol className="items" data-testid="reviews">
                  {o.reviews.map((r) => (
                    <li key={r.no} className="card item" data-testid={`review-${r.no}`}>
                      <h4>
                        Review {r.no}: {r.days} days after
                      </h4>
                      {r.state === "recorded" && r.record ? (
                        <p data-testid={`review-${r.no}-record`}>
                          <span className="tag">{VERDICT[r.record.verdict]}</span> <span className="tag">{USE[r.record.inUse]}</span> Number: <strong>{num(r.record.value)}</strong> {unit}, recorded {r.record.at.slice(0, 10)}.{r.record.note ? ` ${r.record.note}` : ""}
                        </p>
                      ) : r.state === "waiting" ? (
                        <p className="muted">Starts when you accept your first milestone.</p>
                      ) : r.state === "not_due" && r.dueAt ? (
                        <p className="muted" data-testid={`review-${r.no}-due`}>
                          Opens on {r.dueAt.slice(0, 10)}.
                        </p>
                      ) : (
                        <form method="post" action={base(g.id)} data-testid={`form-review-${r.no}`}>
                          <input type="hidden" name="kind" value="review" />
                          <input type="hidden" name="review" value={String(r.no)} />
                          <p>
                            <label htmlFor={`value-${g.id}-${r.no}`} className="label">
                              The number now{unit ? ` (${unit})` : ""}
                            </label>
                            <input id={`value-${g.id}-${r.no}`} name="value" type="text" inputMode="numeric" required maxLength={10} />
                          </p>
                          <p>
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
                          </p>
                          <p>
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
                          </p>
                          <p>
                            <label htmlFor={`note-${g.id}-${r.no}`} className="label">
                              Anything to add (optional)
                            </label>
                            <input id={`note-${g.id}-${r.no}`} name="note" type="text" maxLength={MAX_NOTE_LENGTH} />
                          </p>
                          <p className="muted">Each review is recorded once and cannot be changed.</p>
                          <button type="submit">Record review {r.no}</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ol>

                {o.changeSinceBaseline !== null ? (
                  <p data-testid="change">
                    <strong>Change since the starting number:</strong> {signed(o.changeSinceBaseline)} {unit}, on your latest review. Whether that is better or worse depends on what is measured; this page does not say.
                  </p>
                ) : null}

                {o.next ? (
                  <p data-testid="next">
                    <strong>Next in your plan:</strong> {o.next.title}. <a href="/procure">Make a requirement for it</a>.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <p>
        <a href="/deliver">Delivery</a> · <a href="/procure">What you need</a> · <a href="/">Home</a>
      </p>
    </>
  );
}
