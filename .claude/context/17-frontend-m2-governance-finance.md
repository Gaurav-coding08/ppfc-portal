# 17 — Frontend Milestone 2: risks, change requests & finance

## Part A (done 2026-10-19)

### What exists now

Risks (module 03) and change requests (module 04) in the SPA. Risks: a project Risks tab
(manager create/edit/close, everyone else read-only), the portfolio `/risks` register with
project and department filters, and `/risks/high-exposure`. Change requests: the portfolio
`/change-requests` list, a project tab with "Submit change" for any member, and
`/change-requests/:id` with a history timeline, the reviewer decision panel (reason, confirm,
Idempotency-Key, double-submit guard) and the requester's edit-and-resubmit. Finance (Part B)
is still a placeholder tab.

### Files

- `features/risks/types.ts` — `Risk`, type/status/rating options, `PROJECT_RISK_DEFAULTS`, `RISK_LIST_DEFAULTS`, `RISK_FILTER_KEYS`
- `features/risks/scorePreview.ts` — `previewScore`, `previewBand`, `mitigationRequired`, `HIGH_EXPOSURE_SCORE` (form preview only; mirrors backend `risks.shared.ts`)
- `features/risks/schemas.ts` — `riskFormSchema`, `toCreateBody`, `toUpdateBody(values, dirty)`
- `features/risks/hooks/` — `useProjectRisks`, `usePortfolioRisks`, `useHighExposureRisks`; `useCreateRisk`, `useUpdateRisk`, `useInvalidateRisks`
- `features/risks/components/` — `riskColumns({projectLabel?, actions?})` + `riskRowClassName`, `RiskFilters` (generic, accepts extra selects as children), `RiskFormSheet`, `RisksTab`
- `features/risks/pages/` — `RisksPage` (`/risks`), `HighExposurePage` (`/risks/high-exposure`)
- `features/change-requests/types.ts`, `schemas.ts` — status options, `CR_LIST_DEFAULTS`, `PROJECT_CR_DEFAULTS`, `CR_FILTER_KEYS`; submit/decision/resubmit zod schemas
- `features/change-requests/hooks/` — `useChangeRequests(filters)`, `useChangeRequest(id)`; `useSubmitCr`, `useDecideCr`, `useResubmitCr`, `useInvalidateChangeRequests`
- `features/change-requests/components/` — `crColumns`, `CrFilters`, `ChangeRequestsTab`, `SubmitCrSheet`, `DecisionPanel`, `CrHistoryTimeline`, `ResubmitSheet`
- `features/change-requests/pages/` — `ChangeRequestsPage`, `ChangeRequestDetailPage`
- `auth/can.ts` — `canDecideChangeRequest(user, memberships, cr)` → `'eligible' | 'own' | 'none'`
- `features/projects/hooks/useReferenceData.ts` — `useProjectFilterOptions` now also returns `projects`; new `useProjectLabel()`
- `components/data/DataTable.tsx` — optional `getRowClassName(row)`
- `api/queryKeys.ts` — `risks`, `changeRequests`
- `test/fixtures/governance.ts` — `risk()`, `changeRequest()`, `listResponse()`, `projectOptionsResponse`
- Tests: `RiskFormSheet.test.tsx` (3), `RisksTab.test.tsx` (2), `HighExposurePage.test.tsx` (2), `ChangeRequestDetailPage.test.tsx` (8)
- `docs/openapi.yaml` — risk + CR params, bodies and response schemas (see Decisions)

### Database

None.

### Endpoints / Pages

| Route | Roles | Notes |
|---|---|---|
| `/projects/:id?tab=risks` | view; manage → new/edit/close | `&q&status=a,b&type&sort=score\|dueDate\|status&order&page` |
| `/projects/:id?tab=change-requests` | view; any viewer can submit | `&status=a,b&page` |
| `/risks` | any (scoped) | `?q&status&type&projectId&departmentId&sort&order&page`; read-only, Project links to the tab |
| `/risks/high-exposure` | any (scoped) | `?page`; rows rendered exactly as returned |
| `/change-requests` | any (scoped) | `?status=a,b&projectId&mine=true&from&to&page` |
| `/change-requests/:id` | view (404 → "not found or no access") | decision panel / resubmit by state + role |

