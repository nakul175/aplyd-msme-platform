# Hosting module: status

Owner: the hosting module. Paths: `modules/hosting/`, plus three files at the repository root that only it uses: `Dockerfile`, `.dockerignore` and `.do/app.yaml`, and the launcher `scripts/serve.mjs`. Last updated 5 October 2026.

This is slice 8, built on `main` after pull requests #1 to #9 were merged. It lets the built application run on a host that runs a container or a Node process, which is what DigitalOcean App Platform and a Droplet are. **It is a host for the SYNTHETIC demonstration, not a production site.** Nothing here has been deployed: the agent that wrote it had no DigitalOcean credentials and no container daemon.

## Why a launcher, not a plain deployment

The application is a Cloudflare Worker with a D1 database (decision D-06). DigitalOcean has neither a Workers runtime nor D1. `scripts/serve.mjs` therefore runs the same built Worker (`dist/server`, from `pnpm build`) in workerd, the open-source runtime Workers use, through Miniflare, which the test layers already use. The database is Miniflare's D1: SQLite in memory, built from the migrations and the SYNTHETIC seed at every start. In front of it sits a small gateway (`modules/hosting/src/gateway.ts`) that holds the access gate, answers the platform's health check, and hands every other request on.

```
browser --https--> platform ingress --http--> gateway (PORT, 0.0.0.0) --http--> workerd (127.0.0.1, APLYD_UPSTREAM_PORT)
                                                  gate, /healthz, size limit        the application, D1 in memory
```

## What it does

1. **Refuses to start** (exit code 2, every problem listed, the secret never printed) unless: `APLYD_ENV` is `local`, `synthetic` (the default) or `test`; `SESSION_SECRET` is at least 32 bytes and not one repeated character; and a gate is configured: `DEMO_USER` (no colon) and `DEMO_PASSWORD` (12 characters or more), or `DEMO_ACCESS=open` in so many words. Synthetic sign-in lets anyone who can reach the address sign in as any synthetic user, the operator included, so an ungated address is something the person deploying has to ask for.
2. **The gate.** HTTP Basic. User and password are compared as SHA-256 digests with `timingSafeEqual`. Without them every route but `/healthz` answers 401. The gate's `Authorization` header is removed before the request reaches the application.
3. **`/healthz`** answers without the gate, for the platform's health check, and says only `ok` (the application's own `/api/health` answered 200) or not (503, or "starting" while the database is built). It asks the application at most once every two seconds.
4. **Sign-in works behind a TLS-terminating ingress.** The application refuses a state-changing request whose Origin differs from the origin of the URL it is given (cross-site protection). Behind an ingress that URL is the launcher's own `http://` one, so an Origin whose host equals the request's Host is rewritten to the origin the application sees; every other Origin is passed on unchanged and the application refuses it. If the platform rewrites Host, `APLYD_PUBLIC_HOSTS` (comma-separated) names the public host names to treat as this site's own.
5. **A body over 256 KB is refused** (413), declared or streamed, before the application reads it. The application's own limit is 64 KB.
6. **Upgrade requests are closed**; hop-by-hop headers are not passed on; a down application is a plain 502 with no address or error text.
7. **Stops on SIGTERM and SIGINT**: the gateway closes, the Worker's process ends, exit code 0 (Miniflare's own handlers, which exit at once and leave workerd running, are replaced).
8. **A restart is a reset.** There is no way to keep data, by design: the tables are append-only (corrections are new rows), so a demonstration cannot be put back by deleting rows, and rebuilding the database is the only reset that is true to the model.
9. `APLYD_DEMO=true` is read by the launcher and, if `modules/demo/src/seed.ts` exists, calls its `seedDemo(baseUrl)` after the application is up. The demonstration package is a separate slice; without it the launcher stops with a message when `APLYD_DEMO=true`.

## How to deploy it on DigitalOcean App Platform

What a person has to do, because it needs the account owner (sign-in, authorising DigitalOcean to read a private GitHub repository, choosing a region, accepting the cost, typing three secrets):

