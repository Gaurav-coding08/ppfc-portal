# 10 — Change requests & approval workflow

## Goal
A controlled approval workflow with an explicit state machine, self-approval prevention, idempotent decisions and durable history — decision, history row and audit row commit atomically. Journey 5 and acceptance tests **C** and **D**.

## Depends on
07-projects

## Spec references
Assignment 2 §1 journey 5, §2 module 04, §3.2 transaction integrity, §3.4 (Contributor calling approval API directly is denied), §4 (approved CRs never auto-create costs/revisions), §10 tests C/D.

## State machine (implement as a pure function `nextStatus(current, action)` in `changeRequests.workflow.ts`)

| From | Action | To | Who |
|---|---|---|---|
| — | submit | submitted | any project member (contributor included) |
| submitted | approve | approved | manager of project or admin, **not requester** |
| submitted | reject | rejected | same |
| submitted | return | returned | same |
| returned | resubmit | submitted | requester only |
| approved / rejected | any | — | terminal → 409 `INVALID_TRANSITION` |

Decision reason required for approve, reject and return.

## Scope — module `modules/change-requests/`

| Method | Path | Roles | Behaviour |
|---|---|---|---|
| GET | `/api/v1/change-requests` | any (scoped) | filters `projectId`, `status` (multi), `requestedBy`, `mine=true`, `from`, `to`; paginated |
| GET | `/api/v1/change-requests/:id` | view | CR + full `history[]` (actor names) |
| POST | `/api/v1/projects/:projectId/change-requests` | view (member) | `{ title, description, impactSummary? }`; code `CR-NNN`; tx: insert CR + history (`null → submitted`) + audit |
| POST | `/api/v1/change-requests/:id/decision` | manage | **idempotent** (`Idempotency-Key`); body `{ decision: 'approve'\|'reject'\|'return', reason, version }`. Service: `withTx` → `SELECT ... FOR UPDATE` the CR → `assertProjectAccess(manage)` → `assertNotSelf` → `nextStatus` → update with version check → insert exactly one `change_history` row → `writeAudit` → commit. Returns updated CR with history. |
| POST | `/api/v1/change-requests/:id/resubmit` | requester only | from `returned`; optional edited title/description; tx with history + audit |

### Notes
- Order of checks matters and must be documented in code: scope (404) → role (403) → self-approval (422) → state (409) → version (409).
- `FOR UPDATE` + version check: explain why both (lock serialises concurrent deciders; version catches stale clients).
- Approving a CR does **not** touch budgets or costs (test it).
- Leave an `outbox` insert hook point as a commented TODO for the automation phase (approved-change notification) — do not implement now.

## Tests (`integration/change-requests.test.ts`)
- **Acceptance D:** member contributor `POST /change-requests/:id/decision` directly with a valid token → 403 `FORBIDDEN`; CR unchanged; no history row added.
- **Acceptance C:** PM approves eligible CR → 200; exactly **one** new `change_history` row and one audit row; `decided_by/decided_at` set.
- PM deciding own CR → 422 `SELF_APPROVAL_FORBIDDEN` (seed or create one).
- Approve an already approved/rejected CR → 409 `INVALID_TRANSITION`.
- Return → requester resubmits → submitted; non-requester resubmit → 403.
- Missing reason → 400.
- Same `Idempotency-Key` twice → one history row, second response replayed.
- Atomicity: force `writeAudit` to throw (e.g. via a test-only hook/env flag or by mocking the audit module) → CR status unchanged and no history row.
- Approving a CR leaves `fn_project_financials` values unchanged.
- `unit/workflow.test.ts`: every row of the state table + every illegal transition.

## Acceptance
```
npm run typecheck && npm run lint && npm test
```

## Design rationale
State machine as a pure, unit-tested function; check ordering; how partial failure is prevented (single transaction, audit uses same client); `FOR UPDATE` vs optimistic version; DB check constraint as second line of defence against self-approval.