No backend endpoints were added. Calls: `GET/POST /projects/:projectId/risks`, `GET /risks`,
`GET /risks/high-exposure`, `PATCH /risks/:id`, `GET /change-requests`,
`GET /change-requests/:id`, `POST /projects/:projectId/change-requests`,
`POST /change-requests/:id/decision`, `POST /change-requests/:id/resubmit`, `GET /dashboard/filters`.

### Reusable pieces (use these, don't rebuild)

- `useProjectLabel()` → `(projectId) => "PRJ-001 — Name"` (falls back to `Project #id`), for any list whose rows carry only `projectId` (costs, alerts in Part B)
- `DataTable getRowClassName` — muted rows for closed/reversed records (Part B's reversed costs)
- `DecisionPanel` pattern for Part B's budget-revision decision: key from `useState(newIdempotencyKey)`, `inFlight` ref guard, `pending` on ConfirmDialog, replace the key only after success, remount the panel with `key={record.version}`
- `canDecideChangeRequest` — the self-decision pattern; budget revisions need the same ("never own")
- `useInvalidateChangeRequests` / `useInvalidateRisks` — `<module>.all` + `projects.all` + `dashboard.all`
- Tab URL keys: add any new tab's filter keys to `TAB_FILTER_KEYS` in `ProjectDetailPage.tsx`
- Testing toasts: render `<Toaster />` next to the page in `renderWithProviders`; scope repeated text with `within(dialog)`

### Decisions & trade-offs

- **Score/band preview is form-only.** CLAUDE.md says the browser never computes scores. The feature spec asks for a preview labelled "calculated on save", so `scorePreview.ts` computes p × i only inside the form; every list and badge shows the API's `score`/`exposure`. The thresholds are copied from the backend in one file with a pointer back to it.
- **Mitigation-required is a hint, not a client block.** The field turns required at ≥ 15, but the form still sends the request and the backend's 422 decides. That 422 has no `details`, so `businessRuleField` matches its message (mitigation/owner) to show it on the right field; anything else goes to the form-level banner.
- **Closing goes through a confirmed row action.** The form's status select leaves out "Closed" unless the risk is already closed (so it can be reopened).
- **Idempotency key lifetime**: the backend replays any *successful* response for the same (key, user, path), and deletes the key on failure. So one key per panel is safe to reuse across failed retries and changed decisions. It must be replaced after a success, otherwise the next decision on a returned-then-resubmitted CR would replay the old response. Both the post-success reset and `key={cr.version}` remount take care of that.
- **INVALID_TRANSITION is handled by code, not status**: the spec says 409 but the backend returns 422 (feature 10 context). The panel shows a toast and invalidates, so the page refetches the real state.
- **Decision panel visibility**: a contributor (or a PM from another project) sees no panel at all (acceptance D). The disabled "You can't decide your own request" panel is only for someone who could otherwise decide.
- **Project labels come from `/dashboard/filters.projects`** because risk/CR rows only carry `projectId` and it's the one option list every role can call.
- **No sortable CR columns**: the backend orders by newest submission and has no sort param.
- **OpenAPI fixed rather than casting**: Risk `ownerId` is nullable, `ownerName`/`closedAt` were added, and so were the risk list params (type/status/ownerId/minScore/q/sort/order/departmentId) and the full POST/PATCH risk bodies. CRs gained `requesterName`/`submittedAt`/`deciderName`, history entries and the list params (projectId/requestedBy/mine/from/to). The decision endpoint now documents its 403/409/422 responses. `routes:check` is still 77/77.

### Known gaps / TODO for later parts/features

- Part B: Finance tab, cost categories, `/finance/alerts`, `/finance/comparison`.
- Risk `ownerId` filter and `minScore` are supported by the API but not exposed in the UI.
- The portfolio `/risks` page is read-only; edits happen on the project tab (the owner list needs project members).
- No standalone risk detail page (`GET /risks/:id` unused).

### How to verify quickly

```bash
cd frontend && npm run typecheck && npm run lint && npm test && npm run build   # 57 tests
cd ../backend && npm test                                                     # 453 tests
```

## Part B (done 2026-10-19)

### What exists now

Finance (module 05) in the SPA. The project **Finance tab** shows, in order:
- an alerts strip and seven KPI cards, each with a definition tooltip;
- spend-by-category (bar) and monthly actual-vs-forecast (line) charts;
- the budget with every revision, request and admin approve/reject;
- the costs table: draft → post, reverse, and draft edit/delete;
- the monthly forecast grid, saved in one PUT.

Clicking **Actual spend** filters the costs table to posted rows up to the as-of date, which are exactly the rows that number sums. Portfolio pages: `/finance/alerts`, `/finance/comparison` (up to 10 projects, plus the `excluded` notice) and `/finance/categories` (admin). **Feature 17 is complete.**

### Files

- `features/finance/types.ts` — API types, `COST_LIST_DEFAULTS`, `FINANCE_FILTER_KEYS`, `ALERT_LABELS`, `KPI_DEFINITIONS` (CLAUDE.md wording)
- `features/finance/months.ts` — `monthsBetween`, `isEditableMonth`, `toMonth`, `formatMonth` (string month math for the grid layout)
- `features/finance/schemas.ts` — cost / revision / category zod schemas and body builders (`toUpdateCostBody` = dirty fields only)
- `features/finance/hooks/useFinanceQueries.ts` — `useFinancialSummary`, `useBudget`, `useProjectCosts`, `useForecasts`, `useCostCategories`, `useFinanceAlerts`, `useFinanceComparison`
- `features/finance/hooks/useFinanceMutations.ts` — `useInvalidateFinance` + create/update/delete/post/reverse cost, request/decide revision, save forecasts, create/update category
- `features/finance/components/` — `FinanceTab`, `FinanceSummaryCards`, `FinanceAlertsStrip`, `FinanceCharts`, `BudgetSection`, `RevisionFormSheet`, `CostsSection`, `CostFilters`, `costColumns`, `CostRowActions`, `CostFormSheet`, `ForecastGrid`
- `features/finance/pages/` — `FinanceAlertsPage`, `FinanceComparisonPage`, `CostCategoriesPage`
- `components/form/ReasonConfirmDialog.tsx` — confirm dialog with a required reason
- `components/display/KpiCard.tsx` — new optional `hint` (tooltip) and `onClick`/`actionLabel` (whole card is a button)
- `components/display/StatusBadge.tsx` — new `revision` and `alertSeverity` domains
- `auth/can.ts` — `canDecideBudgetRevision(user, revision)` → `'eligible' | 'own' | 'none'`
- `components/layout/nav.ts` — per-item `visible`; admin-only "Cost categories"; Comparison icon
- `api/queryKeys.ts` — `finance` namespace
- `test/fixtures/finance.ts`; tests `FinanceTab.test.tsx` (9), `FinancePortfolioPages.test.tsx` (3)
- `docs/openapi.yaml` — finance response schemas + cost list params (see Decisions)
- **Backend fix:** `backend/src/modules/finance/summary.repository.ts#getAlerts` + regression test in `finance-insights.test.ts`

### Database

None.

### Endpoints / Pages

| Route | Roles | Notes |
|---|---|---|
| `/projects/:id?tab=finance` | view (read-only); manage → add/edit/delete/post/reverse, request revision, save forecast; admin (not own) → decide revision | `&status&categoryId&from&to&sort=txnDate\|amount\|status&order&page` |
| `/finance/alerts` | PM/admin nav (API is scoped for any role) | `?departmentId` |
| `/finance/comparison` | PM/admin nav | `?projectIds=1,4` (max 10) |
| `/finance/categories` | admin (others see ForbiddenState) | create, rename, deactivate/reactivate |

No backend endpoints were added. Calls: `GET /projects/:id/financial-summary`, `GET /projects/:id/budget`, `POST /projects/:id/budget-revisions`, `POST /budget-revisions/:id/decision`, `GET/POST /projects/:id/costs`, `PATCH/DELETE /costs/:id`, `POST /costs/:id/post`, `POST /costs/:id/reverse`, `GET/PUT /projects/:id/forecasts`, `GET/POST /cost-categories`, `PATCH /cost-categories/:id`, `GET /finance/alerts`, `GET /finance/comparison`.

### Reusable pieces (use these, don't rebuild)

- `useInvalidateFinance()` — `finance.all` + `projects.all` + `dashboard.all`; any finance write calls it
- `ReasonConfirmDialog({ title, description, confirmLabel, onConfirm(reason), pending, destructive })` — parent closes it on success; a failed request keeps the typed reason
- `KpiCard hint` / `onClick` — M3 dashboard KPI cards with definitions and drill-downs
- `FinanceSummaryCards`, `FinanceCharts` — reuse in the M3 dashboard if per-project panels are needed
- `monthsBetween` / `isEditableMonth` — any month grid tied to the reporting date
- `StatusBadge domain="alertSeverity"` — dashboard alert lists

### Decisions & trade-offs

- **Numbers are refetched, never recalculated.** `POST /costs/:id/post` returns `financials`, but they are ignored: they're computed as of the *cost's* date, not the reporting date, so showing them would briefly disagree with every other screen. The test returns `{}` for them and asserts the card shows the second summary response.
- **One Idempotency-Key per confirmation.** The key is created when the Post (or revision-decision) dialog opens and reused for retries from that dialog. Next to it: an `inFlight` ref and the dialog's pending-disable. Checked by removing both guards: the double-click test then saw 2 POSTs and failed.
- **Revision decision sends `version: 1`.** `budget_revisions` has no version column (feature 11: the guard is `status = 'pending'`), but the decision schema still requires `version >= 1`. OpenAPI documents this. A stale decision comes back as 422 INVALID_TRANSITION → toast + refetch.
- **Forecast PUT also sends an Idempotency-Key** (CLAUDE.md rule) even though the route has no idempotency middleware; a repeated PUT of the same months is idempotent anyway.
- **Forecast grid editability mirrors the backend rule** (month > reporting month, ≤ project end) only to lay out the inputs; the backend 422 still decides. Blank months are not sent (the PUT can't delete). The grid remounts on each refetch so inputs start from saved values.
- **"Reversed" status isn't shown on the original expense.** The API has no "has been reversed" flag, and deriving one from reversal rows on the current page would be wrong across pages. Reversal rows are muted with a "Reversal" badge and a negative `signedAmount`; reversing again returns 422 with its message.
- **Drill-down = project costs `?status=posted&to=<asOf>`**, the same set `fn_project_financials` sums (reversals included). Verified live on PRJ-004: 11 rows summing to 103,328 = actual spend.
- **Contributors**: the Finance tab is read-only (the API allows view); the finance nav group stays hidden (feature 16 decision). Write buttons aren't rendered; a direct 403 becomes a toast with the request id.
- **Comparison selection in the URL**, capped at 10 (backend max). Excluded ids are labelled through `useProjectLabel`.
- **OpenAPI fixed rather than casting:**
  - every finance path had no response schema;
  - the cost list was missing 8 query params;
  - `CostTransaction` lacked its joined names and posting fields;
  - `BudgetRevision` listed a `version` that doesn't exist and lacked names, reason and timestamps;
  - `Forecast.month` comes back as `YYYY-MM-01`, not `YYYY-MM`.

  `routes:check` is still 77/77.
- **Backend bug fixed (not a new endpoint):** `GET /finance/alerts` returned 500 for every non-admin. `scopedProjectIdsSql` hardcodes `$1` for the user id, but `getAlerts` put `asOf` at `$1`. Scope params now come first, the same rule the risks and costs repos follow. Regression test added (PM + contributor get 200, only visible projects).

### Known gaps / TODO for later features

- No "reversed" marker on an original posted cost (needs an API flag, e.g. `isReversed`).
- `GET /costs` (cross-project drill) is unused; the M3 dashboard drill-downs can use it.
- Costs table has no text search (`q` is supported by the API).
- Category deactivation guard (drafts in use) relies on the backend 422 toast.
- Main bundle chunk still triggers Vite's 500 KB warning (547 KB, down from 729 KB because finance pages are lazy).

### How to verify quickly

```bash
cd frontend && npm run typecheck && npm run lint && npm test && npm run build   # 69 tests
cd ../backend && npm test                                                     # 454 tests
```
