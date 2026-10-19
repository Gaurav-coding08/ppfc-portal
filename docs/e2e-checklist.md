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

The sections below cover the **API** with curl. The [UI walkthrough](#ui-walkthrough-browser)
at the end covers the same acceptance tests in the browser; most of it is automated by
`cd frontend && npm run test:e2e` (see the README).

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

---

## UI walkthrough (browser)

Run against the Docker stack (`docker compose --profile app up -d --build`,
`http://localhost:8080`) or the dev servers (`http://localhost:5173`). Start from
`npm run db:reset` for the exact seed values. Logins:
- PM = `christelle.satterfield@ppfc.demo`
- Contributor = `estell.conroy@ppfc.demo`
- Admin = `garnet.wiegand@ppfc.demo`

Column **Auto** names the Playwright spec that automates the step (`frontend/e2e/`).

### Test A — project, task, progress persists

| # | Step | Expected | Auto |
|---|------|----------|------|
| UA1 | PM → Projects → **New project**: name, department, dates, budget → Create | Toast "Project PRJ-0NN created"; lands on the new project page | journeys/01 |
| UA2 | Members tab → **Add member** → Estell Conroy, Contributor | Member listed | (API in journeys/01) |
| UA3 | Tasks tab → **New task**: title, assignee Estell Conroy, due date → Create | Toast "Task created"; row in the table | journeys/01 |
| UA4 | Log in as contributor → **My tasks** → set progress 40 → Save | Toast "Progress saved" | journeys/01 |
| UA5 | Reload the page; then as PM reload the project's Tasks tab | Both show 40 % (read back from the API) | journeys/01 |

### Test B — cost posting moves actual spend; drill-down lists it

| # | Step | Expected | Auto |
|---|------|----------|------|
| UB1 | PM → project → Finance tab; note **Actual spend** | Card shows the API value | journeys/02 |
| UB2 | **Add cost** (date ≤ 30 Sep 2026) → Add draft | Draft row; Actual spend unchanged (drafts don't count) | journeys/02 |
| UB3 | Row **Post** → confirm "Post cost" | Toast; Actual spend increases by the amount | journeys/02 |
| UB4 | Click the **Actual spend** card | Costs table filters to `status=posted`, up to the reporting date; the new cost is listed | journeys/02 |

### Test C — CR approval writes one history entry

| # | Step | Expected | Auto |
|---|------|----------|------|
| UC1 | Contributor → PRJ-001 → Change requests tab → **Submit change** | CR in `Submitted`; history has 1 entry | journeys/03 (API submit) |
| UC2 | PM opens the CR → Reason → **Approve** → confirm | Dialog says approval doesn't change budget/costs; toast "Change request approved" | journeys/03 |
| UC3 | Look at **History** | Exactly 2 entries: the submission + `Submitted → Approved` with the reason; decision panel gone | journeys/03 |
| UC4 | PM opens a CR they submitted themselves | Panel disabled: "You can't decide your own request" | component test |

### Test D — contributor can't post or decide (UI side)

| # | Step | Expected | Auto |
|---|------|----------|------|
| UD1 | Contributor → PRJ-001 → Finance tab | Read-only: no Add cost / Post / Reverse; no Finance group in the sidebar | journeys/04 |
| UD2 | Contributor opens a submitted CR | No Approve / Return / Reject | journeys/04 |
| UD3 | Contributor opens `/admin/users` directly | "You don't have access" state, no data | component test |

### Test E — dashboard filters and drill-down

| # | Step | Expected | Auto |
|---|------|----------|------|
| UE1 | Admin → Dashboard | 3 KPI sections, 7 widgets, "Reporting date: 30 Sep 2026" | journeys/05 |
| UE2 | Department filter → Digital Platforms | URL gets `departmentId=1`; every widget refetches | journeys/05 |
| UE3 | Click **Actual spend** card | Drawer: filter context at the top, "N records · AED …"; N = `meta.total` of `GET /dashboard/drill/costs?departmentId=1` | journeys/05 |
| UE4 | Reproduce the KPI in SQL (DBeaver) with the query in `docs/kpi-definitions.md` | Same value as the card | manual |

### Test G — automation is visible

| # | Step | Expected | Auto |
|---|------|----------|------|
| UG1 | Admin → Admin → **Automation** → **Run now** | Toast with the run summary (items found / created); a new row with trigger "Manual" at the top of Runs | component test |
| UG2 | Outbox tab | `TASK_OVERDUE` events; failed ones show attempts, last error, **Retry** | component test |
| UG3 | Log in as a PM who owns a project with overdue tasks (e.g. Christelle) → bell | Unread count > 0; dropdown lists overdue-task notifications; Mark as read lowers the count after refetch | component test |

Note: escalation is idempotent per task per day. If the Docker `worker` already ran today,
Run now reports items found but 0 created, and the notifications are already in the bell.

### Responsive and keyboard (quality pass)

| # | Step | Expected | Auto |
|---|------|----------|------|
| UQ1 | Every page at 1440 / 1024 / 768 / 390 px | No horizontal page scroll. Sidebar: full ≥ 1280, icon rail 768–1279, drawer < 768. Filters move into a "Filters" sheet < 768 | quality/layout |
| UQ2 | Keyboard only: login → project → Tasks tab (arrow keys) → Edit task → Esc → Finance → Post → CR approve | Visible focus ring; focus stays inside dialogs; Esc closes and returns focus to the button that opened the dialog | auth.setup + quality/keyboard |
