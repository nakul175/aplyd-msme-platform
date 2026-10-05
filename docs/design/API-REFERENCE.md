# API reference

Version 0.1. 5 October 2026. Status: draft, not reviewed by a person.

This reference lists every HTTP operation of the APLYD MSME platform as it is built (AS BUILT): 30 operations in 24 route files under `app/api`. For each it says who may call it and what everyone else gets, the content types, the request fields and their limits, every response with its error code, the rows and audit entries it writes, and whether repeating it is safe. It also says how the same operation answers a person at a form and a program. Every record the operations handle is SYNTHETIC, and no person has reviewed any of the code or of this text. The pages the browser shows are not operations here: they only read, and they send their forms to these operations (section 5).

How this relates to the other documents: the [BRD](../brd/BRD.md) says what the platform must do, and each entry names the requirements it serves; the [FSD](../fsd/FSD.md) says what the screens and rules do with these operations; the [data dictionary](DATA-DICTIONARY.md) describes the tables they write and the audit events they cause; the [HLD](HLD.md) and [LLD](LLD.md) say how the modules are built; [Security and privacy](SECURITY-AND-PRIVACY.md) holds the threats; the [test cases](../test/TEST-CASES.md) exercise them.

## 1. Operations

One row for each exported method of each route file. Paths have their parameters in braces: `{id}` is a company id, and the other names are given in each entry. The Actor column is who may succeed: a visitor needs no session, a signed-in person is anyone with a valid session, an owner is the owner of the company in the path, a member is any person of that company (the owner included) for a read, and the operator is the platform operator. Section 2.2 defines them.

| ID | Method | Path | Area | Actor |
| --- | --- | --- | --- | --- |
| API-01 | GET | `/api/health` | Platform | visitor |
| API-02 | GET | `/api/session` | Platform | signed-in person |
| API-03 | POST | `/api/session` | Platform | visitor |
| API-04 | GET | `/api/companies/{id}` | Platform | member |
| API-05 | GET | `/api/companies/{id}/factory` | Describe | member |
| API-06 | POST | `/api/companies/{id}/factory/revisions` | Describe | owner |
| API-07 | GET | `/api/companies/{id}/assessments` | Diagnose | member |
| API-08 | POST | `/api/companies/{id}/assessments` | Diagnose | owner |
| API-09 | GET | `/api/companies/{id}/assessments/{aid}` | Diagnose | member |
| API-10 | POST | `/api/companies/{id}/assessments/{aid}/decisions` | Diagnose | owner |
| API-11 | POST | `/api/companies/{id}/assessments/{aid}/signoff` | Diagnose | owner |
| API-12 | GET | `/api/companies/{id}/requirements` | Procure | member |
| API-13 | POST | `/api/companies/{id}/requirements` | Procure | owner |
| API-14 | POST | `/api/companies/{id}/requirements/{rid}/withdraw` | Procure | owner |
| API-15 | POST | `/api/companies/{id}/requirements/{rid}/engagement` | Deploy | owner |
| API-16 | GET | `/api/companies/{id}/engagements` | Deploy | member |
| API-17 | GET | `/api/companies/{id}/engagements/{eid}` | Deploy | member |
| API-18 | POST | `/api/companies/{id}/engagements/{eid}/milestones` | Deploy | owner |
| API-19 | POST | `/api/companies/{id}/engagements/{eid}/events` | Deploy | owner |
| API-20 | GET | `/api/companies/{id}/engagements/{eid}/outcomes` | Run | member |
| API-21 | POST | `/api/companies/{id}/engagements/{eid}/outcomes` | Run | owner |
| API-22 | GET | `/api/providers` | Procure | signed-in person |
| API-23 | GET | `/api/operator/providers` | Procure | operator |
| API-24 | POST | `/api/operator/providers` | Procure | operator |
| API-25 | POST | `/api/operator/providers/{pid}/list` | Procure | operator |
| API-26 | POST | `/api/operator/providers/{pid}/unlist` | Procure | operator |
| API-27 | GET | `/api/operator/listing-terms` | Procure | operator |
| API-28 | POST | `/api/operator/listing-terms` | Procure | operator |
| API-29 | GET | `/api/operator/pools` | Procure | operator |
| API-30 | GET | `/api/companies/{id}/export` | Portability | member |

## 2. Conventions and shared behaviour

### 2.1 Reading an entry

Each operation in section 3 has a heading `API-NN METHOD path`, a table of properties, a table of request fields, a table of responses and an example. The Form post row and column say what a person at a form gets in place of the JSON answer: a redirect, written `303 to` and a page address, or the word JSON when a form is answered with the same JSON as a program. The word none appears where no form is involved. In a response row the Code or body cell holds the exact error code as one code span for any status of 400 or more.

Statements here come from reading the handlers in `modules/*/src/api`, the route files and `modules/platform/src/api/authorize.ts`. The test `modules/docs/tests/static/api-sync.test.ts` checks that every exported method of every route file has an entry and no entry lacks a route, that the form-post marks agree with the pages, that the error codes agree with the codes in the source, that the requirement identifiers exist, and that a table, trigger or index named in the text exists. It cannot check what an entry says about limits, bodies and side effects: that is a reading of the code and nothing has verified it but that reading. [Certain]

### 2.2 Who can call, and the scope rule

| Actor | Who | What they get from an operation they may not use |
| --- | --- | --- |
| visitor | Anyone, with or without a session. The operation reads no session. | Nothing is refused. |
| signed-in person | Anyone with a valid session: an owner, a member or the operator. | A person with no valid session gets 401 `not_signed_in`. |
| owner | A signed-in person whose `users.role` is `owner` and whose company is the one in the path. | Another company's person, and the operator, get 404 `not_found`. A member gets 403 `forbidden`. |
| member | A signed-in person who belongs to the company in the path. For a read, an owner is one. As a role: any `users.role` other than `owner` with a company. None is seeded; the behaviour is tested with a person added by the test. | Reads as the owner does. Every change gets 403 `forbidden`. |
| operator | A signed-in person whose role is `operator` and who has no company. | Anyone else signed in gets 403 `forbidden`, and the refusal is audited. |

The scope rule is the platform's own (`modules/platform/src/identity/scope.ts`). A person reads only their own company. The company id in the path is compared with the caller's company and used for nothing else: every query is bound to the caller's company. Whether the company is another's or does not exist, the answer is the same 404 `not_found` with the same body, and the refusal is written to the audit log with the first 64 characters of the id that was asked for. Owner authority does not override the rule, and the operator has no company, so the operator reads no company's record (BR-ID-03, BR-ID-04). [Certain]

### 2.3 The session cookie

- Name `aplyd_session`. The value is the base64url of a small payload, a full stop, and the base64url of an HMAC-SHA256 over the payload. The payload holds the user id and an expiry, and nothing else. [Certain]
- Attributes: HttpOnly, Secure, SameSite=Lax, Path=/, Max-Age 28800 seconds (8 hours). Clearing it sets Max-Age 0.
- The company and the role are read from the table `users` on every request, so a user who is removed loses access at once. A cookie name sent twice is refused, so a sibling site cannot shadow it.
- The secret must be at least 32 bytes and not one repeated character. Without one nobody can sign in and every cookie is refused, and a call that needs a session answers 401.
- Sign-in works only where `APLYD_ENV` is `local`, `synthetic` or `test`. Reading a valid cookie works wherever the secret is set; it does not look at the environment or at `is_synthetic`.
- Signing out clears the cookie in the browser. The token stays valid until it expires, unless the user is deleted or the secret changes (platform STATUS, limit 3); BR-ID-07 is not built. No header is ever read for identity.

### 2.4 The order of the checks

A change under a company, in this order: (1) a request that another website sent, 403 `cross_site_refused`; (2) no database, 503 `storage_unavailable`; (3) no valid session, 401 `not_signed_in`; (4) a company that is not the caller's, 404 `not_found`, audited; (5) a caller who is not the owner, 403 `forbidden`, audited; (6) the content type, size and syntax of the body, 415, 413 and 400 `bad_request`; (7) the fields, 400 `invalid`; (8) the data, 404 or 409. A read skips (1) and (6) to (7). An operator change runs (1) to (3), then refuses anyone who is not the operator, then (6) to (8). The sign-in operation runs (1), then (6), then its own checks.

Two results follow. A signed-out request with a wrong content type gets 401, not 415, because the body is not looked at until the person is known. And the body of a refused request is read and thrown away, so that the connection can be used again. [Certain]

### 2.5 The cross-site rule

It applies to every method except GET, HEAD and OPTIONS, which here means to every operation that changes something. A request is refused when it carries an `Origin` header that is not the origin of the request itself (scheme, host and port), when the `Origin` cannot be read as an address, or when it carries no `Origin` and its `Sec-Fetch-Site` header is `cross-site`. A request with the right `Origin`, or with neither header (a program such as curl sends neither), passes. This is a second defence after SameSite=Lax on the cookie. A GET is never checked and never changes anything. [Certain]

### 2.6 Bodies

- The media type is compared without regard to case, and parameters such as `charset` are ignored. Two types are read: `application/json` and `application/x-www-form-urlencoded`.
- Most operations read the body with the platform's `takeBody`. A request with no body and no content type is read as empty. A body with no content type, or any other type, gets 415. JSON must be one object: malformed JSON, an empty body with a JSON type, an array, null or a scalar gets 400 `bad_request`. API-03 and API-06 have their own readers and accept only JSON or form, so a request with no content type gets 415 there whatever its body.
- The size bound is 65536 characters, `MAX_BODY_CHARACTERS`. The body is read in pieces and abandoned at four bytes for each character allowed (262144 bytes); a declared `content-length` above that is refused unread; a body that decodes to more than 65536 characters is refused too. The bound is checked between pieces, so a single large piece is held whole before it is checked: it is not a hard cap on memory. All answer 413 `too_large`. API-03 has no bound of its own.
- Unknown fields are ignored. In API-06 a JSON answer with a key that is not a question is refused. Text is trimmed, counted with JavaScript's `length` (UTF-16 units, so an emoji counts as two), and refused if it holds a control character other than tab and newline, or a character that reverses the direction of text or shows nothing. Zero-width joiners are allowed. A form's repeated field name is a list.
- A number may be sent as a JSON number or, for the amounts, figures and fees, as digits in text (the entry says which). A JSON string that is not digits is refused. Fractions are refused.

### 2.7 JSON and form posts

A form post is one whose content type is `application/x-www-form-urlencoded`. Once the person is known and the body is read, a form post is answered with a 303 redirect to the page that sent it, with a short query that says what happened. The query holds fixed words and identifiers, URL-encoded: the id of what was just made, or the assessment id the sender named in the path. It never holds the text of a field, except `fields=` in API-06, which holds question keys checked against the questionnaire. A program (JSON, or no body) gets JSON.

Refusals before that point are always JSON, form or not: 403 cross-site, 503, 401, 404 for a company, 403 forbidden, 413, 415 and 400 `bad_request`. A person at a form whose session has ended therefore sees the JSON of the refusal at the address of the operation (section 6). The Form post column says JSON for those rows.

Field names differ. A form uses short names (`opportunity`, `in_use`, `test`, `due`, `amount`, `a.<key>`), and JSON uses camel case (`opportunityId`, `inUse`, `acceptanceTest`, `dueOn`, `agreedInr`). Each entry lists both. A redirect carries `location` and `cache-control: no-store`, and goes to one of the pages `/`, `/sign-in`, `/factory`, `/diagnose`, `/procure`, `/deliver`, `/run` and `/operator`.

### 2.8 Errors

An error body is JSON: `{"error": "<code>"}`, with `fields` (a map of field name to a sentence) for `invalid`, `latest` for `stale`, and `detail` for `changed`. The code is the part to rely on; the sentences are English and are not a contract. The codes are listed in section 4. A body holds no personal data and no record. The status class says what to do: 400 mend the request, 401 sign in, 403 not allowed, 404 not there (or not yours), 409 the state does not allow it, 413 and 415 change the request, 503 the platform cannot answer. [Certain]

A 404 for another company's record is the same as for a missing one: same status, body and headers. The audit entry is the only difference, and the caller cannot see it (BR-ID-03).

### 2.9 Headers

- The Worker entry adds to every response `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy: same-origin` and `content-security-policy: frame-ancestors 'none'; base-uri 'self'; form-action 'self'`. This is not a full content-security policy (BR-NFR-13).
- A JSON answer carries `content-type: application/json; charset=utf-8` and `cache-control: no-store`. A redirect carries `location` and `cache-control: no-store`. Sign-in and sign-out add `set-cookie`.
- No `access-control-` header is set anywhere in the source, so no other website is permitted to read an answer. [Certain]

### 2.10 What is not described, and what could not be determined

- Methods a route does not export (HEAD, OPTIONS, PUT, PATCH, DELETE, and POST on a read-only path): the answer comes from the framework (vinext) and was not read or run for this document. Not determined.
- A failure the handlers do not catch (a database error that is not one of the named refusals) is thrown and the framework answers; its status and body were not read. A 500 is [Likely]. Not determined.
- In the hosted demonstration a launcher puts a gateway in front of the Worker (`modules/hosting`): an HTTP Basic gate that answers 401 before any operation here is reached, a `/healthz` address, and a body bound of 262144 bytes. It is not part of the Worker and is not described further here. [Likely]
- Versions and stability: there is no version in the paths or headers. The operations may change without notice. [Certain]

## 3. Operations in detail

The entries follow the order of section 1. Examples are SYNTHETIC. Where an example is abridged, the line above it says so.

### API-01 GET /api/health

| Item | Detail |
| --- | --- |
| Purpose | Says whether the database can be reached and every trigger that makes a table append-only or enforces a rule is present, by name and table. It does not read a trigger's body. |
| Serves | BR-OPS-06, BR-NFR-02, BR-NFR-10 |
| Caller | Anyone. No session is read and the answer names no company or person. |
| Everyone else | Nobody is refused. |
| Content types | None sent. The answer is `application/json; charset=utf-8`. |
| Body limit | None. No body is read, and the query string is ignored. |
| Side effects | None. No row and no audit entry. |
| Idempotency | Safe to repeat. The answer changes only if the database does. |
| Form post | no |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| none | none | none | no | No body, no query and no header is read other than the session cookie. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 200 | Body with `status` ok, `database` ok, `auditGuard` ok | The database answered and every required trigger is there. | none |
| 503 | `degraded` | The body is `status` degraded with `database` ok or unavailable (no binding, or the query failed) and `auditGuard` ok, missing (a required trigger is absent) or unknown (no database to ask). | none |

Response 200.

