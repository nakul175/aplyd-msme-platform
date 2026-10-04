import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { loadHistory, loadLatest, loadRevision } from "../../modules/factory/src/db/revisions.ts";
import { MAX_NOTE_LENGTH, REQUIRED_TO_CONFIRM, SECTIONS } from "../../modules/factory/src/questionnaire.ts";
import type { Answers, Field } from "../../modules/factory/src/questionnaire.ts";
import type { AppEnv } from "../../modules/platform/src/env.ts";
import { resolveIdentityFromCookieHeader } from "../../modules/platform/src/identity/resolve.ts";

export const dynamic = "force-dynamic";

type Search = { saved?: string; confirmed?: string; missing?: string; stale?: string; rev?: string; problem?: string; fields?: string };

const LABELS = new Map(SECTIONS.flatMap((s) => s.fields).map((f) => [f.key, f.label]));
// Nothing of what was sent is shown back: a message from this list, and question names taken from the questionnaire.
const PROBLEMS: Record<string, string> = {
  invalid: "Nothing was saved, because some answers could not be accepted. Please check them and save again.",
  note: "Nothing was saved. Keep the note to plain text of 500 characters or fewer.",
  request: "Nothing was saved, because the request was not complete. Please reload the page and try again.",
  too_many: "Nothing was saved. A company can keep at most 500 saved versions, and this one has reached it.",
};