1. Sign in to DigitalOcean and create an app from GitHub: repository `nakul175/aplyd-msme-platform`, branch `main`. App Platform will find the `Dockerfile`. Authorising DigitalOcean's GitHub application for that repository is a step of this.
2. Or create it from the spec: `doctl apps create --spec .do/app.yaml`, or paste the file into the console's "Edit App Spec".
3. Choose a region and the container size. The spec says `apps-s-1vcpu-1gb-fixed` (1 GiB; see "Cost and size").
4. Set three encrypted run-time values, in place of `REPLACE_ME`: `SESSION_SECRET` (at least 32 random characters, for example `openssl rand -hex 32`), `DEMO_USER` and `DEMO_PASSWORD` (at least 12 characters). While any is still `REPLACE_ME` the container exits at start (the spec's own placeholders are refused by the launcher; a test pins this), so a deploy made too early fails and does not run open.
5. Deploy. The platform builds the image (install and build) and then starts the container; the platform's health check is `/healthz`. On the development machine the launcher was ready within about 12 seconds of starting (the first check, 12 seconds in, found it ready); the platform's own start time was not measured.
6. Open the app's address, give the gate's user and password, and use the application's own sign-in page.

To run the same thing on any machine with Node 22.18 or later: `pnpm install --frozen-lockfile && pnpm build`, then `SESSION_SECRET=… DEMO_USER=… DEMO_PASSWORD=… node scripts/serve.mjs` (it listens on `PORT`, default 8080).

## Cost and size

- DigitalOcean's App Platform pricing page, read on 5 October 2026 (not in `docs/sources.md`; check it again before relying on it): a fixed container with 1 vCPU and 512 MiB is $5.00 a month (`apps-s-1vcpu-0.5gb`) and one with 1 vCPU and 1 GiB is $10.00 a month (`apps-s-1vcpu-1gb-fixed`). The spec uses the second.
- Measured on the development machine, idle after start (one run, `ps` resident set sizes): the launcher's Node process about 190 MB and workerd about 110 MB, about 300 MB together before any page is served. That is why the spec does not use the 512 MiB size: it would leave little room for the runtime, a page render and the platform's own overhead, and the agent could not measure it on the platform. This is a guess about the platform, not a measurement of it.
- The build in the platform's own builder installs every dependency (the build and Miniflare are development dependencies) and builds the application; the platform's build time and memory were not measured.

## Not built, and limits

1. **Not production, and not for real patient or company data.** Synthetic sign-in is the only sign-in (OQ-13 is open). The gate is one shared password for everyone, with no per-person accounts, no lockout and no rate limit on attempts. A password of 12 characters is the least the launcher accepts; its strength is the deployer's choice. Anyone who has it can act as the operator and as every synthetic owner.
2. **Nothing is durable.** The database is in memory. Any restart, redeploy or platform maintenance resets it, and anything a viewer entered is gone. The spec runs one instance, because a second would hold a different database.
3. **Between the platform's ingress and the container the traffic is plain HTTP**, including the gate's password. That leg is the platform's network. The browser's leg is the platform's HTTPS.
4. **The Dockerfile and the app spec have never been built, run or applied.** The sandbox had no container daemon, and no DigitalOcean credentials. What was run: the launcher itself, locally, against the built application (see VALIDATION.md). What the platform's builder does with the Dockerfile (corepack, the pnpm install with its seven-day rule, the build's memory) is unknown. A text test pins the files to the repository's own pins (pnpm, Node, no secrets); it is not a build.
5. **The platform's ingress is assumed**, not observed: that it forwards the browser's Host header, and that the health check goes to `/healthz` over HTTP on the container's port. If it rewrites Host, sign-in is refused as cross-site until `APLYD_PUBLIC_HOSTS` names the public host. The region was not chosen: the pages that list App Platform's regions did not give a table to this agent, and the one summary of them it saw did not list Bangalore; check the console.
6. **It is not Cloudflare.** The runtime is workerd, the same one Workers use, but the database is Miniflare's SQLite, not Cloudflare's D1, and there is no `request.cf`. The review of migration 0014 left open whether Cloudflare's D1 behaves identically for NUL text and BLOB `json_valid`; this launcher does not answer that either.
7. **No hosting-level protection beyond the gate.** No rate limit, no bot protection, no log shipping, no alerting. The gateway logs one line for a refused or failed request (never a header, a body or a credential).
8. **The launcher imports TypeScript directly** (`.ts` from `.mjs`), which Node 22.18 and later do without a flag; the image pins Node 22.22.0. A Node older than 22.18 will not start it.
9. **The header rule exemption.** `modules/platform/tests/static/source-rules.test.ts` now exempts exactly two files, `modules/hosting/src/gate.ts` and `gateway.ts`, from the rule that code reads only allow-listed headers: they run in a Node process in front of the Worker, they read `Authorization` as the gate's own password, and they must pass every other header on. A test fails if anything the Worker runs refers to them. That is an edit to another module's test, and the pull request says so; it touches the identity rule, so the pull request is labelled `needs-human-review`.
10. The demonstration package (`APLYD_DEMO=true`) is not in this slice.
