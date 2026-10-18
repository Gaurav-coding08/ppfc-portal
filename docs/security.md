# Security

How authentication and authorization are implemented and why.

- **Authentication** (feature 04): `backend/src/middleware/authenticate.ts`, `backend/src/modules/auth/`
- **Authorization** (feature 05): `backend/src/lib/access.ts` (role guards, project-scope checks)

## Token storage: httpOnly cookie, not localStorage

The JWT lives in an `httpOnly` cookie (`ppfc_token`), not in `localStorage` or a JS-readable
cookie. `httpOnly` means client-side JavaScript cannot read the token at all — so a successful
XSS injection on this app can't walk off with a session token it can replay later from anywhere.
A token kept in `localStorage` has no such protection: any script running on the page, injected or
not, can read it directly.

The cost of `httpOnly` is that the frontend can't inspect the token itself (e.g. to read the user
id client-side without an API call). That's why `/auth/login` and `/auth/me` also return the user
object in the JSON body — the frontend gets what it needs without ever touching the token.

The login response also returns the raw token in the body (`{ data: { user, token } }`), purely
for API tools and automated tests that call the API directly via `Authorization: Bearer` rather
than running in a browser with cookies. A real browser-based frontend should ignore that field and
rely on the cookie, which is set automatically.

## SameSite + Secure, and how they interact with CORS

- `sameSite: 'lax'` stops the cookie being sent on cross-site requests that aren't simple
  top-level navigations (e.g. a form POST or `fetch` from another origin) — the standard CSRF
  mitigation for cookie-based auth. `'lax'` (not `'strict'`) still allows the cookie on a normal
  top-level link navigation, which `'strict'` would block even for first-party links.
- `secure: COOKIE_SECURE` (env-controlled) means the cookie is only sent over HTTPS once that's
  turned on in a real deployment. It's `false` in local dev (plain HTTP on `localhost`) and must be
  `true` in production.
- `cors({ origin: env.corsOrigins, credentials: true })` is a strict allowlist, not a wildcard —
  `credentials: true` is what allows the browser to actually attach the cookie cross-origin (the
  frontend on `:5173`, the API on `:4000`), but the browser *also* refuses to honor
  `credentials: true` if the server's `Access-Control-Allow-Origin` is `*`. That's why the origin
  list must be explicit origins, never a wildcard, the moment cookies are involved.

Together: SameSite stops *unintended* cross-site requests from carrying the cookie; the CORS
allowlist + `credentials: true` is what lets the *intended* frontend origin carry it.

## Why the JWT holds only `{ sub: userId }` — no role

If the role were baked into the token at login time, promoting/demoting a user or deactivating
their account would have no effect until their (up to `JWT_EXPIRES_IN`, i.e. 8h) token expired —
a stale-role escalation window. Instead, `authenticate` re-reads the user's current `role` and
`is_active` from the database on *every* request (`findActiveUserById`), so a role change or
deactivation takes effect on the user's very next request. The trade-off is one extra indexed
lookup by primary key per request — cheap, and worth it for a PMO tool that actively manages who
can approve what.

## Password hashing

`bcryptjs`, cost factor 10 (the library's default). Cost 10 is deliberately not higher for this
app: it's an internal PMO tool with no regulatory password-hashing mandate, and a higher cost
factor directly slows down every login and the demo dataset's fixed-hash determinism check (see
`docs/data-dictionary.md`). A public-facing, higher-value target would reasonably use 12+.

## No user enumeration

`/auth/login` returns the exact same 401 status, error code, and message for an unknown email and
for a wrong password on a real account — never "no such user" vs "wrong password". Additionally,
when the email doesn't resolve to a user, the service still runs a `bcrypt.compare` against a
fixed dummy hash (computed once at startup) rather than skipping straight to the 401. Without that,
an unknown-email request would return noticeably faster than a wrong-password one (no bcrypt work
done), and that timing difference is itself a side channel an attacker can use to enumerate valid
emails even though the response bodies are identical.

## Rate limiting

