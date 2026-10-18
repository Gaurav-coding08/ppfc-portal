# 11 — Finance: budgets, revisions, categories & cost transactions (done 2026-10-18)

## What exists now
Full finance module in `modules/finance/` split into three sub-modules: budgets (view + revision create + admin decision), cost categories (CRUD, admin-only mutations), and cost transactions (draft/posted lifecycle, reversals, cross-project drill-downs). Every mutation is audited inside a transaction. Posted costs are immutable at both the service layer (422 `INVALID_TRANSITION`) and the DB trigger (`prevent_posted_cost_mutation` → mapped to 409 in `errorHandler.ts`). Budget revisions follow the same self-approval-forbidden pattern as change requests (DB CHECK + service guard). The `fn_project_financials(asOf)` SQL function is the single source of truth for all KPIs; the finance module reads from it but never reimplements its logic.

## Files
- `backend/src/modules/finance/budgets.schemas.ts` — zod schemas for budget/revision endpoints
- `backend/src/modules/finance/budgets.repository.ts` — budget reads via `fn_project_financials`, revision joins
- `backend/src/modules/finance/budgets.mutations.repository.ts` — revision insert, decision update, negative-budget check
- `backend/src/modules/finance/budgets.service.ts` — getBudget, createRevision, decideRevision
- `backend/src/modules/finance/budgets.controller.ts` — HTTP handlers
- `backend/src/modules/finance/budgets.routes.ts` — `projectBudgetRoutes` + `budgetRevisionsRoutes`
- `backend/src/modules/finance/categories.schemas.ts` — zod schemas for cost categories
- `backend/src/modules/finance/categories.repository.ts` — list, find, insert, update, hasDraftCosts
- `backend/src/modules/finance/categories.service.ts` — list (admin can see inactive), create, update with deactivation guard
- `backend/src/modules/finance/categories.controller.ts` — HTTP handlers
- `backend/src/modules/finance/categories.routes.ts` — `costCategoriesRoutes`
- `backend/src/modules/finance/costs.schemas.ts` — zod schemas for all cost endpoints
- `backend/src/modules/finance/costs.repository.ts` — list/find with joins (category name, user names, signed amount)
- `backend/src/modules/finance/costs.mutations.repository.ts` — insert, post (optimistic lock), insertReversal
- `backend/src/modules/finance/costs.service.ts` — CRUD, postCost (idempotent), reverseCost
- `backend/src/modules/finance/costs.controller.ts` — HTTP handlers
- `backend/src/modules/finance/costs.routes.ts` — `projectCostRoutes` + `costsRoutes`
- `backend/src/app.ts` — mounts all finance routes
- `backend/src/middleware/errorHandler.ts` — maps PG `P0001` trigger error to 409
- `backend/tests/integration/finance-budget.test.ts` — 18 tests
- `backend/tests/integration/finance-costs.test.ts` — 16 tests
- `docs/api-routes.md` — 16 new endpoint rows

## Database
No new migrations. Uses existing tables from migration 004: `cost_categories`, `project_budgets`, `budget_revisions`, `cost_transactions`. Uses `fn_project_financials(asOf)` from migration 007. Uses `prevent_posted_cost_mutation` trigger from 004/009.

## Endpoints
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | /api/v1/projects/:projectId/budget | view | Budget summary + revisions from fn_project_financials |
| POST | /api/v1/projects/:projectId/budget-revisions | manage | Pending revision; negative-budget guard |
| POST | /api/v1/budget-revisions/:id/decision | admin | Idempotent; self-approval → 422; non-pending → 422 |
| GET | /api/v1/cost-categories | any | Active only; admin + includeInactive sees all |
| POST | /api/v1/cost-categories | admin | Unique code/name |
| PATCH | /api/v1/cost-categories/:id | admin | Deactivation guard on draft costs |
| GET | /api/v1/projects/:projectId/costs | view | Filters, sort, pagination |
| GET | /api/v1/costs | any (scoped) | Cross-project; postedOnly + upToAsOf for actual-spend rows |
| GET | /api/v1/costs/:id | view | Single cost with joins |
| POST | /api/v1/projects/:projectId/costs | manage | Draft creation; inactive category → 422 |
| PATCH | /api/v1/costs/:id | manage | Drafts only; optimistic lock |
| DELETE | /api/v1/costs/:id | manage | Drafts only; 204 |
| POST | /api/v1/costs/:id/post | manage | Idempotent; draft → posted; returns financials |
| POST | /api/v1/costs/:id/reverse | manage | Posted expense only; creates reversal row |

## Reusable pieces (use these, don't rebuild)
- `budgetsRepo.findBudgetSummary(projectId, asOf, client?)` — full budget + revisions for one project
- `costsRepo.listCostsScoped(caller, filters, client?)` — cross-project cost list with scoping
- `costsRepo.findCostById(id, client?)` — joined cost row with names and signedAmount
- `costsRepo.findRawCostForUpdate(id, client)` — `SELECT ... FOR UPDATE` for serialization
- `mutationsRepo.postCost(id, version, postedBy, client)` — atomic draft→posted with optimistic lock
- `mutationsRepo.insertReversal(input, client)` — creates a posted reversal entry
- `categoriesRepo.findCategoryById(id, client?)` — check isActive before cost creation
- `categoriesRepo.hasDraftCosts(categoryId, client?)` — deactivation guard

## Decisions & trade-offs
- **Budget revision decision is admin-only at the route level** (`requireRole('admin')`) plus self-approval check in the service — contributor/PM get 403 before the handler even runs, keeping the check order clean.
- **Post endpoint returns financials alongside the cost** — the feature spec requires it, and computing it inside the same transaction guarantees the numbers reflect the just-posted cost. Uses `fn_project_financials` with the cost's own `txnDate` as asOf.
- **Reversal is a separate posted row, not an update** — follows the immutability rule: corrections happen by adding entries, never editing. The `reverses_id` FK + UNIQUE constraint prevents double-reversal at the DB level too.
- **Cross-project costs endpoint** has `postedOnly` + `upToAsOf` boolean filters — when both are true, the result set is exactly the rows that make up "actual spend" in `fn_project_financials`. This supports drill-down from dashboard numbers to individual transactions.
- **Trigger error mapping in errorHandler** — the `P0001` code from `prevent_posted_cost_mutation` is mapped to 409 only when the message contains "immutable", so other `RAISE EXCEPTION` calls won't be misclassified.
- **`invalidTransition` returns 422** (not 409) — consistent with the change-requests module. The CLAUDE.md error code `INVALID_TRANSITION` is defined as 422 in `errors.ts`.

## Known gaps / TODO for later features
- `GET /api/v1/costs` cross-project endpoint does not have an `asOf` filter for the default reporting date — it's a general list with optional `upToAsOf` + `asOf` to reconstruct the actual-spend set.
- No `version` column on `budget_revisions` — decisions use `status = 'pending'` as the guard instead of optimistic locking. Feature 14 (hardening) could add it.
- Category rename/deactivation has no audit trail — could be added if needed.

## How to verify quickly
```
cd backend
npm run typecheck && npm run lint && npm test   # 264 tests pass (34 new)
```
