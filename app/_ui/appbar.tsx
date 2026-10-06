// The bar at the top of every page: the mark, and who is signed in with the one way to sign out. It reads the session itself, so a page
// does not have to pass it down. A visitor who is not signed in sees the mark only: the sign-in link is on the page, once, where it is
// explained, not repeated up here.
import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import type { AppEnv } from "../../modules/platform/src/env.ts";
import { resolveIdentityFromCookieHeader } from "../../modules/platform/src/identity/resolve.ts";
import { Logo } from "./icons.tsx";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

export async function AppBar() {
  const e = env as unknown as AppEnv;
  const identity = await resolveIdentityFromCookieHeader((await headers()).get("cookie"), e);
  return (
    <header className="appbar">
      <div className="appbar-in">
        <a href="/" className="brand" aria-label="APLYD home">
          <Logo />
          <span>APLYD</span>
          <small>for manufacturers</small>
        </a>
        {identity ? (
          <div className="appbar-end">
            <div className="who">
              <span className="avatar" aria-hidden>
                {initials(identity.displayName)}
              </span>
              <span className="who-text">
                <strong>{identity.displayName}</strong>
                <span>{identity.role}</span>
              </span>
            </div>
            <form method="post" action="/api/session" className="signout">
              <input type="hidden" name="intent" value="sign-out" />
              <button type="submit" className="small">
                Sign out
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </header>
  );
}
