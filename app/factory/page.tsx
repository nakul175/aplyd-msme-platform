import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { loadHistory, loadLatest, loadRevision } from "../../modules/factory/src/db/revisions.ts";
import { draftAnswers, readDraft } from "../../modules/factory/src/draft.ts";
import { confirmWords, progressOf, progressWords } from "../../modules/factory/src/progress.ts";
import { MAX_NOTE_LENGTH, REQUIRED_TO_CONFIRM, SECTIONS, validateAnswers } from "../../modules/factory/src/questionnaire.ts";
import type { Answers, Field } from "../../modules/factory/src/questionnaire.ts";
import { firstTexts, isVersionNumber } from "../../modules/factory/src/search.ts";
import type { AppEnv } from "../../modules/platform/src/env.ts";
import { resolveIdentityFromCookieHeader } from "../../modules/platform/src/identity/resolve.ts";
import { formatDate } from "../_ui/dates.ts";
import { Arrow, Check } from "../_ui/icons.tsx";
import { Meter, NotOwner, Notice, Page, SignedOut, Tag } from "../_ui/parts.tsx";
import "./factory.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Describe" };

// Every name the page reads from its address. A name repeated in the address reaches the page as a list: each is read as its first text (S3-03).
const SEARCH_NAMES = ["saved", "confirmed", "missing", "stale", "rev", "problem", "fields"] as const;

const LABELS = new Map(SECTIONS.flatMap((s) => s.fields).map((f) => [f.key, f.label]));
const NEEDED = new Set<string>(REQUIRED_TO_CONFIRM);
// Two short questions that sit side by side on a wide screen: the first names the second, which then is not drawn on its own.
const PAIRED_WITH = new Map([["state", "district"]]);
// An option list longer than this is drawn in two columns on a wide screen.
const LONG_LIST = 5;
// Nothing of what was sent is shown back: a message from this list, and question names taken from the questionnaire.
const PROBLEMS: Record<string, string> = {
  invalid: "Nothing was saved, because some answers could not be accepted. Please check them and save again.",
  note: "Nothing was saved. Keep the note to plain text of 500 characters or fewer.",
  request: "Nothing was saved, because the request was not complete. Please reload the page and try again.",
  too_many: "Nothing was saved. A company can keep at most 500 saved versions, and this one has reached it.",
};
// When the answers the person typed are shown again in the boxes, the notice says what to change instead.
const KEPT_PROBLEMS: Record<string, string> = {
  invalid: "Nothing was saved. Your answers are still in the boxes below: change the ones marked, then save again.",
  note: "Nothing was saved. Your answers are still in the boxes below: keep the note to plain text of 500 characters or fewer, then save again.",
  request: "Nothing was saved, because the request was not complete. Your answers are still in the boxes below: save again.",
  too_many: PROBLEMS.too_many,
};
// A save with no question answered is refused with no question named.
const NOTHING_ANSWERED = "Nothing was saved, because no question has been answered yet. Answer at least one question, then save.";
// The one sentence added when a refused save's answers could not be shown again (cookies off, too long to keep, or too late).
const NOT_KEPT = " What you typed could not be kept, so please type it again.";
// At most this many boxes may be ticked in a group that names a limit: the unticked ones are switched off at the limit.
const LIMIT_SCRIPT = `document.addEventListener("change",function(e){var t=e.target;if(!t||t.type!=="checkbox")return;var g=t.closest("[data-max]");if(!g)return;var m=Number(g.getAttribute("data-max"));var b=g.querySelectorAll('input[type="checkbox"]');var n=0;b.forEach(function(x){if(x.checked)n++});b.forEach(function(x){x.disabled=!x.checked&&n>=m});var l=g.parentNode.querySelector(".fc-limit");if(l)l.hidden=n<m});`;

