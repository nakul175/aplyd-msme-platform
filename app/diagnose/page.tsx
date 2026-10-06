import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { Fragment } from "react";
import { presentAssessment, DECISIONS, MAX_NOTE_LENGTH, notOwnerMessage } from "../../modules/diagnose/src/api/diagnose.ts";
import { listAssessments, loadAssessment, loadLatestAssessmentId } from "../../modules/diagnose/src/db/assessments.ts";
import { compareAssessments } from "../../modules/diagnose/src/compare.ts";
import type { Comparison } from "../../modules/diagnose/src/compare.ts";
import type { Item } from "../../modules/diagnose/src/engine.ts";
import { MAX_ITEMS, POINTS } from "../../modules/diagnose/src/engine.ts";
import { READINESS_WORDS, gapView } from "../../modules/diagnose/src/gaps.ts";
import type { Blocker, GapView } from "../../modules/diagnose/src/gaps.ts";
import { afterSignOff, decisionWord, firstUndecided, hasAssessmentFrom, relationToConfirmed, scoreLine, signOffState, signOffWords } from "../../modules/diagnose/src/progress.ts";
import { loadLatest, loadRevision } from "../../modules/factory/src/db/revisions.ts";
import { loadFacts } from "../../modules/journey/src/facts.ts";
import { nextStep } from "../../modules/journey/src/progress.ts";
import type { AppEnv } from "../../modules/platform/src/env.ts";
import { resolveIdentityFromCookieHeader } from "../../modules/platform/src/identity/resolve.ts";
import { Arrow, Check } from "../_ui/icons.tsx";
import { formatDate } from "../_ui/dates.ts";
import { Meter, Notice, Page, PageHead, SignedOut, Tag } from "../_ui/parts.tsx";
import "./diagnose.css";

export const metadata = { title: "Decide" };
export const dynamic = "force-dynamic";

type Param = string | string[] | undefined;
type Search = { a?: Param; saved?: Param; signed?: Param; problem?: Param; needs?: Param };
/** A repeated query parameter arrives as a list; only the first value is read, so a list never reaches the database (finding S3-03). */
const first = (v: Param): string | undefined => (typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : undefined);

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const range = (r: { low: number; high: number }) => (r.low === r.high ? rupees(r.low) : `${rupees(r.low)} to ${rupees(r.high)}`);
const UNIT: Record<string, string> = { percent: "percent", days: "days", rupees_per_year: "rupees a year" };
const READINESS = READINESS_WORDS;
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
        <span className="muted help dg-benefit-means" data-testid="benefit-means">
          {" "}
          This is the change in &ldquo;{benefit.measure.toLowerCase()}&rdquo; that the library assumes the idea could make; the library does not say whether the number goes up or down, so read it as an assumption, not a promise.
        </span>
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

const KIND_TAG: Record<Blocker["kind"], string> = { first: "Do first", check: "Check", answer: "Answer needed", money: "Cost" };

/** One line of "what stands in the way": the idea, what kind of thing it is, and the line in plain words. */
function BlockerLine({ b }: { b: Blocker }) {
  return (
    <li>
      <strong>{b.title}.</strong> <Tag>{KIND_TAG[b.kind]}</Tag> {b.words}
    </li>
  );
}

/**
 * Where the factory stands in five parts, and what stands between each part and the ideas. It reads the stored assessment, the answers it
 * was made from and the library, and is readable without the list of ideas. Which part a question belongs to is this page's choice, and says so.
 */
