# Platform module: status

Owner: the platform module. Paths: `modules/platform/`, `app/`, `worker/`, `drizzle/`, `scripts/`. Last updated 4 October 2026.

This is slice 1, the walking skeleton. It is application plumbing with no product function: sign-in, one company record, the scope rule, an audit trail, and the test pipeline. Protected paths touched: identity and data scope. A person has not reviewed this code.

## What works

- Synthetic sign-in: a person picks one of three synthetic users (two owners in two companies, one platform operator). The session is a signed cookie that carries only the user id and an expiry.
- Identity comes only from that cookie. Company and role are read from the database on every request. Request headers are never read for identity (a static test enforces the allow-list of headers the code may read).
- The company record: an owner reads their own company. A request for any other company, or a request from the operator, gets 404 and the attempt is written to the audit log. The query is bound to the signed-in person's company, not the id in the URL.
- The audit log is append-only: a database trigger refuses UPDATE and DELETE.
- State-changing requests that another website started are refused.
- Sign-in refuses anywhere `APLYD_ENV` is not local, synthetic or test, and without `SESSION_SECRET`.
- The interface shows a SYNTHETIC banner and tag.
- Test runner with layers, per-module baselines and a guard; CI that runs it; a documentation integrity check.

## Not built

- Real sign-in (OQ-13). Hosted staging and its access layer, and the deployment workflow (needs the sponsor's Cloudflare account and OQ-07).
- Creating or editing a company record. Slice 2 (Describe) does that, as appended revisions, not edits.
- A browser test layer. The supply-chain gate (SBOM and audit).
- Any money, vendor, pooling or aggregate code. The invariants in AGENTS.md about vendor-neutral earnings, certification, selling data and the five-company floor have no code to test yet; each gets its test in the slice that adds the code.

## Known limits

1. Synthetic sign-in has no password. Anyone who can reach a synthetic environment can act as any synthetic user. A hosted environment must sit behind an access layer before anyone else is pointed at it.
2. No rate limit on sign-in attempts.
3. A session cannot be revoked before its eight hours end, except by deleting the user or changing `SESSION_SECRET`. There is no "sign out everywhere".
4. The header allow-list test is a tripwire. It catches the usual ways to read a header; it does not prove no code path trusts one.
5. The seeded company records are read-only by absence of a write path, not by a database rule.
6. Results are in [VALIDATION.md](VALIDATION.md), with their dates and limits.
