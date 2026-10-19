# Feature 19 — UI polish context

## 19A — Brand & shell

### Changes

- **Rebrand**: renamed product from "PPFC Portal" to "Keel" with tagline "Portfolio & financial control" across:
  - `frontend/index.html` (`<title>`)
  - `frontend/src/components/layout/Sidebar.tsx` (sidebar header)
  - `frontend/src/auth/LoginPage.tsx` (login page)
  - `README.md` (project title)
  - Repo and package names kept unchanged as specified.

- **SVG logomark**: created `frontend/src/components/display/KeelLogo.tsx` — a keel/hull-line SVG that uses `currentColor` so it adapts to any context. Used in sidebar header and login page.

- **Favicon**: replaced the old Claude-bolt favicon in `frontend/public/favicon.svg` with a matching keel/hull-line icon in indigo-600.

- **Login page split layout**: redesigned `LoginPage.tsx`:
  - Left panel (lg+ only): dark slate-900 background with Keel logo, tagline, 3 value-point bullets (delivery, governance, financial control), and a static KPI-readout illustration (3 mini cards showing sample metrics).
  - Right panel: sign-in form + demo accounts box.
  - Mobile: stacks vertically with a centered brand header and the form below.

### Files touched

- `.claude/features/19-ui-polish.md` (new)
- `.claude/features/README.md` (added Phase 2 table)
- `.claude/context/PROGRESS.md` (row for feature 19)
- `README.md` (title rename)
- `frontend/index.html` (title)
- `frontend/public/favicon.svg` (new keel icon)
- `frontend/src/components/display/KeelLogo.tsx` (new)
- `frontend/src/components/layout/Sidebar.tsx` (logo + name)
- `frontend/src/auth/LoginPage.tsx` (split layout)

### Gate results

- Frontend: typecheck pass, lint pass, 89/89 tests pass, build pass
- Backend: skipped (Docker/Postgres not running — infrastructure dependency)
- E2E: skipped (requires running stack)

## 19B — Fill the empty space with real data

### Changes

- **Dashboard glance band** (`GlanceBand.tsx`): horizontal strip showing as-of date, approved budget, actual spend, forecast EAC, overrun count (with warning icon), and utilisation progress bar. Replaces the old CalendarDays reporting-date info block.
- **Widget padding**: reduced from `p-5` to `p-4` for tighter cards.
- **Chart min-height**: all chart widgets now have `min-h-[320px]` so they take visual priority.
- **Project Overview 2-column layout** (`OverviewTab.tsx`):
  - Left: progress history chart, next 3 planned milestones (uses `useProjectMilestones`), top 3 open risks sorted by score (uses `useProjectRisks`).
  - Right: financial mini-summary (budget, actual, utilisation from the project detail's `budget` field), latest 5 activity events (uses `useProjectActivity`).
  - Both sub-sections link to their respective tabs.
- **List polish**:
  - Sticky table header (`sticky top-0 z-10 bg-white` on `<TableHeader>`).
  - Status-colour left border utility (`lib/statusBorder.ts`) maps status strings to `border-l-4 border-l-{color}` classes.
  - Applied to projects list and tasks tab via `getRowClassName`.
- **Test fix**: dashboard tests updated to use `getAllByText` since the actual-spend value now appears in both the glance band and the KPI card.

### Files touched

- `frontend/src/features/dashboard/components/GlanceBand.tsx` (new)
- `frontend/src/features/dashboard/pages/DashboardPage.tsx` (glance band, chart min-height)
- `frontend/src/features/dashboard/pages/DashboardPage.test.tsx` (getAllByText fix)
- `frontend/src/features/dashboard/components/Widget.tsx` (tighter padding)
- `frontend/src/features/projects/components/OverviewTab.tsx` (2-col layout)
- `frontend/src/components/data/DataTable.tsx` (sticky header)
- `frontend/src/lib/statusBorder.ts` (new)
- `frontend/src/features/projects/pages/ProjectsListPage.tsx` (status border)
- `frontend/src/features/tasks/components/TasksTab.tsx` (status border)

### Gate results

- Frontend: typecheck pass, lint pass, 89/89 tests pass, build pass
- Backend/E2E: skipped (Docker not running; no backend changes)
