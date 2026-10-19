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
