# Development

Last updated 4 October 2026. Read [AGENTS.md](../AGENTS.md) and [HANDOVER.md](../HANDOVER.md) first.

## Set up

- Node 22.18 or later (the tests are TypeScript run directly by Node) and pnpm 11.25.0 (`corepack enable` picks it up from `package.json`).
- `pnpm install --frozen-lockfile`. The install refuses packages published in the last seven days and runs dependency build scripts only for the packages named in `pnpm-workspace.yaml`.
- Copy `.env.example` to `.dev.vars` and fill the names in. For local work `SESSION_SECRET` can be any long random string. `APLYD_ENV` is set to `local` by the build configuration.
- `pnpm db:local` resets the local database and applies the migrations and the SYNTHETIC seed. `pnpm dev` starts the application at http://localhost:5173.

## Layout

| Path | Holds |
| --- | --- |
| `app/` | The Next.js routes and pages. Thin: they call the module. |
| `modules/<name>/` | One module per writing agent: `src/`, `tests/`, `STATUS.md`, `VALIDATION.md`. Today only `platform`. |
| `worker/` | The Worker entry. |
| `drizzle/` | Migrations. Generated from `modules/platform/src/db/schema.ts` with `pnpm db:generate`; custom SQL with `pnpm db:generate --custom --name <name>`. Applied migrations are never edited. |
| `scripts/` | The test runner, the documentation check, the local database script. |

## Tests

`node scripts/test.mjs <layer ...>` runs layers: `static`, `unit`, `integration`, `smoke`, `browser`. `pr` runs all five. Each suite is a file `modules/<module>/tests/<layer>/<name>.test.ts` run with `node --test`.

| Layer | What it is |
| --- | --- |
| static | Type check, documentation check, source rules (header allow-list, no secrets or build output tracked). |
| unit | Pure functions, no database. |
| integration | The request handlers against a real D1 database (workerd's SQLite through Miniflare), with migrations and seed applied. |
| smoke | The built application running in a local Worker, walked over HTTP. Run `pnpm build` first. |
| browser | The same built application in a local Worker, walked in a real headless Chromium through `playwright-core`: the pages render with the SYNTHETIC banner, sign-in is done through the form, the session cookie is read from the browser, the scope rule and sign-out are checked, and a cross-site post is refused. Run `pnpm build` first. |

- `--guard` fails when a suite is missing, has no baseline, or passes fewer tests than its baseline in `modules/<module>/tests/baseline.json`. A skipped test counts as a failure.
- `--update-baseline --reason "<why>"` is the only way to lower or add a baseline. State the reason.
- `--check-catalogue` fails when a test file sits outside a layer directory or a baseline names a suite that no longer exists.
- Reports go to `reports/` (ignored). Evidence that matters is written into the module's `VALIDATION.md` with its date and limits.

## The browser layer

- The browser suites start the built application in a local Worker (as the smoke layer does) and drive a headless Chromium with `playwright-core`, pinned to 1.56.1. That release matches the Chromium 141 build (Playwright's chromium-1194) in the development container. The seven-day rule in `pnpm-workspace.yaml` applies to it like any other package and was not weakened.
- Nothing downloads a browser. Do not run `playwright install`. The layer picks a browser in this order: the file named by the environment variable `APLYD_CHROMIUM_PATH`; `/opt/pw-browsers/chromium` if it exists (the development container); Google Chrome through Playwright's `chrome` channel (the GitHub Ubuntu runners have it; on a laptop, install Chrome or point `APLYD_CHROMIUM_PATH` at any Chrome or Chromium executable).
- An `APLYD_CHROMIUM_PATH` that names a missing file is an error, not a reason to use another browser. If no browser can be launched, every browser suite fails with a message saying what was tried. They are never skipped, and the runner counts a skip as a failure.
- Each suite file starts one Worker and one browser, gives every test a fresh context with no cookies, and blocks any request to an address other than the application's. The browser and the Worker are closed when a test fails, when a test hangs, and when the test process is killed with a signal. A process killed with SIGKILL cannot clean up; the runner's timeout sends SIGTERM first.
- To see what the Worker printed when a browser test fails, run the suite with `APLYD_BROWSER_DEBUG=1` (and `WRANGLER_LOG=debug` for more). The suites live in `modules/platform/tests/browser/`; the support code is in `modules/platform/tests/support/browser.ts` and `ui.ts`.
- A request the application refuses before it reads the request body (the cross-site refusal) can make the local dev proxy lose the next request. The cross-origin suite works around it and prints how often. Details and a way to reproduce it are in [VALIDATION.md](../modules/platform/VALIDATION.md), browser-layer finding 1.

## Adding a module

Create `modules/<name>/` with `src/`, `tests/<layer>/`, `STATUS.md` and `VALIDATION.md`. Do not edit another module's files; ask its owner. A module that touches identity, data scope, migrations or money is a protected path: label the pull request `needs-human-review`.

## Continuous integration

`documentation-checks` runs on every pull request. `engineering-checks` runs on every pull request that changes more than Markdown or `docs/`: catalogue, install, static suites, build, then unit, integration, smoke and browser with the guard. The browser step uses the Google Chrome already on the runner and downloads nothing. Neither uses secrets, a hosted database or a deployment.
