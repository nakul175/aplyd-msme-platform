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

## Deploy readiness, 6 October 2026

Done by the deploy-readiness agent on branch `ops-11-deploy-readiness`, base `b741f59`, for the move of the live host to `main`. **No person and no separate reviewer agent has reviewed it.** Environment: a Linux machine with two cores shared with nine other agents' work, 8 GB, Node v22.22.0, pnpm 11.25.0, no container daemon (`docker` is installed but its daemon is not running) and no route to Docker Hub (a proxy answers 403), so the image itself was not built. The scripts that ran the checks below are not in the repository.

### Clean build and start

What was run, in this order, in a clean copy of the commit (`git archive`, then the paths `.dockerignore` excludes removed: `docs`, `.github`, `reports`, `sources`, `coverage`, `.claude` and every `tests` directory): `corepack prepare pnpm@11.25.0` into an empty corepack home (0.7 seconds, needs the registry), `pnpm install --frozen-lockfile` with an empty package store, `pnpm build`, then `node scripts/serve.mjs` with `NODE_ENV=production`, `APLYD_ENV=synthetic`, test values invented for `SESSION_SECRET`, `DEMO_USER` and `DEMO_PASSWORD` (none real), ports 9461 and 9462. The install and the build ran in the copy that had no `docs` and no `tests`; the build and the launcher did not need them. The copy ran as the same user as the agent (root), not as the image's `node` user: files written during the run were checked, and only the temporary directory was written to (see the second table). Whether App Platform honours `.dockerignore` was not checked.

| Step | Result |
| --- | --- |
| Install, empty store, 210 packages, 725 MB in the store | 10.1 s, no release-age or build-script refusal; the install's own message: "Lockfile passes supply-chain policies"; the build scripts of esbuild and workerd ran. Largest single process 829 MB resident |
| Build (`vinext build`) | 8.3 s. Largest single process 929 MB resident |
| Start, gated, demonstration on, idle machine (load average 2) | gateway listening 1.05 s; `/healthz` 200 at 5.28 s; "demonstration was added: 5 companies, 3 providers, 68 requests" |
| Start, open access, demonstration on, busy machine (load average 6.9) | listening 1.2 s; `/healthz` 200 at 8.04 s |
| Start, gated, no demonstration, idle machine (load average 0.02) | listening 0.47 s; `/healthz` 200 at 2.2 s |

