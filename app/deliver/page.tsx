import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { presentEngagements } from "../../modules/deliver/src/api/engagements.ts";
import { MAX_AMOUNT_INR, MAX_DELIVERIES, MAX_MILESTONES, MAX_NOTE_LENGTH, MAX_TEST_LENGTH, MAX_TITLE_LENGTH } from "../../modules/deliver/src/state.ts";
import type { EngagementStatus, EventKind, MilestoneState } from "../../modules/deliver/src/state.ts";
import { acceptedCount, acceptedLabel, deliverySummary, firstWaitingDecision, primaryAction } from "../../modules/deliver/src/summary.ts";
import { clusterLabel } from "../../modules/procure/src/clusters.ts";
import type { AppEnv } from "../../modules/platform/src/env.ts";
import { resolveIdentityFromCookieHeader } from "../../modules/platform/src/identity/resolve.ts";
import { Check, Lock } from "../_ui/icons.tsx";
import { Meter, NotOwner, Notice, Page, SignedOut, Tag } from "../_ui/parts.tsx";
import "./deliver.css";

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
const STATUS_TONE: Record<EngagementStatus, "ok" | "turn" | "brand" | undefined> = { planning: "turn", in_progress: "brand", complete: "ok", ended_early: undefined };
const STATE: Record<MilestoneState, string> = { planned: "Not started", delivered: "Delivered, waiting for you", accepted: "Accepted", rejected: "Rejected", paid: "Paid" };
const STATE_TONE: Record<MilestoneState, "ok" | "turn" | "brand" | "danger" | undefined> = { planned: undefined, delivered: "turn", accepted: "brand", rejected: "danger", paid: "ok" };
const EVENT: Record<EventKind, string> = { plan_agreed: "Plan agreed", delivered: "Delivered", accepted: "Accepted", rejected: "Rejected", payment_recorded: "Payment recorded", closed: "Closed" };
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export default async function Deliver({ searchParams }: { searchParams: Promise<Search> }) {
  const e = env as unknown as AppEnv;
  const q = await searchParams;
  const identity = await resolveIdentityFromCookieHeader((await headers()).get("cookie"), e);

  if (!identity) return <SignedOut title="Delivery" reason="to see your engagements." />;
  if (!identity.companyId || identity.role !== "owner" || !e.DB) return <NotOwner title="Delivery" />;

  const companyId = identity.companyId;
  const engagements = await presentEngagements(e.DB, companyId);
  const base = (id: string) => `/api/companies/${companyId}/engagements/${id}`;
  const summary = deliverySummary(engagements.map((g) => ({ status: g.status, states: g.milestones.map((m) => m.state) })));
  const waiting = firstWaitingDecision(engagements);
  const waitingIn = waiting ? engagements.find((g) => g.id === waiting.engagementId) : undefined;

  return (
    <Page stage="deliver" identity={identity} title="Delivery" lede="Write the plan, record each delivery, accept or reject it against your test, and note what you paid.">
      {q.made ? (
        <Notice role="status" tone="success" data-testid="made">
          You chose a provider. Write the plan below.
        </Notice>
      ) : null}
      {q.saved && Object.hasOwn(SAVED, q.saved) ? (
        <Notice role="status" tone="success" data-testid="saved">
          {SAVED[q.saved]}
        </Notice>
      ) : null}
      {q.problem && Object.hasOwn(PROBLEMS, q.problem) ? (
        <Notice role="alert" tone="danger" data-testid="problem">
          {PROBLEMS[q.problem]}
        </Notice>
      ) : null}

      {engagements.length === 0 ? (
        <div className="card">
          <p className="muted" data-testid="no-engagements">
            No engagement yet. Choose a provider for one of your requirements on <a href="/procure">What you need</a>.
          </p>
        </div>
      ) : (
        <>
          <section className="card tint dl-summary" aria-label="Where things stand" data-testid="summary">
            <div className="dl-tags">
              {summary.yourTurn ? <Tag tone="turn">Your turn</Tag> : summary.withProvider > 0 ? <Tag>Waiting for the provider</Tag> : summary.open > 0 ? <Tag tone="ok">Nothing to do now</Tag> : <Tag>All closed</Tag>}
            </div>
            <p>{summary.sentence}</p>
            {waiting ? (
              <div className="actions">
                <a className="btn" href={`#ms-${waiting.milestoneId}`}>
                  Go to milestone {waiting.seq}
                  {engagements.length > 1 && waitingIn ? ` of ${waitingIn.title}` : ""}
                </a>
              </div>
            ) : null}
          </section>

          <ul className="items" data-testid="engagements">
            {engagements.map((g) => {
              const open = g.closedAt === null;
              const states = g.milestones.map((m) => m.state);
              const main = open ? primaryAction(g.milestones) : null;
              return (
                <li key={g.id} className="card item dl-eng" data-testid={`engagement-${g.requirementId}`}>
                  <div className="dl-head">
                    <div className="dl-id">
                      <div className="dl-title">
                        <h2>{g.title}</h2>
                        <Tag tone={STATUS_TONE[g.status]}>{STATUS[g.status]}</Tag>
                        <Tag>{clusterLabel(g.cluster)}</Tag>
                      </div>
                      <p className="dl-provider">
                        Provider: <strong>{g.providerName}</strong>
                        {g.providerSummary ? <span className="muted"> — {g.providerSummary}</span> : null}
                      </p>
                    </div>
                    <div className="dl-progress">
                      <Meter done={acceptedCount(states)} of={g.milestones.length} label={acceptedLabel(states)} />
                      {g.planAgreedAt ? <p className="muted">You agreed the plan on {g.planAgreedAt.slice(0, 10)}.</p> : null}
                      {g.closedAt ? <p className="muted">Closed on {g.closedAt.slice(0, 10)}.</p> : null}
                    </div>
                  </div>

                  <section className="dl-plan">
                    <h3>Milestones</h3>
                    {g.planAgreedAt !== null ? (
                      <p className="dl-locked">
                        <Lock />
                        The plan is agreed. No milestone can be added or changed now.
                      </p>
                    ) : open && g.milestones.length > 0 ? (
                      <p className="muted">You are writing the plan. Add each part of the work as a milestone, then agree the plan.</p>
                    ) : null}

                    {g.milestones.length === 0 ? (
                      <p className="muted">None yet. A plan is a list of parts, each with a date, a price and the test you will check it by.</p>
                    ) : (
                      <ol className="dl-steps" data-testid="milestones">
                        {g.milestones.map((m) => (
                          <li key={m.id} id={`ms-${m.id}`} className="dl-ms" data-state={m.state} data-testid={`milestone-${m.seq}`}>
                            <div className="dl-ms-head">
                              <span className="dl-dot" aria-hidden>
                                {m.state === "accepted" || m.state === "paid" ? <Check /> : null}
                              </span>
                              <div className="dl-ms-id">
                                <h4>
                                  {m.seq}. {m.title}
                                </h4>
                                <Tag tone={STATE_TONE[m.state]}>{STATE[m.state]}</Tag>
                              </div>
                            </div>
                            <p className="dl-meta">
                              <span>Due {m.dueOn}</span>
                              <span className="num">{`Price ${rupees(m.agreedInr)}`}</span>
                            </p>
                            <p className="dl-check">
                              <strong>How you will check it:</strong> {m.acceptanceTest}
                            </p>
                            {m.paidInr !== null ? (
                              <p className="dl-paid">
                                <Check />
                                {`Payment noted: you recorded a payment of ${rupees(m.paidInr)}, made outside this service.`}
                              </p>
                            ) : null}
                            {m.history.length > 0 ? (
                              <ul className="dl-history" data-testid="history" aria-label="Recorded on this milestone">
                                {m.history.map((h, i) => (
                                  <li key={i}>
                                    <span className="num dl-when">{h.at.slice(0, 10)}</span> {EVENT[h.kind]}
                                    {h.note ? `: ${h.note}` : ""}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                            {m.next.includes("accepted") ? (
                              <form method="post" action={`${base(g.id)}/events`} className="dl-act" data-testid={`form-decision-${m.seq}`}>
                                <input type="hidden" name="milestone" value={m.id} />
                                <p className="dl-act-title">Check it against the test above, then decide.</p>
                                <div className="question">
                                  <label htmlFor={`note-decision-${m.id}`} className="label">
                                    Your note, against your test (optional)
                                  </label>
                                  <input id={`note-decision-${m.id}`} name="note" type="text" maxLength={MAX_NOTE_LENGTH} />
                                </div>
                                <div className="actions">
                                  <button type="submit" name="kind" value="accepted" className={main?.seq === m.seq && main.kind === "accepted" ? "primary" : undefined}>
                                    Accept milestone {m.seq}
                                  </button>
                                  <button type="submit" name="kind" value="rejected">
                                    Reject milestone {m.seq}
                                  </button>
                                </div>
                                <p className="help">Accept it if it passes the test you wrote. Reject it if it does not: it can then be delivered again. Your answer is recorded and stays on record.</p>
                              </form>
                            ) : null}
                            {m.next
                              .filter((kind) => kind === "delivered" || kind === "payment_recorded")
                              .map((kind) => (
                                <form key={kind} method="post" action={`${base(g.id)}/events`} className="dl-act" data-testid={`form-${kind}-${m.seq}`}>
                                  <input type="hidden" name="kind" value={kind} />
                                  <input type="hidden" name="milestone" value={m.id} />
                                  <p className="dl-act-title">{kind === "delivered" ? "When the provider says this part is done" : "Note down what you paid"}</p>
                                  {kind === "payment_recorded" ? (
                                    <div className="question">
                                      <label htmlFor={`amount-${m.id}`} className="label">
                                        Amount you paid, in rupees
                                      </label>
                                      <p className="help" id={`amount-help-${m.id}`}>
                                        It starts as the agreed price. Change it to what you actually paid. Whole rupees, digits only.
                                      </p>
                                      <input id={`amount-${m.id}`} name="amount" type="text" inputMode="numeric" required defaultValue={String(m.agreedInr)} maxLength={9} aria-describedby={`amount-help-${m.id}`} />
                                    </div>
                                  ) : null}
                                  <div className="question">
                                    <label htmlFor={`note-${kind}-${m.id}`} className="label">
                                      {kind === "delivered" ? "What the provider told you (optional)" : "How you paid (optional)"}
                                    </label>
                                    <input id={`note-${kind}-${m.id}`} name="note" type="text" maxLength={MAX_NOTE_LENGTH} />
                                  </div>
                                  <div className="actions">
                                    <button type="submit" className={main?.seq === m.seq && main.kind === kind ? "primary" : undefined}>
                                      {kind === "delivered" ? `Record that milestone ${m.seq} was delivered` : `Record a payment for milestone ${m.seq}`}
                                    </button>
                                  </div>
                                  <p className="help">
                                    {kind === "delivered"
                                      ? "The provider does not use this service, so you record what they told you. The milestone then waits for your decision."
                                      : "A payment is one you made yourself, outside this service, and are noting down. No money is sent from here."}
                                  </p>
                                </form>
                              ))}
                            {open && g.planAgreedAt !== null && m.state === "rejected" && m.next.length === 0 ? (
                              <Notice tone="warn" data-testid={`delivery-cap-${m.seq}`}>
                                This milestone was rejected after being delivered {m.deliveries} times, as many as can be recorded, so it cannot be delivered again. Close the engagement to end it; everything stays on record.
                              </Notice>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    )}
                    <p className="dl-total num" data-testid="totals">
                      <span>{`Plan total ${rupees(g.agreedTotalInr)}.`}</span> <span>{`Payments you have recorded: ${rupees(g.paidTotalInr)}.`}</span>
                    </p>
                  </section>

                  {g.planAgreedAt === null && open ? (
                    <div className="dl-steps-plan">
                      {g.milestones.length < MAX_MILESTONES ? (
                        <form method="post" action={`${base(g.id)}/milestones`} className="dl-step" data-testid="add-milestone">
                          <span className="dl-step-n" aria-hidden>
                            1
                          </span>
                          <div className="dl-step-body">
                            <h3>Add a milestone</h3>
                            <div className="question">
                              <label htmlFor={`title-${g.id}`} className="label">
                                What is delivered
                              </label>
                              <p className="help">What the provider hands over for this part of the work.</p>
                              <input id={`title-${g.id}`} name="title" type="text" required maxLength={MAX_TITLE_LENGTH} />
                            </div>
                            <div className="question">
                              <label htmlFor={`test-${g.id}`} className="label">
                                How you will check it
                              </label>
                              <p className="help">Write the test now, before any work starts. You accept or reject the work against it.</p>
                              <input id={`test-${g.id}`} name="test" type="text" required maxLength={MAX_TEST_LENGTH} />
                            </div>
                            <div className="field-row two">
                              <div className="question">
                                <label htmlFor={`due-${g.id}`} className="label">
                                  Due date (YYYY-MM-DD)
                                </label>
                                <p className="help">A real date, written like 2026-12-15.</p>
                                <input id={`due-${g.id}`} name="due" type="text" required placeholder="2026-12-15" maxLength={10} />
                              </div>
                              <div className="question">
                                <label htmlFor={`price-${g.id}`} className="label">
                                  Price for this milestone, in rupees
                                </label>
                                <p className="help">{`Whole rupees, digits only, up to ${rupees(MAX_AMOUNT_INR)}.`}</p>
                                <input id={`price-${g.id}`} name="amount" type="text" inputMode="numeric" required maxLength={9} />
                              </div>
                            </div>
                            <div className="actions">
                              <button type="submit" className={g.milestones.length === 0 ? "primary" : undefined}>
                                Add this milestone
                              </button>
                            </div>
                            <p className="help">It joins the plan above. You can add more before you agree the plan.</p>
                          </div>
                        </form>
                      ) : (
                        <p className="muted">The plan holds the most milestones it can ({MAX_MILESTONES}).</p>
                      )}
                      {g.milestones.length > 0 ? (
                        <form method="post" action={`${base(g.id)}/events`} className="dl-step" data-testid="agree-plan">
                          <input type="hidden" name="kind" value="plan_agreed" />
                          <span className="dl-step-n" aria-hidden>
                            2
                          </span>
                          <div className="dl-step-body">
                            <h3>Agree the plan</h3>
                            <p className="help">Agreeing the plan locks it: no milestone can be added or changed after. Nothing can be delivered, accepted or paid before then.</p>
                            <div className="actions">
                              <button type="submit" className="primary">
                                Agree this plan
                              </button>
                            </div>
                          </div>
                        </form>
                      ) : null}
                    </div>
                  ) : null}

                  {open ? (
                    <form method="post" action={`${base(g.id)}/events`} className="dl-close" data-testid="close">
                      <input type="hidden" name="kind" value="closed" />
                      <h3>Done with this engagement?</h3>
                      <div className="dl-close-row">
                        <div className="question">
                          <label htmlFor={`close-note-${g.id}`} className="label">
                            Why you are closing it (optional)
                          </label>
                          <input id={`close-note-${g.id}`} name="note" type="text" maxLength={MAX_NOTE_LENGTH} />
                        </div>
                        <button type="submit">Close this engagement</button>
                      </div>
                      <p className="help">Closing ends the engagement: nothing more can be recorded on it. Everything stays on record.</p>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <section className="card flat dl-about" aria-label="About this page">
        <h2>About this page</h2>
        <p>
          <Tag>SYNTHETIC</Tag> The providers and plans here are placeholders written to test the service.
        </p>
        <p>This page is your own record of a piece of work: the plan you agree with a provider, whether each part arrived and passed your test, and what you paid. It does not contact the provider, hold money or move any.</p>
        <p>The provider does not use this service and has not seen any of it. A payment is one you made yourself, outside this service, and are noting down.</p>
      </section>

      <nav className="actions" aria-label="More pages">
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
