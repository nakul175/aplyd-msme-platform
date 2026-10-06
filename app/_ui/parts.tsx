// The parts every page is built from. A page that uses them looks and behaves like the others without repeating the markup, and the
// things a test finds a page by (its h1, its notices' roles and test ids, its links' names) stay where they were.
import type { HTMLAttributes, ReactNode } from "react";
import { env } from "cloudflare:workers";
import { loadFacts } from "../../modules/journey/src/facts.ts";
import { STAGES, STAGE_IDS, isOwnersTurn, nextStep, stageById, stageStatuses } from "../../modules/journey/src/progress.ts";
import type { Facts, NextStep, StageId, StageStatus } from "../../modules/journey/src/progress.ts";
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
          Step {s.n} of {STAGES.length}: {s.short}
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
          <a className="tap" href="/">
            Back
          </a>
        </p>
      </div>
    </>
  );
}

/** One line at the foot of an owner's page: what is the owner's turn, when it is somewhere else and not shown at the top. */
function NextUp({ next }: { next: NextStep }) {
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

/**
 * The owner's turn, shown first, directly under the page head, when it is done on this page (or the page says it belongs here). The button
 * goes to the form on this page that does it, so the one thing to do is on the first screen. It reads the same `nextStep` as the home page
 * and the foot card, so the head and the foot of a page never say different things.
 */
function YourTurn({ next, href }: { next: NextStep; href: string }) {
  return (
    <section className="card tint your-turn" aria-label="Your turn" data-testid="your-turn" data-key={next.key}>
      <p className="eyebrow">Your turn</p>
      <h2>{next.title}</h2>
      <p>{next.body}</p>
      <p>
        <a className="btn primary" href={href}>
          {next.cta}
          <Arrow className="icon" />
        </a>
      </p>
    </section>
  );
}

/** The facts the steps are worked out from, for a signed-in owner; null for anyone else, or when they cannot be read (the page still opens). */
export async function ownerFacts(identity: Identity | null): Promise<Facts | null> {
  const e = env as unknown as AppEnv;
  if (!identity?.companyId || identity.role !== "owner" || !e.DB) return null;
  try {
    return await loadFacts(e.DB, identity.companyId);
  } catch (err) {
    console.error("journey.facts_failed", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Where the owner's turn is shown on a page, or null when nothing is the owner's turn. A page that passes `here` has a place for it: the
 * card goes at the top when it is this page's stage or the page names its rule in `here`. A page that does not pass `here` keeps the card
 * at the foot, and only when the turn is on another stage.
 */
export function turnPlace(next: NextStep | null, stage: StageId, here?: Partial<Record<NextStep["key"], string>>): "top" | "foot" | null {
  if (!next || !isOwnersTurn(next)) return null;
  if (here && (next.stage === stage || Object.hasOwn(here, next.key))) return "top";
  return next.stage === stage ? null : "foot";
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
 * The frame of an owner's page: the five steps, this page's head, the owner's turn when it is on this page, the page, and the owner's turn
 * at the foot when it is somewhere else. A visitor or a person who is not an owner gets the page's own content without the steps (the page
 * decides what to show them before it gets here). A page that has already read the facts passes them, so they are read once.
 */
export async function Page({
  stage,
  identity,
  title,
  lede,
  hideNext,
  facts: given,
  here,
  children,
}: {
  stage: StageId;
  identity: Identity | null;
  title: string;
  lede?: ReactNode;
  /** The page already points to the next step itself. */
  hideNext?: boolean;
  /** The facts, if the page has read them already (`ownerFacts`). */
  facts?: Facts | null;
  /** In-page places for the owner's turn, by the rule that fired: the card at the top links there instead of to the stage's page. */
  here?: Partial<Record<NextStep["key"], string>>;
  children: ReactNode;
}) {
  // The steps and the next step are an aid. If reading them fails, the page itself still opens.
  const facts = given === undefined ? await ownerFacts(identity) : given;
  const now = new Date();
  const next = facts ? nextStep(facts, now) : null;
  const place = hideNext ? null : turnPlace(next, stage, here);
  return (
    <>
      {facts ? <Strip status={stageStatuses(facts, now)} current={stage} /> : null}
      <PageHead stage={stage} title={title} lede={lede} />
      {next && place === "top" ? <YourTurn next={next} href={here?.[next.key] ?? next.href} /> : null}
      {children}
      {next && place === "foot" ? <NextUp next={next} /> : null}
    </>
  );
}
