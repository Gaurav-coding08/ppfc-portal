# Feature 19 — UI polish

UI-only changes: no business logic, API, SQL, route, permission or KPI-definition changes.
Every number still comes from the API. No new dependencies without asking.

## Part A — Brand & shell

- Rename the product in the UI, page titles, login and README from "PPFC Portal" to "Keel"
  with tagline "Portfolio & financial control". Inline SVG logomark (keel/hull line) in the
  sidebar and favicon. Keep repo/package names unchanged.
- Login: split layout. Left: brand, tagline, 3 one-line value points (delivery, governance,
  financial control), a small static KPI-readout illustration. Right: form + demo accounts.

## Part B — Fill the empty space with real data (existing endpoints only)

- Dashboard: top "portfolio at a glance" band (as-of date, approved budget, actual, EAC,
  overrun count, utilisation progress bar); tighter card padding; max width 1440 on a 12-col
  grid; charts min-height 320.
- Project Overview: 2 columns. Left: progress-over-time chart, next 3 milestones, top 3
  open risks. Right: financial mini-summary (existing summary endpoint) + latest activity.
- Lists: 40 px rows, sticky header, status-colour left border, empty states with a one-line
  next action.

## Part D — Guidance & "what's new"

- Dashboard "How to read this" toggle: dismissible panel explaining the fixed 30 Sep 2026
  as-of date, that numbers come from SQL via the API, how filters combine, and the drill icon.
  KPI tooltips stay.
- Role-based "Your focus" strip under the glance band: contributor -> overdue/due-soon tasks
  (tasks/mine); PM -> CRs awaiting my decision + my projects' finance alerts; admin -> failed
  automation runs + pending budget revisions. Items link to records; empty state "Nothing needs
  your attention."
- First-login guided tour (4-5 steps: sidebar, filters, a KPI drill-down, Your focus, bell),
  role-aware, Skip/Next/Done, keyboard accessible, once per user (localStorage in try/catch),
  re-openable via user menu "Take the tour". Small in-repo component.
- "What's new" in the user menu: short static list (Keel rebrand, Your focus, CSV export,
  roadmap).
- Tour disabled when `?tour=off` or `navigator.webdriver` is true. Unit tests: shows once,
  Skip persists, Your focus renders per role from mocked responses.

## Part C — Optional enhancements

- "Export CSV" on Projects, Tasks, Costs, Risks (current filtered page from the API response).
- Milestone roadmap view (Gantt-style strip across projects) from the existing milestones
  endpoint.
- README "Enhancements" section: these + the version-conflict handling already built.
