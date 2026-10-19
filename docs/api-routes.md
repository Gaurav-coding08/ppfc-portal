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
| GET | /api/v1/projects | any (scoped) | `?q&departmentId&ownerId&status&startFrom&endTo&page&pageSize&sort&order&asOf`. `status` accepts a comma-separated list. Scoped: admin sees all; others see projects they own or are a member of. Each row includes `progressPct` (`fn_project_progress`) and `deliveryStatus` (`fn_project_delivery_status`). |
| POST | /api/v1/projects | project_manager, admin | `{ code?, name, description?, departmentId, ownerId, status, startDate, endDate, initialBudget }`. `code` auto-generated `PRJ-NNN` if omitted. One transaction: project + owner's `manager` membership + `project_budgets` + audit `project.create`. A PM may only set `ownerId` to themselves (else 403); owner must be an active project_manager or admin (else 422). |
| GET | /api/v1/projects/:id | view access | `?asOf`. Project + members + counts (tasks, overdue tasks, open risks, pending CRs) + `progressPct` + `deliveryStatus` + budget headline (`currentBudget`, `actualSpend`, `utilization`) from `fn_project_financials`. |
| PATCH | /api/v1/projects/:id | manage access | `{ name?, description?, departmentId?, ownerId?, status?, startDate?, endDate?, version }`, strict schema (no budget field). Optimistic lock via `version`. `endDate < startDate` → 422. `status: 'completed'` with any non-done task → 422. Changing `ownerId` re-validates the new owner and upserts their `manager` membership. Audited `project.update` with before/after. |
| GET | /api/v1/projects/:id/members | view access | List of members with `memberRole`. |
| POST | /api/v1/projects/:id/members | manage access | `{ userId, memberRole }`. Inactive/missing user → 404/422. Duplicate membership → 409. Audited `project_member.add`. |
| DELETE | /api/v1/projects/:id/members/:userId | manage access | 204. Cannot remove the owner (422). Cannot remove a member with open assigned tasks on that project (422, `details.openTaskCount`). Audited `project_member.remove`. |
| GET | /api/v1/projects/:id/progress-snapshots | view access | Ordered by `snapshotDate` ascending. |
| GET | /api/v1/projects/:projectId/tasks | view access | `?status&assigneeId\|unassigned&priority&overdue&dueFrom&dueTo&q&page&pageSize&sort&order&asOf`. Each row adds `isOverdue`, `isDueSoon` (excludes `done`), `assigneeName`. |
| POST | /api/v1/projects/:projectId/tasks | manage access | `{ title, description?, assigneeId?, status?, priority, startDate?, dueDate, weight, progress? }`. Assignee must be a project member (422). `dueDate` must be ≥ `startDate` and within the project's own dates (422). `status: 'done'` normalises `progress` to 100. Audited `task.create`. |
| GET | /api/v1/tasks/mine | any authenticated user | Caller's own assigned tasks across every scoped project; same filters as the project-nested list (minus `assigneeId`/`unassigned`). |
| GET | /api/v1/tasks/:id | view access (via the task's project) | `?asOf`. |
| PATCH | /api/v1/tasks/:id | manage access → any field; a contributor who is the task's own assignee → `progress`/`status` only (else 403 `FORBIDDEN`, `details.fields`) | `{ ...fields?, version }`. `status: 'done'` normalises `progress` to 100; `progress: 100` with no explicit `status` infers `done`; dropping `progress` below 100 on a `done` task with no explicit `status` reverts it to `in_progress`. `completedAt` is set only on the transition into `done` and cleared on the way out. Optimistic lock via `version`. Audited `task.update` with before/after. |
| DELETE | /api/v1/tasks/:id | manage access | 204 only when `status = 'todo'` and `progress = 0` (else 422). Audited `task.delete`. |
| GET | /api/v1/projects/:projectId/milestones | view access | `?status&dueWithinDays&asOf`. Each row adds `isOverdue` (still `planned`, past due) and `daysToDue`. |
| POST | /api/v1/projects/:projectId/milestones | manage access | `{ name, dueDate, status?, achievedDate? }`. `dueDate` must fall within the project's own dates (422). `status: 'achieved'` requires an `achievedDate` on or before `asOf` (422 otherwise). Audited `milestone.create`. |
| PATCH | /api/v1/milestones/:id | manage access | `{ name?, dueDate?, status?, achievedDate?, version }`. Same achieved/`achievedDate` rule as create. Optimistic lock via `version`. Audited `milestone.update` with before/after. |
| GET | /api/v1/projects/:projectId/risks | view access | `?type&status&ownerId&minScore&q&page&pageSize&sort(score,dueDate,status)&order`. Each row adds `exposure` (`fn_exposure_band(score)`: high ≥15, medium 8–14, low ≤7) and `ownerName`. |
| POST | /api/v1/projects/:projectId/risks | manage access | `{ type, title, description?, ownerId, probability(1–5), impact(1–5), mitigation?, dueDate?, status? }`. `ownerId` must be a project member (422). `probability × impact ≥ 15` requires `mitigation` (422). Audited `risk.create`. |
| GET | /api/v1/risks | any (scoped) | Cross-portfolio; same filters plus `projectId`, `departmentId`. Admin sees all; others see risks on projects they own or are a member of (`scopedProjectIdsSql`). Used by the dashboard drill-down. |
| GET | /api/v1/risks/high-exposure | any (scoped) | `status <> 'closed' AND score >= 15`, sorted `score desc, dueDate asc`. Same scoping as `/risks`. |
| GET | /api/v1/risks/:id | view access (via the risk's project) | |
| PATCH | /api/v1/risks/:id | manage access | `{ ...fields?, version }`. Moving `status` to `'closed'` sets `closedAt = now()`; moving away from `'closed'` clears it. The mitigation-required rule is re-checked against the effective (patched) probability/impact/mitigation on every update, not just when those fields change. Optimistic lock via `version`. Audited `risk.update` with before/after. |
| GET | /api/v1/change-requests | any (scoped) | `?projectId&status(multi)&requestedBy&mine=true&from&to&page&pageSize`. Scoped: admin sees all; others see CRs on projects they own or are a member of. Sorted by `submitted_at DESC`. |
| GET | /api/v1/change-requests/:id | view access (via the CR's project) | Returns the CR with its full `history[]` (actor names). |
| POST | /api/v1/projects/:projectId/change-requests | view access (any project member) | `{ title, description?, impactSummary? }`. Auto-assigns `CR-NNN` code. Transaction: insert CR + history (`null → submitted`) + audit. 201. |
| POST | /api/v1/change-requests/:id/decision | manage access (not requester) | **Idempotent** (`Idempotency-Key`). `{ decision: 'approve'\|'reject'\|'return', reason, version }`. Check order: scope (404) → role (403) → self-approval (422 `SELF_APPROVAL_FORBIDDEN`) → state (409 `INVALID_TRANSITION`) → version (409 `VERSION_CONFLICT`). `SELECT ... FOR UPDATE` + version check. Transaction: update CR + history + audit. Approved CRs do not touch budgets or costs. |
| POST | /api/v1/change-requests/:id/resubmit | requester only | From `returned` only. `{ title?, description?, version }`. Transaction: update CR (status → submitted, clear decision fields) + history + audit. |
| GET | /api/v1/projects/:projectId/budget | view access | `?asOf`. Returns `{ initialAmount, approvedRevisionsTotal, currentBudget, currency, revisions[] }` from `fn_project_financials`. |
| POST | /api/v1/projects/:projectId/budget-revisions | manage access (PM) | `{ amount (signed, ≠ 0), rationale (min 10 chars), effectiveDate }`. Status `pending`. Revision that would make current budget < 0 → 422. Audited `budget_revision.create`. |
| POST | /api/v1/budget-revisions/:id/decision | admin only | **Idempotent** (`Idempotency-Key`). `{ decision: 'approve'\|'reject', reason, version }`. Requester ≠ decider (422 `SELF_APPROVAL_FORBIDDEN`). Only from `pending` (422 `INVALID_TRANSITION`). Transaction: update revision + audit. |
| GET | /api/v1/cost-categories | any authenticated user | Active categories by default. `?includeInactive=true` shows all (admin only). |
| POST | /api/v1/cost-categories | admin | `{ code, name }`. Unique code/name (409). |
| PATCH | /api/v1/cost-categories/:id | admin | `{ code?, name?, isActive? }`. Cannot deactivate if used by draft costs (422). |
| GET | /api/v1/projects/:projectId/costs | view access | `?status(multi)&categoryId&from&to&entryType&q&page&pageSize&sort(txnDate,amount,status)&order`. Includes `categoryName`, `createdByName`, `postedByName`, `signedAmount`. |
| GET | /api/v1/costs | any (scoped) | Cross-project; adds `projectId`, `departmentId`, `asOf`, `postedOnly`, `upToAsOf`. `postedOnly=true&upToAsOf=true` gives exactly the rows behind "actual spend". |
| GET | /api/v1/costs/:id | view access (via the cost's project) | Single cost with all fields. |
| POST | /api/v1/projects/:projectId/costs | manage access | `{ categoryId, txnDate, amount > 0, description, vendor? }`. Creates a **draft**. Inactive category → 422. Project not `cancelled`. Audited `cost.create`. |
| PATCH | /api/v1/costs/:id | manage access | Drafts only (posted → 422 `INVALID_TRANSITION`). `{ ...fields?, version }`. Optimistic lock. Audited `cost.update`. |
| DELETE | /api/v1/costs/:id | manage access | Drafts only (posted → 422). 204. Audited `cost.delete`. |
| POST | /api/v1/costs/:id/post | manage access | **Idempotent** (`Idempotency-Key`). Draft → posted. Sets `posted_by`/`posted_at`. Transaction: update + audit `cost.post`. Returns cost + refreshed `{ actualSpend, remainingBudget, utilization, currency }` from `fn_project_financials`. |
| POST | /api/v1/costs/:id/reverse | manage access | Posted expense only, not already reversed (422). `{ reason, txnDate? }`. Creates a **posted** `reversal` row with `reverses_id`. Transaction + audit `cost.reverse`. |
| GET | /api/v1/projects/:projectId/forecasts | view access | `?asOf`. Monthly forecast rows + `forecastToComplete` at asOf. |
| PUT | /api/v1/projects/:projectId/forecasts | manage access | `{ months: [{ month: 'YYYY-MM', amount ≥ 0 }] }`. Upsert by (project, month) in one tx. Months must be after asOf month and ≤ project end month (422). Audited `forecast.upsert`. |
| GET | /api/v1/projects/:projectId/financial-summary | view access | `?asOf`. Full `fn_project_financials` row + `spendByCategory[]` + `monthlyTrend[]` (month, actual, forecast) + `alerts[]`. |
| GET | /api/v1/finance/alerts | any (scoped) | `?asOf&departmentId`. One row per triggered alert: `OVERRUN_FORECAST`, `NEAR_BUDGET`, `OVERSPENT`, `FORECAST_MISSING`. Severity + amounts. |
| GET | /api/v1/finance/comparison | any (scoped) | `?projectIds=1,2,3&asOf` (max 10). Non-visible projects dropped to `excluded`. Side-by-side financial rows. |
| GET | /api/v1/dashboard/kpis | any (scoped) | `?departmentId&projectId&managerId&status&from&to&categoryId&asOf`. 16 KPIs with unit + drill endpoint. Delivery, risk/governance and financial. `categoryId` is accepted but reported in `meta.ignoredFilters` (financial KPIs come from `fn_project_financials`, which has no category dimension). |
| GET | /api/v1/dashboard/project-health | any (scoped) | Per project: progress, deliveryStatus, utilization, eac, openHighRisks, overdueTasks. |
| GET | /api/v1/dashboard/budget-vs-actual-eac | any (scoped) | Per project: code, name, currentBudget, actualSpend, eac, `isOverrun` (EAC > budget, from `fn_project_financials`). Ignores `categoryId` (reported in `meta.ignoredFilters`). |
| GET | /api/v1/dashboard/monthly-spend | any (scoped) | Month series: actual, forecast, cumulative. Respects `categoryId`. |
| GET | /api/v1/dashboard/spend-by-category | any (scoped) | Per cost category. Respects `categoryId`. |
| GET | /api/v1/dashboard/overdue-by-owner | any (scoped) | Per assignee (incl. "Unassigned") count of overdue incomplete tasks. |
| GET | /api/v1/dashboard/risk-matrix | any (scoped) | 5×5 grid probability × impact with count + band. Includes `totalOpenRisks`. |
| GET | /api/v1/dashboard/milestones | any (scoped) | `?withinDays=14`. Planned milestones with isOverdue, daysToDue. |
| GET | /api/v1/dashboard/drill/costs | any (scoped) | `?drillProjectId&drillCategoryId&month&page&pageSize`. Posted costs ≤ asOf, paginated. Respects `categoryId`. |
| GET | /api/v1/dashboard/drill/tasks | any (scoped) | `?kind=overdue\|blocked\|all&ownerId&drillProjectId&page&pageSize`. Paginated. |
| GET | /api/v1/dashboard/drill/risks | any (scoped) | `?kind=high-exposure\|cell\|all&probability&impact&page&pageSize`. Open risks, paginated. |
| GET | /api/v1/dashboard/drill/change-requests | any (scoped) | `?from&to&page&pageSize`. Pending CRs, paginated. |
| GET | /api/v1/dashboard/filters | any (scoped) | Option lists: departments, projects, managers, statuses, categories — scoped to caller. |
| POST | /api/v1/admin/automation/overdue-escalation/run | admin | Manual trigger: producer pass (finds overdue tasks, queues `TASK_OVERDUE` outbox events) + dispatcher pass in the same call. Returns `{ run, dispatch }`. Idempotent by design — a second call the same day queues 0 new events. Audited `automation.overdue_escalation.run`. |
| GET | /api/v1/admin/automation/runs | admin | `?status&jobName&page&pageSize`. Newest first. |
| GET | /api/v1/admin/automation/outbox | admin | `?status&eventType&page&pageSize`. Newest first. |
| POST | /api/v1/admin/automation/outbox/:id/retry | admin | Only from `failed` → `pending`, `attempts=0`. Otherwise 422 `INVALID_TRANSITION` (CLAUDE.md maps this code to 422; see feature 10's same precedent). Audited `outbox.retry`. |
| GET | /api/v1/notifications | any | `?unread=true&page&pageSize`. Caller's own rows only. Response includes `unreadCount`. |
| PATCH | /api/v1/notifications/:id/read | any | Own only — another user's notification id → 404. Idempotent (already-read → 200 unchanged). |