```json
{
  "status": "ok",
  "database": "ok",
  "auditGuard": "ok"
}
```

### API-02 GET /api/session

| Item | Detail |
| --- | --- |
| Purpose | Says who the caller is: the user, the company, the role and the display name, as read from the database on this request. |
| Serves | BR-ID-01 |
| Caller | Any signed-in person: an owner, a member or the operator. |
| Everyone else | A visitor gets 401 `not_signed_in`. There is no 503: a platform with no database or no usable secret cannot resolve a session and answers 401. |
| Content types | None sent. The answer is JSON. |
| Body limit | None. No body is read, and the query string is ignored. |
| Side effects | None. A refusal is not written to the audit log. |
| Idempotency | Safe to repeat. |
| Form post | no |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| none | none | none | no | No body, no query and no header is read other than the session cookie. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 200 | Body with `userId`, `companyId`, `role`, `displayName` | The cookie is valid and the user still exists. `companyId` is null for the operator. | none |
| 401 | `not_signed_in` | No valid session (see section 2.3). | none |

Response 200.

```json
{
  "userId": "user-synthetic-owner-a",
  "companyId": "company-synthetic-a",
  "role": "owner",
  "displayName": "SYNTHETIC Owner A"
}
```

### API-03 POST /api/session

| Item | Detail |
| --- | --- |
| Purpose | Signs in as one of the synthetic users, or, when `intent` is `sign-out`, clears the session cookie in the caller's browser. Real sign-in does not exist (OQ-13). |
| Serves | BR-ID-01, BR-ID-02, BR-ID-06, BR-DATA-01, BR-ID-07 |
| Caller | Anyone. Sign-in finds only a user whose `is_synthetic` is 1, by email. |
| Everyone else | Another website's request: 403 `cross_site_refused`. An address that is not a synthetic user's, or none: 401 `unknown_user`, with nothing written to the audit log (anyone can send it and the log cannot be pruned), only a console warning without the address. A platform that is not in a synthetic environment, or has no database or no usable secret: 503 `sign_in_not_available`. Sign-out has no such refusal. |
| Content types | `application/json` (one JSON object) or `application/x-www-form-urlencoded`, compared without regard to case. Any other type, and a request with no content type, gets 415. |
| Body limit | None in the handler: the body is read in full with `request.json()` or `request.text()`. Only the platform in front of the Worker bounds it [Likely]. See section 6. |
| Side effects | Sign-in: one `audit_events` row, `session.created`, and a `set-cookie` header. Sign-out: a `set-cookie` header that clears the cookie, and one `session.ended` row only if the request carried a valid session. No other table is written. |
| Idempotency | Not idempotent. Every sign-in makes a new token and a `session.created` row. Sign-out can be repeated; the old token stays valid until it expires, so a repeat that still sends it writes another `session.ended` row. |
| Form post | yes. The home page `/` (sign-out) and the page `/sign-in` (sign-in) post here, with fields `email` and `intent`. |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| `email` | `email` | string | to sign in | Trimmed and lower-cased, then matched exactly against `users.email`. No length limit here. Ignored for sign-out. A JSON value that is not a string counts as empty. |
| `intent` | `intent` | string | no | `sign-out` signs out. Any other value, or none, signs in. A JSON value that is not a string counts as empty. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 200 | Body with `signedIn` true | Sign-in succeeded. The `set-cookie` header holds `aplyd_session` (section 2.3). | 303 to `/`, with the same `set-cookie` header |
| 200 | Body with `signedOut` true | `intent` was `sign-out`. The `set-cookie` header clears the cookie, whether or not a session existed. | 303 to `/`, with the clearing `set-cookie` header |
| 400 | `bad_request` | The body cannot be read, or is JSON that is not one object. A JSON body that is empty gets this. | JSON |
| 401 | `unknown_user` | No synthetic user has that address, or the address is empty. | 303 to `/sign-in?refused=1` |
| 403 | `cross_site_refused` | A change that another website sent (section 2.5). Checked first. | JSON |
| 415 | `unsupported_content_type` | The type is not JSON or form, or there is none. | JSON |
| 503 | `sign_in_not_available` | Sign-in only. `APLYD_ENV` is not local, synthetic or test, or there is no database, or the secret is missing, shorter than 32 bytes or one repeated character. | JSON |

Request, JSON.

```json
{
  "email": "owner-a@synthetic.invalid",
  "intent": "sign-in"
}
```

Response 200.

```json
{
  "signedIn": true
}
```

### API-04 GET /api/companies/{id}

| Item | Detail |
| --- | --- |
| Purpose | Reads the caller's own company record. The query is bound to the caller's company, never to the id in the URL. |
| Serves | BR-ID-03, BR-ID-04, BR-ID-06 |
| Caller | A person of the company in the URL, its owner or a member: a signed-in person whose company is that company. |
| Everyone else | Not signed in: 401 `not_signed_in`. Signed in with another company, or as the operator, who has none: 404 `not_found`, the same answer as for a company that does not exist, and an audit entry `company.read.denied` is written. No database bound: 503 `storage_unavailable`. |
| Content types | None sent. The answer is JSON. |
| Body limit | None. No body is read, and the query string is ignored. |
| Side effects | None on success. A refusal writes `company.read.denied`. |
| Idempotency | Safe to repeat. |
| Form post | no |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| `id` (in the path) | same | string | yes | The company id. Compared with the caller's own company; it is never used to look anything up. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 200 | Body with `id`, `name`, `synthetic`, `createdAt` | The id is the caller's company. | none |
| 401 | `not_signed_in` | No valid session: no cookie, a bad or expired token, a user that no longer exists, or a platform with no database or no usable secret. | none |
| 404 | `not_found` | The id is not the caller's company, or the company row is gone. Audit entry `company.read.denied` for the first case. | none |
| 503 | `storage_unavailable` | The platform has no database bound. | none |

Response 200.

```json
{
  "id": "company-synthetic-a",
  "name": "SYNTHETIC Company A",
  "synthetic": true,
  "createdAt": "2026-10-04T00:00:00.000Z"
}
```

### API-05 GET /api/companies/{id}/factory

| Item | Detail |
| --- | --- |
| Purpose | Reads the company's factory description: the latest revision, the latest confirmed one, the newest revisions as a history, and how many were saved. |
| Serves | BR-DESC-02, BR-ID-03 |
| Caller | A person of the company in the URL, its owner or a member: a signed-in person whose company is that company. |
| Everyone else | Not signed in: 401 `not_signed_in`. Signed in with another company, or as the operator, who has none: 404 `not_found`, the same answer as for a company that does not exist, and an audit entry `factory.read.denied` is written. No database bound: 503 `storage_unavailable`. |
| Content types | None sent. The answer is JSON. |
| Body limit | None. No body is read, and the query string is ignored. |
| Side effects | None on success. A refusal writes `factory.read.denied`. |
| Idempotency | Safe to repeat. |
| Form post | no |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| `id` (in the path) | same | string | yes | The company id. Compared with the caller's own company; it is never used to look anything up. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 200 | Body with `questionnaireVersion`, `latest`, `latestConfirmed`, `history`, `revisionsSaved` | The company may have no revision yet: `latest` and `latestConfirmed` are then null, `history` is empty and `revisionsSaved` is 0. `history` lists the newest 100 revisions without their answers; older ones are stored and counted. | none |
| 401 | `not_signed_in` | No valid session: no cookie, a bad or expired token, a user that no longer exists, or a platform with no database or no usable secret. | none |
| 404 | `not_found` | The id is not the caller's company. Audit entry `factory.read.denied`. | none |
| 503 | `storage_unavailable` | The platform has no database bound. | none |

Response 200, abridged (the answers are shortened).

```json
{
  "questionnaireVersion": 1,
  "latest": {
    "revision": 2,
    "createdAt": "2026-10-05T09:42:10.000Z",
    "createdBy": "user-synthetic-owner-a",
    "confirmed": true,
    "questionnaireVersion": 1,
    "answers": {
      "sector": "textiles_garments",
      "products": "SYNTHETIC school uniforms",
      "employees": "10_49",
      "processes": [
        "cutting",
        "packaging"
      ],
      "problems": [
        "late_deliveries",
        "rejects_rework"
      ]
    },
    "note": ""
  },
  "latestConfirmed": {
    "revision": 2,
    "createdAt": "2026-10-05T09:42:10.000Z",
    "createdBy": "user-synthetic-owner-a",
    "confirmed": true,
    "questionnaireVersion": 1,
    "answers": {
      "sector": "textiles_garments"
    },
    "note": ""
  },
  "history": [
    {
      "revision": 2,
      "createdAt": "2026-10-05T09:42:10.000Z",
      "createdBy": "user-synthetic-owner-a",
      "confirmed": true,
      "questionnaireVersion": 1,
      "note": ""
    },
    {
      "revision": 1,
      "createdAt": "2026-10-05T09:30:00.000Z",
      "createdBy": "user-synthetic-owner-a",
      "confirmed": false,
      "questionnaireVersion": 1,
      "note": "first draft"
    }
  ],
  "revisionsSaved": 2
}
```

### API-06 POST /api/companies/{id}/factory/revisions

| Item | Detail |
| --- | --- |
| Purpose | Saves a new revision of the factory description. The body names the revision it starts from; if the latest has moved on, nothing is written. A revision can be a draft or confirmed as accurate. |
| Serves | BR-DESC-01, BR-DESC-02, BR-DESC-03, BR-ID-05, BR-DATA-04 |
| Caller | The owner of the company in the URL: a signed-in person whose role is `owner` and whose company is that company. |
| Everyone else | Another website's request: 403 `cross_site_refused`. Not signed in: 401 `not_signed_in`. Another company's person, or the operator: 404 `not_found` and an audit entry `factory.write.denied`. A member who is not the owner: 403 `forbidden` and an audit entry `factory.write.denied`. No database bound: 503 `storage_unavailable`. |
| Content types | `application/json` or `application/x-www-form-urlencoded` only, compared without regard to case. Any other type, and a request with no content type, gets 415, whether or not there is a body. |
| Body limit | 65536 characters (`MAX_BODY_CHARACTERS` in `modules/factory/src/api/factory.ts`; the longest legitimate description is about 6 KB). Read as in section 2.6; 413 `too_large` above it. |
| Side effects | One `factory_revisions` row (`revision_no` is `basedOn` plus 1) and one `audit_events` row, `factory.revision.created`, in one batch. Nothing is written when the answer is 409. |
| Idempotency | Not idempotent, but a repeat is refused: the same request sent twice gets 409 `stale` the second time, because the latest revision is no longer `basedOn`. The check and the insert are one statement, so two saves from the same starting point cannot both succeed. Each success makes a permanent row, up to 500 for a company. |
| Form post | yes. The page `/factory` posts here, with `based_on`, `note`, `intent` and one `a.<key>` field for each question answered (a repeated name is a many-choice answer). |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| `id` (in the path) | same | string | yes | The company id. Compared with the caller's own company; it is never used to look anything up. |
| `basedOn` | `based_on` | integer, 0 or more | yes | The number of the revision this one starts from; 0 for the first. A form value is read as a number only if it is 1 to 9 digits. Anything else gets 400 `invalid`. |
| `answers` | `a.<key>` | object keyed by question key | yes | Answers to the questions of section 5.2 of the data dictionary. Unknown keys, wrong types, unlisted options, too many choices, over-long text and text with refused characters are refused, with one message for each key in `fields`. Empty text, an empty list and null are dropped. An object that leaves nothing to save is refused (`fields.answers`). In a form, a number arrives as text and is read when it is whole digits. |
| `note` | `note` | string | no | Trimmed; up to 500 characters after trimming; control characters and invisible direction marks are refused. In JSON a value that is not a string gets 400 `bad_request`. |
| `confirm` | `intent` equal to `confirm` | boolean | no | True asks for the revision to be confirmed as accurate. It needs the five required answers: `sector`, `products`, `employees`, `processes`, `problems`. In JSON a value that is not a boolean gets 400 `bad_request`. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 201 | Body with `revision`, `confirmed` | Saved. `confirmed` is true only if it was asked for and every required answer is there. | 303 to `/factory?saved={revision}`, with `&confirmed=1` if confirmed, and `&missing={keys}` when a form asked to confirm and was saved as a draft instead |
| 400 | `invalid` | `basedOn` is not an integer of 0 or more, or the note is too long or has refused characters, or the answers are refused, or (JSON only) a confirmation lacks required answers. The body holds `fields`, a map of key to message. | 303 to `/factory?problem=request` (basedOn), `problem=note`, or `problem=invalid&fields={sorted question keys}` |
| 400 | `bad_request` | The body cannot be read, is not one JSON object, or has a `note` or `confirm` of the wrong type. | JSON |
| 401 | `not_signed_in` | No valid session: no cookie, a bad or expired token, a user that no longer exists, or a platform with no database or no usable secret. | JSON |
| 403 | `cross_site_refused` | A change that another website sent (section 2.5). Checked first, before the session. | JSON |
| 403 | `forbidden` | The caller is a member of the company and not its owner. Audit entry `factory.write.denied`. | JSON |
| 404 | `not_found` | The company in the URL is not the caller's own (the operator has none) or does not exist. Audit entry `factory.write.denied` with the first 64 characters of the id. | JSON |
| 409 | `stale` | The latest revision is not `basedOn`. The body holds `latest`, the number now latest. Nothing is written. | 303 to `/factory?stale=1` |
| 409 | `too_many_revisions` | The company already has 500 revisions (trigger `factory_revisions_limit`). | 303 to `/factory?problem=too_many` |
| 413 | `too_large` | The body is over the limit (see Body limit). | JSON |
| 415 | `unsupported_content_type` | The type is not JSON or form, or there is none. | JSON |
| 503 | `storage_unavailable` | The platform has no database bound. | JSON |

Request, JSON.

```json
{
  "basedOn": 1,
  "answers": {
    "sector": "textiles_garments",
    "products": "SYNTHETIC school uniforms",
    "employees": "10_49",
    "processes": [
      "cutting",
      "packaging"
    ],
    "problems": [
      "late_deliveries"
    ]
  },
  "note": "second pass",
  "confirm": true
}
```

Response 201.

```json
{
  "revision": 2,
  "confirmed": true
}
```

Response 409.

```json
{
  "error": "stale",
  "latest": 3
}
```

Response 400.

```json
{
  "error": "invalid",
  "fields": {
    "sector": "Choose one of the options."
  }
}
```

### API-07 GET /api/companies/{id}/assessments

