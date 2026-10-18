# 06 — Admin: departments, users, roles & audit review

## Goal
Administrator capabilities: reference data, user and role management, and an audit/activity review API. Every admin mutation is audited atomically.

## Depends on
05-access-control-platform

## Spec references
Assignment 2 §2 module 07 (roles, scoped access, audit/activity events), §3.4 Administrator row, §4 controls and audit.

## Scope — module `modules/admin/` and `modules/users/`

| Method | Path | Roles | Behaviour |
|---|---|---|---|
| GET | `/api/v1/departments` | any | list all |
| GET | `/api/v1/users` | PM, admin | `?q&role&departmentId&projectId&page&pageSize&sort`; **PM sees only users who are members of projects the PM can manage** (needed for assignee pickers); admin sees all. Never return `password_hash`. |
| GET | `/api/v1/users/:id` | PM (scoped as above), admin | 404 outside scope |
| POST | `/api/v1/admin/users` | admin | `{ email, fullName, role, departmentId, password }`; password policy min 8 chars, letter + digit; duplicate email → 409; audited `user.create` |
| PATCH | `/api/v1/admin/users/:id` | admin | `{ fullName?, role?, departmentId?, isActive?, version? }`; admin cannot change own role or deactivate self → 422; audited `user.update` with before/after |
| GET | `/api/v1/admin/audit-events` | admin | `?entityType&entityId&actorId&projectId&action&from&to&page&pageSize`, newest first; include actor name |
| GET | `/api/v1/projects/:projectId/activity` | view access on project | audit events where `project_id = :projectId`, newest first, paginated; contributor sees it only for member projects (scope via `assertProjectAccess`) |

### Rules
- All admin mutations in `withTx` + `writeAudit` with `requestId`.
- Role change takes effect on the user's next request (role read from DB in `authenticate` — feature 04).
- Keep at least one active admin: refuse to demote/deactivate the last active admin → 422.

## Tests (`integration/admin.test.ts`)
- Contributor and PM → 403 on all `/admin/*` routes.
- Admin creates user → 201, can log in with the new password, audit row exists with matching requestId.
- Duplicate email → 409.
- Admin demoting self → 422; demoting last admin → 422.
- Role change: promote a contributor to PM; that user's next call to a PM-only route succeeds without re-login.
- PM `GET /users` returns only users on their projects; non-scoped `/users/:id` → 404.
- Audit filter by entityType + date range returns expected rows; `password_hash` never appears in any response (assert on serialized body).

## Acceptance
```
npm run typecheck && npm run lint && npm test
```

## Out of scope
Frontend admin screens (frontend phase).

## Interview talking points
Why the last-admin guard; why PM user visibility is scoped; how audit gives "who changed what, when, from which request".
