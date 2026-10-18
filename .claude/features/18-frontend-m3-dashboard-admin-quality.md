# 18 — Frontend Milestone 3: executive dashboard, admin, automation & quality

## Goal
The executive web dashboard (live, SQL-backed KPIs, cross-filters, visuals, drill-downs), the admin/audit/automation/notification screens, and the quality pass that makes the whole app demo-ready: responsive and accessible polish, E2E smoke tests, Docker, docs. Covers journey **6**, module **06** and the rest of **07**, §8.1's visible outcome, and acceptance tests **E**, **G** (automation part) and **H** (frontend part).

## Depends on
17-frontend-m2-governance-finance

## Spec references
Assignment 2 §1 journey 6, §2 modules 06–07, §3.1 (all), §5 (every bullet incl. the mandatory analytics integrity demonstration), §8.1, §10 tests E, G, H, §11 submission.

## Read first
CLAUDE.md (Frontend section), context files 06-admin-users-audit, 13-dashboard-analytics (exact endpoints, filter params, KPI keys, units, drill endpoints), 15-automation-overdue-escalation, 16 and 17 frontend context files, `docs/kpi-definitions.md`, and the OpenAPI file.

Implement **one part per run**.

---

## Part A — Executive dashboard (module 06)

Route `/dashboard` (default landing page after login).

- **Filter bar (≥ 4 coordinated filters, all in URL params):** department, project, manager, lifecycle status, timeframe (period selector), cost category. Category applies only to compatible finance visuals — those visuals show a small "filtered by category" chip; KPI cards that can't be filtered by category show "all categories". A "Reset filters" action. Use exactly the filter params feature 13 accepts.
- **KPI cards** grouped into three rows with section titles:
  - Delivery: total / active projects, portfolio progress, overdue incomplete tasks, milestones due within 14 days.
  - Risk & governance: open high-exposure risks, blocked work, pending change requests.
  - Financial: approved budget, actual spend, remaining budget, utilization %, forecast EAC, projected overrun (count and/or amount).
  - Each card: value from the API with its unit (AED / % / count), a short label, a definition tooltip (from `kpi-definitions.md`), and — where the API provides a drill endpoint — a clickable affordance.
- **Visuals (≥ 5, recharts, fixed chart palette, legends, units on axes, responsive containers):**
  1. Budget vs Actual vs EAC by project (grouped bar; overrun projects highlighted rose).
  2. Monthly cost trend — actual vs forecast (line).
  3. Spend by category (horizontal bar).
  4. Risk matrix — probability × impact 5×5 CSS grid, cell = count of open risks, cell colour by exposure band, clickable.
  5. Overdue work by owner (bar) **or** project health table (status, progress, utilization, overdue count with badges).
  6. (if the API provides it) Milestone roadmap — next 90 days timeline.
- **Drill-downs (≥ 2, more is fine):** a right-side drawer with a paginated table of the underlying records, a link to each record, and the **same filter context** shown at the top of the drawer.
  - Finance: Actual spend card / a bar in chart 1 or 3 → posted cost transactions.
  - Delivery: Overdue tasks card / chart 5 bar → filtered tasks; risk matrix cell → risks.
  - Show "N records · total X" in the drawer header so the KPI can be visually reconciled with its records.
- **States:** skeletons per card/chart, empty ("No data for these filters" + reset), error per widget (one failing widget must not blank the page) with requestId.
- **Integrity (spec §5 mandatory):** the dashboard never patches numbers. Every mutation hook from M1/M2 already invalidates the `dashboard` keys — verify it: update a task's progress and post a cost in another tab, return to the dashboard → values refetch. Add a small "Last updated hh:mm:ss · Refresh" control.
- Show the reporting "as of" date prominently; the period selector never moves it silently.

**Part A tests:** filters round-trip through the URL; changing a filter calls the KPI endpoint with the right params; a failing visual endpoint shows its own error while other cards render; clicking the Actual spend card opens the drawer with the finance drill endpoint and the current filters; category filter adds the chip only to compatible visuals; after a mocked task mutation the dashboard KPI query is invalidated and refetched.

## Part B — Admin, audit, automation & notifications (module 07 + §8.1)

- **Users** `/admin/users` (Admin): list with role, department, active; create user; change role with ConfirmDialog (backend blocks self-demotion — show its message); departments list.
- **Audit log** `/admin/audit`: filters entity type, actor, date range; table with time, actor, action, entity link, and an expandable before/after JSON diff viewer.
- **Automation** `/admin/automation`: runs table (job, trigger, started, duration, status badge, items found/created, error), **Run now** button (manual trigger endpoint) → toast with the run summary → table refetch; outbox tab (status filter, attempts, last error, next attempt) with **Retry** on failed events (confirm). This screen is the "visible outcome + persistent log" evidence for §8.1.
- **Notifications:** topbar bell with unread count (poll every 60 s via React Query `refetchInterval`, and refetch on window focus), dropdown with latest items, mark as read, "View all" page `/notifications` with unread filter. Each notification links to its task/CR.

**Part B tests:** non-admin cannot see Admin nav and gets ForbiddenState on direct URL; role change requires confirmation; Run now shows the summary and refetches runs; bell count updates after mark-as-read (from refetch, not local decrement).

## Part C — Quality, E2E, Docker & docs

- **Responsive pass:** check every page at 1440, 1024, 768 and 390 px widths; fix overflow, sidebar drawer, filter sheet, stacked KPI grid, horizontally scrolling tables.
- **Accessibility pass:** keyboard-only walk of login → project → task edit → cost post → CR decision; visible focus; dialog focus trap and Esc; labels; icon-only buttons have `aria-label`; badge text never colour-only; check contrast of muted text.
- **Playwright E2E smoke** (`npm run test:e2e`, against the running stack with seeded data):
  1. PM logs in, creates a project, adds a task; contributor logs in, updates progress; reload shows persisted progress (journey 2 / test A).
  2. PM posts a draft cost; finance summary actual spend increases; drill-down lists the transaction (test B).
  3. PM approves a CR; detail shows exactly one new history entry (test C).
  4. Contributor does not see Post / Decide actions (UI side of test D).
  5. Dashboard: apply department filter, open the finance drill-down, record count shown (test E).
- **Docker:** `frontend/Dockerfile` (multi-stage: build → nginx serving `dist/`, nginx proxies `/api` to the `api` service); add `web` service to `docker-compose.yml` under `profiles: ["app"]`, port 5173 or 8080. `docker compose --profile app up -d --build` must bring up db + api + worker + web.
- **Docs:** README (frontend setup, demo logins, ports, how to run E2E); `docs/architecture.md` frontend section (routing, API client, state approach, reusable components, error/conflict handling, design system); update `docs/e2e-checklist.md` with the UI steps for tests A–E, G; screenshots of dashboard, project detail, finance tab and CR detail in `docs/screenshots/`.

---

## Acceptance (whole milestone)
```
cd frontend && npm run typecheck && npm run lint && npm test && npm run build
cd backend && npm test
docker compose --profile app up -d --build
cd frontend && npm run test:e2e
```
Manual for the owner (list in the run report): journey 6 — filter the dashboard, open a KPI drill-down, and reproduce one KPI value with a SQL query in DBeaver (test E); run automation from the UI and see the run row + notification (test G).

## Out of scope
Power BI, MS Access, PowerPoint, hosted deployment.

## Design rationale
How a KPI on screen traces to its SQL (drill drawer + kpi-definitions); why each widget fails independently; why notifications refetch instead of local counts; how the dashboard stays correct after mutations (invalidation, no client math); what the E2E suite proves versus the backend tests.
