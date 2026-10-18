# 11 — Finance: budgets, revisions, categories & cost transactions

## Goal
Finance as an operational module with editable records and controls: approved budgets and revisions with authorization and rationale, cost categories, draft→posted cost lifecycle, immutable posted costs with reversals, all audited. Journey 4 and acceptance tests **B** and **D**.

## Depends on
07-projects

## Spec references
Assignment 2 §4 (all capabilities + financial definitions), §1 journey 4, §3.4, §10 tests B/D.

## Scope — module `modules/finance/` (split files: `budgets.*`, `categories.*`, `costs.*`)

### Budgets & revisions
| Method | Path | Roles | Behaviour |
|---|---|---|---|
| GET | `/api/v1/projects/:projectId/budget` | view | `{ initialAmount, approvedRevisionsTotal, currentBudget, currency, revisions[] }` — current budget from `fn_project_financials(asOf)` |
| POST | `/api/v1/projects/:projectId/budget-revisions` | manage (PM) | `{ amount (signed, ≠ 0), rationale (min 10 chars), effectiveDate }`; status `pending`; a revision that would make current budget < 0 → 422; audited |
| POST | `/api/v1/budget-revisions/:id/decision` | **admin only** | idempotent; `{ decision: 'approve'\|'reject', reason }`; only from `pending` (409 otherwise); requester ≠ decider (422); tx + audit |

### Cost categories
| Method | Path | Roles | Behaviour |
|---|---|---|---|
| GET | `/api/v1/cost-categories` | any | active by default, `?includeInactive=true` for admin |
| POST | `/api/v1/cost-categories` | admin | unique code/name (409) |
| PATCH | `/api/v1/cost-categories/:id` | admin | rename / deactivate; cannot deactivate if used by **draft** costs (422) |

### Cost transactions
| Method | Path | Roles | Behaviour |
|---|---|---|---|
| GET | `/api/v1/projects/:projectId/costs` | view | filters `status`, `categoryId`, `from`, `to`, `entryType`, `q`; sort `txnDate,amount,status`; paginated; includes `categoryName`, `createdByName`, `postedByName`, `signedAmount` (negative for reversals) |
| GET | `/api/v1/costs` | any (scoped) | cross-project version for drill-downs: adds `projectId`, `departmentId`, `asOf` (`postedOnly=true&upToAsOf=true` gives exactly the rows behind "actual spend") |
| GET | `/api/v1/costs/:id` | view | |
| POST | `/api/v1/projects/:projectId/costs` | manage | create **draft**: `{ categoryId, txnDate, amount > 0, description, vendor? }`; inactive category → 422; project not `cancelled`; audited |
| PATCH | `/api/v1/costs/:id` | manage | drafts only (posted → 409 `INVALID_TRANSITION`); version; audited |
| DELETE | `/api/v1/costs/:id` | manage | drafts only; audited (with `before`) |
| POST | `/api/v1/costs/:id/post` | manage | **idempotent**; draft → posted; sets `posted_by/posted_at`; tx: update with version + audit `cost.post`; returns cost + refreshed project financial summary (actual, remaining, utilization from SQL) |
| POST | `/api/v1/costs/:id/reverse` | manage | posted expense only, not already reversed (409); `{ reason, txnDate? }` creates a **posted** `reversal` row (same amount/category, `reverses_id`) in a tx with audit |

### Controls
- Contributor → 403 on every finance mutation; non-member → 404.
- Posted costs: service refuses update/delete; DB trigger (feature 02) is the backstop — map trigger error to 409.
- Approved change requests never create costs or revisions (already tested in 10; don't add any link here).

## Tests (`integration/finance-budget.test.ts`, `integration/finance-costs.test.ts`)
- **Acceptance D:** member contributor `POST /costs/:id/post` and `POST /projects/:id/costs` directly → 403; nothing changes.
- **Acceptance B:** PM creates draft → posts it → actual spend increases by exactly the amount, remaining and utilization update (assert against values from `fn_project_financials` before/after).
- Draft cost does not change actual spend; cost dated after asOf does not change actual spend at default asOf.
- Posted cost PATCH/DELETE → 409; reversal reduces actual spend; double reversal → 409.
- Same Idempotency-Key on post twice → posted once, one audit row.
- Amount 0 / negative → 400; inactive category → 422.
- Budget revision: pending has no effect; admin approves → current budget increases; PM approving → 403; admin approving own request → 422; deciding non-pending → 409.
- Zero-budget project → utilization `null` in API response, no division error.

## Acceptance
```
npm run typecheck && npm run lint && npm test
```

## Design rationale
Draft vs posted as the approval rule; why posted rows are immutable and corrected via reversal (audit trail, accounting practice); why revisions are decided by admin and never by the requester; how idempotency stops double-posting from a double-click.
