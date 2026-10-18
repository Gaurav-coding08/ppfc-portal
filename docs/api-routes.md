# API routes

Base path: `/api/v1`. See `CLAUDE.md` for response shape, status code and error code conventions.

| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | /api/v1/health | public | Liveness check; also pings the DB with `SELECT 1`. |
| POST | /api/v1/auth/login | public | Rate-limited 10/15min per IP. Sets `ppfc_token` httpOnly cookie and returns `{ data: { user, token } }`. Same 401 for unknown email and wrong password. |
| GET | /api/v1/auth/me | any authenticated user | `{ data: { user, memberships } }`. Accepts cookie or `Authorization: Bearer`. |
| POST | /api/v1/auth/logout | any authenticated user | Clears the `ppfc_token` cookie. 204. |
| GET | /api/v1/departments | any authenticated user | List all departments. |
| GET | /api/v1/users | project_manager, admin | `?q&role&departmentId&projectId&page&pageSize&sort&order`. PM sees only users who are members of a project the PM can manage (owns, or `member_role='manager'`); admin sees all. Never returns `password_hash`. |
| GET | /api/v1/users/:id | project_manager (scoped as above), admin | 404 when the user exists but is outside the caller's scope. |
| POST | /api/v1/admin/users | admin | `{ email, fullName, role, departmentId, password }`. Password: min 8 chars, letter + digit. Duplicate email → 409 `IDEMPOTENCY_CONFLICT`. Audited `user.create`. |
| PATCH | /api/v1/admin/users/:id | admin | `{ fullName?, role?, departmentId?, isActive?, version }`. Admin cannot change their own role or deactivate themselves → 422 `BUSINESS_RULE`. Refuses to demote/deactivate the last active admin → 422 `BUSINESS_RULE`. Optimistic lock via `version` → 409 `VERSION_CONFLICT` on mismatch. Audited `user.update` with before/after. |
| GET | /api/v1/admin/audit-events | admin | `?entityType&entityId&actorId&projectId&action&from&to&page&pageSize`, newest first, includes actor name. |
| GET | /api/v1/projects/:projectId/activity | view access on the project | Audit events for that project, newest first, paginated. Out of scope (or non-member contributor) → 404. |
