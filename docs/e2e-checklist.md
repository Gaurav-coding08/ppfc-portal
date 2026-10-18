# End-to-end manual checklist

Maps each acceptance test to exact steps. Run against the dev DB
(`npm run dev`) after `npm run db:reset`.

## Prerequisites

```bash
docker compose up -d db
cd backend
cp .env.example .env          # if not already done
npm run db:reset               # migrate + import seed data
npm run dev                    # API on localhost:4000
```

Password for all demo accounts: `Demo@1234`

---

## A — Health, auth, and rate limiting

| # | Step | Expected |
|---|------|----------|
| A1 | `curl -i localhost:4000/api/v1/health` | 200, `{ data: { status: "ok", db: "up" } }`, `x-request-id` header present |
| A2 | `curl -X POST localhost:4000/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"garnet.wiegand@ppfc.demo","password":"Demo@1234"}'` | 200, body has `data.user` and `data.token`, `Set-Cookie: ppfc_token=...` header |
| A3 | Copy the token from A2. `curl localhost:4000/api/v1/auth/me -H 'Authorization: Bearer <token>'` | 200, `data.user.role = "admin"` |
| A4 | `curl -X POST localhost:4000/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"garnet.wiegand@ppfc.demo","password":"wrong"}'` | 401 `UNAUTHENTICATED` |
| A5 | `curl -X POST localhost:4000/api/v1/auth/logout -H 'Authorization: Bearer <token>'` | 204, `Set-Cookie` clears the cookie |

## B — Projects, tasks, milestones, risks (scoped access)

| # | Step | Expected |
|---|------|----------|
| B1 | Login as PM `christelle.satterfield@ppfc.demo`. `GET /projects` | 200, sees PRJ-001, PRJ-004, PRJ-007 (owner or member projects) |
| B2 | `GET /projects/1` (PRJ-001, PM is owner) | 200, includes `progressPct`, `deliveryStatus`, `currentBudget`, `actualSpend` |
| B3 | `GET /projects/2` (PRJ-002, PM is not member) | 404 `NOT_FOUND` |
| B4 | `GET /projects/1/tasks?status=in_progress` | 200, all returned tasks have `status: "in_progress"` |
| B5 | `GET /projects/1/milestones` | 200, milestones with `isOverdue` and `daysToDue` |
| B6 | `GET /projects/1/risks` | 200, risks with `exposure` and `ownerName` |
| B7 | Login as contributor `estell.conroy@ppfc.demo`. `GET /projects` | 200, sees only member projects (PRJ-001, PRJ-008) |
| B8 | `GET /projects/2` as contributor | 404 (not a member) |
| B9 | Verify with SQL: `SELECT id FROM projects WHERE id = 2` → project exists but API correctly returns 404 |

## C — Change requests (submit, decide, self-approval guard)

| # | Step | Expected |
|---|------|----------|
| C1 | Login as contributor `estell.conroy@ppfc.demo`. `POST /projects/1/change-requests` with `{ "title": "Test CR" }` | 201, CR with `status: "submitted"`, auto-generated `code` |
| C2 | Login as PM `christelle.satterfield@ppfc.demo`. `POST /change-requests/<id>/decision` with `{ "decision": "approve", "reason": "ok", "version": 1 }` + `Idempotency-Key` header | 200, CR now `status: "approved"` |
| C3 | Repeat C2 with same Idempotency-Key | 200 (replayed, same response) |
| C4 | PM submits their own CR on PRJ-001, then tries to decide it | 422 `SELF_APPROVAL_FORBIDDEN` |
| C5 | Contributor tries to decide any CR | 403 `FORBIDDEN` |
| C6 | Verify with SQL: `SELECT * FROM change_history WHERE change_request_id = <id>` → history rows for submit and approve |
| C7 | Verify with SQL: `SELECT * FROM audit_events WHERE entity_type = 'change_request' AND entity_id = <id>` → audit rows |

## D — Finance: budgets, costs, forecasts, EAC

| # | Step | Expected |
|---|------|----------|
| D1 | Login as PM. `GET /projects/1/budget?asOf=2026-09-30` | 200, `initialAmount`, `currentBudget` (= initial + approved revisions), `revisions[]` |
| D2 | `POST /projects/1/costs` with `{ "categoryId": 1, "txnDate": "2026-06-15", "amount": 5000, "description": "Test" }` | 201, `status: "draft"` |
| D3 | `POST /costs/<id>/post` + `Idempotency-Key` | 200, `status: "posted"`, response includes refreshed `actualSpend`, `remainingBudget`, `utilization` |
| D4 | `POST /costs/<id>/reverse` with `{ "reason": "Duplicate entry" }` | 201, reversal row created with `entryType: "reversal"` |
| D5 | `GET /projects/1/financial-summary?asOf=2026-09-30` | 200, `currentBudget`, `actualSpend`, `forecastToComplete`, `eac`, `projectedVariance`, `alerts[]`, `monthlyTrend[]` |
| D6 | Verify with SQL: the reversal's `signed_amount` is negative and `reverses_id` points to the original |
| D7 | `PUT /projects/1/forecasts` with months after asOf month | 200 |
| D8 | `GET /finance/comparison?projectIds=1,2` as admin | 200, side-by-side financials |
| D9 | Contributor tries `POST /projects/1/costs` | 403 |

## E — Dashboard analytics

| # | Step | Expected |
|---|------|----------|
| E1 | Login as admin. `GET /dashboard/kpis` | 200, 16 KPIs with `key`, `value`, `unit`, `drill` |
| E2 | `GET /dashboard/project-health` | 200, per-project rows with `deliveryStatus`, `utilization` |
| E3 | `GET /dashboard/budget-vs-actual-eac` | 200, per-project `currentBudget`, `actualSpend`, `eac` |
| E4 | `GET /dashboard/risk-matrix` | 200, 5×5 grid; `totalOpenRisks` matches `SELECT count(*) FROM risks WHERE status <> 'closed'` |
| E5 | `GET /dashboard/drill/costs?page=1&pageSize=5` | 200, paginated posted costs |
| E6 | Login as contributor. `GET /dashboard/kpis` | 200, KPIs scoped to contributor's member projects |
| E7 | Compare E1 vs E6: admin totals ≥ contributor totals |

## H — Security hardening

| # | Step | Expected |
|---|------|----------|
| H1 | `curl -i localhost:4000/api/v1/projects` (no token) | 401 `UNAUTHENTICATED` |
| H2 | Contributor `POST /projects` | 403 `FORBIDDEN` |
| H3 | PM of PRJ-001 `GET /tasks/<taskId-from-PRJ-002>` | 404 (cross-project ID escalation blocked) |
| H4 | `curl -I localhost:4000/api/v1/health` — check headers | `x-powered-by` absent (helmet removes it), `x-request-id` present |
| H5 | Trigger a validation error: `POST /auth/login` with `{}` | 400 `VALIDATION_ERROR`, no stack trace in body |
| H6 | `GET /admin/audit-events` as admin | 200, audit rows with `actorName`, `action`, `entityType` |
| H7 | `GET /admin/audit-events` as PM or contributor | 403 |
| H8 | Verify `.env` is in `.gitignore`: `git status --porcelain .env` → not tracked |
| H9 | Verify no template-literal SQL with interpolated values: `grep -rn '\${' backend/src/modules/ --include="*.repository.ts"` → all are from whitelist maps or static fragments |
