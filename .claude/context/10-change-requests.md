# 10 — Change requests & approval workflow (done 2026-10-18)

## What exists now
Full CR lifecycle: submit, list (scoped), detail with history, decide (approve/reject/return)
with idempotency, and resubmit from `returned`. Every mutation (submit, decision, resubmit) is
atomic — CR update, `change_history` row, and `audit_events` row all commit in one transaction
via `withTx`. The state machine is a pure function in `changeRequests.workflow.ts`, unit-tested
for every legal and illegal transition. Self-approval is blocked at both the service layer
(422 `SELF_APPROVAL_FORBIDDEN`) and the DB (`CHECK (decided_by IS NULL OR decided_by <> requested_by)`).
Approved CRs never touch budgets, costs, or `fn_project_financials`.

## Files
- `backend/src/modules/change-requests/changeRequests.workflow.ts` — pure `nextStatus(current, action)` state machine
- `backend/src/modules/change-requests/changeRequests.schemas.ts` — zod schemas for all endpoints
- `backend/src/modules/change-requests/changeRequests.repository.ts` — read queries: `listCrsScoped`, `findCrById`, `findCrHistory`, `findRawCrById`, `findRawCrForUpdate`
- `backend/src/modules/change-requests/changeRequests.mutations.repository.ts` — `nextCrCode`, `insertCr`, `insertHistory`, `updateCrDecision`, `updateCrResubmit`
- `backend/src/modules/change-requests/changeRequests.service.ts` — list, get, create (with tx)
- `backend/src/modules/change-requests/changeRequests.decision.service.ts` — `decideCr`, `resubmitCr` (both with tx)
- `backend/src/modules/change-requests/changeRequests.controller.ts` — HTTP handlers
- `backend/src/modules/change-requests/changeRequests.routes.ts` — `projectCrRoutes` + `changeRequestsRoutes`
- `backend/src/app.ts` — mounts both routers
- `backend/tests/unit/workflow.test.ts` — 16 tests (every legal + illegal transition)
- `backend/tests/integration/change-requests.test.ts` — 15 tests
- `docs/api-routes.md` — new endpoint rows

## Database
No new migrations. Uses existing tables: `change_requests` (migration 003), `change_history`
(003), `idempotency_keys` (003, updated 010).

## Endpoints
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | /api/v1/change-requests | any (scoped) | `?projectId&status(multi)&requestedBy&mine&from&to&page&pageSize` |
| GET | /api/v1/change-requests/:id | view | CR + `history[]` with actor names |
| POST | /api/v1/projects/:projectId/change-requests | view (member) | Auto `CR-NNN` code; tx: CR + history + audit |
| POST | /api/v1/change-requests/:id/decision | manage (not self) | Idempotent; check order: scope→role→self→state→version |
| POST | /api/v1/change-requests/:id/resubmit | requester only | From `returned`; optional title/description edit |

## Reusable pieces (use these, don't rebuild)
- `nextStatus(current, action)` (`changeRequests.workflow.ts`) — returns new status or null (illegal); pure, no side effects
- `nextCrCode(client)` (`changeRequests.mutations.repository.ts`) — next `CR-NNN`; call inside a transaction
- `findRawCrForUpdate(id, client)` — `SELECT ... FOR UPDATE` for serializing concurrent deciders
- `insertHistory(crId, from, to, actorId, reason, client)` — reusable for any status transition

## Decisions & trade-offs
- **Check order on decision**: scope (404) → role (403) → self-approval (422) → state (409) → version (409). Documented in the service file. Scope checked first to avoid leaking existence via different error codes.
- **`FOR UPDATE` + version check both present**: the row lock serializes concurrent deciders so only one proceeds; the version check catches stale clients who read the row before someone else decided. Both are needed because `FOR UPDATE` alone doesn't protect against a client holding a stale version number.
- **`assertNotSelf` from `lib/access.ts` not used** — it throws 404 (don't-leak pattern), but the feature spec requires 422 `SELF_APPROVAL_FORBIDDEN`. Used `selfApproval()` from `errors.ts` directly instead.
- **Resubmit clears `decided_by`/`decided_at`/`decision_reason`** and resets `submitted_at` to `now()` — a resubmitted CR is effectively a new submission from the decision perspective.
- **List endpoint uses `scopedProjectIdsSql`** — same cross-portfolio scoping pattern as risks (feature 09).

## Known gaps / TODO for later features
- Outbox insert for approved-change notification is left as a TODO comment in `decideCr` — not implemented per feature spec.
- No endpoint to update a CR's title/description/impactSummary outside the resubmit flow (the feature spec doesn't ask for one).
- The `invalidTransition` error uses status 422 (not 409 as the feature file's table says) because `invalidTransition()` in `errors.ts` is wired to 422. The feature file's table header says "409" for terminal-state attempts but the error code `INVALID_TRANSITION` maps to 422 in CLAUDE.md's error code list. Tests assert 422.

## How to verify quickly
```
cd backend
npm run typecheck && npm run lint && npm test   # 230 tests pass (31 new)
```