| Item | Detail |
| --- | --- |
| Purpose | Lists the company's assessments, newest first, with how many items each has and how many have a decision. |
| Serves | BR-DIAG-01, BR-ID-03 |
| Caller | A person of the company in the URL, its owner or a member: a signed-in person whose company is that company. |
| Everyone else | Not signed in: 401 `not_signed_in`. Signed in with another company, or as the operator, who has none: 404 `not_found`, the same answer as for a company that does not exist, and an audit entry `assessment.read.denied` is written. No database bound: 503 `storage_unavailable`. |
| Content types | None sent. The answer is JSON. |
| Body limit | None. No body is read, and the query string is ignored. |
| Side effects | None on success. A refusal writes `assessment.read.denied`. |
| Idempotency | Safe to repeat. |
| Form post | no |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| `id` (in the path) | same | string | yes | The company id. Compared with the caller's own company; it is never used to look anything up. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 200 | Body with `assessments`, an array | Each entry holds `id`, `factoryRevisionNo`, `libraryVersion`, `engineVersion`, `createdAt`, `items` (the count), `decided` (items with at least one decision) and `signedOffAt` (null until signed off). The array is empty for a company with none. | none |
| 401 | `not_signed_in` | No valid session: no cookie, a bad or expired token, a user that no longer exists, or a platform with no database or no usable secret. | none |
| 404 | `not_found` | The id is not the caller's company. Audit entry `assessment.read.denied`. | none |
| 503 | `storage_unavailable` | The platform has no database bound. | none |

Response 200.

```json
{
  "assessments": [
    {
      "id": "aaaaaaaa-0000-4000-8000-000000000001",
      "factoryRevisionNo": 2,
      "libraryVersion": 1,
      "engineVersion": 1,
      "createdAt": "2026-10-05T09:42:10.000Z",
      "items": 4,
      "decided": 2,
      "signedOffAt": null
    }
  ]
}
```

### API-08 POST /api/companies/{id}/assessments

| Item | Detail |
| --- | --- |
| Purpose | Makes an assessment from the newest confirmed description. The same description, library version and engine version always give the same result, so asking again returns the assessment already there. |
| Serves | BR-DIAG-01, BR-DIAG-03, BR-DIAG-04 |
| Caller | The owner of the company in the URL: a signed-in person whose role is `owner` and whose company is that company. |
| Everyone else | Another website's request: 403 `cross_site_refused`. Not signed in: 401 `not_signed_in`. Another company's person, or the operator: 404 `not_found` and an audit entry `assessment.write.denied`. A member who is not the owner: 403 `forbidden` and an audit entry `assessment.write.denied`. No database bound: 503 `storage_unavailable`. |
| Content types | `application/json` (one JSON object) or `application/x-www-form-urlencoded`. The type is compared without regard to case and parameters such as `charset` are ignored. A request with no body and no content type is read as empty. Any other type, or a body with no type, gets 415. The body is not used: no field is read. |
| Body limit | 65536 characters (`MAX_BODY_CHARACTERS`). The body is read in pieces and abandoned at four bytes for each character allowed (262144 bytes); a declared `content-length` above that is refused unread. A body that decodes to more than 65536 characters is refused too. Both answer 413 `too_large`. |
| Side effects | When new: one `assessments` row with a stored copy of the result, and one `audit_events` row, `assessment.created`, in one batch. When it already exists: nothing is written. |
| Idempotency | Idempotent: 201 with `created` true the first time, 200 with `created` false afterwards, with the same `id`. A newer confirmed description makes a new assessment. |
| Form post | yes. The page `/diagnose` posts here with no fields. |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| `id` (in the path) | same | string | yes | The company id. Compared with the caller's own company; it is never used to look anything up. |
| none | none | none | no | The request body is read for its type and size and then ignored. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 200 | Body with `id`, `created` false, `factoryRevisionNo` | An assessment for this description, library and engine already existed. | 303 to `/diagnose?a={id}` |
| 201 | Body with `id`, `created` true, `factoryRevisionNo` | A new assessment was made. | 303 to `/diagnose?a={id}` |
| 400 | `bad_request` | The body cannot be read, or is JSON that is not one object (malformed, empty with a JSON type, an array, null or a scalar). | JSON |
| 401 | `not_signed_in` | No valid session: no cookie, a bad or expired token, a user that no longer exists, or a platform with no database or no usable secret. | JSON |
| 403 | `cross_site_refused` | A change that another website sent (section 2.5). Checked first, before the session. | JSON |
| 403 | `forbidden` | The caller is a member of the company and not its owner. Audit entry `assessment.write.denied`. | JSON |
| 404 | `not_found` | The company in the URL is not the caller's own (the operator has none) or does not exist. Audit entry `assessment.write.denied` with the first 64 characters of the id. | JSON |
| 409 | `no_confirmed_description` | The company has no confirmed revision (the handler checks; trigger `assessments_needs_confirmed_description` is the second guard). | 303 to `/diagnose?needs=confirm` |
| 413 | `too_large` | The body is over the limit (see Body limit). | JSON |
| 415 | `unsupported_content_type` | The content type is not JSON or form, or there is a body and no content type. | JSON |
| 503 | `storage_unavailable` | The platform has no database bound. | JSON |

Response 201.

```json
{
  "id": "aaaaaaaa-0000-4000-8000-000000000001",
  "created": true,
  "factoryRevisionNo": 2
}
```

### API-09 GET /api/companies/{id}/assessments/{aid}

| Item | Detail |
| --- | --- |
| Purpose | Reads one assessment: the stored result, the decision standing on each item, the history of decisions, and the sign-off with a check that its fingerprint still matches. |
| Serves | BR-DIAG-02, BR-DIAG-05, BR-DIAG-09 |
| Caller | A person of the company in the URL, its owner or a member: a signed-in person whose company is that company. |
| Everyone else | Not signed in: 401 `not_signed_in`. Signed in with another company, or as the operator, who has none: 404 `not_found`, the same answer as for a company that does not exist, and an audit entry `assessment.read.denied` is written. No database bound: 503 `storage_unavailable`. |
| Content types | None sent. The answer is JSON. |
| Body limit | None. No body is read, and the query string is ignored. |
| Side effects | None on success. A refusal of the company writes `assessment.read.denied`; an unknown assessment writes nothing. |
| Idempotency | Safe to repeat. The answer changes when decisions are added. |
| Form post | no |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| `id` (in the path) | same | string | yes | The company id. Compared with the caller's own company; it is never used to look anything up. |
| `aid` (in the path) | same | string | yes | The assessment id. An id of more than 64 characters is not looked up and answers 404. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 200 | Body with `id`, `factoryRevisionNo`, `libraryVersion`, `engineVersion`, `createdAt`, `result`, `standing`, `history`, `signoff` | `result` is the stored copy: the ranked `items` and the `leftOut` list, with `synthetic` true. `standing` is the latest decision on each item. `history` lists every decision. `signoff` is null until signed off, else `at`, `note`, `digest` and `digestMatches`, which is false if the digest recomputed from the stored result and decisions differs from the stored one. | none |
| 401 | `not_signed_in` | No valid session: no cookie, a bad or expired token, a user that no longer exists, or a platform with no database or no usable secret. | none |
| 404 | `not_found` | The company is not the caller's (audited), or no assessment of that id exists for the caller's company, or the id is over 64 characters. Another company's assessment looks exactly like a missing one. | none |
| 503 | `storage_unavailable` | The platform has no database bound. | none |

Response 200, abridged (one item, and only some of its keys).

```json
{
  "id": "aaaaaaaa-0000-4000-8000-000000000001",
  "factoryRevisionNo": 2,
  "libraryVersion": 1,
  "engineVersion": 1,
  "createdAt": "2026-10-05T09:42:10.000Z",
  "result": {
    "engine": "rules",
    "engineVersion": 1,
    "libraryVersion": 1,
    "synthetic": true,
    "items": [
      {
        "rank": 1,
        "opportunityId": "digital_job_log",
        "title": "SYNTHETIC title",
        "kind": "non_ai",
        "readiness": {
          "state": "ready",
          "needsFirst": [],
          "toCheck": []
        }
      }
    ],
    "leftOut": []
  },
  "standing": [
    {
      "opportunityId": "digital_job_log",
      "decision": "accept",
      "at": "2026-10-05T09:42:10.000Z",
      "note": ""
    }
  ],
  "history": [
    {
      "at": "2026-10-05T09:42:10.000Z",
      "opportunityId": "digital_job_log",
      "decision": "accept",
      "note": ""
    }
  ],
  "signoff": {
    "at": "2026-10-05T10:05:00.000Z",
    "note": "",
    "digest": "3b1f0c9e5a7d4c2e8f6a0b9d1c3e5f70a2b4c6d8e0f1a3b5c7d9e1f3a5b7c9d1",
    "digestMatches": true
  }
}
```

### API-10 POST /api/companies/{id}/assessments/{aid}/decisions

| Item | Detail |
| --- | --- |
| Purpose | Records the owner's decision on one item of an assessment: accept, defer or reject. A later decision on the same item replaces the earlier one in effect; both are kept. |
| Serves | BR-DIAG-05 |
| Caller | The owner of the company in the URL: a signed-in person whose role is `owner` and whose company is that company. |
| Everyone else | Another website's request: 403 `cross_site_refused`. Not signed in: 401 `not_signed_in`. Another company's person, or the operator: 404 `not_found` and an audit entry `assessment.write.denied`. A member who is not the owner: 403 `forbidden` and an audit entry `assessment.write.denied`. No database bound: 503 `storage_unavailable`. |
| Content types | `application/json` (one JSON object) or `application/x-www-form-urlencoded`. The type is compared without regard to case and parameters such as `charset` are ignored. A request with no body and no content type is read as empty. Any other type, or a body with no type, gets 415. |
| Body limit | 65536 characters (`MAX_BODY_CHARACTERS`). The body is read in pieces and abandoned at four bytes for each character allowed (262144 bytes); a declared `content-length` above that is refused unread. A body that decodes to more than 65536 characters is refused too. Both answer 413 `too_large`. |
| Side effects | One `assessment_events` row (kind `decision`) and one `audit_events` row, `assessment.decision`, in one batch. |
| Idempotency | Not idempotent: every call adds a decision event, up to 200 on one assessment. The standing decision is the latest one. |
| Form post | yes. The page `/diagnose` posts here, with `opportunity`, `decision` and `note`. |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| `id` (in the path) | same | string | yes | The company id. Compared with the caller's own company; it is never used to look anything up. |
| `aid` (in the path) | same | string | yes | The assessment id. |
| `opportunityId` | `opportunity` | string | yes | An item of this assessment, 1 to 80 characters. An id the assessment does not hold gets 400 `invalid` with `fields.opportunityId`. |
| `decision` | `decision` | string | yes | `accept`, `defer` or `reject`. |
| `note` | `note` | string | no | up to 500 characters after trimming; control characters and invisible direction marks are refused. A value that is not a string is refused. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 201 | Body with `ok` true | The decision was recorded. | 303 to `/diagnose?a={aid}&saved={opportunity}` |
| 400 | `invalid` | A field is wrong, or the item is not in this assessment. The body holds `fields`. | 303 to `/diagnose?a={aid}&problem=decision` |
| 400 | `bad_request` | The body cannot be read, or is JSON that is not one object (malformed, empty with a JSON type, an array, null or a scalar). | JSON |
| 401 | `not_signed_in` | No valid session: no cookie, a bad or expired token, a user that no longer exists, or a platform with no database or no usable secret. | JSON |
| 403 | `cross_site_refused` | A change that another website sent (section 2.5). Checked first, before the session. | JSON |
| 403 | `forbidden` | The caller is a member of the company and not its owner. Audit entry `assessment.write.denied`. | JSON |
| 404 | `not_found` | The company is not the caller's (audited), or the assessment does not exist for the caller's company. | 303 to `/diagnose?problem=missing` for the second case |
| 409 | `signed_off` | The assessment is signed off; its decisions are final (trigger `assessment_events_signed_off_is_final`). | 303 to `/diagnose?a={aid}&problem=signed` |
| 409 | `too_many_decisions` | The assessment already has 200 decisions (trigger `assessment_events_decision_limit`). | 303 to `/diagnose?a={aid}&problem=too_many` |
| 413 | `too_large` | The body is over the limit (see Body limit). | JSON |
| 415 | `unsupported_content_type` | The content type is not JSON or form, or there is a body and no content type. | JSON |
| 503 | `storage_unavailable` | The platform has no database bound. | JSON |

Request, JSON.

```json
{
  "opportunityId": "digital_job_log",
  "decision": "accept",
  "note": "start with one line"
}
```

Response 201.

```json
{
  "ok": true
}
```

### API-11 POST /api/companies/{id}/assessments/{aid}/signoff

| Item | Detail |
| --- | --- |
| Purpose | Signs off an assessment: the owner says they have read it and every decision on it is theirs. Every item needs a decision. The answer carries a SHA-256 fingerprint over the assessment id, the result and the standing decisions with their notes. |
| Serves | BR-DIAG-05 |
| Caller | The owner of the company in the URL: a signed-in person whose role is `owner` and whose company is that company. |
| Everyone else | Another website's request: 403 `cross_site_refused`. Not signed in: 401 `not_signed_in`. Another company's person, or the operator: 404 `not_found` and an audit entry `assessment.write.denied`. A member who is not the owner: 403 `forbidden` and an audit entry `assessment.write.denied`. No database bound: 503 `storage_unavailable`. |
| Content types | `application/json` (one JSON object) or `application/x-www-form-urlencoded`. The type is compared without regard to case and parameters such as `charset` are ignored. A request with no body and no content type is read as empty. Any other type, or a body with no type, gets 415. |
| Body limit | 65536 characters (`MAX_BODY_CHARACTERS`). The body is read in pieces and abandoned at four bytes for each character allowed (262144 bytes); a declared `content-length` above that is refused unread. A body that decodes to more than 65536 characters is refused too. Both answer 413 `too_large`. |
| Side effects | One `assessment_events` row (kind `signoff`, with the digest) and one `audit_events` row, `assessment.signed_off`, in one batch. The statement adds nothing if a decision landed after the digest was computed. |
| Idempotency | Once only: a second call gets 409 `already_signed_off`. A sign-off is final. |
| Form post | yes. The page `/diagnose` posts here, with `note`. |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| `id` (in the path) | same | string | yes | The company id. Compared with the caller's own company; it is never used to look anything up. |
| `aid` (in the path) | same | string | yes | The assessment id. |
| `note` | `note` | string | no | up to 500 characters after trimming; control characters and invisible direction marks are refused. A value that is not a string is refused. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 201 | Body with `ok` true, `digest` | Signed off. `digest` is 64 hexadecimal characters. | 303 to `/diagnose?a={aid}&signed=1` |
| 400 | `invalid` | The note is refused. The body holds `fields.note`. | 303 to `/diagnose?a={aid}&problem=note` |
| 400 | `bad_request` | The body cannot be read, or is JSON that is not one object (malformed, empty with a JSON type, an array, null or a scalar). | JSON |
| 401 | `not_signed_in` | No valid session: no cookie, a bad or expired token, a user that no longer exists, or a platform with no database or no usable secret. | JSON |
| 403 | `cross_site_refused` | A change that another website sent (section 2.5). Checked first, before the session. | JSON |
| 403 | `forbidden` | The caller is a member of the company and not its owner. Audit entry `assessment.write.denied`. | JSON |
| 404 | `not_found` | The company is not the caller's (audited), or the assessment does not exist for the caller's company. | 303 to `/diagnose?problem=missing` for the second case |
| 409 | `undecided` | Some item has no decision (trigger `assessment_events_signoff_needs_every_decision`). | 303 to `/diagnose?a={aid}&problem=undecided` |
| 409 | `already_signed_off` | A sign-off exists (index `assessment_events_one_signoff`). | 303 to `/diagnose?a={aid}&problem=signed` |
| 409 | `no_items` | The assessment has no items to sign off (trigger `assessment_events_signoff_needs_an_item`). | 303 to `/diagnose?a={aid}&problem=no_items` |
| 409 | `changed` | A decision was added while the sign-off was being made. The body also holds `detail`, a sentence. Read the assessment again. | 303 to `/diagnose?a={aid}&problem=changed` |
| 413 | `too_large` | The body is over the limit (see Body limit). | JSON |
| 415 | `unsupported_content_type` | The content type is not JSON or form, or there is a body and no content type. | JSON |
| 503 | `storage_unavailable` | The platform has no database bound. | JSON |

