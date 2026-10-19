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
