import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { Fragment } from "react";
import { NOT_INCLUDED, README, SECTIONS, SECTION_TEXT, buildExport } from "../../modules/portability/src/bundle.ts";
import type { ExportCounts, Section } from "../../modules/portability/src/bundle.ts";
import { readExportInput } from "../../modules/portability/src/read.ts";
import type { AppEnv } from "../../modules/platform/src/env.ts";
import { resolveIdentityFromCookieHeader } from "../../modules/platform/src/identity/resolve.ts";
import { Arrow } from "../_ui/icons.tsx";
import { NotOwner, PageHead, SignedOut, Tag } from "../_ui/parts.tsx";

export const dynamic = "force-dynamic";

const TITLE = "Take your data with you";
const num = (n: number) => n.toLocaleString("en-IN");
const many = (n: number, one: string, more: string) => `${num(n)} ${n === 1 ? one : more}`;

/** What each section holds, counted, in the owner's words. */
const COUNTED: Record<Section, (c: ExportCounts) => string> = {
  company: () => "1 record",
  factoryDescriptions: (c) => many(c.factoryDescriptions, "version", "versions"),
  assessments: (c) => `${many(c.assessments, "list of ideas", "lists of ideas")}, ${many(c.ideas, "idea", "ideas")}, ${many(c.decisions, "decision", "decisions")}, ${many(c.signOffs, "sign-off", "sign-offs")}`,
  requirements: (c) => `${many(c.requirements, "request", "requests")}${c.withdrawnRequirements > 0 ? `, ${num(c.withdrawnRequirements)} of them withdrawn` : ""}`,
  engagements: (c) => `${many(c.engagements, "provider chosen", "providers chosen")}, ${many(c.milestones, "milestone", "milestones")}, ${many(c.engagementEvents, "thing recorded", "things recorded")} on them`,
  measurements: (c) => many(c.measurements, "number", "numbers"),
};

const sizeOf = (bytes: number) => (bytes < 1024 ? `${num(bytes)} bytes` : `about ${num(Math.ceil(bytes / 1024))} KB`);

export default async function Export() {
  const e = env as unknown as AppEnv;
  const identity = await resolveIdentityFromCookieHeader((await headers()).get("cookie"), e);

  if (!identity) return <SignedOut title={TITLE} reason="to download your company's records." />;
  if (identity.role === "operator" && identity.companyId === null) {
    return (
      <>
        <PageHead title={TITLE} />
        <div className="card" data-testid="operator-cannot-export">
          <p>The operator cannot download a company&apos;s records. Only a person of that company can.</p>
          <p className="muted">This keeps each company&apos;s records with that company. The operator&apos;s own work is on the operator&apos;s page.</p>
          <p>
            <a href="/">Back</a>
          </p>
        </div>
      </>
    );
  }
  if (!identity.companyId) return <NotOwner title={TITLE} hasCompany={false} />;

  const input = e.DB ? await readExportInput(e.DB, identity) : null;
  if (!input) {
    return (
      <>
        <PageHead title={TITLE} />
        <div className="card">
          <p className="muted">Your records cannot be read just now. Try again later.</p>
          <p>
            <a href="/">Back</a>
          </p>
        </div>
      </>
    );
  }

  const bundle = buildExport(input, new Date());
  const bytes = new TextEncoder().encode(JSON.stringify(bundle, null, 2)).length;
  const href = `/api/companies/${encodeURIComponent(identity.companyId)}/export`;

  return (
    <>
      <PageHead title={TITLE} lede="Download every record your company has made here, in one file. The file is yours to keep." />

      <p>
        <Tag>SYNTHETIC</Tag> Every record here is test data. Nothing in it is about a real company.
      </p>

      <section className="card" aria-labelledby="ex-in">
        <h2 id="ex-in">What is in the file</h2>
        <dl className="facts" data-testid="counts">
          {SECTIONS.map((s) => (
            <Fragment key={s}>
              <dt>{SECTION_TEXT[s].title}</dt>
              <dd data-testid={`count-${s}`}>{COUNTED[s](bundle.counts)}</dd>
            </Fragment>
          ))}
        </dl>
        <div className="actions">
          <a className="btn primary" href={href} download data-testid="download">
            Download your records
            <Arrow className="icon" />
          </a>
        </div>
        <p className="help muted">One JSON file, {sizeOf(bytes)}. Any text editor opens it.</p>
      </section>

      <section className="card" aria-labelledby="ex-next">
        <h2 id="ex-next">What happens next</h2>
        <ul>
          <li>Your browser saves the file. It holds your records as they are at that moment.</li>
          <li data-testid="not-closed">Downloading does not close your account. Your records stay here, and you can keep using the service.</li>
          <li>The file is yours. Anyone who has it can read your records, so keep it where only you can open it.</li>
          <li>Each download is noted in the platform&apos;s log, with your account and the time.</li>
          <li>Any person of your company who can sign in can download this file.</li>
          <li>Closing an account and removing its records is not built yet.</li>
        </ul>
      </section>

      <details className="card" data-testid="not-included">
        <summary>What is not in the file, and why</summary>
        <ul>
          {NOT_INCLUDED.map((n) => (
            <li key={n.what}>
              <strong>{n.what}</strong> {n.why}
            </li>
          ))}
        </ul>
      </details>

      <details className="card" data-testid="layout">
        <summary>How the file is laid out</summary>
        <p className="muted">{README.format}</p>
        <dl className="facts">
          {SECTIONS.map((s) => (
            <Fragment key={s}>
              <dt>
                <code>{s}</code>
              </dt>
              <dd>{SECTION_TEXT[s].text}</dd>
            </Fragment>
          ))}
        </dl>
      </details>
    </>
  );
}