function Input({ field, value, readOnly }: { field: Field; value: unknown; readOnly: boolean }) {
  const name = `a.${field.key}`;
  const id = `f-${field.key}`;
  if (field.kind === "text") {
    return field.long ? (
      <textarea id={id} name={name} rows={4} maxLength={field.maxLength} defaultValue={typeof value === "string" ? value : ""} readOnly={readOnly} />
    ) : (
      <input id={id} name={name} type="text" maxLength={field.maxLength} defaultValue={typeof value === "string" ? value : ""} readOnly={readOnly} />
    );
  }
  if (field.kind === "number") {
    return <input id={id} name={name} type="number" inputMode="numeric" min={field.min} max={field.max} defaultValue={typeof value === "number" ? value : ""} readOnly={readOnly} />;
  }
  const picked = field.kind === "multi" ? (Array.isArray(value) ? value : []) : [value];
  return (
    <div className="options">
      {field.options.map((opt) => (
        <label key={opt.value} className="option">
          <input type={field.kind === "multi" ? "checkbox" : "radio"} name={name} value={opt.value} defaultChecked={picked.includes(opt.value)} disabled={readOnly} />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

function Sections({ answers, readOnly }: { answers: Answers; readOnly: boolean }) {
  return (
    <>
      {SECTIONS.map((section) => (
        <fieldset key={section.id} className="card" data-testid={`section-${section.id}`}>
          <legend>{section.title}</legend>
          {section.intro ? <p className="muted">{section.intro}</p> : null}
          {section.fields.map((field) => (
            <div key={field.key} className="question">
              {field.kind === "choice" || field.kind === "multi" ? (
                <p id={`l-${field.key}`} className="label">
                  {field.label}
                </p>
              ) : (
                <label htmlFor={`f-${field.key}`} className="label">
                  {field.label}
                </label>
              )}
              {field.help ? <p className="muted help">{field.help}</p> : null}
              {field.kind === "multi" && field.maxChoices ? <p className="muted help">Choose up to {field.maxChoices}.</p> : null}
              <Input field={field} value={answers[field.key]} readOnly={readOnly} />
            </div>
          ))}
        </fieldset>
      ))}
    </>
  );
}

export default async function Factory({ searchParams }: { searchParams: Promise<Search> }) {
  const e = env as unknown as AppEnv;
  const q = await searchParams;
  const identity = await resolveIdentityFromCookieHeader((await headers()).get("cookie"), e);

  if (!identity) {
    return (
      <>
        <h1>Describe your factory</h1>
        <p>
          <a href="/sign-in">Sign in</a> to describe your factory.
        </p>
      </>
    );
  }
  if (!identity.companyId || identity.role !== "owner" || !e.DB) {
    return (
      <>
        <h1>Describe your factory</h1>
        <p className="muted">This page is for the owner of a company. Your account is not linked to one.</p>
        <p>
          <a href="/">Back</a>
        </p>
      </>
    );
  }

  const db = e.DB;
  const companyId = identity.companyId;
  const [latest, history] = await Promise.all([loadLatest(db, companyId), loadHistory(db, companyId)]);
  const viewing = q.rev && /^\d{1,9}$/.test(q.rev) ? await loadRevision(db, companyId, Number(q.rev)) : null;
  const shown = viewing ?? latest;
  const readOnly = viewing !== null && viewing.revision !== latest?.revision;
  const missing = (q.missing ?? "").split(",").filter((k) => (REQUIRED_TO_CONFIRM as readonly string[]).includes(k));
  const problemFields = (q.fields ?? "").split(",").filter((k) => LABELS.has(k));

  return (
    <>
      <h1>Describe your factory</h1>
      <p className="muted">
        <span className="tag">SYNTHETIC</span> Answer what you can. You can stop and come back: every save is kept as a new version, and nothing is overwritten.
      </p>

      {q.saved ? (
        <p role="status" className="notice" data-testid="saved">
          {q.confirmed === "1" ? `Version ${q.saved} saved and confirmed as accurate.` : `Version ${q.saved} saved as a draft.`}
        </p>
      ) : null}
      {missing.length ? (
        <p role="alert" className="notice" data-testid="missing">
          It was saved as a draft, not confirmed. To confirm, please answer: {missing.map((k) => LABELS.get(k) ?? k).join("; ")}.
        </p>
      ) : null}
      {q.problem && PROBLEMS[q.problem] ? (
        <p role="alert" className="notice" data-testid="problem">
          {PROBLEMS[q.problem]}
          {q.problem === "invalid" && problemFields.length ? ` Check: ${problemFields.map((k) => LABELS.get(k)).join("; ")}.` : ""}
        </p>
      ) : null}
      {q.stale === "1" ? (
        <p role="alert" className="notice" data-testid="stale">
          Someone saved a newer version while you were typing, so yours was not saved. The newest version is shown below. Please make your changes again.
        </p>
      ) : null}

      <p data-testid="status">
        {latest ? (
          <>
            Newest version: {latest.revision}, {latest.confirmed ? "confirmed as accurate" : "a draft"}, saved {latest.createdAt.slice(0, 10)}.
          </>
        ) : (
          <>Nothing saved yet.</>
        )}
      </p>

      {readOnly && viewing ? (
        <p className="notice" data-testid="viewing">
          You are looking at version {viewing.revision}, saved {viewing.createdAt.slice(0, 10)}. It cannot be changed. <a href="/factory">Go to the newest version</a> to make changes.
        </p>
      ) : null}

      <form method="post" action={`/api/companies/${companyId}/factory/revisions`} data-testid="describe-form">
        <input type="hidden" name="based_on" value={latest?.revision ?? 0} />
        <Sections answers={shown?.answers ?? {}} readOnly={readOnly} />
        {readOnly ? null : (
          <>
            <p>
              <label htmlFor="note" className="label">
                What changed since last time? (optional)
              </label>
              <br />
              <input id="note" name="note" type="text" maxLength={MAX_NOTE_LENGTH} />
            </p>
            <p className="actions">
              <button type="submit" name="intent" value="save">
                Save as draft
              </button>{" "}
              <button type="submit" name="intent" value="confirm">
                Confirm this is accurate
              </button>
            </p>
            <p className="muted help">Confirming says the description is accurate and ready for the next step. You can still save a newer version later.</p>
          </>
        )}
      </form>

      <h2>Earlier versions</h2>
      {latest && latest.revision > history.length ? <p className="muted">The newest {history.length} of {latest.revision} versions are listed. Older ones are kept.</p> : null}
      {history.length ? (
        <ul data-testid="history">
          {history.map((h) => (
            <li key={h.revision}>
              <a href={`/factory?rev=${h.revision}`}>Version {h.revision}</a> · {h.createdAt.slice(0, 10)} · {h.confirmed ? "confirmed" : "draft"}
              {h.note ? ` · ${h.note}` : ""}
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
