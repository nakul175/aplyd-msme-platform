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

`node scripts/test.mjs <layer ...>` runs layers: `static`, `unit`, `integration`, `smoke`. `pr` runs all four. Each suite is a file `modules/<module>/tests/<layer>/<name>.test.ts` run with `node --test`.

| Layer | What it is |
| --- | --- |
| static | Type check, documentation check, source rules (header allow-list, no secrets or build output tracked). |
| unit | Pure functions, no database. |
| integration | The request handlers against a real D1 database (workerd's SQLite through Miniflare), with migrations and seed applied. |
| smoke | The built application running in a local Worker, walked over HTTP. Run `pnpm build` first. |

- `--guard` fails when a suite is missing, has no baseline, or passes fewer tests than its baseline in `modules/<module>/tests/baseline.json`. A skipped test counts as a failure.
- `--update-baseline --reason "<why>"` is the only way to lower or add a baseline. State the reason.
- `--check-catalogue` fails when a test file sits outside a layer directory or a baseline names a suite that no longer exists.
- Reports go to `reports/` (ignored). Evidence that matters is written into the module's `VALIDATION.md` with its date and limits.

## Adding a module

Create `modules/<name>/` with `src/`, `tests/<layer>/`, `STATUS.md` and `VALIDATION.md`. Do not edit another module's files; ask its owner. A module that touches identity, data scope, migrations or money is a protected path: label the pull request `needs-human-review`.

## Continuous integration

`documentation-checks` runs on every pull request. `engineering-checks` runs on every pull request that changes more than Markdown or `docs/`: catalogue, install, static suites, build, then unit, integration and smoke with the guard. Neither uses secrets, a hosted database or a deployment.
