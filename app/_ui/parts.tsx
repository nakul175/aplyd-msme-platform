// The parts every page is built from. A page that uses them looks and behaves like the others without repeating the markup, and the
// things a test finds a page by (its h1, its notices' roles and test ids, its links' names) stay where they were.
import type { HTMLAttributes, ReactNode } from "react";
import { env } from "cloudflare:workers";
import { loadFacts } from "../../modules/journey/src/facts.ts";
import { STAGES, STAGE_IDS, isOwnersTurn, nextStep, stageById, stageStatuses } from "../../modules/journey/src/progress.ts";
import type { Facts, StageId, StageStatus } from "../../modules/journey/src/progress.ts";
import type { AppEnv } from "../../modules/platform/src/env.ts";
import type { Identity } from "../../modules/platform/src/identity/scope.ts";
import { Arrow, Check } from "./icons.tsx";

export type Tone = "info" | "success" | "warn" | "danger";

/**
 * A message the page shows after something happened: `status` for a thing that went well, `alert` for a thing that needs attention. The
 * role is what a screen reader announces and what a test finds it by; the tone is only its colour. Pass `data-testid` as on any element.
 */
export function Notice({ tone, role, children, ...rest }: { tone?: Tone; role?: "status" | "alert" | "note"; children: ReactNode } & Omit<HTMLAttributes<HTMLDivElement>, "role">) {
  return (
    <div className="notice" role={role} data-tone={tone} {...rest}>
      {children}
    </div>
  );
}

export function Tag({ tone, children }: { tone?: "ok" | "turn" | "warn" | "brand" | "danger"; children: ReactNode }) {
  return (
    <span className="tag" data-tone={tone}>
      {children}
    </span>
  );
}

/** "3 of 5", drawn as a bar with the words under it. The words carry the meaning; the bar only shows it. */
export function Meter({ done, of, label, ...rest }: { done: number; of: number; label: string } & HTMLAttributes<HTMLDivElement>) {
  const pct = of > 0 ? Math.round((Math.min(done, of) / of) * 100) : 0;
  return (
    <div className="meter" {...rest}>
      <div className="meter-bar" aria-hidden>
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="meter-label">{label}</p>
    </div>
  );
}

export function PageHead({ stage, title, lede }: { stage?: StageId; title: string; lede?: ReactNode }) {
  const s = stage ? stageById(stage) : null;
  return (
    <header className="page-head">
      {s ? (
        <p className="eyebrow">
          Step {s.n} of {STAGES.length} · {s.short}
        </p>
      ) : null}
      <h1>{title}</h1>
      {lede ? <div className="lede">{lede}</div> : null}
    </header>
  );
}

/** What a visitor who is not signed in sees on a page that needs an account. One link, named "Sign in". */
export function SignedOut({ title, reason }: { title: string; reason: string }) {
  return (
    <>
      <PageHead title={title} />
      <div className="card">
        <p>
          <a href="/sign-in">Sign in</a> {reason}
        </p>
      </div>
    </>
  );
}

/** What a signed-in person who is not an owner of a company sees on an owner's page. */
export function NotOwner({ title, hasCompany = false }: { title: string; hasCompany?: boolean }) {
  return (
    <>
      <PageHead title={title} />
      <div className="card">
        <p className="muted">{hasCompany ? "This page is for the owner of your company. You can see your company's record on the home page." : "This page is for the owner of a company. Your account is not linked to one."}</p>
        <p>
          <a href="/">Back</a>
        </p>
      </div>
    </>
  );
}

/** One line at the foot of an owner's page: what is the owner's turn, when it is not this page's own stage. */
function NextUp({ facts, stage }: { facts: Facts; stage: StageId }) {
  const next = nextStep(facts, new Date());
  if (next.stage === stage || !isOwnersTurn(next)) return null;
  return (
    <aside className="card tint" aria-label="What is next" data-testid="next-up">
      <p className="eyebrow">Your next step</p>
      <h2>{next.title}</h2>
      <p>{next.body}</p>
      <p>
        <a className="btn primary" href={next.href}>
          {next.cta}
          <Arrow className="icon" />
        </a>
      </p>
    </aside>
  );
}

const SAYS: Record<StageStatus, string> = { done: "done", current: "your turn", todo: "not started" };

/** The strip itself: pure, so a page that has already read the facts can draw it. */
export function Strip({ status, current }: { status: Record<StageId, StageStatus>; current?: StageId }) {
  return (
    <nav className="strip" aria-label="Your five steps">
      <ol>
        {STAGES.map((s, i) => (
          <li key={s.id} data-status={status[s.id]} data-prev={i > 0 ? status[STAGE_IDS[i - 1]!] : undefined}>
            <a href={s.href} aria-current={current === s.id ? "page" : undefined}>
              <span className="dot" aria-hidden>
                {status[s.id] === "done" ? <Check /> : s.n}
              </span>
              <span>{s.short}</span>
              <span className="sr">, {SAYS[status[s.id]]}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * The frame of an owner's page: the five steps, this page's head, the page, and what to do next if that is somewhere else. A visitor or a
 * person who is not an owner gets the page's own content without the steps (the page decides what to show them before it gets here).
 */
export async function Page({ stage, identity, title, lede, hideNext, children }: { stage: StageId; identity: Identity | null; title: string; lede?: ReactNode; /** The page already points to the next step itself. */ hideNext?: boolean; children: ReactNode }) {
  const e = env as unknown as AppEnv;
  // The steps and the next step are an aid. If reading them fails, the page itself still opens.
  let facts: Facts | null = null;
  if (identity?.companyId && identity.role === "owner" && e.DB) {
    try {
      facts = await loadFacts(e.DB, identity.companyId);
    } catch (err) {
      console.error("journey.facts_failed", err instanceof Error ? err.message : String(err));
    }
  }
  return (
    <>
      {facts ? <Strip status={stageStatuses(facts, new Date())} current={stage} /> : null}
      <PageHead stage={stage} title={title} lede={lede} />
      {children}
      {facts && !hideNext ? <NextUp facts={facts} stage={stage} /> : null}
    </>
  );
}
