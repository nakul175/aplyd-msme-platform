# Hosting module: validation

Environment for every result below: a Linux container with two cores and no container daemon, Node v22.22.0, pnpm 11.25.0, 5 October 2026. The agent that wrote the code ran every check. **No person and no separate reviewer agent has reviewed this slice**, and the results of the repository's continuous-integration checks on GitHub were not read by the agent (it was told not to read check results, so none is claimed). The slice is a draft pull request, labelled `needs-human-review`.

## What was run

`pnpm install --frozen-lockfile`, `pnpm build`, then `node scripts/test.mjs pr`. The hosting module has four suites:

| Suite | Tests | What it covers |
| --- | --- | --- |
| hosting/unit/gate | 17 | The environment checks (a real environment name, a weak or repeated secret, a short password, a colon in the user name, `DEMO_ACCESS`, the port and public-host values), the gate's Basic-header parsing and comparison, and which Origin the application is shown. |
| hosting/integration/gateway | 14 | The gateway in front of a stand-in application on loopback: the gate, the open health route and its neighbours behind the gate, the starting state, Origin rewriting, redirects and cookies, a body over the limit (declared at once, streamed, and a declared length with almost no body sent), a down application, open access and its log line, an upgrade request, and hop-by-hop headers. |
| hosting/static/deploy-files | 6 | Text checks of `Dockerfile`, `.dockerignore` and `.do/app.yaml` against the repository's own pins (Node, pnpm, no secret, no copied environment file, the placeholder values the launcher refuses). **A text check, not a build.** |
| hosting/smoke/serve | 6 | The launcher itself (`scripts/serve.mjs`) started against the built application in a child process, and talked to over HTTP: refusal to start, the gate and the health route, signing in behind a TLS-terminating ingress, a cross-site request refused and the next request still served, a body over the limit, and open access with a clean SIGTERM exit. |

43 tests. The platform module's `source-rules` suite gained one test (7 in all) for the header-rule exemption below. The launcher's start-and-stop helper lives in `tests/support/launcher.ts` so another module's smoke or browser layer can start the same launcher (the demonstration does).

## What the first run found

- **The Origin rewrite split a list.** The first version read an Origin header up to a comma, so a crafted `Origin: https://this-host, https://evil.example` would have been rewritten to the site's own origin and passed as same-site. A unit test written for it failed; the code now treats a value that is not one origin as not an origin and leaves it for the application to refuse.
- **Miniflare's own exit handlers.** On SIGTERM Miniflare's handler ended the Node process at once with code 143 and left workerd running. Found by stopping the launcher by hand and listing processes. The launcher removes those handlers after constructing Miniflare and stops in order (gateway, then Worker) with exit code 0; a smoke test pins the exit code, and a check by hand after the change found no workerd process left.
- **The Wrangler dev proxy loses a request after a refusal** (the platform module's validation records it as browser-layer finding 1). The launcher drives Miniflare directly instead; the smoke test sends a cross-site request and then an ordinary one to pin that this launcher does not have the fault. The cause in the dev proxy was not analysed.

## Does the suite catch what it claims to?

Each change was made to the working tree, the hosting unit, integration and static suites were run, and the change was reverted with `git checkout`. 20 changes. The first run caught 18 and let 2 survive; the survivors were a declared body length that was not checked (the streamed check masked it, as it answers 413 too) and hop-by-hop request headers passed on. A test for each was added and both changes now fail. The smoke layer was not run for these changes.

| Change | Failed |
| --- | --- |
| Authorization header passed on to the application | integration, unit |
| Password not checked; user OR password passes | integration, unit |
| Every Origin rewritten as the site's own; listed public hosts ignored | integration, unit |
| Origin with a path or comma accepted | unit |
| `production` allowed as an environment; secret floor of 8 bytes; one repeated character accepted; password floor of 1; colon allowed in the user; open access without being asked | unit (and the deploy-file test for the password floor) |
| Gate applied to the health route; health ignores the starting state; requests served before ready | integration |
| Declared body size not checked; streamed body size not checked | integration |
| Hop-by-hop request headers passed on; upgrade requests accepted; no challenge on a refusal | integration |

What these do not show: the mutations were written by the author of the code and the tests, and are the failures the author thought of. They say nothing about a way of breaking the gate or the proxy that the author did not think of. Timing-safe comparison cannot be shown by a test of this kind and was not.

## Measured, once, on the development machine

- Start: the first health check, made 12 seconds after the launcher started, found it ready. The platform's start time was not measured.
- Idle memory after start (`ps` resident set sizes, one run): the launcher's Node process about 190 MB and workerd about 110 MB.
- The hosting smoke suite takes about 12 seconds for six tests that start the launcher five times.

## Not checked

- **The Dockerfile and the app spec were never built, run or applied.** There is no container daemon in the sandbox and no DigitalOcean credentials. What the platform's builder does with the Dockerfile (corepack, the pnpm install with its seven-day rule, the build's memory use) is unknown.
- **Nothing was deployed.** No address exists. The gate, the health check and the Origin handling were checked on loopback only; how the platform's ingress forwards Host and Origin is assumed (STATUS.md, limit 5).
- **The region.** App Platform's region list was not read as a table; Bangalore was not seen in the one summary the agent saw. Check the console.
- **Cloudflare's own D1** is not what runs here (STATUS.md, limit 6).
- **The cost figures** ($5.00 and $10.00 a month for the 512 MiB and 1 GiB fixed containers) come from DigitalOcean's pricing page read on 5 October 2026. They are not in `docs/sources.md` and have not been confirmed against an invoice.
- **Rate limits, lockout, log shipping, alerting.** None exists.

## Final run

`node scripts/test.mjs pr --update-baseline` on the final code of this branch, 5 October 2026, run once: **58 of 58 suites passed, none failed** (491 tests across the 55 suites that report a count; the other three are `tsc`, the documentation check and `drizzle-kit check`). The runner recorded baselines for the hosting module (new: 43 tests in 4 suites) and the platform module (`static/source-rules` from 6 to 7); the other modules' baselines were not changed, because their counts did not change. The run took about 10 and a half minutes on two cores.

An earlier run of the same command, before this file existed, passed 57 and failed 1: the documentation check, because the handover linked to this file. It is mentioned so the record shows a failure and what it was.