function Input({ field, value, readOnly, describedBy, invalid }: { field: Field; value: unknown; readOnly: boolean; describedBy?: string; invalid?: boolean }) {
  const name = `a.${field.key}`;
  const id = `f-${field.key}`;
  if (field.kind === "text") {
    return field.long ? (
      <textarea id={id} name={name} rows={field.maxLength > 1000 ? 7 : 4} maxLength={field.maxLength} defaultValue={typeof value === "string" ? value : ""} readOnly={readOnly} aria-describedby={describedBy} aria-invalid={invalid ? true : undefined} />
    ) : (
      <input id={id} name={name} type="text" maxLength={field.maxLength} defaultValue={typeof value === "string" ? value : ""} readOnly={readOnly} aria-describedby={describedBy} aria-invalid={invalid ? true : undefined} />
    );
  }
  if (field.kind === "number") {
    // A refused save is shown back as typed, so a box can hold text that is not a number: the server says which box to change.
    return <input id={id} className="fc-narrow" name={name} type="number" inputMode="numeric" min={field.min} max={field.max} defaultValue={typeof value === "number" || typeof value === "string" ? value : ""} readOnly={readOnly} aria-describedby={describedBy} aria-invalid={invalid ? true : undefined} />;
  }
  const picked = field.kind === "multi" ? (Array.isArray(value) ? value : []) : [value];
  // A group with a limit (the biggest problems: three) switches off the unticked boxes once the limit is reached. The server keeps the same rule.
  const max = field.kind === "multi" ? field.maxChoices : undefined;
  const full = max !== undefined && picked.length >= max;
  return (
    <div className={field.options.length > LONG_LIST ? "options cols" : "options"} data-max={max}>
      {field.options.map((opt) => {
        const on = picked.includes(opt.value);
        return (
          <label key={opt.value} className="option">
            <input type={field.kind === "multi" ? "checkbox" : "radio"} name={name} value={opt.value} defaultChecked={on} disabled={readOnly || (full && !on)} />
            {opt.label}
          </label>
        );
      })}
    </div>
  );
}

/** One question: its label, a short help line (with a tag when the question is needed to confirm), and the control. */
function Question({ field, value, readOnly, error }: { field: Field; value: unknown; readOnly: boolean; error?: string }) {
  const needed = !readOnly && NEEDED.has(field.key);
  const chooseUpTo = field.kind === "multi" && field.maxChoices ? `Choose up to ${field.maxChoices}.` : null;
  const words = [field.help, chooseUpTo].filter(Boolean).join(" ");
  const helpId = needed || words ? `h-${field.key}` : undefined;
  const errorId = error ? `e-${field.key}` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;
  const problem = error ? (
    <p id={errorId} className="fc-error" data-testid={`error-${field.key}`}>
      <strong>Change this answer.</strong> {error}
    </p>
  ) : null;
  const help = helpId ? (
    <p id={helpId} className="help fc-help">
      {needed ? <Tag tone="brand">Needed to confirm</Tag> : null}
      {words ? <span>{words}</span> : null}
    </p>
  ) : null;

  if (field.kind === "choice" || field.kind === "multi") {
    return (
      <fieldset className={error ? "question fc-bad" : "question"} aria-describedby={describedBy}>
        <legend id={`l-${field.key}`} className="label">
          {field.label}
        </legend>
        {problem}
        {help}
        <Input field={field} value={value} readOnly={readOnly} />
        {field.kind === "multi" && field.maxChoices ? (
          <p className="help fc-limit" hidden={!(Array.isArray(value) && value.length >= field.maxChoices)}>
            That is the most you can choose. Untick one to choose another.
          </p>
        ) : null}
      </fieldset>
    );
  }
  return (
    <div className={error ? "question fc-bad" : "question"}>
      <label htmlFor={`f-${field.key}`} className="label">
        {field.label}
      </label>
      {problem}
      {help}
      <Input field={field} value={value} readOnly={readOnly} describedBy={describedBy} invalid={Boolean(error)} />
    </div>
  );
}

function Sections({ answers, readOnly, errors }: { answers: Answers; readOnly: boolean; errors: Record<string, string> }) {
  return (
    <div className="fc-sections">
      {SECTIONS.map((section) => {
        const blocks: Field[][] = [];
        for (let i = 0; i < section.fields.length; i++) {
          const field = section.fields[i]!;
          const next = section.fields[i + 1];
          if (next && PAIRED_WITH.get(field.key) === next.key) {
            blocks.push([field, next]);
            i += 1;
          } else blocks.push([field]);
        }
        return (
          <fieldset key={section.id} className="card" data-testid={`section-${section.id}`}>
            <legend>{section.title}</legend>
            {section.intro ? <p className="muted">{section.intro}</p> : null}
            {blocks.map((block) =>
              block.length === 2 ? (
                <div key={block[0]!.key} className="field-row two">
                  {block.map((field) => (
                    <Question key={field.key} field={field} value={answers[field.key]} readOnly={readOnly} error={errors[field.key]} />
                  ))}
                </div>
              ) : (
                <Question key={block[0]!.key} field={block[0]!} value={answers[block[0]!.key]} readOnly={readOnly} error={errors[block[0]!.key]} />
              ),
            )}
          </fieldset>
        );
      })}
    </div>
  );
}

