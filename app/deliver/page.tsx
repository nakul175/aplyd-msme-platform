import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { presentEngagements } from "../../modules/deliver/src/api/engagements.ts";
import { MAX_AMOUNT_INR, MAX_DELIVERIES, MAX_MILESTONES, MAX_NOTE_LENGTH, MAX_TEST_LENGTH, MAX_TITLE_LENGTH } from "../../modules/deliver/src/state.ts";
import type { EngagementStatus, EventKind, MilestoneState } from "../../modules/deliver/src/state.ts";
import { clusterLabel } from "../../modules/procure/src/clusters.ts";
import type { AppEnv } from "../../modules/platform/src/env.ts";
import { resolveIdentityFromCookieHeader } from "../../modules/platform/src/identity/resolve.ts";

export const dynamic = "force-dynamic";

type Search = { made?: string; saved?: string; problem?: string };

const PROBLEMS: Record<string, string> = {
  invalid: "That could not be saved. Check each box: a name, how you will check it, a date written YYYY-MM-DD, and a whole number of rupees.",
  plan_locked: "The plan is agreed, so no milestone can be added to it.",
  too_many: `A plan holds at most ${MAX_MILESTONES} milestones.`,
  closed: "This engagement is closed, so nothing more can be recorded on it.",
  already_agreed: "You have already agreed this plan.",
  no_milestones: "Add at least one milestone before you agree the plan.",
  not_agreed: "Agree the plan first. Nothing is delivered, accepted or paid before then.",
  wrong_state: "That cannot be recorded for this milestone in its present state. Reload the page to see what can.",
  too_many_deliveries: `This milestone has been delivered ${MAX_DELIVERIES} times, as many as can be recorded. If the last one is still waiting for your decision, decide on it. Once it is rejected, the only step left is to close the engagement.`,
  missing: "That engagement or milestone could not be found.",
};
const SAVED: Record<string, string> = {
  milestone: "The milestone was added to the plan.",
  plan_agreed: "You agreed the plan. Nothing can be added to it now.",
  delivered: "Recorded: delivered, as the provider told you.",
  accepted: "Recorded: you accepted it against the test you wrote.",
  rejected: "Recorded: you rejected it. It can be delivered again.",
  payment_recorded: "Recorded: the payment you made outside this service.",
  closed: "The engagement is closed. Everything stays on record.",
};
const STATUS: Record<EngagementStatus, string> = { planning: "Planning", in_progress: "In progress", complete: "Complete", ended_early: "Ended early" };
const STATE: Record<MilestoneState, string> = { planned: "Not started", delivered: "Delivered, waiting for you", accepted: "Accepted", rejected: "Rejected", paid: "Paid" };
const EVENT: Record<EventKind, string> = { plan_agreed: "Plan agreed", delivered: "Delivered", accepted: "Accepted", rejected: "Rejected", payment_recorded: "Payment recorded", closed: "Closed" };
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export default async function Deliver({ searchParams }: { searchParams: Promise<Search> }) {
  const e = env as unknown as AppEnv;
  const q = await searchParams;
  const identity = await resolveIdentityFromCookieHeader((await headers()).get("cookie"), e);

  if (!identity) {
    return (
      <>
        <h1>Delivery</h1>
        <p>
          <a href="/sign-in">Sign in</a> to see your engagements.
        </p>
      </>
    );
  }
  if (!identity.companyId || identity.role !== "owner" || !e.DB) {
    return (
      <>
        <h1>Delivery</h1>
        <p className="muted">This page is for the owner of a company. Your account is not linked to one.</p>
        <p>
          <a href="/">Back</a>
        </p>
      </>
    );
  }

  const companyId = identity.companyId;
  const engagements = await presentEngagements(e.DB, companyId);
  const base = (id: string) => `/api/companies/${companyId}/engagements/${id}`;

  return (
    <>
      <h1>Delivery</h1>
      <p className="muted">
        <span className="tag">SYNTHETIC</span> The providers and plans here are placeholders written to test the service. This page is your own record of a piece of work: the plan you agree with a provider, whether each part arrived and passed your test, and what you paid. It does not contact the provider, hold money or move any. The provider does not use this service and has not seen any of it. A payment is one you made yourself, outside this service, and are noting down.
      </p>

      {q.made ? (
        <p role="status" className="notice" data-testid="made">
          You chose a provider. Write the plan below.
        </p>
      ) : null}
      {q.saved && Object.hasOwn(SAVED, q.saved) ? (
        <p role="status" className="notice" data-testid="saved">
          {SAVED[q.saved]}
        </p>
      ) : null}
      {q.problem && Object.hasOwn(PROBLEMS, q.problem) ? (
        <p role="alert" className="notice" data-testid="problem">
          {PROBLEMS[q.problem]}
        </p>
      ) : null}

      {engagements.length === 0 ? (
        <p className="muted" data-testid="no-engagements">
          No engagement yet. Choose a provider for one of your requirements on <a href="/procure">What you need</a>.
        </p>
      ) : (
        <ul className="items" data-testid="engagements">
          {engagements.map((g) => {
            const open = g.closedAt === null;
            return (
              <li key={g.id} className="card item" data-testid={`engagement-${g.requirementId}`}>
                <h2>{g.title}</h2>
                <p>
                  <span className="tag">{STATUS[g.status]}</span> <span className="tag">{clusterLabel(g.cluster)}</span>
                </p>
                <p>
                  Provider: <strong>{g.providerName}</strong>
                  {g.providerSummary ? <span className="muted"> — {g.providerSummary}</span> : null}
                </p>
                <p className="muted" data-testid="totals">
                  Plan total {rupees(g.agreedTotalInr)}. Payments you have recorded: {rupees(g.paidTotalInr)}.
                </p>
                {g.planAgreedAt ? <p className="muted">You agreed the plan on {g.planAgreedAt.slice(0, 10)}.</p> : null}
                {g.closedAt ? <p className="muted">Closed on {g.closedAt.slice(0, 10)}.</p> : null}

                <h3>Milestones</h3>
                {g.milestones.length === 0 ? (
                  <p className="muted">None yet. A plan is a list of parts, each with a date, a price and the test you will check it by.</p>
                ) : (
                  <ol className="items" data-testid="milestones">
                    {g.milestones.map((m) => (
                      <li key={m.id} className="card item" data-testid={`milestone-${m.seq}`}>
                        <h4>
                          {m.seq}. {m.title}
                        </h4>
                        <p>
                          <span className="tag">{STATE[m.state]}</span> Due {m.dueOn}. Price {rupees(m.agreedInr)}
                          {m.paidInr !== null ? `; you recorded a payment of ${rupees(m.paidInr)}` : ""}.
                        </p>
                        <p>
                          <strong>How you will check it:</strong> {m.acceptanceTest}
                        </p>
                        {m.history.length > 0 ? (
                          <ul className="muted" data-testid="history">
                            {m.history.map((h, i) => (
                              <li key={i}>
                                {h.at.slice(0, 10)} {EVENT[h.kind]}
                                {h.note ? `: ${h.note}` : ""}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {m.next.includes("accepted") ? (
                          <form method="post" action={`${base(g.id)}/events`} data-testid={`form-decision-${m.seq}`}>
                            <input type="hidden" name="milestone" value={m.id} />
                            <p>
                              <label htmlFor={`note-decision-${m.id}`} className="label">
                                Your note, against your test (optional)
                              </label>
                              <input id={`note-decision-${m.id}`} name="note" type="text" maxLength={MAX_NOTE_LENGTH} />
                            </p>
                            <button type="submit" name="kind" value="accepted">
                              Accept milestone {m.seq}
                            </button>{" "}
                            <button type="submit" name="kind" value="rejected">
                              Reject milestone {m.seq}
                            </button>
                          </form>
                        ) : null}
                        {m.next
                          .filter((kind) => kind === "delivered" || kind === "payment_recorded")
                          .map((kind) => (
                            <form key={kind} method="post" action={`${base(g.id)}/events`} data-testid={`form-${kind}-${m.seq}`}>
                              <input type="hidden" name="kind" value={kind} />
                              <input type="hidden" name="milestone" value={m.id} />
                              {kind === "payment_recorded" ? (
                                <p>
                                  <label htmlFor={`amount-${m.id}`} className="label">
                                    Amount you paid, in rupees
                                  </label>
                                  <input id={`amount-${m.id}`} name="amount" type="text" inputMode="numeric" required defaultValue={String(m.agreedInr)} maxLength={9} />
                                </p>
                              ) : null}
                              <p>
                                <label htmlFor={`note-${kind}-${m.id}`} className="label">
                                  {kind === "delivered" ? "What the provider told you (optional)" : "How you paid (optional)"}
                                </label>
                                <input id={`note-${kind}-${m.id}`} name="note" type="text" maxLength={MAX_NOTE_LENGTH} />
                              </p>
                              <button type="submit">{kind === "delivered" ? `Record that milestone ${m.seq} was delivered` : `Record a payment for milestone ${m.seq}`}</button>
                            </form>
                          ))}
                        {open && g.planAgreedAt !== null && m.state === "rejected" && m.next.length === 0 ? (
                          <p className="notice" data-testid={`delivery-cap-${m.seq}`}>
                            This milestone was rejected after being delivered {m.deliveries} times, as many as can be recorded, so it cannot be delivered again. Close the engagement to end it; everything stays on record.
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                )}

                {g.planAgreedAt === null && open ? (
                  <>
                    {g.milestones.length < MAX_MILESTONES ? (
                      <form method="post" action={`${base(g.id)}/milestones`} data-testid="add-milestone">
                        <h3>Add a milestone</h3>
                        <p>
                          <label htmlFor={`title-${g.id}`} className="label">
                            What is delivered
                          </label>
                          <input id={`title-${g.id}`} name="title" type="text" required maxLength={MAX_TITLE_LENGTH} />
                        </p>
                        <p>
                          <label htmlFor={`test-${g.id}`} className="label">
                            How you will check it
                          </label>
                          <input id={`test-${g.id}`} name="test" type="text" required maxLength={MAX_TEST_LENGTH} />
                        </p>
                        <p>
                          <label htmlFor={`due-${g.id}`} className="label">
                            Due date (YYYY-MM-DD)
                          </label>
                          <input id={`due-${g.id}`} name="due" type="text" required placeholder="2026-12-15" maxLength={10} />
                        </p>
                        <p>
                          <label htmlFor={`price-${g.id}`} className="label">
                            Price for this milestone, in rupees (up to {rupees(MAX_AMOUNT_INR)})
                          </label>
                          <input id={`price-${g.id}`} name="amount" type="text" inputMode="numeric" required maxLength={9} />
                        </p>
                        <button type="submit">Add this milestone</button>
                      </form>
                    ) : (
                      <p className="muted">The plan holds the most milestones it can ({MAX_MILESTONES}).</p>
                    )}
                    {g.milestones.length > 0 ? (
                      <form method="post" action={`${base(g.id)}/events`} data-testid="agree-plan">
                        <input type="hidden" name="kind" value="plan_agreed" />
                        <p className="muted">Agreeing the plan locks it: no milestone can be added or changed after. Nothing can be delivered, accepted or paid before then.</p>
                        <button type="submit">Agree this plan</button>
                      </form>
                    ) : null}
                  </>
                ) : null}

                {open ? (
                  <form method="post" action={`${base(g.id)}/events`} data-testid="close">
                    <input type="hidden" name="kind" value="closed" />
                    <p>
                      <label htmlFor={`close-note-${g.id}`} className="label">
                        Why you are closing it (optional)
                      </label>
                      <input id={`close-note-${g.id}`} name="note" type="text" maxLength={MAX_NOTE_LENGTH} />
                    </p>
                    <button type="submit">Close this engagement</button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <p>
        <a href="/procure">What you need</a> · <a href="/">Home</a>
      </p>
    </>
  );
}