Request, JSON.

```json
{
  "note": ""
}
```

Response 201.

```json
{
  "ok": true,
  "digest": "3b1f0c9e5a7d4c2e8f6a0b9d1c3e5f70a2b4c6d8e0f1a3b5c7d9e1f3a5b7c9d1"
}
```

### API-12 GET /api/companies/{id}/requirements

| Item | Detail |
| --- | --- |
| Purpose | Lists the company's requirements, newest first, each with what may be said of its pool of similar companies and the providers listed for it. |
| Serves | BR-PROC-02, BR-PROC-06, BR-GOV-06 |
| Caller | A person of the company in the URL, its owner or a member: a signed-in person whose company is that company. |
| Everyone else | Not signed in: 401 `not_signed_in`. Signed in with another company, or as the operator, who has none: 404 `not_found`, the same answer as for a company that does not exist, and an audit entry `requirement.read.denied` is written. No database bound: 503 `storage_unavailable`. |
| Content types | None sent. The answer is JSON. |
| Body limit | None. No body is read, and the query string is ignored. |
| Side effects | None on success. A refusal writes `requirement.read.denied`. |
| Idempotency | Safe to repeat. Pool counts and providers change as other companies and the operator act. |
| Form post | no |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| `id` (in the path) | same | string | yes | The company id. Compared with the caller's own company; it is never used to look anything up. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 200 | Body with `requirements`, an array | Each entry holds `id`, `assessmentId`, `opportunityId`, `cluster`, `title`, `summary`, `kind`, `createdAt`, `withdrawnAt`, `pool` and `providers`. `pool` is null once withdrawn; otherwise `shown` false with the `floor` (5) when fewer than five companies are in it, or `shown` true with `atLeast`, the largest multiple of five reached. A pool count below five is never shown to anyone (C-04). `providers` lists `id`, `name` and `summary` of each listed provider that serves the item in the cluster, in name order, and is empty once withdrawn. | none |
| 401 | `not_signed_in` | No valid session: no cookie, a bad or expired token, a user that no longer exists, or a platform with no database or no usable secret. | none |
| 404 | `not_found` | The id is not the caller's company. Audit entry `requirement.read.denied`. | none |
| 503 | `storage_unavailable` | The platform has no database bound. | none |

Response 200.

```json
{
  "requirements": [
    {
      "id": "bbbbbbbb-0000-4000-8000-000000000001",
      "assessmentId": "aaaaaaaa-0000-4000-8000-000000000001",
      "opportunityId": "digital_job_log",
      "cluster": "synthetic-cluster-1",
      "title": "SYNTHETIC title",
      "summary": "SYNTHETIC summary",
      "kind": "non_ai",
      "createdAt": "2026-10-05T09:42:10.000Z",
      "withdrawnAt": null,
      "pool": {
        "shown": false,
        "floor": 5
      },
      "providers": [
        {
          "id": "cccccccc-0000-4000-8000-000000000001",
          "name": "SYNTHETIC Provider One",
          "summary": "SYNTHETIC summary"
        }
      ]
    }
  ]
}
```

### API-13 POST /api/companies/{id}/requirements

| Item | Detail |
| --- | --- |
| Purpose | Turns an accepted item of a signed-off assessment into a standard requirement in one cluster, which joins that cluster's pool. |
| Serves | BR-PROC-01 |
| Caller | The owner of the company in the URL: a signed-in person whose role is `owner` and whose company is that company. |
| Everyone else | Another website's request: 403 `cross_site_refused`. Not signed in: 401 `not_signed_in`. Another company's person, or the operator: 404 `not_found` and an audit entry `requirement.write.denied`. A member who is not the owner: 403 `forbidden` and an audit entry `requirement.write.denied`. No database bound: 503 `storage_unavailable`. |
| Content types | `application/json` (one JSON object) or `application/x-www-form-urlencoded`. The type is compared without regard to case and parameters such as `charset` are ignored. A request with no body and no content type is read as empty. Any other type, or a body with no type, gets 415. |
| Body limit | 65536 characters (`MAX_BODY_CHARACTERS`). The body is read in pieces and abandoned at four bytes for each character allowed (262144 bytes); a declared `content-length` above that is refused unread. A body that decodes to more than 65536 characters is refused too. Both answer 413 `too_large`. |
| Side effects | When new: one `requirements` row, with a stored copy of the specification taken from the assessment, and one `audit_events` row, `requirement.created`, in one batch. When it exists: nothing. |
| Idempotency | Idempotent per company, assessment and item: 201 with `created` true, then 200 with `created` false and the cluster it was first made in, which may differ from the one asked for. A form is told so with `problem=already_made`. |
| Form post | yes. The page `/procure` posts here, with `assessment`, `opportunity` and `cluster`. |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| `id` (in the path) | same | string | yes | The company id. Compared with the caller's own company; it is never used to look anything up. |
| `assessmentId` | `assessment` | string | yes | 1 to 64 characters. An assessment of the caller's company. |
| `opportunityId` | `opportunity` | string | yes | 1 to 80 characters. An item of that assessment. |
| `cluster` | `cluster` | string | yes | One of `synthetic-cluster-1`, `synthetic-cluster-2`, `synthetic-cluster-3`. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 200 | Body with `id`, `created` false, `cluster` | One already existed for this assessment and item. | 303 to `/procure?problem=already_made` |
| 201 | Body with `id`, `created` true, `cluster` | A requirement was made. | 303 to `/procure?made={id}` |
| 400 | `invalid` | A field is wrong, or the item is not in that assessment. The body holds `fields`. | 303 to `/procure?problem=request` |
| 400 | `bad_request` | The body cannot be read, or is JSON that is not one object (malformed, empty with a JSON type, an array, null or a scalar). | JSON |
| 401 | `not_signed_in` | No valid session: no cookie, a bad or expired token, a user that no longer exists, or a platform with no database or no usable secret. | JSON |
| 403 | `cross_site_refused` | A change that another website sent (section 2.5). Checked first, before the session. | JSON |
| 403 | `forbidden` | The caller is a member of the company and not its owner. Audit entry `requirement.write.denied`. | JSON |
| 404 | `not_found` | The company is not the caller's (audited), or the assessment does not exist for it. | 303 to `/procure?problem=missing` for the second case |
| 409 | `not_signed_off` | The assessment is not signed off (trigger `requirements_needs_signed_off_assessment`). | 303 to `/procure?problem=not_signed_off` |
| 409 | `not_accepted` | The standing decision on the item is not accept (trigger `requirements_needs_accepted_item`). | 303 to `/procure?problem=not_accepted` |
| 409 | `previously_withdrawn` | A requirement for this item was made and withdrawn; it is not made again. | 303 to `/procure?problem=previously_withdrawn` |
| 413 | `too_large` | The body is over the limit (see Body limit). | JSON |
| 415 | `unsupported_content_type` | The content type is not JSON or form, or there is a body and no content type. | JSON |
| 503 | `storage_unavailable` | The platform has no database bound. | JSON |

Request, JSON.

```json
{
  "assessmentId": "aaaaaaaa-0000-4000-8000-000000000001",
  "opportunityId": "digital_job_log",
  "cluster": "synthetic-cluster-1"
}
```

Response 201.

```json
{
  "id": "bbbbbbbb-0000-4000-8000-000000000001",
  "created": true,
  "cluster": "synthetic-cluster-1"
}
```

### API-14 POST /api/companies/{id}/requirements/{rid}/withdraw

| Item | Detail |
| --- | --- |
| Purpose | Withdraws a requirement. It stays on record, marked withdrawn, and leaves its pool. |
| Serves | BR-PROC-01 |
| Caller | The owner of the company in the URL: a signed-in person whose role is `owner` and whose company is that company. |
| Everyone else | Another website's request: 403 `cross_site_refused`. Not signed in: 401 `not_signed_in`. Another company's person, or the operator: 404 `not_found` and an audit entry `requirement.write.denied`. A member who is not the owner: 403 `forbidden` and an audit entry `requirement.write.denied`. No database bound: 503 `storage_unavailable`. |
| Content types | `application/json` (one JSON object) or `application/x-www-form-urlencoded`. The type is compared without regard to case and parameters such as `charset` are ignored. A request with no body and no content type is read as empty. Any other type, or a body with no type, gets 415. |
| Body limit | 65536 characters (`MAX_BODY_CHARACTERS`). The body is read in pieces and abandoned at four bytes for each character allowed (262144 bytes); a declared `content-length` above that is refused unread. A body that decodes to more than 65536 characters is refused too. Both answer 413 `too_large`. |
| Side effects | One `requirement_events` row (kind `withdraw`) and one `audit_events` row, `requirement.withdrawn`, in one batch. |
| Idempotency | Once only: a second call gets 409 `already_withdrawn`. |
| Form post | yes. The page `/procure` posts here, with `note`. |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| `id` (in the path) | same | string | yes | The company id. Compared with the caller's own company; it is never used to look anything up. |
| `rid` (in the path) | same | string | yes | The requirement id, 1 to 64 characters; a longer one answers 404. |
| `note` | `note` | string | no | up to 500 characters after trimming; control characters and invisible direction marks are refused. A value that is not a string is refused. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 201 | Body with `ok` true | The requirement was withdrawn. | 303 to `/procure?withdrawn=1` |
| 400 | `invalid` | The note is refused. The body holds `fields.note`. | 303 to `/procure?problem=note` |
| 400 | `bad_request` | The body cannot be read, or is JSON that is not one object (malformed, empty with a JSON type, an array, null or a scalar). | JSON |
| 401 | `not_signed_in` | No valid session: no cookie, a bad or expired token, a user that no longer exists, or a platform with no database or no usable secret. | JSON |
| 403 | `cross_site_refused` | A change that another website sent (section 2.5). Checked first, before the session. | JSON |
| 403 | `forbidden` | The caller is a member of the company and not its owner. Audit entry `requirement.write.denied`. | JSON |
| 404 | `not_found` | The company is not the caller's (audited), or the requirement does not exist for it, or the id is over 64 characters. | 303 to `/procure?problem=missing` for the second case |
| 409 | `already_withdrawn` | It was withdrawn before (index `requirement_events_one_withdrawal`). | 303 to `/procure?problem=withdrawn` |
| 409 | `engaged` | A provider has been chosen for it (trigger `requirement_events_not_after_engagement`). | 303 to `/procure?problem=engaged` |
| 413 | `too_large` | The body is over the limit (see Body limit). | JSON |
| 415 | `unsupported_content_type` | The content type is not JSON or form, or there is a body and no content type. | JSON |
| 503 | `storage_unavailable` | The platform has no database bound. | JSON |

Request, JSON.

```json
{
  "note": "no longer needed"
}
```

Response 201.

```json
{
  "ok": true
}
```

### API-15 POST /api/companies/{id}/requirements/{rid}/engagement