export default async function Factory({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const e = env as unknown as AppEnv;
  const q = firstTexts(await searchParams, SEARCH_NAMES);
  const cookieHeader = (await headers()).get("cookie");
  const identity = await resolveIdentityFromCookieHeader(cookieHeader, e);

  if (!identity) return <SignedOut title="Describe your factory" reason="to describe your factory." />;
  if (!identity.companyId || identity.role !== "owner" || !e.DB) return <NotOwner title="Describe your factory" hasCompany={identity.companyId !== null} />;

  const db = e.DB;
  const companyId = identity.companyId;
  const [latest, history] = await Promise.all([loadLatest(db, companyId), loadHistory(db, companyId)]);
  const viewing = isVersionNumber(q.rev) ? await loadRevision(db, companyId, Number(q.rev)) : null;
  const shown = viewing ?? latest;
  const readOnly = viewing !== null && viewing.revision !== latest?.revision;
  // A refused or stale save comes back with the answers the person typed in a short-lived cookie (draft.ts). They are drawn in the boxes in
  // place of the saved ones, and checked again with the same rules as a save so each question that failed is marked.
  const problem = q.problem !== undefined && Object.hasOwn(PROBLEMS, q.problem) ? q.problem : null;
  const stale = q.stale === "1";
  const typed = (problem !== null || stale) && !readOnly ? readDraft(cookieHeader, companyId) : null;
  const typedAnswers = typed ? draftAnswers(typed) : null;
  const fieldErrors: Record<string, string> = {};
  if (typedAnswers) {
    const checked = validateAnswers(typedAnswers, { confirm: false });
    if (!checked.ok) for (const [key, message] of Object.entries(checked.errors)) if (LABELS.has(key)) fieldErrors[key] = message;
  }
  const missing = (q.missing ?? "").split(",").filter((k) => (REQUIRED_TO_CONFIRM as readonly string[]).includes(k));
  const problemFields = (q.fields ?? "").split(",").filter((k) => LABELS.has(k));
  // How much of the questionnaire the newest saved version covers: worked out here from the saved answers, not from what is being typed.
  const progress = progressOf(latest?.answers);
  const confirmLine = confirmWords(progress, latest?.confirmed === true);

  const confirmedNow = latest?.confirmed === true;
  const lede = (
    <>
      <p>Answer what you can and stop whenever you like: every save is kept as a new version, and nothing is overwritten.</p>
      {confirmedNow && latest ? (
        <div className="fc-next" data-testid="confirmed-next">
          <p>
            <strong>Your description is confirmed (version {latest.revision}).</strong> The next step is to see which ideas are worth trying in your factory. You can change an answer below at any time and save a new version.
          </p>
          <a className="btn primary" href="/diagnose">
            See what is worth doing
            <Arrow className="icon" />
          </a>
        </div>
      ) : null}
    </>
  );

  return (
    <Page stage="describe" identity={identity} title="Describe your factory" lede={lede} hideNext={confirmedNow}>
      {isVersionNumber(q.saved) ? (
        <Notice role="status" tone="success" data-testid="saved">
          {q.confirmed === "1" ? `Version ${q.saved} saved and confirmed as accurate.` : `Version ${q.saved} saved as a draft.`}
        </Notice>
      ) : null}
      {missing.length ? (
        <Notice role="alert" tone="warn" data-testid="missing">
          It was saved as a draft, not confirmed. To confirm, please answer: {missing.map((k) => LABELS.get(k) ?? k).join("; ")}.
        </Notice>
      ) : null}
      {problem ? (
        <Notice role="alert" tone="danger" data-testid="problem">
          {problem === "invalid" && problemFields.length === 0 ? NOTHING_ANSWERED : typed ? KEPT_PROBLEMS[problem] : PROBLEMS[problem] + (problem === "too_many" ? "" : NOT_KEPT)}
          {problem === "invalid" && problemFields.length ? ` Check: ${problemFields.map((k) => LABELS.get(k)).join("; ")}.` : ""}
        </Notice>
      ) : null}
      {stale ? (
        <Notice role="alert" tone="warn" data-testid="stale">
          {latest ? `Version ${latest.revision} was saved while you were typing, so yours was not saved. ` : "A newer version was saved while you were typing, so yours was not saved. "}
          {typed ? "Your answers are still in the boxes below. If you save now, they become the newest version." : "The newest version is shown below. Please make your changes again."}
          {latest ? (
            <>
              {" "}
              <a href={`/factory?rev=${latest.revision}`} target="_blank" rel="noopener">
                Look at version {latest.revision} first (it opens in a new tab)
              </a>
              .
            </>
          ) : null}
        </Notice>
      ) : null}

      <section className="card fc-state" aria-label="Where your description stands">
        <div className="fc-tags">
          {latest ? (
            <Tag tone={latest.confirmed ? "ok" : "turn"}>
              {latest.confirmed ? <Check className="fc-tick" /> : null}
              {latest.confirmed ? "Confirmed" : "Draft"}
            </Tag>
          ) : (
            <Tag tone="turn">Not started</Tag>
          )}{" "}
          <Tag>SYNTHETIC</Tag>
        </div>
        <p data-testid="status" className="fc-status">
          {latest ? (
            <>
              Newest version: {latest.revision}, {latest.confirmed ? "confirmed as accurate" : "a draft"}, saved <span className="fc-date">{formatDate(latest.createdAt)}</span>.
            </>
          ) : (
            <>Nothing saved yet.</>
          )}
        </p>
        <Meter data-testid="answered" done={progress.answered} of={progress.total} label={progressWords(progress, latest !== null)} />
        {latest ? confirmLine ? <p className="help">{confirmLine}</p> : null : <p className="help">A draft can be saved after answering just one question.</p>}
      </section>

      {readOnly && viewing ? (
        <Notice tone="info" data-testid="viewing">
          You are looking at version {viewing.revision}, saved <span className="fc-date">{formatDate(viewing.createdAt)}</span>. It cannot be changed. <a href="/factory">Go to the newest version</a> to make changes.
        </Notice>
      ) : null}

      <form method="post" action={`/api/companies/${companyId}/factory/revisions`} className="fc-form" data-testid="describe-form">
        <input type="hidden" name="based_on" value={latest?.revision ?? 0} />
        <Sections answers={typedAnswers ?? shown?.answers ?? {}} readOnly={readOnly} errors={fieldErrors} />
        {readOnly ? null : (
          <>
            <div className="card fc-save">
              <div className="question">
                <label htmlFor="note" className="label">
                  What changed since last time? (optional)
                </label>
                <input id="note" name="note" type="text" maxLength={MAX_NOTE_LENGTH} defaultValue={typed?.note ?? ""} />
              </div>
              <p className="help">
                {confirmedNow
                  ? "Saving a new version keeps your description confirmed as accurate. Choose Save as draft instead if you are not sure yet: the version you confirmed stays on record."
                  : "Confirming says the description is accurate and ready for the next step. You can still save a newer version later."}
              </p>
            </div>
            <div className="sticky-actions">
              <div className="actions">
                <button type="submit" name="intent" value="save">
                  Save as draft
                </button>
                <button type="submit" name="intent" value="confirm" className="primary">
                  {confirmedNow ? (
                    <>
                      Save a new version<span className="sr"> and confirm this is accurate</span>
                    </>
                  ) : (
                    "Confirm this is accurate"
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </form>
      <script dangerouslySetInnerHTML={{ __html: LIMIT_SCRIPT }} />

      {history.length ? (
        <details className="card" open={readOnly}>
          <summary>Earlier versions</summary>
          {latest && latest.revision > history.length ? (
            <p className="muted">
              The newest {history.length} of {latest.revision} versions are listed. Older ones are kept.
            </p>
          ) : null}
          <ul className="fc-versions" data-testid="history">
            {history.map((h) => (
              <li key={h.revision}>
                <a href={`/factory?rev=${h.revision}`} aria-current={viewing?.revision === h.revision ? "page" : undefined}>
                  Version {h.revision}
                </a>{" "}
                <Tag tone={h.confirmed ? "ok" : undefined}>{h.confirmed ? "confirmed" : "draft"}</Tag>{" "}
                <span className="muted num">{formatDate(h.createdAt)}</span>{" "}
                {viewing?.revision === h.revision ? <Tag tone="brand">Shown above</Tag> : null}{" "}
                {h.note ? <span className="muted fc-note">{h.note}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="muted">No earlier versions yet. Your first save will be version 1.</p>
      )}
    </Page>
  );
}
