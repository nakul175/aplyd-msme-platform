import { env } from "cloudflare:workers";
import { isSyntheticEnvironment } from "../../modules/platform/src/env.ts";
import type { AppEnv } from "../../modules/platform/src/env.ts";

export const dynamic = "force-dynamic";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ refused?: string }> }) {
  const e = env as unknown as AppEnv;
  const refused = (await searchParams).refused === "1";

  if (!isSyntheticEnvironment(e) || !e.DB) {
    return (
      <>
        <h1>Sign in</h1>
        <p>Sign-in is not available in this environment.</p>
      </>
    );
  }

  const { results } = await e.DB
    .prepare("SELECT email, display_name, role FROM users WHERE is_synthetic = 1 ORDER BY display_name")
    .all<{ email: string; display_name: string; role: string }>();

  return (
    <>
      <h1>Sign in</h1>
      <p className="muted">Synthetic environment: choose a synthetic user. There is no password.</p>
      {refused ? <p role="alert">That user was not found.</p> : null}
      <form method="post" action="/api/session">
        <p>
          <label htmlFor="email">Synthetic user</label>
          <br />
          <select id="email" name="email" required>
            {results.map((u) => (
              <option key={u.email} value={u.email}>
                {u.display_name} ({u.role})
              </option>
            ))}
          </select>
        </p>
        <button type="submit">Sign in</button>
      </form>
    </>
  );
}
