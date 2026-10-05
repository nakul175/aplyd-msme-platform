import { env } from "cloudflare:workers";
import { isSyntheticEnvironment } from "../../modules/platform/src/env.ts";
import type { AppEnv } from "../../modules/platform/src/env.ts";
import { Arrow } from "../_ui/icons.tsx";
import { Notice, PageHead } from "../_ui/parts.tsx";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function SignIn({ searchParams }: { searchParams: Promise<{ refused?: string; expired?: string }> }) {
  const e = env as unknown as AppEnv;
  const q = await searchParams;
  const refused = q.refused === "1";
  // A form was posted with no valid session (it ended, or the cookie is gone): the platform sent the person here with ?expired=1.
  const expired = q.expired === "1";

  if (!isSyntheticEnvironment(e) || !e.DB) {
    return (
      <div className="narrow">
        <PageHead title="Sign in" />
        <div className="card">
          <p>Sign-in is not available in this environment.</p>
        </div>
      </div>
    );
  }

  const { results } = await e.DB
    .prepare("SELECT email, display_name, role FROM users WHERE is_synthetic = 1 ORDER BY display_name")
    .all<{ email: string; display_name: string; role: string }>();

  return (
    <div className="narrow" style={{ display: "grid", gap: "var(--s-4)" }}>
      <PageHead title="Sign in" lede={<p>Synthetic environment: choose a synthetic user. There is no password.</p>} />
      {expired ? (
        <Notice role="alert" tone="warn" data-testid="expired">
          Your session has ended. Sign in again; what you typed was not saved.
        </Notice>
      ) : null}
      {refused ? (
        <Notice role="alert" tone="danger">
          That user was not found.
        </Notice>
      ) : null}
      <form method="post" action="/api/session" className="card">
        <div className="question">
          <label htmlFor="email" className="label">
            Synthetic user
          </label>
          <select id="email" name="email" required>
            {results.map((u) => (
              <option key={u.email} value={u.email}>
                {u.display_name} ({u.role})
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="primary big">
          Sign in
          <Arrow className="icon" />
        </button>
      </form>
      <section className="card flat" aria-label="Who is who">
        <h2>Who is who</h2>
        <dl className="facts">
          <dt>Owner</dt>
          <dd>Describes a factory and works through the five steps. Sees that company and no other.</dd>
          <dt>Operator</dt>
          <dd>Keeps the list of providers. Never sees a company&rsquo;s record.</dd>
        </dl>
      </section>
    </div>
  );
}