| Item | Detail |
| --- | --- |
| Purpose | Chooses one of the listed providers for a requirement, which opens an engagement. The platform does not recommend, certify or vet the provider, and no money moves. |
| Serves | BR-DEPL-01 |
| Caller | The owner of the company in the URL: a signed-in person whose role is `owner` and whose company is that company. |
| Everyone else | Another website's request: 403 `cross_site_refused`. Not signed in: 401 `not_signed_in`. Another company's person, or the operator: 404 `not_found` and an audit entry `engagement.write.denied`. A member who is not the owner: 403 `forbidden` and an audit entry `engagement.write.denied`. No database bound: 503 `storage_unavailable`. |
| Content types | `application/json` (one JSON object) or `application/x-www-form-urlencoded`. The type is compared without regard to case and parameters such as `charset` are ignored. A request with no body and no content type is read as empty. Any other type, or a body with no type, gets 415. |
| Body limit | 65536 characters (`MAX_BODY_CHARACTERS`). The body is read in pieces and abandoned at four bytes for each character allowed (262144 bytes); a declared `content-length` above that is refused unread. A body that decodes to more than 65536 characters is refused too. Both answer 413 `too_large`. |
| Side effects | When new: one `engagements` row (with a copy of the requirement's title and cluster) and one `audit_events` row, `engagement.created`, in one batch. Choosing the same provider again writes nothing. |
| Idempotency | Idempotent for the same provider: 201 with `created` true, then 200 with `created` false. A different provider for a requirement that has an engagement gets 409 `already_engaged`. A form is sent to `/deliver?made=1` either way. |
| Form post | yes. The page `/procure` posts here, with `provider`. |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| `id` (in the path) | same | string | yes | The company id. Compared with the caller's own company; it is never used to look anything up. |
| `rid` (in the path) | same | string | yes | The requirement id, 1 to 64 characters; a longer one answers 404. |
| `providerId` | `provider` | string | yes | 1 to 64 characters. A provider that is listed and serves the requirement's item in its cluster. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 200 | Body with `id`, `created` false | An engagement with this provider already existed. | 303 to `/deliver?made=1` |
| 201 | Body with `id`, `created` true | An engagement was opened. | 303 to `/deliver?made=1` |
| 400 | `invalid` | `providerId` is missing or over 64 characters. The body holds `fields.providerId`. | 303 to `/procure?problem=engage` |
| 400 | `bad_request` | The body cannot be read, or is JSON that is not one object (malformed, empty with a JSON type, an array, null or a scalar). | JSON |
| 401 | `not_signed_in` | No valid session: no cookie, a bad or expired token, a user that no longer exists, or a platform with no database or no usable secret. | JSON |
| 403 | `cross_site_refused` | A change that another website sent (section 2.5). Checked first, before the session. | JSON |
| 403 | `forbidden` | The caller is a member of the company and not its owner. Audit entry `engagement.write.denied`. | JSON |
| 404 | `not_found` | The company is not the caller's (audited), or the requirement does not exist for it, or an id is over 64 characters. | 303 to `/procure?problem=missing` for the second case |
| 409 | `requirement_withdrawn` | The requirement is withdrawn (trigger `engagements_needs_an_open_requirement`). | 303 to `/procure?problem=withdrawn` |
| 409 | `provider_unavailable` | The provider is not listed now, or does not serve this item in this cluster (trigger `engagements_needs_a_listed_provider`). | 303 to `/procure?problem=provider_unavailable` |
| 409 | `already_engaged` | The requirement already has an engagement with another provider (index `engagements_one_per_requirement`). | 303 to `/procure?problem=already_engaged` |
| 413 | `too_large` | The body is over the limit (see Body limit). | JSON |
| 415 | `unsupported_content_type` | The content type is not JSON or form, or there is a body and no content type. | JSON |
| 503 | `storage_unavailable` | The platform has no database bound. | JSON |

Request, JSON.

```json
{
  "providerId": "cccccccc-0000-4000-8000-000000000001"
}
```

Response 201.

```json
{
  "id": "dddddddd-0000-4000-8000-000000000001",
  "created": true
}
```

### API-16 GET /api/companies/{id}/engagements

| Item | Detail |
| --- | --- |
| Purpose | Lists the company's engagements, each with its provider, milestone plan, derived state and totals. |
| Serves | BR-DEPL-02, BR-DEPL-03 |
| Caller | A person of the company in the URL, its owner or a member: a signed-in person whose company is that company. |
| Everyone else | Not signed in: 401 `not_signed_in`. Signed in with another company, or as the operator, who has none: 404 `not_found`, the same answer as for a company that does not exist, and an audit entry `engagement.read.denied` is written. No database bound: 503 `storage_unavailable`. |
| Content types | None sent. The answer is JSON. |
| Body limit | None. No body is read, and the query string is ignored. |
| Side effects | None on success. A refusal writes `engagement.read.denied`. |
| Idempotency | Safe to repeat. |
| Form post | no |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| `id` (in the path) | same | string | yes | The company id. Compared with the caller's own company; it is never used to look anything up. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 200 | Body with `engagements`, an array | Each entry has the shape given for API-17. | none |
| 401 | `not_signed_in` | No valid session: no cookie, a bad or expired token, a user that no longer exists, or a platform with no database or no usable secret. | none |
| 404 | `not_found` | The id is not the caller's company. Audit entry `engagement.read.denied`. | none |
| 503 | `storage_unavailable` | The platform has no database bound. | none |

Response 200.

```json
{
  "engagements": []
}
```

### API-17 GET /api/companies/{id}/engagements/{eid}

| Item | Detail |
| --- | --- |
| Purpose | Reads one engagement: the provider, the milestone plan with each milestone's state and what may be recorded next, and the totals the owner has agreed and recorded. |
| Serves | BR-DEPL-02, BR-DEPL-03 |
| Caller | A person of the company in the URL, its owner or a member: a signed-in person whose company is that company. |
| Everyone else | Not signed in: 401 `not_signed_in`. Signed in with another company, or as the operator, who has none: 404 `not_found`, the same answer as for a company that does not exist, and an audit entry `engagement.read.denied` is written. No database bound: 503 `storage_unavailable`. |
| Content types | None sent. The answer is JSON. |
| Body limit | None. No body is read, and the query string is ignored. |
| Side effects | None on success. A refusal of the company writes `engagement.read.denied`; an unknown engagement writes nothing. |
| Idempotency | Safe to repeat. |
| Form post | no |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| `id` (in the path) | same | string | yes | The company id. Compared with the caller's own company; it is never used to look anything up. |
| `eid` (in the path) | same | string | yes | The engagement id. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 200 | Body with `id`, `requirementId`, `providerId`, `providerName`, `providerSummary`, `title`, `cluster`, `createdAt`, `status`, `planAgreedAt`, `closedAt`, `milestones`, `agreedTotalInr`, `paidTotalInr` | `status` is planning, in_progress, complete or ended_early, worked out from the events. Each milestone holds `id`, `seq`, `title`, `acceptanceTest`, `dueOn`, `agreedInr`, `createdAt`, `state` (planned, delivered, accepted, rejected or paid), `deliveries`, `next` (the kinds that may be recorded now, empty before the plan is agreed and after the close), `paidInr` and `history`. The totals are the owner's own figures; nothing is paid through the platform (D-03). | none |
| 401 | `not_signed_in` | No valid session: no cookie, a bad or expired token, a user that no longer exists, or a platform with no database or no usable secret. | none |
| 404 | `not_found` | The company is not the caller's (audited), or no engagement of that id exists for it. | none |
| 503 | `storage_unavailable` | The platform has no database bound. | none |

Response 200, abridged (one milestone).

```json
{
  "id": "dddddddd-0000-4000-8000-000000000001",
  "requirementId": "bbbbbbbb-0000-4000-8000-000000000001",
  "providerId": "cccccccc-0000-4000-8000-000000000001",
  "providerName": "SYNTHETIC Provider One",
  "providerSummary": "SYNTHETIC summary",
  "title": "SYNTHETIC title",
  "cluster": "synthetic-cluster-1",
  "createdAt": "2026-10-05T09:42:10.000Z",
  "status": "planning",
  "planAgreedAt": null,
  "closedAt": null,
  "milestones": [
    {
      "id": "eeeeeeee-0000-4000-8000-000000000001",
      "seq": 1,
      "title": "First line live",
      "acceptanceTest": "Ten jobs logged in a week",
      "dueOn": "2026-11-15",
      "agreedInr": 50000,
      "createdAt": "2026-10-05T09:42:10.000Z",
      "state": "planned",
      "deliveries": 0,
      "next": [],
      "paidInr": null,
      "history": []
    }
  ],
  "agreedTotalInr": 50000,
  "paidTotalInr": 0
}
```

### API-18 POST /api/companies/{id}/engagements/{eid}/milestones

| Item | Detail |
| --- | --- |
| Purpose | Adds the next milestone to a plan that is not yet agreed, with the test the owner will use to accept it and the price the owner and the provider have agreed outside the platform. |
| Serves | BR-DEPL-02 |
| Caller | The owner of the company in the URL: a signed-in person whose role is `owner` and whose company is that company. |
| Everyone else | Another website's request: 403 `cross_site_refused`. Not signed in: 401 `not_signed_in`. Another company's person, or the operator: 404 `not_found` and an audit entry `engagement.write.denied`. A member who is not the owner: 403 `forbidden` and an audit entry `engagement.write.denied`. No database bound: 503 `storage_unavailable`. |
| Content types | `application/json` (one JSON object) or `application/x-www-form-urlencoded`. The type is compared without regard to case and parameters such as `charset` are ignored. A request with no body and no content type is read as empty. Any other type, or a body with no type, gets 415. |
| Body limit | 65536 characters (`MAX_BODY_CHARACTERS`). The body is read in pieces and abandoned at four bytes for each character allowed (262144 bytes); a declared `content-length` above that is refused unread. A body that decodes to more than 65536 characters is refused too. Both answer 413 `too_large`. |
| Side effects | One `milestones` row (`seq` is the next number) and one `audit_events` row, `milestone.added`, in one batch. |
| Idempotency | Not idempotent: every call adds another milestone, up to 12 in a plan. Nothing stops two milestones with the same title. |
| Form post | yes. The page `/deliver` posts here, with `title`, `test`, `due` and `amount`. |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| `id` (in the path) | same | string | yes | The company id. Compared with the caller's own company; it is never used to look anything up. |
| `eid` (in the path) | same | string | yes | The engagement id. |
| `title` | `title` | string | yes | Trimmed, 1 to 120 characters; refused characters are refused. |
| `acceptanceTest` | `test` | string | yes | Trimmed, 1 to 500 characters. How the owner will decide that the work is done. |
| `dueOn` | `due` | string, YYYY-MM-DD | yes | A real calendar date from 2000 to 2100. |
| `agreedInr` | `amount` | integer, or digits in text | yes | Whole rupees from 1 to 100000000 (₹10,00,00,000). Text of 1 to 9 digits is read as a number. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 201 | Body with `id`, `seq` | The milestone was added. | 303 to `/deliver?saved=milestone` |
| 400 | `invalid` | A field is wrong. The body holds `fields`. | 303 to `/deliver?problem=invalid` |
| 400 | `bad_request` | The body cannot be read, or is JSON that is not one object (malformed, empty with a JSON type, an array, null or a scalar). | JSON |
| 401 | `not_signed_in` | No valid session: no cookie, a bad or expired token, a user that no longer exists, or a platform with no database or no usable secret. | JSON |
| 403 | `cross_site_refused` | A change that another website sent (section 2.5). Checked first, before the session. | JSON |
| 403 | `forbidden` | The caller is a member of the company and not its owner. Audit entry `engagement.write.denied`. | JSON |
| 404 | `not_found` | The company is not the caller's (audited), or the engagement does not exist for it. | 303 to `/deliver?problem=missing` for the second case |
| 409 | `plan_locked` | The plan is agreed; milestones can no longer be added. | 303 to `/deliver?problem=plan_locked` |
| 409 | `closed` | The engagement is closed. | 303 to `/deliver?problem=closed` |
| 409 | `too_many` | The plan already has 12 milestones (trigger `milestones_limit`). | 303 to `/deliver?problem=too_many` |
| 413 | `too_large` | The body is over the limit (see Body limit). | JSON |
| 415 | `unsupported_content_type` | The content type is not JSON or form, or there is a body and no content type. | JSON |
| 503 | `storage_unavailable` | The platform has no database bound. | JSON |

Request, JSON.

```json
{
  "title": "First line live",
  "acceptanceTest": "Ten jobs logged in a week",
  "dueOn": "2026-11-15",
  "agreedInr": 50000
}
```

Response 201.

```json
{
  "id": "eeeeeeee-0000-4000-8000-000000000001",
  "seq": 1
}
```

### API-19 POST /api/companies/{id}/engagements/{eid}/events

| Item | Detail |
| --- | --- |
| Purpose | Records one thing that happened: the plan agreed, a milestone delivered (as the provider said), accepted or rejected against its test, a payment the owner says was made outside the platform, or the engagement closed. |
| Serves | BR-DEPL-03, BR-DEPL-04, BR-DEPL-09 |
| Caller | The owner of the company in the URL: a signed-in person whose role is `owner` and whose company is that company. |
| Everyone else | Another website's request: 403 `cross_site_refused`. Not signed in: 401 `not_signed_in`. Another company's person, or the operator: 404 `not_found` and an audit entry `engagement.write.denied`. A member who is not the owner: 403 `forbidden` and an audit entry `engagement.write.denied`. No database bound: 503 `storage_unavailable`. |
| Content types | `application/json` (one JSON object) or `application/x-www-form-urlencoded`. The type is compared without regard to case and parameters such as `charset` are ignored. A request with no body and no content type is read as empty. Any other type, or a body with no type, gets 415. |
| Body limit | 65536 characters (`MAX_BODY_CHARACTERS`). The body is read in pieces and abandoned at four bytes for each character allowed (262144 bytes); a declared `content-length` above that is refused unread. A body that decodes to more than 65536 characters is refused too. Both answer 413 `too_large`. |
| Side effects | One `engagement_events` row and one `audit_events` row named for the kind (`engagement.plan_agreed`, `engagement.delivered`, `engagement.accepted`, `engagement.rejected`, `engagement.payment_recorded` or `engagement.closed`), in one batch. |
| Idempotency | Not idempotent, but the database allows each event only in its turn: the plan once, a close once, a payment once per milestone, a decision only after a delivery. A repeat gets 409. |
| Form post | yes. The page `/deliver` posts here, with `kind`, `milestone`, `amount` and `note`. |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| `id` (in the path) | same | string | yes | The company id. Compared with the caller's own company; it is never used to look anything up. |
| `eid` (in the path) | same | string | yes | The engagement id. |
| `kind` | `kind` | string | yes | `plan_agreed`, `delivered`, `accepted`, `rejected`, `payment_recorded` or `closed`. |
| `milestoneId` | `milestone` | string | for delivered, accepted, rejected and payment_recorded | 1 to 64 characters. Refused for `plan_agreed` and `closed`, which are about no milestone. |
| `amountInr` | `amount` | integer, or digits in text | for payment_recorded | Whole rupees from 1 to 100000000 (₹10,00,00,000), as the owner says was paid. Refused for any other kind. |
| `note` | `note` | string | no | up to 500 characters after trimming; control characters and invisible direction marks are refused. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 201 | Body with `ok` true | The event was recorded. | 303 to `/deliver?saved={kind}` |
| 400 | `invalid` | A field is wrong, or one is given that the kind does not take. The body holds `fields`. | 303 to `/deliver?problem=invalid` |
| 400 | `bad_request` | The body cannot be read, or is JSON that is not one object (malformed, empty with a JSON type, an array, null or a scalar). | JSON |
| 401 | `not_signed_in` | No valid session: no cookie, a bad or expired token, a user that no longer exists, or a platform with no database or no usable secret. | JSON |
| 403 | `cross_site_refused` | A change that another website sent (section 2.5). Checked first, before the session. | JSON |
| 403 | `forbidden` | The caller is a member of the company and not its owner. Audit entry `engagement.write.denied`. | JSON |
| 404 | `not_found` | The company is not the caller's (audited), or the engagement does not exist for it. | 303 to `/deliver?problem=missing` for the second case |
| 409 | `closed` | The engagement is closed. | 303 to `/deliver?problem=closed` |
| 409 | `already_agreed` | The plan is already agreed. | 303 to `/deliver?problem=already_agreed` |
| 409 | `no_milestones` | The plan has no milestone to agree. | 303 to `/deliver?problem=no_milestones` |
| 409 | `not_agreed` | The plan is not agreed yet, so nothing can be delivered, decided or paid. | 303 to `/deliver?problem=not_agreed` |
| 409 | `wrong_state` | The milestone is not in a state that takes this: delivered only when planned or rejected, accepted or rejected only after a delivery, paid once and only after acceptance. | 303 to `/deliver?problem=wrong_state` |
| 409 | `too_many_deliveries` | The milestone has already been delivered 14 times (trigger `engagement_events_delivery_limit`). | 303 to `/deliver?problem=too_many_deliveries` |
| 413 | `too_large` | The body is over the limit (see Body limit). | JSON |
| 415 | `unsupported_content_type` | The content type is not JSON or form, or there is a body and no content type. | JSON |
| 503 | `storage_unavailable` | The platform has no database bound. | JSON |

Request, JSON.

```json
{
  "kind": "payment_recorded",
  "milestoneId": "eeeeeeee-0000-4000-8000-000000000001",
  "amountInr": 50000,
  "note": "paid by bank transfer"
}
```

Response 201.

```json
{
  "ok": true
}
```

### API-20 GET /api/companies/{id}/engagements/{eid}/outcomes

| Item | Detail |
| --- | --- |
| Purpose | Reads the measurements of one engagement: the baseline, which of the reviews at 30, 90 and 180 days after the first acceptance are due or recorded, the change since baseline, and the next accepted idea that has no requirement yet. |
| Serves | BR-RUN-02, BR-RUN-03, BR-RUN-04 |
| Caller | A person of the company in the URL, its owner or a member: a signed-in person whose company is that company. |
| Everyone else | Not signed in: 401 `not_signed_in`. Signed in with another company, or as the operator, who has none: 404 `not_found`, the same answer as for a company that does not exist, and an audit entry `outcome.read.denied` is written. No database bound: 503 `storage_unavailable`. |
| Content types | None sent. The answer is JSON. |
| Body limit | None. No body is read, and the query string is ignored. |
| Side effects | None on success. A refusal of the company writes `outcome.read.denied`; an unknown engagement writes nothing. |
| Idempotency | Safe to repeat. The review states change with the clock. |
| Form post | no |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| `id` (in the path) | same | string | yes | The company id. Compared with the caller's own company; it is never used to look anything up. |
| `eid` (in the path) | same | string | yes | The engagement id. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 200 | Body with `engagementId`, `title`, `expected`, `baseline`, `firstAcceptedAt`, `canRecordBaseline`, `reviews`, `changeSinceBaseline`, `next` | `expected` is the range the assessment gave for the idea, a SYNTHETIC assumption, or null. `reviews` has three entries, each with `no`, `days`, `dueAt`, `state` (waiting, not_due, due or recorded) and `record` (null, or `at`, `value`, `verdict`, `inUse`, `note`). `changeSinceBaseline` is the latest review's figure less the baseline, or null unless both exist. All figures are typed by the owner; the platform measures nothing. | none |
| 401 | `not_signed_in` | No valid session: no cookie, a bad or expired token, a user that no longer exists, or a platform with no database or no usable secret. | none |
| 404 | `not_found` | The company is not the caller's (audited), or no engagement of that id exists for it. | none |
| 503 | `storage_unavailable` | The platform has no database bound. | none |

Response 200.

```json
{
  "engagementId": "dddddddd-0000-4000-8000-000000000001",
  "title": "SYNTHETIC title",
  "expected": {
    "measure": "Orders delivered late",
    "unit": "percent",
    "low": 10,
    "high": 30,
    "synthetic": true
  },
  "baseline": {
    "value": 40,
    "at": "2026-10-05T09:30:00.000Z",
    "note": ""
  },
  "firstAcceptedAt": "2026-10-05T09:42:10.000Z",
  "canRecordBaseline": false,
  "reviews": [
    {
      "no": 1,
      "days": 30,
      "dueAt": "2026-11-04T09:42:10.000Z",
      "state": "not_due",
      "record": null
    },
    {
      "no": 2,
      "days": 90,
      "dueAt": "2027-01-03T09:42:10.000Z",
      "state": "not_due",
      "record": null
    },
    {
      "no": 3,
      "days": 180,
      "dueAt": "2027-04-03T09:42:10.000Z",
      "state": "not_due",
      "record": null
    }
  ],
  "changeSinceBaseline": null,
  "next": null
}
```

### API-21 POST /api/companies/{id}/engagements/{eid}/outcomes

| Item | Detail |
| --- | --- |
| Purpose | Records a baseline (once, before anything is accepted) or one review (once each, from the day it falls due): a number the owner typed, whether the work did what the assessment expected, and whether it is still in use. |
| Serves | BR-RUN-01, BR-RUN-02 |
| Caller | The owner of the company in the URL: a signed-in person whose role is `owner` and whose company is that company. |
| Everyone else | Another website's request: 403 `cross_site_refused`. Not signed in: 401 `not_signed_in`. Another company's person, or the operator: 404 `not_found` and an audit entry `outcome.write.denied`. A member who is not the owner: 403 `forbidden` and an audit entry `outcome.write.denied`. No database bound: 503 `storage_unavailable`. |
| Content types | `application/json` (one JSON object) or `application/x-www-form-urlencoded`. The type is compared without regard to case and parameters such as `charset` are ignored. A request with no body and no content type is read as empty. Any other type, or a body with no type, gets 415. |
| Body limit | 65536 characters (`MAX_BODY_CHARACTERS`). The body is read in pieces and abandoned at four bytes for each character allowed (262144 bytes); a declared `content-length` above that is refused unread. A body that decodes to more than 65536 characters is refused too. Both answer 413 `too_large`. |
| Side effects | One `outcome_events` row and one `audit_events` row, `outcome.baseline` or `outcome.review`, in one batch. |
| Idempotency | Not idempotent, but each measurement can be recorded once: a repeated baseline gets 409 `baseline_exists`, a repeated review `review_exists`. |
| Form post | yes. The page `/run` posts here, with `kind`, `value`, `review`, `verdict`, `in_use` and `note`. |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| `id` (in the path) | same | string | yes | The company id. Compared with the caller's own company; it is never used to look anything up. |
| `eid` (in the path) | same | string | yes | The engagement id, 1 to 64 characters; a longer one answers 404. |
| `kind` | `kind` | string | yes | `baseline` or `review`. |
| `value` | `value` | integer, or digits in text | yes | Whole number from 0 to 1000000000; text of 1 to 10 digits is read as a number. In the unit of the idea's measure, which the platform does not check. |
| `reviewNo` | `review` | integer | for review | 1, 2 or 3. In JSON it must be a number; the text `1` is refused. Refused for a baseline. |
| `verdict` | `verdict` | string | for review | `met`, `partly` or `not_met`. Refused for a baseline. |
| `inUse` | `in_use` | string | for review | `yes` or `no`. Refused for a baseline. |
| `note` | `note` | string | no | up to 500 characters after trimming; control characters and invisible direction marks are refused. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 201 | Body with `ok` true | The measurement was recorded. | 303 to `/run?saved={kind}` |
| 400 | `invalid` | A field is wrong, or one is given that a baseline does not take. The body holds `fields`. | 303 to `/run?problem=invalid` |
| 400 | `bad_request` | The body cannot be read, or is JSON that is not one object (malformed, empty with a JSON type, an array, null or a scalar). | JSON |
| 401 | `not_signed_in` | No valid session: no cookie, a bad or expired token, a user that no longer exists, or a platform with no database or no usable secret. | JSON |
| 403 | `cross_site_refused` | A change that another website sent (section 2.5). Checked first, before the session. | JSON |
| 403 | `forbidden` | The caller is a member of the company and not its owner. Audit entry `outcome.write.denied`. | JSON |
| 404 | `not_found` | The company is not the caller's (audited), or the engagement does not exist for it, or the id is over 64 characters. | 303 to `/run?problem=missing` for the second case |
| 409 | `baseline_exists` | A baseline was recorded already (trigger `outcome_events_one_baseline_only`). | 303 to `/run?problem=baseline_exists` |
| 409 | `baseline_too_late` | Something is already accepted (trigger `outcome_events_baseline_before_acceptance`). | 303 to `/run?problem=baseline_too_late` |
| 409 | `review_exists` | That review was recorded already (trigger `outcome_events_one_review_each`). | 303 to `/run?problem=review_exists` |
| 409 | `nothing_accepted` | A review needs an accepted milestone (trigger `outcome_events_review_needs_an_acceptance`). | 303 to `/run?problem=nothing_accepted` |
| 409 | `not_due` | The review's day has not come: 30, 90 or 180 days after the first acceptance (trigger `outcome_events_review_is_due`). | 303 to `/run?problem=not_due` |
| 413 | `too_large` | The body is over the limit (see Body limit). | JSON |
| 415 | `unsupported_content_type` | The content type is not JSON or form, or there is a body and no content type. | JSON |
| 503 | `storage_unavailable` | The platform has no database bound. | JSON |

Request, JSON, a review.

```json
{
  "kind": "review",
  "reviewNo": 1,
  "value": 25,
  "verdict": "partly",
  "inUse": "yes",
  "note": ""
}
```

Response 201.

```json
{
  "ok": true
}
```

### API-22 GET /api/providers

| Item | Detail |
| --- | --- |
| Purpose | Lists every provider that is listed now, with what it serves, for any signed-in person. The order is by name and does not depend on when a provider was listed or on anything else about it. |
| Serves | BR-PROC-06, BR-COM-02 |
| Caller | Any signed-in person: an owner, a member or the operator. |
| Everyone else | A visitor gets 401 `not_signed_in`. No database bound: 503 `storage_unavailable`. |
| Content types | None sent. The answer is JSON. |
| Body limit | None. No body is read, and the query string is ignored. |
| Side effects | None. A refusal is not written to the audit log. |
| Idempotency | Safe to repeat. |
| Form post | no |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| none | none | none | no | No body, no query and no header is read other than the session cookie. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 200 | Body with `providers`, an array | Each entry holds `id`, `name`, `summary` and `services`, a list of `opportunityId` and `cluster`. The fee a provider was listed at is not shown here. The array is empty if none is listed. | none |
| 401 | `not_signed_in` | No valid session: no cookie, a bad or expired token, a user that no longer exists, or a platform with no database or no usable secret. | none |
| 503 | `storage_unavailable` | The platform has no database bound. | none |

Response 200.

```json
{
  "providers": [
    {
      "id": "cccccccc-0000-4000-8000-000000000001",
      "name": "SYNTHETIC Provider One",
      "summary": "SYNTHETIC summary",
      "services": [
        {
          "opportunityId": "digital_job_log",
          "cluster": "synthetic-cluster-1"
        }
      ]
    }
  ]
}
```

### API-23 GET /api/operator/providers

| Item | Detail |
| --- | --- |
| Purpose | Reads the provider registry for the operator: every provider, listed or not, with what it serves and the fee it was last listed at, and the listing terms in force. |
| Serves | BR-PROC-04, BR-OPS-01 |
| Caller | The operator: a signed-in person whose role is `operator` and who has no company. |
| Everyone else | Not signed in: 401 `not_signed_in`. Signed in and not the operator (an owner, a member, or anyone with a company): 403 `forbidden` and an audit entry `operator.read.denied` whose requested text is `operator`. No database bound: 503 `storage_unavailable`. |
| Content types | None sent. The answer is JSON. |
| Body limit | None. No body is read, and the query string is ignored. |
| Side effects | None on success. A refusal writes `operator.read.denied`. |
| Idempotency | Safe to repeat. |
| Form post | no |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| none | none | none | no | No body, no query and no header is read other than the session cookie. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 200 | Body with `providers`, `terms` | Each provider holds `id`, `name`, `summary`, `createdAt`, `services`, `listed`, `listedFeeInr` and `listedAt` (the last two are null unless listed now). `terms` is the fee in force (`version`, `at`, `feeInr`, `note`), or null while the fee is undecided (OQ-11). Providers are in name order. | none |
| 401 | `not_signed_in` | No valid session: no cookie, a bad or expired token, a user that no longer exists, or a platform with no database or no usable secret. | none |
| 403 | `forbidden` | The caller is not the operator. Audit entry `operator.read.denied`, requested `operator`. | none |
| 503 | `storage_unavailable` | The platform has no database bound. | none |

Response 200.

```json
{
  "providers": [
    {
      "id": "cccccccc-0000-4000-8000-000000000001",
      "name": "SYNTHETIC Provider One",
      "summary": "SYNTHETIC summary",
      "createdAt": "2026-10-05T09:30:00.000Z",
      "services": [
        {
          "opportunityId": "digital_job_log",
          "cluster": "synthetic-cluster-1"
        }
      ],
      "listed": true,
      "listedFeeInr": 1500,
      "listedAt": "2026-10-05T09:42:10.000Z"
    }
  ],
  "terms": {
    "version": 1,
    "at": "2026-10-05T09:30:00.000Z",
    "feeInr": 1500,
    "note": "placeholder"
  }
}
```

### API-24 POST /api/operator/providers

| Item | Detail |
| --- | --- |
| Purpose | Enters a provider and what it serves into the registry. It is not listed until the operator lists it. The platform does not vet the provider. |
| Serves | BR-PROC-04, BR-OPS-01 |
| Caller | The operator: a signed-in person whose role is `operator` and who has no company. |
| Everyone else | Another website's request: 403 `cross_site_refused`. Not signed in: 401 `not_signed_in`. Signed in and not the operator: 403 `forbidden` and an audit entry `operator.write.denied` whose requested text is `operator`. No database bound: 503 `storage_unavailable`. |
| Content types | `application/json` (one JSON object) or `application/x-www-form-urlencoded`. The type is compared without regard to case and parameters such as `charset` are ignored. A request with no body and no content type is read as empty. Any other type, or a body with no type, gets 415. |
| Body limit | 65536 characters (`MAX_BODY_CHARACTERS`). The body is read in pieces and abandoned at four bytes for each character allowed (262144 bytes); a declared `content-length` above that is refused unread. A body that decodes to more than 65536 characters is refused too. Both answer 413 `too_large`. |
| Side effects | One `providers` row, one `provider_services` row for each service, and one `audit_events` row, `provider.created`, in one batch. |
| Idempotency | Not idempotent: every call makes a new provider with a new id, even with the same name. Nothing stops duplicates by name. |
| Form post | yes. The page `/operator` posts here, with `name`, `summary` and the repeated fields `opportunity` and `cluster`. |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| `name` | `name` | string | yes | Trimmed, 1 to 100 characters; refused characters are refused. |
| `summary` | `summary` | string | no | Trimmed, up to 300 characters. |
| `services` | `opportunity` and `cluster`, each repeated | array of objects with `opportunityId` and `cluster` | yes | JSON: 1 to 20 objects, each naming a library item and one of the three clusters, each pair once (a repeated pair gets 400 `invalid`). Form: every chosen opportunity is paired with every chosen cluster, repeats dropped, and the number of pairs must be at most 20. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 201 | Body with `id` | The provider was entered. | 303 to `/operator?made={id}` |
| 400 | `invalid` | A field is wrong, or (JSON) a service is named twice. The body holds `fields`. | 303 to `/operator?problem=provider` |
| 400 | `bad_request` | The body cannot be read, or is JSON that is not one object (malformed, empty with a JSON type, an array, null or a scalar). | JSON |
| 401 | `not_signed_in` | No valid session: no cookie, a bad or expired token, a user that no longer exists, or a platform with no database or no usable secret. | JSON |
| 403 | `cross_site_refused` | A change that another website sent (section 2.5). Checked first, before the session. | JSON |
| 403 | `forbidden` | The caller is not the operator. Audit entry `operator.write.denied`, requested `operator`. | JSON |
| 413 | `too_large` | The body is over the limit (see Body limit). | JSON |
| 415 | `unsupported_content_type` | The content type is not JSON or form, or there is a body and no content type. | JSON |
| 503 | `storage_unavailable` | The platform has no database bound. | JSON |

Request, JSON.

```json
{
  "name": "SYNTHETIC Provider One",
  "summary": "SYNTHETIC summary",
  "services": [
    {
      "opportunityId": "digital_job_log",
      "cluster": "synthetic-cluster-1"
    }
  ]
}
```

Response 201.

```json
{
  "id": "cccccccc-0000-4000-8000-000000000001"
}
```

### API-25 POST /api/operator/providers/{pid}/list

| Item | Detail |
| --- | --- |
| Purpose | Lists a provider, at the one fee in force for every provider. The body is read for a note and nothing else: any fee it names is ignored (D-03). |
| Serves | BR-PROC-05, BR-GOV-02, BR-OPS-01 |
| Caller | The operator: a signed-in person whose role is `operator` and who has no company. |
| Everyone else | Another website's request: 403 `cross_site_refused`. Not signed in: 401 `not_signed_in`. Signed in and not the operator: 403 `forbidden` and an audit entry `operator.write.denied` whose requested text is `operator`. No database bound: 503 `storage_unavailable`. |
| Content types | `application/json` (one JSON object) or `application/x-www-form-urlencoded`. The type is compared without regard to case and parameters such as `charset` are ignored. A request with no body and no content type is read as empty. Any other type, or a body with no type, gets 415. |
| Body limit | 65536 characters (`MAX_BODY_CHARACTERS`). The body is read in pieces and abandoned at four bytes for each character allowed (262144 bytes); a declared `content-length` above that is refused unread. A body that decodes to more than 65536 characters is refused too. Both answer 413 `too_large`. |
| Side effects | One `provider_events` row (kind `list`, with the terms version and fee read inside the statement) and one `audit_events` row, `provider.listed`, in one batch. |
| Idempotency | Not idempotent: a provider that is listed cannot be listed again (409 `already_listed`). Listing and unlisting must alternate, so a provider can be listed again after being unlisted. |
| Form post | yes. The page `/operator` posts here, with `note`. |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| `pid` (in the path) | same | string | yes | The provider id, 1 to 64 characters; a longer one answers 404. |
| `note` | `note` | string | no | up to 500 characters after trimming; control characters and invisible direction marks are refused. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 201 | Body with `ok` true, `feeInr` | The provider was listed. `feeInr` is the fee on the new row, in whole rupees. | 303 to `/operator?listed=1` |
| 400 | `invalid` | The note is refused. The body holds `fields.note`. | 303 to `/operator?problem=note` |
| 400 | `bad_request` | The body cannot be read, or is JSON that is not one object (malformed, empty with a JSON type, an array, null or a scalar). | JSON |
| 401 | `not_signed_in` | No valid session: no cookie, a bad or expired token, a user that no longer exists, or a platform with no database or no usable secret. | JSON |
| 403 | `cross_site_refused` | A change that another website sent (section 2.5). Checked first, before the session. | JSON |
| 403 | `forbidden` | The caller is not the operator. Audit entry `operator.write.denied`, requested `operator`. | JSON |
| 404 | `not_found` | No provider has that id, or it is over 64 characters. | 303 to `/operator?problem=missing` |
| 409 | `fee_undecided` | No listing terms exist yet (OQ-11); nothing can be listed. | 303 to `/operator?problem=fee_undecided` |
| 409 | `no_service` | The provider serves nothing (trigger `provider_events_list_needs_a_service`). The operations above always give a provider a service, so this is reached only by a direct write [Likely]. | 303 to `/operator?problem=no_service` |
| 409 | `already_listed` | The provider is listed now (trigger `provider_events_alternate`). | 303 to `/operator?problem=already_listed` |
| 413 | `too_large` | The body is over the limit (see Body limit). | JSON |
| 415 | `unsupported_content_type` | The content type is not JSON or form, or there is a body and no content type. | JSON |
| 503 | `storage_unavailable` | The platform has no database bound. | JSON |

Request, JSON.

```json
{
  "note": ""
}
```

Response 201.

```json
{
  "ok": true,
  "feeInr": 1500
}
```

### API-26 POST /api/operator/providers/{pid}/unlist

| Item | Detail |
| --- | --- |
| Purpose | Unlists a provider. Its earlier listing and fee stay on record. |
| Serves | BR-PROC-04 |
| Caller | The operator: a signed-in person whose role is `operator` and who has no company. |
| Everyone else | Another website's request: 403 `cross_site_refused`. Not signed in: 401 `not_signed_in`. Signed in and not the operator: 403 `forbidden` and an audit entry `operator.write.denied` whose requested text is `operator`. No database bound: 503 `storage_unavailable`. |
| Content types | `application/json` (one JSON object) or `application/x-www-form-urlencoded`. The type is compared without regard to case and parameters such as `charset` are ignored. A request with no body and no content type is read as empty. Any other type, or a body with no type, gets 415. |
| Body limit | 65536 characters (`MAX_BODY_CHARACTERS`). The body is read in pieces and abandoned at four bytes for each character allowed (262144 bytes); a declared `content-length` above that is refused unread. A body that decodes to more than 65536 characters is refused too. Both answer 413 `too_large`. |
| Side effects | One `provider_events` row (kind `unlist`) and one `audit_events` row, `provider.unlisted`, in one batch. |
| Idempotency | Not idempotent: a provider that is not listed gets 409 `not_listed`, so a repeat is refused. |
| Form post | yes. The page `/operator` posts here, with `note`. |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| `pid` (in the path) | same | string | yes | The provider id, 1 to 64 characters; a longer one answers 404. |
| `note` | `note` | string | no | up to 500 characters after trimming; control characters and invisible direction marks are refused. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 201 | Body with `ok` true | The provider was unlisted. | 303 to `/operator?unlisted=1` |
| 400 | `invalid` | The note is refused. The body holds `fields.note`. | 303 to `/operator?problem=note` |
| 400 | `bad_request` | The body cannot be read, or is JSON that is not one object (malformed, empty with a JSON type, an array, null or a scalar). | JSON |
| 401 | `not_signed_in` | No valid session: no cookie, a bad or expired token, a user that no longer exists, or a platform with no database or no usable secret. | JSON |
| 403 | `cross_site_refused` | A change that another website sent (section 2.5). Checked first, before the session. | JSON |
| 403 | `forbidden` | The caller is not the operator. Audit entry `operator.write.denied`, requested `operator`. | JSON |
| 404 | `not_found` | No provider has that id, or it is over 64 characters. | 303 to `/operator?problem=missing` |
| 409 | `not_listed` | The provider is not listed now (trigger `provider_events_alternate`). | 303 to `/operator?problem=not_listed` |
| 413 | `too_large` | The body is over the limit (see Body limit). | JSON |
| 415 | `unsupported_content_type` | The content type is not JSON or form, or there is a body and no content type. | JSON |
| 503 | `storage_unavailable` | The platform has no database bound. | JSON |

Response 201.

```json
{
  "ok": true
}
```

### API-27 GET /api/operator/listing-terms

| Item | Detail |
| --- | --- |
| Purpose | Reads the listing fee in force and every earlier version. |
| Serves | BR-PROC-05, BR-OPS-01 |
| Caller | The operator: a signed-in person whose role is `operator` and who has no company. |
| Everyone else | Not signed in: 401 `not_signed_in`. Signed in and not the operator (an owner, a member, or anyone with a company): 403 `forbidden` and an audit entry `operator.read.denied` whose requested text is `operator`. No database bound: 503 `storage_unavailable`. |
| Content types | None sent. The answer is JSON. |
| Body limit | None. No body is read, and the query string is ignored. |
| Side effects | None on success. A refusal writes `operator.read.denied`. |
| Idempotency | Safe to repeat. |
| Form post | no |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| none | none | none | no | No body, no query and no header is read other than the session cookie. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 200 | Body with `terms`, `history` | `terms` is the latest version (`version`, `at`, `feeInr`, `note`), or null while the fee is undecided (OQ-11). `history` lists every version, newest first. The fee is one number for every provider (D-03). | none |
| 401 | `not_signed_in` | No valid session: no cookie, a bad or expired token, a user that no longer exists, or a platform with no database or no usable secret. | none |
| 403 | `forbidden` | The caller is not the operator. Audit entry `operator.read.denied`, requested `operator`. | none |
| 503 | `storage_unavailable` | The platform has no database bound. | none |

Response 200.

```json
{
  "terms": {
    "version": 1,
    "at": "2026-10-05T09:30:00.000Z",
    "feeInr": 1500,
    "note": "placeholder"
  },
  "history": [
    {
      "version": 1,
      "at": "2026-10-05T09:30:00.000Z",
      "feeInr": 1500,
      "note": "placeholder"
    }
  ]
}
```

### API-28 POST /api/operator/listing-terms

| Item | Detail |
| --- | --- |
| Purpose | Sets the listing fee: a new version, one number in whole rupees for every provider. Earlier versions, and the listings made under them, stay as they were. No fee is decided (OQ-11); the figure of 1500 in the seed data is a placeholder. |
| Serves | BR-PROC-05, BR-GOV-02 |
| Caller | The operator: a signed-in person whose role is `operator` and who has no company. |
| Everyone else | Another website's request: 403 `cross_site_refused`. Not signed in: 401 `not_signed_in`. Signed in and not the operator: 403 `forbidden` and an audit entry `operator.write.denied` whose requested text is `operator`. No database bound: 503 `storage_unavailable`. |
| Content types | `application/json` (one JSON object) or `application/x-www-form-urlencoded`. The type is compared without regard to case and parameters such as `charset` are ignored. A request with no body and no content type is read as empty. Any other type, or a body with no type, gets 415. |
| Body limit | 65536 characters (`MAX_BODY_CHARACTERS`). The body is read in pieces and abandoned at four bytes for each character allowed (262144 bytes); a declared `content-length` above that is refused unread. A body that decodes to more than 65536 characters is refused too. Both answer 413 `too_large`. |
| Side effects | One `listing_terms` row (the next `version`) and one `audit_events` row, `listing_terms.set`, in one batch. |
| Idempotency | Not idempotent: every call makes a new version, even with the same fee. |
| Form post | yes. The page `/operator` posts here, with `feeInr` and `note`. |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| `feeInr` | `feeInr` | integer, or digits in text | yes | Whole rupees from 1 to 10000000 (₹1,00,00,000), a sanity bound and not a proposal. Text of 1 to 8 digits is read as a number. The form field is named `feeInr`, as in JSON. |
| `note` | `note` | string | no | up to 500 characters after trimming; control characters and invisible direction marks are refused. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 201 | Body with `terms` | The new version: `version`, `at`, `feeInr`, `note`. | 303 to `/operator?fee=1` |
| 400 | `invalid` | The fee or the note is refused. The body holds `fields`. | 303 to `/operator?problem=fee` |
| 400 | `bad_request` | The body cannot be read, or is JSON that is not one object (malformed, empty with a JSON type, an array, null or a scalar). | JSON |
| 401 | `not_signed_in` | No valid session: no cookie, a bad or expired token, a user that no longer exists, or a platform with no database or no usable secret. | JSON |
| 403 | `cross_site_refused` | A change that another website sent (section 2.5). Checked first, before the session. | JSON |
| 403 | `forbidden` | The caller is not the operator. Audit entry `operator.write.denied`, requested `operator`. | JSON |
| 413 | `too_large` | The body is over the limit (see Body limit). | JSON |
| 415 | `unsupported_content_type` | The content type is not JSON or form, or there is a body and no content type. | JSON |
| 503 | `storage_unavailable` | The platform has no database bound. | JSON |

Request, JSON.

```json
{
  "feeInr": 1500,
  "note": "placeholder"
}
```

Response 201.

```json
{
  "terms": {
    "version": 2,
    "at": "2026-10-05T09:42:10.000Z",
    "feeInr": 1500,
    "note": "placeholder"
  }
}
```

### API-29 GET /api/operator/pools

| Item | Detail |
| --- | --- |
| Purpose | Reads the pools of at least five companies for the operator: a cluster, an item and a count, with no company, person or requirement. |
| Serves | BR-OPS-02, BR-GOV-06 |
| Caller | The operator: a signed-in person whose role is `operator` and who has no company. |
| Everyone else | Not signed in: 401 `not_signed_in`. Signed in and not the operator (an owner, a member, or anyone with a company): 403 `forbidden` and an audit entry `operator.read.denied` whose requested text is `operator`. No database bound: 503 `storage_unavailable`. |
| Content types | None sent. The answer is JSON. |
| Body limit | None. No body is read, and the query string is ignored. |
| Side effects | None on success. A refusal writes `operator.read.denied`. |
| Idempotency | Safe to repeat. |
| Form post | no |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| none | none | none | no | No body, no query and no header is read other than the session cookie. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 200 | Body with `pools`, an array | Each entry holds `cluster`, `opportunityId` and `companies`, the exact number of distinct companies with an open requirement there. A pool of fewer than five is left out, so no count below five is shown to anyone (C-04). An owner sees only a multiple of five (API-12); the operator sees the exact number (OQ-14 concerns the floor for pool members). | none |
| 401 | `not_signed_in` | No valid session: no cookie, a bad or expired token, a user that no longer exists, or a platform with no database or no usable secret. | none |
| 403 | `forbidden` | The caller is not the operator. Audit entry `operator.read.denied`, requested `operator`. | none |
| 503 | `storage_unavailable` | The platform has no database bound. | none |

Response 200.

```json
{
  "pools": [
    {
      "cluster": "synthetic-cluster-1",
      "opportunityId": "digital_job_log",
      "companies": 7
    }
  ]
}
```

### API-30 GET /api/companies/{id}/export

| Item | Detail |
| --- | --- |
| Purpose | Gives the caller's own company's records as one JSON file to save: the company, every version of the factory description, every assessment with its decisions and sign-offs, every requirement (withdrawn ones too), every engagement with its milestones and events, and every baseline and review. The file names its format and version, carries a `readme` that explains each section and what is left out, and is marked SYNTHETIC. Every read is bound to the caller's company, never to the id in the URL. |
| Serves | BR-DATA-03, BR-GOV-05 |
| Caller | A person of the company in the URL, its owner or a member: a signed-in person whose company is that company. |
| Everyone else | Not signed in: 401 `not_signed_in`. Signed in with another company, or as the operator, who has none: 404 `not_found`, the same answer as for a company that does not exist, and an audit entry `company.export.denied` is written. No database bound: 503 `storage_unavailable`. |
| Content types | None sent. The answer is JSON, indented, with `content-disposition: attachment` and a file name `aplyd-records-{id}-{date}.json`. |
| Body limit | None. No body is read, and the query string is ignored. |
| Side effects | A success writes one audit entry `company.export` with the format `version` and the number of `records`. A refusal writes `company.export.denied`. No record is changed. |
| Idempotency | Safe to repeat. Each call writes its own `company.export` entry. The file differs only in `exportedAt` while the records stay the same. |
| Form post | no |

| Field | Form field | Type | Required | Limits and meaning |
| --- | --- | --- | --- | --- |
| `id` (in the path) | same | string | yes | The company id. Compared with the caller's own company; it is never used to look anything up. |

| Status | Code or body | When | Form post |
| --- | --- | --- | --- |
| 200 | Body with `format`, `version`, `synthetic`, `tag`, `exportedAt`, `companyId`, `readme`, `counts`, `company`, `factoryDescriptions`, `assessments`, `requirements`, `engagements` and `measurements` | The id is the caller's company. Every list is oldest first. Nothing of another company is in it, and nothing of the provider register, the listing terms, the pools, the audit log or a session: an engagement names only the `chosenProvider` by id and name. Audit entry `company.export`. | none |
| 401 | `not_signed_in` | No valid session: no cookie, a bad or expired token, a user that no longer exists, or a platform with no database or no usable secret. | none |
| 404 | `not_found` | The id is not the caller's company, or the company row is gone. Audit entry `company.export.denied` for the first case. | none |
| 503 | `storage_unavailable` | The platform has no database bound. | none |

Response 200, shortened: the `readme` texts and the record lists are cut to one entry each.

```json
{
  "format": "aplyd-msme-company-records",
  "version": 1,
  "synthetic": true,
  "tag": "SYNTHETIC",
  "exportedAt": "2026-10-06T01:00:00.000Z",
  "companyId": "company-synthetic-a",
  "readme": {
    "title": "Your company's records from the APLYD MSME platform",
    "about": ["This file holds every record your company made on the APLYD MSME platform, as they were when the file was made."],
    "format": "JSON, as UTF-8 text.",
    "sections": { "company": "The company record." },
    "notIncluded": [{ "what": "Other companies' records.", "why": "They belong to those companies." }]
  },
  "counts": {
    "factoryDescriptions": 1,
    "assessments": 0,
    "ideas": 0,
    "decisions": 0,
    "signOffs": 0,
    "requirements": 0,
    "withdrawnRequirements": 0,
    "engagements": 0,
    "milestones": 0,
    "engagementEvents": 0,
    "measurements": 0
  },
  "company": {
    "id": "company-synthetic-a",
    "name": "SYNTHETIC Company A",
    "synthetic": true,
    "createdAt": "2026-10-04T00:00:00.000Z"
  },
  "factoryDescriptions": [
    {
      "revision": 1,
      "createdAt": "2026-10-04T00:00:00.000Z",
      "createdBy": "user-synthetic-owner-a",
      "confirmed": true,
      "questionnaireVersion": 1,
      "note": "SYNTHETIC first description",
      "answers": { "products": "SYNTHETIC school uniforms and cotton shirts" }
    }
  ],
  "assessments": [],
  "requirements": [],
  "engagements": [],
  "measurements": []
}
```

## 4. Error codes

Every code an operation can answer with, as the `error` field of the body (`status` for `degraded`). The sync test compares this list with the codes written in the source. A status can repeat: `not_found` is 404 everywhere, and `invalid` and `bad_request` are 400.

| Code | Status | Meaning | Used by |
| --- | --- | --- | --- |
| `bad_request` | 400 | The body cannot be read, or is JSON that is not one object; in API-06, a note or confirm of the wrong type. | API-03, API-06, API-08, API-10, API-11, API-13, API-14, API-15, API-18, API-19, API-21, API-24, API-25, API-26, API-28 |
| `invalid` | 400 | A field is missing or wrong. The body holds `fields`, a map of field name to sentence. | API-06, API-10, API-11, API-13, API-14, API-15, API-18, API-19, API-21, API-24, API-25, API-26, API-28 |
| `not_signed_in` | 401 | No valid session. | API-02, API-04, API-05, API-06, API-07, API-08, API-09, API-10, API-11, API-12, API-13, API-14, API-15, API-16, API-17, API-18, API-19, API-20, API-21, API-22, API-23, API-24, API-25, API-26, API-27, API-28, API-29, API-30 |
| `unknown_user` | 401 | No synthetic user has the address given at sign-in. | API-03 |
| `cross_site_refused` | 403 | A change that another website sent. | API-03, API-06, API-08, API-10, API-11, API-13, API-14, API-15, API-18, API-19, API-21, API-24, API-25, API-26, API-28 |
| `forbidden` | 403 | The caller is a member and not the owner, or is not the operator. | API-06, API-08, API-10, API-11, API-13, API-14, API-15, API-18, API-19, API-21, API-23, API-24, API-25, API-26, API-27, API-28, API-29 |
| `not_found` | 404 | No such record for the caller's company, or the company in the path is not the caller's, or a provider does not exist. The same answer for all. | API-04, API-05, API-06, API-07, API-08, API-09, API-10, API-11, API-12, API-13, API-14, API-15, API-16, API-17, API-18, API-19, API-20, API-21, API-25, API-26, API-30 |
| `already_agreed` | 409 | The plan is already agreed. | API-19 |
| `already_engaged` | 409 | The requirement has an engagement with another provider. | API-15 |
| `already_listed` | 409 | The provider is listed. | API-25 |
| `already_signed_off` | 409 | A sign-off exists. | API-11 |
| `already_withdrawn` | 409 | The requirement is already withdrawn. | API-14 |
| `baseline_exists` | 409 | A baseline is recorded. | API-21 |
| `baseline_too_late` | 409 | Something is accepted, so a baseline can no longer be taken. | API-21 |
| `changed` | 409 | A decision landed while the sign-off was made. The body holds `detail`. | API-11 |
| `closed` | 409 | The engagement is closed. | API-18, API-19 |
| `engaged` | 409 | A provider has been chosen for the requirement. | API-14 |
| `fee_undecided` | 409 | No listing terms exist, so nothing can be listed (OQ-11). | API-25 |
| `no_confirmed_description` | 409 | An assessment needs a confirmed description. | API-08 |
| `no_items` | 409 | The assessment has no items to sign off. | API-11 |
| `no_milestones` | 409 | The plan has no milestone to agree. | API-19 |
| `no_service` | 409 | The provider serves nothing. | API-25 |
| `not_accepted` | 409 | The item is not accepted. | API-13 |
| `not_agreed` | 409 | The plan is not agreed yet. | API-19 |
| `not_due` | 409 | The review's day has not come. | API-21 |
| `not_listed` | 409 | The provider is not listed. | API-26 |
| `not_signed_off` | 409 | The assessment is not signed off. | API-13 |
| `nothing_accepted` | 409 | A review needs an accepted milestone. | API-21 |
| `plan_locked` | 409 | The plan is agreed; no milestone can be added. | API-18 |
| `previously_withdrawn` | 409 | A requirement for the item was made and withdrawn. | API-13 |
| `provider_unavailable` | 409 | The provider is not listed, or does not serve the item in the cluster. | API-15 |
| `requirement_withdrawn` | 409 | The requirement is withdrawn. | API-15 |
| `review_exists` | 409 | That review is recorded. | API-21 |
| `signed_off` | 409 | The assessment is signed off, so its decisions are final. | API-10 |
| `stale` | 409 | The revision a save starts from is no longer the latest. The body holds `latest`. | API-06 |
| `too_many` | 409 | The plan has 12 milestones. | API-18 |
| `too_many_decisions` | 409 | The assessment has 200 decisions. | API-10 |
| `too_many_deliveries` | 409 | The milestone has been delivered 14 times. | API-19 |
| `too_many_revisions` | 409 | The company has 500 revisions. | API-06 |
| `undecided` | 409 | Some item has no decision. | API-11 |
| `wrong_state` | 409 | The milestone is not in a state that takes this event. | API-19 |
| `too_large` | 413 | The body is over the limit. | API-06, API-08, API-10, API-11, API-13, API-14, API-15, API-18, API-19, API-21, API-24, API-25, API-26, API-28 |
| `unsupported_content_type` | 415 | The content type is not JSON or form, or there is a body and no type. | API-03, API-06, API-08, API-10, API-11, API-13, API-14, API-15, API-18, API-19, API-21, API-24, API-25, API-26, API-28 |
| `degraded` | 503 | Health only: the field is `status`, not `error`. The database is unavailable or a required trigger is missing. | API-01 |
| `sign_in_not_available` | 503 | Sign-in is refused: not a synthetic environment, no database, or no usable secret. | API-03 |
| `storage_unavailable` | 503 | The platform has no database bound. | API-04, API-05, API-06, API-07, API-08, API-09, API-10, API-11, API-12, API-13, API-14, API-15, API-16, API-17, API-18, API-19, API-20, API-21, API-22, API-23, API-24, API-25, API-26, API-27, API-28, API-29, API-30 |

## 5. Pages that post forms

No page is an operation: every page is a GET that reads data through the same functions the API uses. No page exports POST, and the application uses no server actions. The forms below post to the API and are answered with a redirect back to a page (section 2.7). A page the table does not list posts nothing. The sync test reads every `<form method="post">` in `app/**/page.tsx`, and in the parts every page shares (`app/_ui/*.tsx`, listed as `(every page)`), and compares it with this table.

| Page | Posts to |
| --- | --- |
| `(every page)` | API-03 (sign-out, in the bar at the top, `app/_ui/appbar.tsx`) |
| `/sign-in` | API-03 (sign-in) |
| `/factory` | API-06 |
| `/diagnose` | API-08, API-10, API-11 |
| `/procure` | API-13, API-14, API-15 |
| `/deliver` | API-18, API-19 |
| `/run` | API-21 |
| `/operator` | API-24, API-25, API-26, API-28 |

The page `/demo` posts nothing. A person who is signed in as a member sees a notice in place of a form on the pages that make and decide, and the API refuses the same change with 403 `forbidden` (BR-ID-05). [Certain]

## 6. Discrepancies and observations

Differences between the handlers, the status pages and the requirements, found while writing this document. None was fixed: this task owns no code. Evidence is a file and line as of 5 October 2026. The first three rows are also in section 9 of the data dictionary.

| No. | Where | What | Effect |
| --- | --- | --- | --- |
| 1 | `modules/platform/src/api/session.ts` lines 18 to 27 | The sign-in and sign-out handler reads its body with `request.text()` or `request.json()` and no size bound. Every other write is bounded at 65536 characters, and the platform STATUS page (line 14) describes bodies read in pieces and abandoned at a bound. | A large body to API-03 is bounded only by the platform in front of the Worker [Likely]. |
| 2 | `modules/platform/src/api/session.ts` line 40; `modules/deliver/src/api/engagements.ts` line 4; `modules/run/src/api/outcomes.ts` line 4 | Comments cite OQ-07 for real sign-in and OQ-13 for providers not signing in. In the register OQ-13 is how real owners sign in and OQ-19 is whether providers sign in. | None on behaviour. A reader following the number reaches the wrong question. |
| 3 | `modules/deliver/STATUS.md` lines 46 and 47; `modules/diagnose/STATUS.md` lines 36 and 37; `modules/procure/STATUS.md` line 43 | These pages describe migration 0014 as on a review-fixes branch. It is applied in `drizzle/`, and several guards behind the 409 answers of this reference (the delivery limit of API-19, for one) are in it. | A reader may think those guards are optional. |
| 4 | `modules/platform/src/identity/resolve.ts` | A valid cookie is accepted wherever the secret is set: the environment and `users.is_synthetic` are checked at sign-in only. | None today, as nothing but sign-in mints a token. A real-user table would need the check to move [Likely]. |
| 5 | `modules/run/src/api/outcomes.ts` (`reviewNo`), `modules/factory/src/api/factory.ts` (`note`, `confirm`) | A JSON `reviewNo` must be a number while `value` also takes digits in text. In API-06 a `note` or `confirm` of the wrong type is 400 `bad_request`, but every other wrong field is 400 `invalid` with `fields`. | A program must know which fields are strict, and which code to expect. |
| 6 | `modules/procure/src/db/providers.ts` (`listProvider`) | `no_service` is a refusal that cannot be reached through the operations: a provider is created with at least one service, and its services cannot be added to afterwards from the application. | None. It is a guard for a direct write [Likely]. |
| 7 | `modules/procure/src/api/providers.ts` (`handlePools`) | The operator's pool list gives the exact count of a pool of five or more, where an owner is told only the largest multiple of five reached. | By design while the floor for pool members is open (OQ-14, C-04). The operator can see a count that an owner cannot. |
| 8 | `modules/platform/src/api/authorize.ts`; the pages | A refusal before the body is read is JSON even for a form post. A person whose session ended while a form was open sees raw JSON at the address of the operation. | A rough edge for a person; nothing is lost or leaked. [Likely] |
| 9 | no rate limit on any operation | Sign-in and writes are not rate limited, and nothing caps the audit entries one person can cause by repeated refused requests. Sign-out does not revoke a token. | BR-ID-07 and BR-NFR-12 are not built. |

Items that rest on a reading and not on a test are tagged where they appear, and section 2.10 lists what could not be determined.
