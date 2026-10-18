# 16 — Frontend Milestone 1: foundation, projects, tasks & milestones

## Goal
A working, good-looking SPA a reviewer can log into and use for delivery work: app shell and design system, real authentication, the typed API client, the shared component kit every later screen reuses, and the full Projects, Tasks and Milestones modules. Covers business journeys **1** and **2** (dashboard part comes in M3), the milestone half of **3**, and acceptance test **A**.

## Depends on
14-backend-hardening, 15-automation-overdue-escalation

## Spec references
Assignment 2 §1 journeys 1–3, §2 modules 01–02 and 07 (sign-in), §3.1 (all bullets), §3.4 (role selector is not authentication), §10 test A.

## Read first
CLAUDE.md (Frontend section is binding), context files 04-auth, 05-access-control-platform, 06-admin-users-audit, 07-projects, 08-tasks-milestones, 14-backend-hardening (OpenAPI file path), and the OpenAPI file itself. Take every endpoint path, query param and body field from those — do not guess.

This milestone is split into parts. Implement **one part per run** (see run-feature skill).

---

## Part A — Foundation & shell

1. **Scaffold** `frontend/` with Vite React TS; install the pre-approved stack; shadcn init; Inter font; Tailwind theme tokens from the CLAUDE.md design system (indigo primary, slate neutrals, semantic colours).
2. **Vite proxy** `/api` → `http://localhost:4000`. Root README: how to run backend + frontend together.
3. **API layer** (`src/api/`):
   - `npm run api:types` → `schema.ts` from the backend OpenAPI file.
   - `client.ts`: openapi-fetch client, `credentials: 'include'`, JSON, attaches `Idempotency-Key` when provided.
   - `errors.ts`: `ApiError { status, code, message, details, requestId }`; `toApiError(res)`; helpers `isForbidden`, `isVersionConflict`, `isValidation`.
   - `queryKeys.ts`: one factory per module (`projects.list(filters)`, `projects.detail(id)`, …).
   - QueryClient defaults: `staleTime 30s`, `retry` only for network/5xx (never 4xx), `refetchOnWindowFocus: true`.
   - **Contract check:** for every endpoint this milestone uses, call it once against the running API (seeded data) and compare to the generated types. Fix mismatches in the OpenAPI file, record them in the AI dev log.
4. **Auth:** Login page (email + password, zod validation, error message from API, demo accounts listed below the form for reviewers — read emails from the seed docs), `AuthProvider` on `GET /auth/me`, `RequireAuth` route wrapper, 401 → redirect to `/login?next=`, logout via `POST /auth/logout` + cache clear. `can.ts` with UI hints per role/membership.
5. **App shell:** Sidebar (grouped nav per design system; items hidden by role), Topbar (breadcrumb, "Data as of" badge from the reporting date the API exposes — if none is exposed, read it from an existing endpoint's `asOf`; do not hardcode), user menu. Mobile drawer. 404 page.
6. **Shared kit** (`components/`): `DataTable` (server-side sort, pagination, column visibility, row click), `FilterBar` (search, selects, date range; synced to URL params), `Pagination`, `LoadingState` (skeletons), `EmptyState`, `ErrorState` (message + requestId + Retry), `ConfirmDialog`, `SubmitButton` (pending state), `FormField` wrappers for input/select/date/number/textarea, `StatusBadge`/`PriorityBadge`/`ExposureBadge`, `Money`, `Percent`, `DateText`, `ProgressBar`, `KpiCard`, `VersionConflictDialog`, `ForbiddenState`.
7. **Placeholder routes** for every later module (empty page with title), so navigation is complete from day one.

**Part A tests:** login validation + failed-login message; RequireAuth redirects when `/auth/me` is 401; `formatDate('2026-09-30')` renders 30 Sep 2026 regardless of TZ (set `TZ=Asia/Dubai` in the test); `<Money>` formats AED; `toApiError` parses the backend error shape incl. `requestId`; sidebar hides Admin group for a contributor.

## Part B — Projects (module 01)

- **List** `/projects`: DataTable (code, name, department, owner, status, dates, progress, delivery status). Filters: search, department, owner, status, start/end date range — all in URL. Sort and pagination server-side. "New project" for PM/Admin.
- **Create / edit** (sheet or page): name, description, department, owner (eligible users from the users endpoint), status, start/end dates (end ≥ start, mirrors backend), initial approved budget on create (AED). Inline field errors from 400/422 `details`. Edit sends `version`; 409 → VersionConflictDialog. Success toast, invalidate list + detail.
- **Detail** `/projects/:id`: header card (code, name, status, owner, department, dates, weighted progress bar, delivery status) + tabs. Build **Overview**, **Tasks**, **Milestones**, **Members**, **Activity** now; Risks / Change requests / Finance tabs render placeholders until M2.
- **Members tab:** list; add/remove for PM/Admin with confirm.
- **Activity tab:** project activity feed (audit events) with actor, action, time.
- **Progress history:** small line chart of progress snapshots on Overview (if the endpoint exists).
- Non-member opening a project URL → backend 404 → friendly "Project not found or you don't have access".

## Part C — Tasks & milestones (module 02)

- **Project Tasks tab:** DataTable (title, assignee, status, priority, due date, weight, progress) with overdue / due-soon badges, filters (status multi, assignee incl. "Unassigned", priority, overdue only), sort, pagination. Create/edit for PM/Admin (assignee limited to project members, weight > 0, progress 0–100).
- **Contributor edit** of own task: a reduced form with **only** progress (slider + number) and status. If the API rejects with 403 `details.fields`, show which fields aren't allowed.
- After any task save: invalidate the task list, the project detail (progress) and the `dashboard` query keys — this is what makes journey 2 visible later.
- Delete only shown when the backend rule allows (untouched task); confirm first.
- **My tasks** `/my-tasks`: assigned tasks across projects, grouped Overdue / Due soon / Upcoming / Done, inline progress update.
- **Milestones tab:** list with due date, status, achieved date; a compact roadmap strip (milestones as dots on a time axis, coloured by status); create/edit for PM/Admin with validation mirroring the backend (date within project dates; achieved requires achieved date). Milestones due within 14 days highlighted.

**Part B+C tests:** project list writes filters to the URL and reads them back on reload; create-project form shows server validation errors inline; edit 409 opens the conflict dialog; contributor task form renders only progress/status; saving a task invalidates the project detail query (assert refetch via msw call count); overdue badge shown for an overdue task and not for one due exactly on the reporting date (use API data, don't compute).

---

## Acceptance (whole milestone)
```
cd frontend && npm run typecheck && npm run lint && npm test && npm run build
cd backend && npm test
```
Manual (list these in the run report for the owner to click through): log in as PM → create a project → add a task → log in as its contributor → update progress → reload → progress persisted and project progress changed (test A).

## Out of scope
Risks, change requests, finance (M2); dashboard, admin, automation, notifications, Playwright E2E, Docker (M3).

## Design rationale
Why React Query invalidation instead of local state patching; why filters live in the URL; why the typed client is generated and how OpenAPI drift was handled; why role-based hiding is not security; how dates avoid the timezone bug.
