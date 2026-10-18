# Feature plan — PPFC Portal

Run one at a time with `/run-feature` (next pending) or `/run-feature 07` (specific). Each run writes `.claude/context/<feature-file-name>.md`; later features read those instead of re-scanning the repo.

## Phase 1 — Backend (these files)

| # | File | Builds | Suggested model |
|---|---|---|---|
| 01 | 01-project-setup | Repo, TS, Docker Compose (Postgres + test DB), app factory, logging, errors, Vitest harness | Sonnet |
| 02 | 02-database-schema | All tables, constraints, indexes, migration runner, financial SQL functions, BI views, read-only role | **Opus** (review carefully) |
| 03 | 03-synthetic-data | Seeded generator → CSV → import; all edge cases; demo accounts | Sonnet |
| 04 | 04-auth | Login/me/logout, JWT cookie, validation middleware, rate limit | Sonnet |
| 05 | 05-access-control-platform | RBAC + project scope, audit writer, idempotency, optimistic locking, pagination | **Opus** |
| 06 | 06-admin-users-audit | Departments, users, roles, audit review, project activity | Sonnet |
| 07 | 07-projects | Projects CRUD, members, delivery status, snapshots | Sonnet |
| 08 | 08-tasks-milestones | Tasks (field-level RBAC), milestones, weighted progress, concurrency | Sonnet |
| 09 | 09-risks-issues | Risk register, exposure bands, high-exposure list | Sonnet |
| 10 | 10-change-requests | State machine, approvals, history, idempotent atomic decisions | **Opus** |
| 11 | 11-finance-budgets-costs | Budgets, revisions, categories, draft→posted costs, reversals | **Opus** |
| 12 | 12-finance-forecasts-insights | Forecasts, summary, EAC, alerts, comparison | Sonnet (Opus to review SQL) |
| 13 | 13-dashboard-analytics | KPIs, visuals data, cross-filters, drill-downs, integrity tests | **Opus** |
| 14 | 14-backend-hardening | Route guard, RBAC matrix, OpenAPI, security/logging pass, README, E2E checklist | Sonnet |

## Later phases (feature files to be written when backend is done)

| Phase | Planned files |
|---|---|
| Frontend | 15-frontend-shell-auth, 16-frontend-projects-tasks, 17-frontend-risks-crs, 18-frontend-finance, 19-frontend-admin-audit, 20-frontend-dashboard |
| Automation | 21-automation-overdue-escalation (outbox worker, retries, run log, notifications API) |
| MS Access / VBA | 22-access-vba (ODBC link, form, query, report, VBA button) |
| Power BI | 23-powerbi (model, SQL queries, DAX, report, KPI reconciliation) |
| Parallel any time | docs, AI dev log review, PowerPoint (6–8 slides), optional free-tier deploy |
