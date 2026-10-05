# Portability module: validation

Environment for every result below: a Linux container shared with nine other agents, Node v22.22.0, pnpm 11.25.0, Chromium 141 at `/opt/pw-browsers/chromium` through `playwright-core` 1.56.1, 6 October 2026 (IST; the runner stamps the UTC date, 5 October). The agent that wrote the code ran every check here. No person and no separate agent has reviewed this slice. A passing suite here does not make an acceptance case passed.

## Results

Branch `slice-11c-portability`, from b741f59.

| Command | Result |
| --- | --- |
| `pnpm build` | Built; `/export` and `/api/companies/[id]/export` are in the route list |
| `pnpm typecheck` | Passed |
| `node scripts/test.mjs unit static integration browser --only portability/unit/bundle,portability/static/scope,portability/integration/export-api,portability/browser/export --update-baseline --reason "..."` | 4 of 4 suites passed: unit 10, static 7, integration 10, browser 3. These are the baseline |
| `node scripts/test.mjs static --only <every static suite but static/typecheck>` | 28 of 28 passed, before this file and STATUS.md existed (see "Not run, and what fails" for the index) |
| `node scripts/test.mjs unit --only <docs, platform, journey and portability unit suites>` | 21 of 21 passed, the contrast guard (`journey/unit/contrast`, 8) among them |
| `node scripts/test.mjs integration browser --only platform/integration/platform-api,platform/browser/pages,platform/browser/session-and-scope --guard` | 3 of 3 passed (26, 3, 8) |
| `node scripts/test.mjs --check-catalogue` | Clean, 99 suites in 5 layers |

What the suites pin:

- `unit/bundle`: the shape, the format and version, every section present in the file and in its readme, the readme's sentences (the file is the owner's, exporting does not close the account, SYNTHETIC), an empty company, the order (the same rows in reverse give the same text), the counts, no key from the forbidden list at any depth, a field a data layer might add later (a fee, a secret, a pool count, the provider's summary) not copied, and a file name that cannot break the header.
- `integration/export-api` (one Miniflare D1 with the real migrations and seed; A and B given records through the application's own handlers, with the listing fee set to an unusual SYNTHETIC value): owner A gets 200 with the attachment header and counts equal to `COUNT(*)` of each table for A; A's file holds no id, name, address, description or record of B's, no key from the forbidden list and not the fee; owner B asking for A gets the same 404 body as the requirements read and the company read, and so does a company that does not exist, each audited as `company.export.denied`; a member of A is allowed and refused B; the operator is refused A and B, audited with no company; no session, a broken cookie and a deleted user get 401 and write nothing; one success writes exactly one `company.export` with the version and the record count; an empty company gets every section empty; two exports differ only in `exportedAt` and the date in the name; no database gives 503.
- `static/scope`: the route is thin and passes the path id only; the handler's first statement is `authorizeCompanyRead(request, env, requestedId, "company.export.denied")`, the second returns any refusal, the third reads through `allowed.identity`, and the path id is used nowhere else; the reader imports exactly the company-bound data-layer functions and passes each the identity's company; the module, the route and the page hold no SQL and name no table in a query; nothing reaches the provider register, the listing terms, the pools or the audit log; only the export route and `/export` use the module, and no operator or provider route does.
- `browser/export` (the built application in a local Worker, real Chromium): the owner opens `/export` (one main, one h1, one banner), sees the counts and the sentences, clicks "Download your records", and the saved file parses with the documented format, version, company and counts; the same address fetched from the page gives 200, the other company's gives 404; no fee or amount is on the page; a visitor sees one "Sign in" link, no download, and gets 401 from the API; the operator is told they cannot export and gets 404.

## Mutation checks

Each change below was made to the source by hand, the three fast suites were run, and the file was restored with `git checkout`. The number is the count of failing tests in each suite.

| Change | unit | static | integration |
| --- | --- | --- | --- |
| The success audit event renamed | 0 | 1 | 2 |
| The requirements read with another company's id | 0 | 1 | 3 |
| The provider's own summary copied into the file | 3 | 0 | 1 |
| The versions of the description not sorted | 2 | 0 | 1 |
| The success audit write removed | 0 | 1 | 6 |
| A refusal not returned (only 503 returned) | 0 | 1 | 4 |
| The withdrawn flag always false | 2 | 0 | 1 |

Every change was caught by at least one suite.

## A look at the page and the files

With `pnpm build` and `scripts/serve.mjs` on port 9431 with the demonstration cast, screenshots of `/export` were taken at 390 and 1200 pixels wide for an owner, a visitor and the operator (no sideways scroll at 390), and every demonstration owner's file was fetched: each answered 200, held no key from the forbidden list, no number equal to the placeholder fee and no id, address or user id of another company. The screenshots are not kept in the repository. This is one agent looking, not a test with an owner.

## Not run, and what fails

- **Two documentation suites fail on this branch** once this file and STATUS.md exist, and passed before they were added: `docs/static/docindex` (the documentation index must list every Markdown file) and `docs/static/findings` (the findings register must cite every module's STATUS and VALIDATION page). The index and the register belong to another agent this wave, so they are not edited here; the rows they need are in the slice's report.
- Not run: the full guard (`node scripts/test.mjs pr --guard`), the smoke layer, and the integration and browser suites of the other modules. The integrator runs the full guard after merging.
- No person has read the code. No separate agent has reviewed it.
