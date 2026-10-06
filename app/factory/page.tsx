import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { loadHistory, loadLatest, loadRevision } from "../../modules/factory/src/db/revisions.ts";
import { confirmWords, progressOf, progressWords } from "../../modules/factory/src/progress.ts";
import { MAX_NOTE_LENGTH, REQUIRED_TO_CONFIRM, SECTIONS } from "../../modules/factory/src/questionnaire.ts";
import type { Answers, Field } from "../../modules/factory/src/questionnaire.ts";
import type { AppEnv } from "../../modules/platform/src/env.ts";
import { resolveIdentityFromCookieHeader } from "../../modules/platform/src/identity/resolve.ts";
import { formatDate } from "../_ui/dates.ts";
import { Check } from "../_ui/icons.tsx";
import { Meter, NotOwner, Notice, Page, SignedOut, Tag } from "../_ui/parts.tsx";
import "./factory.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Describe" };

type Search = { saved?: string; confirmed?: string; missing?: string; stale?: string; rev?: string; problem?: string; fields?: string };

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

function Input({ field, value, readOnly, describedBy }: { field: Field; value: unknown; readOnly: boolean; describedBy?: string }) {
  const name = `a.${field.key}`;
  const id = `f-${field.key}`;
  if (field.kind === "text") {
    return field.long ? (
      <textarea id={id} name={name} rows={field.maxLength > 1000 ? 7 : 4} maxLength={field.maxLength} defaultValue={typeof value === "string" ? value : ""} readOnly={readOnly} aria-describedby={describedBy} />
    ) : (
      <input id={id} name={name} type="text" maxLength={field.maxLength} defaultValue={typeof value === "string" ? value : ""} readOnly={readOnly} aria-describedby={describedBy} />
    );
  }
  if (field.kind === "number") {
    return <input id={id} className="fc-narrow" name={name} type="number" inputMode="numeric" min={field.min} max={field.max} defaultValue={typeof value === "number" ? value : ""} readOnly={readOnly} aria-describedby={describedBy} />;
  }
  const picked = field.kind === "multi" ? (Array.isArray(value) ? value : []) : [value];
  return (
    <div className={field.options.length > LONG_LIST ? "options cols" : "options"}>
      {field.options.map((opt) => (
        <label key={opt.value} className="option">
          <input type={field.kind === "multi" ? "checkbox" : "radio"} name={name} value={opt.value} defaultChecked={picked.includes(opt.value)} disabled={readOnly} />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

/** One question: its label, a short help line (with a tag when the question is needed to confirm), and the control. */
function Question({ field, value, readOnly }: { field: Field; value: unknown; readOnly: boolean }) {
  const needed = !readOnly && NEEDED.has(field.key);
  const chooseUpTo = field.kind === "multi" && field.maxChoices ? `Choose up to ${field.maxChoices}.` : null;
  const words = [field.help, chooseUpTo].filter(Boolean).join(" ");
  const helpId = needed || words ? `h-${field.key}` : undefined;
  const help = helpId ? (
    <p id={helpId} className="help fc-help">
      {needed ? <Tag tone="brand">Needed to confirm</Tag> : null}
      {words ? <span>{words}</span> : null}
    </p>
  ) : null;

  if (field.kind === "choice" || field.kind === "multi") {
    return (
      <fieldset className="question" aria-describedby={helpId}>
        <legend id={`l-${field.key}`} className="label">
          {field.label}
        </legend>
        {help}
        <Input field={field} value={value} readOnly={readOnly} />
      </fieldset>
    );
  }
  return (
    <div className="question">
      <label htmlFor={`f-${field.key}`} className="label">
        {field.label}
      </label>
      {help}
      <Input field={field} value={value} readOnly={readOnly} describedBy={helpId} />
    </div>
  );
}

function Sections({ answers, readOnly }: { answers: Answers; readOnly: boolean }) {
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
                    <Question key={field.key} field={field} value={answers[field.key]} readOnly={readOnly} />
                  ))}
                </div>
              ) : (
                <Question key={block[0]!.key} field={block[0]!} value={answers[block[0]!.key]} readOnly={readOnly} />
              ),
            )}
          </fieldset>
        );
      })}
    </div>
  );
}

export default async function Factory({ searchParams }: { searchParams: Promise<Search> }) {
  const e = env as unknown as AppEnv;
  const q = await searchParams;
  const identity = await resolveIdentityFromCookieHeader((await headers()).get("cookie"), e);

  if (!identity) return <SignedOut title="Describe your factory" reason="to describe your factory." />;
  if (!identity.companyId || identity.role !== "owner" || !e.DB) return <NotOwner title="Describe your factory" hasCompany={identity.companyId !== null} />;

  const db = e.DB;
  const companyId = identity.companyId;
  const [latest, history] = await Promise.all([loadLatest(db, companyId), loadHistory(db, companyId)]);
  const viewing = q.rev && /^\d{1,9}$/.test(q.rev) ? await loadRevision(db, companyId, Number(q.rev)) : null;
  const shown = viewing ?? latest;
  const readOnly = viewing !== null && viewing.revision !== latest?.revision;
  const missing = (q.missing ?? "").split(",").filter((k) => (REQUIRED_TO_CONFIRM as readonly string[]).includes(k));
  const problemFields = (q.fields ?? "").split(",").filter((k) => LABELS.has(k));
  // How much of the questionnaire the newest saved version covers: worked out here from the saved answers, not from what is being typed.
  const progress = progressOf(latest?.answers);
  const confirmLine = confirmWords(progress, latest?.confirmed === true);

  return (
    <Page stage="describe" identity={identity} title="Describe your factory" lede="Answer what you can and stop whenever you like: every save is kept as a new version, and nothing is overwritten.">
      {q.saved ? (
        <Notice role="status" tone="success" data-testid="saved">
          {q.confirmed === "1" ? `Version ${q.saved} saved and confirmed as accurate.` : `Version ${q.saved} saved as a draft.`}
        </Notice>
      ) : null}
      {missing.length ? (
        <Notice role="alert" tone="warn" data-testid="missing">
          It was saved as a draft, not confirmed. To confirm, please answer: {missing.map((k) => LABELS.get(k) ?? k).join("; ")}.
        </Notice>
      ) : null}
      {q.problem && Object.hasOwn(PROBLEMS, q.problem) ? (
        <Notice role="alert" tone="danger" data-testid="problem">
          {PROBLEMS[q.problem]}
          {q.problem === "invalid" && problemFields.length ? ` Check: ${problemFields.map((k) => LABELS.get(k)).join("; ")}.` : ""}
        </Notice>
      ) : null}
      {q.stale === "1" ? (
        <Notice role="alert" tone="warn" data-testid="stale">
          Someone saved a newer version while you were typing, so yours was not saved. The newest version is shown below. Please make your changes again.
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
        <Sections answers={shown?.answers ?? {}} readOnly={readOnly} />
        {readOnly ? null : (
          <>
            <div className="card fc-save">
              <div className="question">
                <label htmlFor="note" className="label">
                  What changed since last time? (optional)
                </label>
                <input id="note" name="note" type="text" maxLength={MAX_NOTE_LENGTH} />
              </div>
              <p className="help">Confirming says the description is accurate and ready for the next step. You can still save a newer version later.</p>
            </div>
            <div className="sticky-actions">
              <div className="actions">
                <button type="submit" name="intent" value="save">
                  Save as draft
                </button>
                <button type="submit" name="intent" value="confirm" className="primary">
                  Confirm this is accurate
                </button>
              </div>
            </div>
          </>
        )}
      </form>

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