Resident memory (`ps -o rss`, summed over the launcher's Node process and workerd; the second figure counts shared pages once, from `/proc/<pid>/smaps_rollup`), megabytes:

| Run | Highest during start | 3 s after ready | 60 s after ready | After a browse | Highest during the browse |
| --- | --- | --- | --- | --- | --- |
| Gated, demonstration on | not sampled | 337 (286) | 277 (223) | 297 (243) | 295 (241) |
| Open, demonstration on | 345 (288) | 345 (289) | 300 (244) | 319 (262) | 317 (261) |
| Gated, no demonstration | 306 (279) | 311 (284) | 273 (246) | 301 (273) | 290 (263) |

The browse: sign in as SYNTHETIC Owner A, then Describe, Diagnose, Procure, Deliver, Run, `/demo` (when on) and `/api/health`, three rounds, then sign in as the operator and open `/operator` (26 requests with the demonstration, 23 without). All answered 200. The first request after ready (`/sign-in`) took 119, 71 and 50 ms; the second 28, 40 and 14 ms. Median page 68, 62 and 24 ms; slowest 230, 326 and 56 ms. With the demonstration on, the Node process held 150 to 222 MB and workerd 123 to 145 MB. SIGTERM ended each run with exit code 0 in about 100 ms and left no process. Every process started was ended.

**Does it fit the plan's 1 GiB?** Yes, with room: at the highest, 345 MB resident for both processes (about a third of 1 GiB) [Certain for these processes on this machine; Likely on App Platform, whose own overhead and the way it counts memory were not measured]. The 512 MiB size would probably hold (67 % at the highest) but is tight for a presentation [Guessing].

The database is not in memory. Each start wrote a Miniflare directory (`miniflare-<random>`, about 1.4 MB, SQLite files for the database and a cache) under the temporary directory, and it was still there after a clean SIGTERM exit. Nothing was written to the application's own directories, so a read-only application directory would not stop it [Likely; the run was as root, so a permission error on a path outside what was listed would not have shown].

### Behaviours the status page claims, run against the launcher

56 checks (a script that started the launcher and talked to it over HTTP, with raw requests so that Host and Origin could be set). 55 matched the claim. The one that did not is the second finding below.

- `/healthz` answers 200 `ok` without credentials, also for HEAD and with a query string, with `cache-control: no-store`. `POST /healthz`, `/healthz/`, `/HEALTHZ`, `//healthz` and `/healthz/x` are behind the gate (401).
- Every other path answers 401 without credentials, with `WWW-Authenticate: Basic realm="APLYD synthetic demonstration"`: 12 paths (including `/`, `/sign-in`, `/api/health`, `/demo`, a static path, a path that does not exist), and `POST`, `PUT`, `DELETE`, `PATCH`, `OPTIONS`.
- 401 for a wrong password, a wrong user, an empty password, no colon, a user in another case, the password with one character added or removed, `Bearer`, a malformed Basic value and `Basic` alone. The Basic scheme name is accepted in lower case. The right pair gives 200 on `/sign-in`, `/`, `/api/health` (`{"status":"ok","database":"ok","auditGuard":"ok"}`) and `/demo`.
- Origin and Host: an Origin of `https://<Host>` is accepted for sign-in (303, cookie `HttpOnly; Secure; SameSite=Lax; Max-Age=28800`); another site's Origin, `null`, and a comma list are refused (403 `cross_site_refused`); `X-Forwarded-Host` is not trusted; a request with no Origin at all is accepted (303); an `http` Origin with the same host is accepted. An ingress that rewrites Host to an internal name while the browser's Origin is the public host is refused until `APLYD_PUBLIC_HOSTS` names it; then it is accepted, a second listed host with a port and mixed case works, an unlisted host and a listed name on another port are still refused.
- A body over 256 KB is refused (413). An upgrade request is closed with no answer.
- A restart is a reset: a provider entered as the operator was on `/operator`; after SIGTERM (exit 0) and a start with the same settings it was gone, and the demonstration was added again with the same counts (5, 3, 68). Without `APLYD_DEMO`, `/demo` answers 404.
- The launcher refuses to start (exit 2, problems listed, the secret not printed) with no settings at all, with the spec's `REPLACE_ME` placeholders, with a short password, with `APLYD_ENV=production`, and with `DEMO_ACCESS=open` together with a gate.

### What could not be reproduced or was found different

1. **"The database is in memory"** (the status page, the launcher's header, the Dockerfile's comment, section 2 of the status page's limits). It is a SQLite file in the temporary directory, left behind after exit. The reset on restart is real (new directory each start); the words were wrong. Corrected in the status page, the launcher's header and the Dockerfile.
2. **A dead Worker is not repaired.** After killing workerd, `/healthz` answered 503 `application not answering` within 2.5 s and every other page 502, as claimed, but the launcher stayed running 7.5 s later. Only a platform health check on `/healthz` makes the platform restart the container, and the live app uses the default check (the sponsor's report). Not changed in code: a watchdog that exits the launcher would reset a live demonstration on a false alarm, and the health check is the platform's job. In the runbook, section 19.3.
3. **"Ready within about 12 seconds"** was taken on a busy machine. 2.2 to 8.0 seconds here. Not a contradiction; the old figure is kept above in this file.
4. **A session survives a restart** (the runbook said "Likely; not observed"): a cookie issued before the restart was accepted after it, signed in as Company A, with the demonstration reseeded. Now observed.
5. **The application's 64 KB body limit** is not applied to `POST /api/session`: a 100 KB form body was passed through by the gateway (under its own 256 KB limit) and answered 303. Not a hosting fault; the application's route is another module's.
6. **Not reproduced because it needs the platform:** that the platform's ingress forwards Host and Origin as assumed; that the health check reaches `/healthz` over HTTP on port 8080; the platform's start time and build memory; the first build's 2 minutes 11 seconds; the region; the cost.

### The commit on `/healthz`

New in this pass. `APLYD_COMMIT` (7 to 64 hexadecimal characters; anything else is ignored with a line in the log, never a refusal to start) is shown by `/healthz` as a second line `commit <id>`, or `commit unknown`. The Dockerfile declares `ARG APLYD_COMMIT` and `ENV APLYD_COMMIT` after the build, so a new commit does not redo the install and build. `.do/app.yaml` sets `APLYD_COMMIT` to `${_self.COMMIT_HASH}` as a run-time value; DigitalOcean's documentation says its bindable variables are available at run time only for a Dockerfile build (not run). The route that carries the commit is the one route outside the gate: a commit id is shown to anyone who can reach the address [Likely low risk; the sponsor decides]. `.do/app.yaml` also gained `APLYD_DEMO: "true"`, as the live app has.

Tests added: 1 unit (18 in all: the accepted and ignored values, including a newline and a template placeholder), 1 integration (15: the second line in every state, none when not given, nothing on any other path), 1 smoke (7: a given commit, none given, a value that is not a commit id), 2 static (8: the spec's run-time variable and the Dockerfile's order, and the demonstration switch; the old assertion on the spec's literal values now allows exactly `"true"` and `${_self.COMMIT_HASH}` as well as `synthetic` and `REPLACE_ME`, so a real-looking secret still fails it). Four changes were made on purpose and each failed the test written for it: the gateway printing no commit, the commit check accepting any string, the spec's variable renamed, the Dockerfile's `ARG` before the build.

Run on 6 October 2026: `node scripts/test.mjs static` 28 of 28 suites passed (via the heavy queue, including `static/typecheck`, `static/documentation`, `static/traceability`, `static/test-docs`); `node scripts/test.mjs static unit integration smoke --only hosting/unit/gate,hosting/static/deploy-files,hosting/integration/gateway,hosting/smoke/serve`: 18, 15, 8 and 7 tests passed, none failed (smoke 22 seconds, against `pnpm build` of this commit); the baselines in `tests/baseline.json` were updated by the runner to those counts. `node scripts/test.mjs pr --guard` was not run, as the brief forbids it. The documentation findings register quotes text of the status page (FND-197, FND-199); the status page keeps it as quoted history so the register's own check stays green.

### Not checked in this pass

- The image: no Docker build, no non-root run (`USER node`), no `HEALTHCHECK` run, no image size. The `chown -R` after the build copies the whole install into a new layer, so the image is larger than it needs to be [Likely]; it does not affect the running container.
- Anything on DigitalOcean: the live spec, the console wording, rollback behaviour, what the platform serves while a deploy fails, whether the build honours `.dockerignore`, whether `${_self.COMMIT_HASH}` is filled as documented.
- GitHub's run logs (forbidden to the token available; only run lists and step timings were read).
- A run of the full guard on this branch.

## Hosting fixes, 6 October 2026 (wave 2)

Done by agent O of the second wave on branch `ops-12-hosting-fixes`, base `696640e`. **No person and no separate reviewer agent has reviewed it.** Environment: Linux, two cores shared with nine other agents' work, 8 GB, Node v22.22.0, no container daemon. The scripts that ran the scratch proofs and the mutation checks below are not in the repository.

### What changed, and the finding each answers

| Finding | Change | Tests added |
| --- | --- | --- |
| S3-05: `DEMO_USER` left as `REPLACE_ME` started the launcher, although the spec and this page said any of the three stops it | `parseConfig` refuses the literal `REPLACE_ME` (white space round it ignored; a longer real value that merely contains the word is not refused) in `SESSION_SECRET`, `DEMO_USER` and `DEMO_PASSWORD`, each alone, naming the variable | unit 3 (each alone; every one at once and with open access; only the whole word), static 1 (each of the spec's three placeholders alone), smoke 1 (the launcher exits 2 for each alone) |
| S3-04: Miniflare's `MF-Original-URL`, `MF-CF-Blob` and `MF-Route-Override` headers went through the gate to its entry worker | `upstreamHeaders` drops every header whose name starts with `mf-`, in any case | unit 1, integration 1 (sent through a running gateway) |
| S3-09: `.dockerignore` did not list `.dev.vars`, and `COPY . .` would carry a developer's local file into an image | `.dockerignore` lists `.dev.vars`, `.dev.vars.*` and `*.key` (`*.pem` was there) | static 1 (also that `.gitignore` lists `.dev.vars` and the Dockerfile still copies the whole context) |
| S3-06: `check-traceability.mjs` and `check-test-docs.mjs` passed with no requirement rows, and `check-test-docs.mjs` with no test documents | Both fail when the BRD yields fewer than 100 rows (the floor of `docs/static/brd`; each script holds its own copy, see "Needs another owner" in the report), or when the BRD, the FSD (traceability) or any of the seven test documents is missing | the scratch proof below |
| Deploy-readiness pass, difference 2: a dead Worker left the launcher running | A watchdog: once ready, the launcher probes the Worker's `/api/health` every `APLYD_WATCHDOG_SECONDS` (5); after `APLYD_WATCHDOG_PROBES` (6) failures in a row it logs one line and exits 1. 0 probes turns it off. The probe is the gateway's own, now exported (`probeUpstream`); the loop is `watchUpstream` in `gateway.ts` | unit 1 (the two settings), integration 3 (the probe; the loop fires once, only after a run of failures; a thrown probe counts; it can be stopped; 0 does nothing), smoke 1 (a Worker killed with SIGKILL; the launcher exits 1 with one log line; a healthy one is left alone for 4.5 seconds under a 3 probe, 1 second watchdog) |
| Deploy-readiness pass, difference 5: `POST /api/session` does not apply the application's 64 KB body limit | Not changed here: see the report ("Needs another owner") | none |

The static test's comment and the launcher test helper's comment said "in memory"; both now say a SQLite file in a temporary directory. The runbook's other statements that the database is in memory (sections 1, 4.1, 5.1, 8, 10, 11, 14, 16) are corrected, and its sections 4.3, 4.4, 10 and 19 describe the placeholder rule and the watchdog.

### Checks run on 6 October 2026

- `node scripts/test.mjs static unit integration smoke --only hosting/static/deploy-files,hosting/unit/gate,hosting/integration/gateway,hosting/smoke/serve --update-baseline --reason "..."`, after `pnpm build`, both through the heavy queue in one call: **all four passed**: unit/gate 23 (was 18), integration/gateway 19 (was 15), static/deploy-files 10 (was 8), smoke/serve 10 (was 7); the smoke suite took 43 seconds. The runner updated `modules/hosting/tests/baseline.json` to those counts.
- `node scripts/test.mjs static unit integration --only hosting/static/deploy-files,hosting/unit/gate,hosting/integration/gateway,static/documentation,static/traceability,static/test-docs,docs/static/docindex`: 7 of 7 passed.
- `node scripts/test.mjs static --only` the other documentation and platform static suites (`docs/static/*`, `platform/static/source-rules`, `page-lookups`, `conflict-markers`): 12 of 13 passed. The one that failed is `docs/static/lld-sync`, for six lines that are not about this module (`app/diagnose/page.tsx`, `app/deliver/page.tsx` and `app/run/page.tsx` export `metadata`, which the LLD does not list, in two places each). It failed in the same way for those lines before the LLD rows for the hosting files were updated here; the hosting lines it also reported are fixed.
- `node scripts/test.mjs --check-catalogue`: clean, 118 suites in 5 layers.
- A TypeScript check of the hosting module's files only (`tsc --noEmit` on a scratch configuration that extends the repository's and includes `modules/hosting/**/*.ts`, Node types only): no errors. **`pnpm typecheck` for the whole repository was not run** (heavy queue; the integrator's guard runs it).
- `node scripts/check-traceability.mjs` and `node scripts/check-test-docs.mjs` on the real repository: both pass (116 requirements; 623 cases). `node scripts/check-documentation.mjs`: passes.
- `node scripts/test.mjs pr --guard` was not run.

### Does the new code's test catch a change to it?

17 changes were made to the working tree one at a time, the hosting unit, integration and static suites were run, and the file was restored. **All 17 failed a test**: `DEMO_USER` not refused; `SESSION_SECRET` not refused; the placeholder compared without trimming; the placeholder matched as a substring; `mf-` headers kept; the `mf-` match case-sensitive; only `mf-original-url` dropped; `.dev.vars`, `.dev.vars.*` and `*.key` each removed from `.dockerignore`; the watchdog never starting its count again after a good answer; off by one at the limit; ignoring a stop made during a probe; asking again after it fired; a probe that throws counted as healthy; a probe that accepts any status; a default of 60 probes. The smoke suite was not run for these changes. The same limit as before applies: the author of the code wrote them.

### S3-06 proved on scratch copies

Trees were built in the scratch area (not in the repository): `modules/docs/src`, the two scripts, the repository's `docs/`, `git init` and `git add`, with the BRD changed. The old scripts are the ones at `696640e`.

| Tree | Old `check-traceability` | New | Old `check-test-docs` | New |
| --- | --- | --- | --- | --- |
| BRD with no table; no other document | passes, "0 requirements", exit 0 | fails (2 problems: 0 rows, the FSD missing), exit 1 | passes, "0 cases cover 0 requirements", exit 0 | fails (8 problems: 0 rows, the seven test documents missing), exit 1 |
| No BRD file | not run | fails ("the document does not exist"), exit 1 | not run | fails, exit 1 |
| The real BRD cut to 20 rows | fails (hundreds of knock-on lines) | fails with one line: 20 rows read, 100 expected | fails (1522 lines) | fails with one line |
| The real repository | passes | passes | passes | passes |

The first row is the failure the review described. In a copy that holds the other Markdown files the old traceability script already failed, on cited identifiers that nothing defined; the review's tree held only the BRD.

### Run against the launcher by hand

- Where the database is: with `TMPDIR` pointed at an empty scratch directory the launcher wrote one `miniflare-<random>` directory there, holding the D1 database as `d1/miniflare-D1DatabaseObject/<hash>.sqlite` (with its `-wal` and `-shm` files) and a cache database, 680 KB after the demonstration was added. It was still there after the launcher stopped. So the database is a SQLite file in the temporary directory, in a new directory at every start, and not in memory [Certain].
- The watchdog with its defaults: the launcher was started with the demonstration on, the Worker's process was killed with SIGKILL, and the launcher was gone 27 seconds later after logging `The application has not answered its health check 6 times in a row (one probe every 5 seconds). Exiting with code 1 ...` and `Stopping.`; the gateway no longer answered [Certain]. The exit code 1 and the one log line are pinned by the smoke test, with a faster setting.
- A sign-in survives a restart: pinned by a smoke test (a cookie issued by one launch is accepted by the next launch with the same `SESSION_SECRET`, signed in as Company A). It passed [Certain for the launcher on this machine].
- `/healthz` showed `commit <id>` when `APLYD_COMMIT` was set and `commit unknown` when it was not (the existing smoke test, and the same line on this run's launcher).

### Not checked

- **The platform.** That DigitalOcean restarts a container whose main process exits, and how quickly; that the first start after a restart answers within the health check's initial delay; none of it was run. The watchdog's exit code 1 is only as useful as that assumption.
- **A false alarm under load.** The watchdog needs six failed probes in a row (each fails if the Worker does not answer `/api/health` in 2 seconds, or answers anything but 200). That a slow page never causes six in a row on a 1 vCPU container with a viewer clicking was not measured. A Worker that answers 503 on `/api/health` (a missing guard trigger) is also treated as dead.
- **The image.** Still no Docker build; whether App Platform honours `.dockerignore` (so `.dev.vars` stays out) was not checked, and a build from git does not hold the file in any case.
- **The full guard and the whole-repository typecheck** (see above).
- **S3-10** (no limit on wrong attempts at the gate) is unchanged and still listed under the limits in `STATUS.md` (limit 1).
