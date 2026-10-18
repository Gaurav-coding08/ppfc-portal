# Security

How authentication is implemented and why, for feature 04 (`backend/src/middleware/authenticate.ts`,
`backend/src/modules/auth/`). Authorization (role/resource checks) is feature 05's concern — see
`CLAUDE.md`'s "Roles & authorization" section for that.

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