function Stand({ gaps, newest }: { gaps: GapView; newest: boolean }) {
  return (
    <section className="card dg-stand" id="stand" aria-label="Where your factory stands" data-testid="stand">
      <h2>Where your factory stands</h2>
      <p>
        This is what your answers say about five parts of your factory, and what stands between each part and the ideas on this page. You can read it without reading the ideas. Each line comes from the same rules that ranked the ideas, so "Nothing in the way" means nothing that those rules check.
      </p>
      {gaps.state === "all_left_out" ? (
        <p data-testid="stand-all-left-out">
          Every idea that matches the problems you named was left out, because your answers say the problem it solves does not seem to be there. So there are no ideas to rank. What was left out, and the answer behind it, is under each part.
        </p>
      ) : null}
      {gaps.state === "no_match" ? <p data-testid="stand-no-match">No idea in the library matches the problems you named, so there is nothing to hold your factory up against. The five parts below still show your answers.</p> : null}
      <div className="dg-areas">
        {gaps.areas.map((a) => (
          <div key={a.id} className="dg-area" data-testid={`area-${a.id}`}>
            <h3>
              {a.label}{" "}
              {a.state === "not_assessed" ? <Tag>Not assessed</Tag> : a.heldUp > 0 ? <Tag tone="turn">{a.heldUp === 1 ? "1 idea held up" : `${a.heldUp} ideas held up`}</Tag> : <Tag tone="ok">Nothing in the way</Tag>}
            </h3>
            <p className="muted dg-about">{a.about}</p>
            {a.whyNot ? <p data-testid={`area-${a.id}-not-assessed`}><strong>Not assessed.</strong> {a.whyNot}</p> : null}
            {a.blockers.length ? (
              <>
                <p className="dg-sub">What stands in the way</p>
                <ul className="dg-between">
                  {a.blockers.map((b, i) => (
                    <BlockerLine key={`${b.opportunityId}-${b.kind}-${i}`} b={b} />
                  ))}
                </ul>
              </>
            ) : null}
            {a.inPlace.length ? (
              <>
                <p className="dg-sub">Left out because of your answers</p>
                <ul className="dg-between">
                  {a.inPlace.map((l) => (
                    <li key={l.opportunityId}>{l.words}</li>
                  ))}
                </ul>
              </>
            ) : null}
            <details className="dg-more dg-stand-answers" data-testid={`area-${a.id}-answers`}>
              <summary>Your answers in this part ({a.standing.length})</summary>
              <dl className="facts dg-stand-facts">
                {a.standing.map((q) => (
                  <Fragment key={q.question}>
                    <dt>{q.label}</dt>
                    <dd>{q.answer ?? <span className="muted">Not answered</span>}</dd>
                  </Fragment>
                ))}
              </dl>
            </details>
          </div>
        ))}
      </div>
      {gaps.unplaced.length || gaps.unplacedInPlace.length ? (
        <div className="dg-area" data-testid="area-unplaced">
          <h3>Not placed in a part</h3>
          <p className="muted dg-about">{gaps.placed ? "The library does not say which part these belong to." : "This assessment was made with an earlier version of the library, so these cannot be placed in a part."}</p>
          <ul className="dg-between">
            {gaps.unplaced.map((b, i) => (
              <BlockerLine key={`${b.opportunityId}-${b.kind}-${i}`} b={b} />
            ))}
            {gaps.unplacedInPlace.map((l) => (
              <li key={l.opportunityId}>{l.words}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {gaps.rankedBelowCap > 0 ? <p className="muted">{gaps.rankedBelowCap === 1 ? "One more idea matches" : `${gaps.rankedBelowCap} more ideas match`} your problems but ranked below the first {MAX_ITEMS}, so it is not looked at here.</p> : null}
      {gaps.ideas.length ? (
        <details className="dg-more" data-testid="stand-by-idea">
          <summary>Idea by idea: what stands in the way</summary>
          <ul className="dg-by-idea">
            {gaps.ideas.map((i) => (
              <li key={i.opportunityId}>
                <strong>
                  {i.rank}. {i.title}.
                </strong>{" "}
                {READINESS_WORDS[i.readiness]}.
                {i.blockers.length ? (
                  <ul className="dg-between">
                    {i.blockers.map((b, n) => (
                      <li key={`${b.kind}-${n}`}>
                        <Tag>{KIND_TAG[b.kind]}</Tag> {b.words}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <> Nothing that the rules check stands in the way.</>
                )}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {gaps.needsAnswers && newest ? (
        <div className="dg-answer-next">
          <p>Where a line says you did not answer a question, answer it in your description and confirm it. Then make a new assessment: the lines and the ideas change, and the comparison below shows what moved.</p>
          <p>
            <a className="btn" href="/factory">
              Answer the missing questions
            </a>
          </p>
        </div>
      ) : null}
      <p className="muted help">
        Which part a question belongs to is a choice made for this page, not a finding. The ideas and the figures are SYNTHETIC placeholders, and the cost is compared with the top of your budget band, which is an assumption.
      </p>
    </section>
  );
}

const place = (n: number) => `place ${n}`;

/** What changed between this assessment and the one before it: the answers that differ, and the ideas that moved, came in or dropped out. */
function Compare({ cmp, earlier, later }: { cmp: Comparison; earlier: { revision: number; date: string }; later: { revision: number; date: string } }) {
  const up = cmp.moved.filter((m) => m.direction === "up");
  const down = cmp.moved.filter((m) => m.direction === "down");
  const used = cmp.answers?.filter((a) => a.usedByRules) ?? [];
  const unused = cmp.answers?.filter((a) => !a.usedByRules) ?? [];
  return (
    <section className="card dg-compare" id="compare" aria-label="What changed since the earlier assessment" data-testid="compare">
      <h2>What changed since the earlier assessment</h2>
      <p data-testid="compare-which">
        This assessment is from version {later.revision} of your description (<span className="dg-date">{later.date}</span>). The one before it is from version {earlier.revision} (<span className="dg-date">{earlier.date}</span>). Both are kept as they were.
      </p>
      {cmp.sameDescription ? (
        <p>
          Both were made from version {later.revision} of your description, so none of your answers changed.
          {cmp.libraryChanged ? " The library of ideas is a different version." : ""}
          {cmp.engineChanged ? " The ranking rules are a different version." : ""}
        </p>
      ) : cmp.answers === null ? (
        <p>One of the two descriptions could not be read, so your answers are not compared.</p>
      ) : used.length === 0 && unused.length === 0 ? (
        <p>No answer is different between the two versions of your description.</p>
      ) : (
        <>
          {used.length ? (
            <>
              <h3>Your answers that changed</h3>
              <ul className="dg-changes" data-testid="compare-answers">
                {used.map((a) => (
                  <li key={a.key}>
                    <strong>{a.label}</strong> Was: {a.before}. Now: {a.after}.
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>None of the answers the rules read changed.</p>
          )}
          {unused.length ? (
            <details className="dg-more">
              <summary>Other answers that changed ({unused.length})</summary>
              <ul className="dg-changes">
                {unused.map((a) => (
                  <li key={a.key}>
                    <strong>{a.label}</strong> {a.before === "" ? "Changed." : `Was: ${a.before}. Now: ${a.after}.`} The rules do not use this answer.
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}
      {cmp.nothingMoved ? (
        <p data-testid="compare-nothing-moved">No idea moved, came in or dropped out: the same ideas are in the same order.</p>
      ) : (
        <>
          {up.length ? (
            <>
              <h3>Ideas that moved up</h3>
              <ul className="dg-changes" data-testid="compare-up">
                {up.map((m) => (
                  <li key={m.opportunityId}>
                    <strong>{m.title}.</strong> From {place(m.from)} to {place(m.to)}. {m.because.join(" ")}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {down.length ? (
            <>
              <h3>Ideas that moved down</h3>
              <ul className="dg-changes" data-testid="compare-down">
                {down.map((m) => (
                  <li key={m.opportunityId}>
                    <strong>{m.title}.</strong> From {place(m.from)} to {place(m.to)}. {m.because.join(" ")}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {cmp.entered.length ? (
            <>
              <h3>Ideas that came in</h3>
              <ul className="dg-changes" data-testid="compare-entered">
                {cmp.entered.map((e) => (
                  <li key={e.opportunityId}>
                    <strong>{e.title}.</strong> Now in {place(e.rank)}. {e.before}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {cmp.dropped.length ? (
            <>
              <h3>Ideas that dropped out</h3>
              <ul className="dg-changes" data-testid="compare-dropped">
                {cmp.dropped.map((d) => (
                  <li key={d.opportunityId}>
                    <strong>{d.title}.</strong> Was in {place(d.wasRank)}. {d.now}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}
      {cmp.changedInPlace.length ? (
        <>
          <h3>Ideas that kept their place but changed</h3>
          <ul className="dg-changes" data-testid="compare-changed">
            {cmp.changedInPlace.map((c) => (
              <li key={c.opportunityId}>
                <strong>{c.title}.</strong> Still in {place(c.rank)}. {c.because.join(" ")}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {cmp.steady > 0 ? <p className="muted">{cmp.steady === 1 ? "One idea stayed" : `${cmp.steady} ideas stayed`} in the same place with nothing changed.</p> : null}
      <p className="muted help">The comparison only reads the two assessments and the two versions of your description. Nothing in it is new advice, and nothing here can be changed.</p>
    </section>
  );
}

/** What the page says in place of the comparison when there is nothing to compare, and why. */
function NothingToCompare({ why, newestId }: { why: "only_one" | "earliest"; newestId: string | null }) {
  return (
    <section className="card dg-compare" aria-label="What changed since the earlier assessment" data-testid="compare-empty">
      <h2>What changed since the earlier assessment</h2>
      {why === "only_one" ? (
        <p>You have one assessment so far, so there is nothing to compare it with. When you confirm a changed description and make a new assessment, this shows which ideas moved up or down, which came in or dropped out, and which of your answers caused it.</p>
      ) : (
        <>
          <p>This is your earliest assessment, so there is nothing before it to compare with. The newer one shows what changed since this one.</p>
          {newestId ? (
            <p>
              <a className="btn" href={`/diagnose?a=${encodeURIComponent(newestId)}`}>
                Open your newest assessment
              </a>
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

export default async function Diagnose({ searchParams }: { searchParams: Promise<Search> }) {
  const e = env as unknown as AppEnv;
  const raw = await searchParams;
  const q = { a: first(raw.a), saved: first(raw.saved), signed: first(raw.signed), problem: first(raw.problem), needs: first(raw.needs) };
  const identity = await resolveIdentityFromCookieHeader((await headers()).get("cookie"), e);

  if (!identity) return <SignedOut title="What to do about it" reason="to see your assessment." />;
  if (!identity.companyId || identity.role !== "owner" || !e.DB) {
    return (
      <>
        <PageHead title="What to do about it" />
        <div className="card">
          <p className="muted">{notOwnerMessage(identity.companyId !== null)}</p>
          <p>
            <a className="btn" href="/">
              Back
            </a>
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
  // The answers each assessment was made from (read for this company only), and the assessment made just before this one, for the two
  // views below. They are read, never written; nothing here makes a record.
  const at = view ? all.findIndex((a) => a.id === view.id) : -1;
  const earlierId = at >= 0 ? (all[at + 1]?.id ?? null) : null;
  const earlierRecord = earlierId ? await loadAssessment(db, companyId, earlierId) : null;
  const [shownDescription, earlierDescription] = await Promise.all([record ? loadRevision(db, companyId, record.factoryRevisionNo) : null, earlierRecord ? loadRevision(db, companyId, earlierRecord.factoryRevisionNo) : null]);
  const gaps = view ? gapView(view.result, shownDescription?.answers ?? null) : null;
  const cmp = view && earlierRecord ? compareAssessments(earlierRecord.result, view.result, earlierDescription?.answers ?? null, shownDescription?.answers ?? null, earlierRecord.factoryRevisionNo === view.factoryRevisionNo) : null;
  const decisionOf = new Map((view?.standing ?? []).map((s) => [s.opportunityId, s]));
  const signed = view?.signoff ?? null;
  const decided = view ? view.result.items.filter((i) => decisionOf.has(i.opportunityId)).length : 0;
  const total = view?.result.items.length ?? 0;
  const state = signOffState(decided, total, signed !== null);
  const ready = state === "ready";
  const nextIdea = view && !signed ? firstUndecided(view.result.items, new Set(decisionOf.keys())) : null;
  // After a sign-off the owner's turn is somewhere else: the same step the strip names, with its own words on the button; the page points to it here, so the frame does not repeat it at the foot.
  const onward = signed ? afterSignOff(nextStep(await loadFacts(db, companyId), new Date())) : null;
  // The make button is the page's main action until an assessment exists for the confirmed description; after that it is a quiet way to make it again.
  const madeFromConfirmed = confirmed ? hasAssessmentFrom(all, confirmed.revision) : false;

  const MakeForm = ({ primary }: { primary: boolean }) =>
    confirmed ? (
      <form method="post" action={`/api/companies/${companyId}/assessments`} data-testid="make-form" className={primary ? "card tint dg-make-card" : "dg-make"}>
        {primary ? <h2>See what is worth doing</h2> : null}
        <p>
          Your confirmed description is version {confirmed.revision}, saved <span className="dg-date">{formatDate(confirmed.createdAt)}</span>.
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
    <Page
      stage="diagnose"
      identity={identity}
      hideNext={onward !== null}
      title="What to do about it"
      lede={signed ? "This list of ideas is signed off. Your decisions are below, and what comes next is after the last idea." : "Here is a short, ranked list of ideas for your factory: for each one you say yes, not yet or no, and then sign off."}
    >
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

      {view ? null : (
        <section className="card dg-stand" aria-label="Where your factory stands" data-testid="stand-empty">
          <h2>Where your factory stands</h2>
          {all.length ? (
            <p>Open one of your assessments below to see where your factory stands on data, people, systems, money and quality, and what stands between it and each idea.</p>
          ) : (
            <>
              <p>
                This will show where your factory stands on data, people, systems, money and quality, and what stands between it and each idea. It appears once you have made your first assessment
                {confirmed ? "." : ", which needs a description of your factory that you have confirmed."}
              </p>
              <p>After you confirm a changed description and make a second assessment, it will also show what changed: which ideas moved, and which of your answers caused it.</p>
            </>
          )}
        </section>
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
              Drafted by a set of rules on {formatDate(view.createdAt)}, not by an AI model.{signed ? "" : " You check it: decide on each idea below, then sign it off."} Library version {view.libraryVersion}, engine version {view.engineVersion}.
            </p>
            {view.result.inputs.problems.length ? <p className="dg-problems">Problems you named: {view.result.inputs.problems.join("; ")}.</p> : <p className="dg-problems">You named no problems, so there is nothing to match.</p>}
            <p className="muted dg-jump" data-testid="jump">
              {cmp ? "What changed since the earlier assessment comes after the ideas and the sign-off. " : ""}
              <a href="#stand">Go to where your factory stands</a>, which comes after the ideas.
            </p>
            {total > 0 ? (
              <p className="dg-count" data-testid="decided-count">
                {decided} of {total} ideas decided.{" "}
                {signed ? "Signed off." : <a href="#signoff">Go to the sign-off</a>}
                {signed ? null : ", which comes after the last idea."}
              </p>
            ) : null}
          </div>

          {view.result.items.length === 0 ? (
            <Notice tone="warn" data-testid="no-items">
              {view.result.leftOut.length > 0
                ? "Every idea that matches the problems you named was left out, because your answers say the problem it solves does not seem to be there. Under \"Where your factory stands\" each one is listed with the answer behind it."
                : 'Nothing in the library matches the problems you named. Naming "something else" cannot be matched.'}
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
                    <p className="muted help" data-testid={`figures-${item.opportunityId}`}>
                      Where these figures come from: {item.source === "assumption" ? "an assumption (SYNTHETIC placeholder). No study, quotation or measurement stands behind them." : `the source register, ${item.source}.`}
                    </p>
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
                    ) : (
                      <p className="muted" data-testid={`first-${item.opportunityId}`}>
                        Nothing the library asks for first is missing.
                      </p>
                    )}
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

                  {!signed && q.saved === item.opportunityId ? (
                    <p className="dg-saved-here" data-testid="saved-here">
                      <Check className="dg-tagtick" /> Your decision on this idea is saved.{" "}
                      {nextIdea ? <a href={`#idea-${nextIdea}`}>Go to the next idea to decide</a> : <a href="#signoff">Every idea is decided: go to the sign-off</a>}
                    </p>
                  ) : null}
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

          <section className={signed || ready ? "card tint dg-signoff-card" : "card dg-signoff-card"} id="signoff" aria-label="Sign-off" data-testid="signoff">
            {signed ? (
              <>
                <h3 className="dg-signed">
                  <Check className="dg-tick" />
                  Signed off
                </h3>
                <p>
                  Signed off on <span className="dg-date">{formatDate(signed.at)}</span>. {signed.note ? `Your note: ${signed.note}` : ""}
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
                <p data-testid="unchanged">{signed.digestMatches ? "Nothing in this list has changed since you signed it." : "This list is not the same as the one you signed: what is stored has changed since."}</p>
                <details className="dg-more">
                  <summary>How this is checked</summary>
                  <p className="muted help">
                    Fingerprint of what was signed: <code>{signed.digest.slice(0, 16)}</code> {signed.digestMatches ? "(checked just now: it matches)" : "(checked just now: IT DOES NOT MATCH what is stored)"}
                  </p>
                </details>
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

          {cmp && earlierRecord ? (
            <Compare cmp={cmp} earlier={{ revision: earlierRecord.factoryRevisionNo, date: formatDate(earlierRecord.createdAt) }} later={{ revision: view.factoryRevisionNo, date: formatDate(view.createdAt) }} />
          ) : null}

          {gaps ? <Stand gaps={gaps} newest={!confirmed || relationToConfirmed(view.factoryRevisionNo, confirmed.revision) === "newest"} /> : null}

          {cmp ? null : <NothingToCompare why={all.length <= 1 ? "only_one" : "earliest"} newestId={all[0]?.id ?? null} />}

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
                  · <span className="dg-date">{formatDate(a.createdAt)}</span> · {a.signedOffAt ? "signed off" : `${a.decided} of ${a.items} decided`}
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
