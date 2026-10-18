# API routes

Base path: `/api/v1`. See `CLAUDE.md` for response shape, status code and error code conventions.

| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | /api/v1/health | public | Liveness check; also pings the DB with `SELECT 1`. |
| POST | /api/v1/auth/login | public | Rate-limited 10/15min per IP. Sets `ppfc_token` httpOnly cookie and returns `{ data: { user, token } }`. Same 401 for unknown email and wrong password. |
| GET | /api/v1/auth/me | any authenticated user | `{ data: { user, memberships } }`. Accepts cookie or `Authorization: Bearer`. |
| POST | /api/v1/auth/logout | any authenticated user | Clears the `ppfc_token` cookie. 204. |