`POST /auth/login` is limited to 10 requests / 15 minutes **per IP** (`middleware/rateLimit.ts`),
returning 429 `RATE_LIMITED` once exceeded. Keyed by IP rather than by the submitted email so it
can't be turned into a way to lock a *known* victim account out by hammering it from elsewhere.
Disabled automatically when `NODE_ENV=test` (otherwise the test suite's hundreds of login calls
would trip it) via an explicit toggle a test can flip back on if it specifically wants to assert
rate-limiting behaviour.

## Secrets via environment

`JWT_SECRET`, `DATABASE_URL`, etc. are read from environment variables only (`src/config/env.ts`,
validated with zod at boot — a missing/malformed value crashes the process immediately rather than
failing confusingly on the first request). Nothing security-sensitive is hard-coded in source,
with one explicit, documented exception: the demo dataset's bcrypt password hash (see
`docs/demo-accounts.md`) — fixed on purpose so the generated CSVs are byte-identical across runs,
and clearly marked dev-only.

## Swapping in a real identity provider later

Because `authenticate` is the *only* place that decides who `req.user` is, swapping JWT + bcrypt
for an identity provider (Entra ID, Auth0, etc.) later only means replacing what's inside that one
middleware — verify the IdP's token instead of our own JWT, then resolve/sync the local `users`
row the same way (by email or by a stored external subject id) and attach the same `AuthUser`
shape to `req.user`. Every controller, service, and the whole RBAC layer in feature 05 stays
unchanged, because they only ever depend on `req.user`'s shape, never on how it got there.

## Role × action matrix

Every route checks authorization server-side. The table below is the single source of truth —
later features must comply with it.

| Action | Contributor | Project Manager | Admin |
|---|---|---|---|
| View project (own/member) | yes | yes | yes (all) |
| View project (non-member) | no (404) | no (404) | yes |
| Manage project | no | own projects only | yes |
| Create task | no | own projects | yes |
| Update own assigned task progress/status | yes (member) | yes | yes |
| Update any task | no | own projects | yes |
| Manage milestones | no | own projects | yes |
| Manage risks | no | own projects | yes |
| Submit change request | yes (member) | yes | yes |
| Decide change request | no | own projects (not own CR) | yes (not own CR) |
| Create draft cost | no | own projects | yes |
| Post cost | no | own projects | yes |
| Request budget revision | no | own projects | yes |
| Decide budget revision | no | no | yes (not own) |
| Manage cost categories | no | no | yes |
| Manage users | no | no | yes |
| View audit log | no | no | yes |

### How scope is enforced

Authorization checks run on the **loaded resource's** `project_id`, never on a caller-supplied
project id alone. This prevents ID-based escalation: even if the caller knows the id of a resource
in another project, `assertProjectAccess` verifies the project link from the DB row itself.

- Out of scope → 404 (never reveals the resource exists to someone who shouldn't see the project).
- In scope but role insufficient → 403.
- Self-approval (CR decisions, budget-revision decisions) → 422 `SELF_APPROVAL_FORBIDDEN`.

### Idempotency

Mutating POST routes that could cause double submissions (cost posting, CR decisions, budget-revision
decisions) require an `Idempotency-Key` header. The key is scoped to `(key, user_id)` and stored in
`idempotency_keys`. A duplicate key with the same method + path replays the stored response; a
duplicate key with a different path returns 409 `IDEMPOTENCY_CONFLICT`. Only 2xx responses are
stored, so a retry after a transient error gets a fresh attempt.

### Optimistic locking

Mutable entities carry a `version` column. The client must send the current `version` on every
update; the UPDATE succeeds only when the row's version matches. A mismatch returns 409
`VERSION_CONFLICT` with `{ currentVersion }` so the client can retry from the latest state. This
avoids the overhead and deadlock risk of pessimistic locks while still preventing lost updates.

### Audit trail integrity

`writeAudit` requires a `PoolClient`, not the pool — enforcing that audit rows are written inside
the same transaction as the mutation they record. If the mutation rolls back, the audit row rolls
back with it; if it commits, the audit row is guaranteed to be there. `password_hash` /
`passwordHash` fields are automatically stripped from before/after payloads.
