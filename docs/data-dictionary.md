# Data dictionary

All tables live in the `public` schema of the `ppfc` database.
Money columns are `NUMERIC(14,2)` (never float). Timestamps are `TIMESTAMPTZ`.

---

## app_settings

System-wide key-value configuration.

| Column | Type | Null | Meaning |
|---|---|---|---|
| key | TEXT PK | no | Setting name (e.g. `reporting_date`) |
| value | TEXT | no | Setting value as text |

Seed row: `reporting_date = 2026-09-30`.

---

## departments

Organizational units that projects and users belong to.

| Column | Type | Null | Meaning |
|---|---|---|---|
| id | BIGINT IDENTITY PK | no | |
| code | TEXT UNIQUE | no | Short code (e.g. `IT`) |
| name | TEXT UNIQUE | no | Full name |

---

## users

Every person who can log in.

| Column | Type | Null | Meaning |
|---|---|---|---|
| id | BIGINT IDENTITY PK | no | |
| email | TEXT | no | Unique (case-insensitive index) |
| full_name | TEXT | no | Display name |
| password_hash | TEXT | no | bcrypt hash |
| role | TEXT | no | `contributor`, `project_manager`, or `admin` |
| department_id | BIGINT FK departments | yes | |
| is_active | BOOLEAN | no | Soft-delete flag, default `true` |
| version | INT | no | Optimistic lock, default 1 |
| created_at | TIMESTAMPTZ | no | |
| updated_at | TIMESTAMPTZ | no | |

---

## projects

Top-level delivery entity. 1—N tasks, milestones, risks. 1—1 budget.

| Column | Type | Null | Meaning |
|---|---|---|---|
| id | BIGINT IDENTITY PK | no | |
| code | TEXT UNIQUE | no | Human-readable code (e.g. `PRJ-001`) |
| name | TEXT | no | |
| description | TEXT | yes | |
| department_id | BIGINT FK departments | no | |
| owner_id | BIGINT FK users | no | Primary owner (project manager) |
| status | TEXT | no | `planning`, `active`, `on_hold`, `completed`, `cancelled` |
| start_date | DATE | no | |
| end_date | DATE | no | CHECK `end_date >= start_date` |
| version | INT | no | Optimistic lock |
| created_by | BIGINT FK users | yes | |
| created_at | TIMESTAMPTZ | no | |
| updated_at | TIMESTAMPTZ | no | |

---

## project_members

Many-to-many: which users are on which projects and in what role.

| Column | Type | Null | Meaning |
|---|---|---|---|
| project_id | BIGINT FK projects (CASCADE) | no | PK part 1 |
| user_id | BIGINT FK users | no | PK part 2 |
| member_role | TEXT | no | `manager` or `contributor` |
| added_at | TIMESTAMPTZ | no | |

Cardinality: project 1—N members; user 1—N memberships.

---

## tasks

Work items under a project. Weight-based progress aggregation.

| Column | Type | Null | Meaning |
|---|---|---|---|
| id | BIGINT IDENTITY PK | no | |
| project_id | BIGINT FK projects | no | |
| title | TEXT | no | |
| description | TEXT | yes | |
| assignee_id | BIGINT FK users | yes | |
| status | TEXT | no | `todo`, `in_progress`, `blocked`, `done` |
| priority | TEXT | no | `low`, `medium`, `high`, `critical` |
| start_date | DATE | yes | |
| due_date | DATE | no | |
| weight | NUMERIC(6,2) | no | Must be > 0; used in progress calculation |
| progress | INT | no | 0–100. CHECK: `done` requires progress = 100 |
| completed_at | TIMESTAMPTZ | yes | |
| version | INT | no | Optimistic lock |
| created_at | TIMESTAMPTZ | no | |
| updated_at | TIMESTAMPTZ | no | |

Cardinality: project 1—N tasks.

---

## milestones

Key delivery dates for a project.

| Column | Type | Null | Meaning |
|---|---|---|---|
| id | BIGINT IDENTITY PK | no | |
| project_id | BIGINT FK projects | no | |
| name | TEXT | no | |
| due_date | DATE | no | |
| status | TEXT | no | `planned`, `achieved`, `missed` |
| achieved_date | DATE | yes | Required when status = `achieved` |
| version | INT | no | |
| created_at | TIMESTAMPTZ | no | |
| updated_at | TIMESTAMPTZ | no | |

Cardinality: project 1—N milestones.

---

## risks

Risks and issues tracked against a project.

| Column | Type | Null | Meaning |
|---|---|---|---|
| id | BIGINT IDENTITY PK | no | |
| project_id | BIGINT FK projects | no | |
| type | TEXT | no | `risk` or `issue` |
| title | TEXT | no | |
| description | TEXT | yes | |
| owner_id | BIGINT FK users | yes | |
| probability | SMALLINT | no | 1–5 |
| impact | SMALLINT | no | 1–5 |
| score | SMALLINT | no | Generated: probability × impact |
| mitigation | TEXT | yes | |
| due_date | DATE | yes | |
| status | TEXT | no | `open`, `mitigating`, `closed` |
| closed_at | TIMESTAMPTZ | yes | |
| version | INT | no | |
| created_at | TIMESTAMPTZ | no | |
| updated_at | TIMESTAMPTZ | no | |

Cardinality: project 1—N risks.

---

## progress_snapshots

Historical progress recordings for trend charts.

| Column | Type | Null | Meaning |
|---|---|---|---|
| id | BIGINT IDENTITY PK | no | |
| project_id | BIGINT FK projects | no | |
| snapshot_date | DATE | no | UNIQUE with project_id |
| progress_pct | NUMERIC(5,2) | yes | |
| actual_spend | NUMERIC(14,2) | yes | |

---

## change_requests

Formal change requests against a project (governance).

| Column | Type | Null | Meaning |
|---|---|---|---|
| id | BIGINT IDENTITY PK | no | |
| code | TEXT UNIQUE | no | Human-readable (e.g. `CR-001`) |
| project_id | BIGINT FK projects | no | |
| title | TEXT | no | |
| description | TEXT | yes | |
| impact_summary | TEXT | yes | |
| requested_by | BIGINT FK users | no | |
| status | TEXT | no | `submitted`, `approved`, `rejected`, `returned` |
| submitted_at | TIMESTAMPTZ | no | |
| decided_by | BIGINT FK users | yes | CHECK: `decided_by <> requested_by` |
| decided_at | TIMESTAMPTZ | yes | |
| decision_reason | TEXT | yes | |
| version | INT | no | |
| created_at | TIMESTAMPTZ | no | |
| updated_at | TIMESTAMPTZ | no | |

Cardinality: project 1—N change requests.

---

## change_history

Audit trail for change request status transitions.

| Column | Type | Null | Meaning |
|---|---|---|---|
| id | BIGINT IDENTITY PK | no | |
| change_request_id | BIGINT FK change_requests (CASCADE) | no | |
| from_status | TEXT | yes | null for initial submission |
| to_status | TEXT | no | |
| actor_id | BIGINT FK users | no | |
| reason | TEXT | yes | |
| created_at | TIMESTAMPTZ | no | |

Cardinality: change_request 1—N history rows.

---

## audit_events

General-purpose audit log for all entity mutations.

| Column | Type | Null | Meaning |
|---|---|---|---|
| id | BIGINT IDENTITY PK | no | |
| actor_id | BIGINT FK users | yes | null for system actions |
| entity_type | TEXT | no | e.g. `project`, `task`, `cost_transaction` |
| entity_id | BIGINT | no | |
| action | TEXT | no | e.g. `create`, `update`, `delete`, `post` |
| project_id | BIGINT | yes | For scoped queries |
| before | JSONB | yes | State before mutation |
| after | JSONB | yes | State after mutation |
| request_id | TEXT | yes | Correlation with HTTP request |
| created_at | TIMESTAMPTZ | no | |

---

## idempotency_keys

Stores responses for replay on duplicate requests.

| Column | Type | Null | Meaning |
|---|---|---|---|
| key | TEXT | no | PK part 1 (from `Idempotency-Key` header) |
| user_id | BIGINT FK users | no | PK part 2 |
| method | TEXT | no | HTTP method |
| path | TEXT | no | Request path |
| response_status | INT | no | Stored HTTP status |
| response_body | JSONB | yes | Stored response |
| created_at | TIMESTAMPTZ | no | |

---

## cost_categories

Lookup table for cost classification.

| Column | Type | Null | Meaning |
|---|---|---|---|
| id | BIGINT IDENTITY PK | no | |
| code | TEXT UNIQUE | no | |
| name | TEXT UNIQUE | no | |
| is_active | BOOLEAN | no | Soft-delete, default `true` |

---

## project_budgets

One budget per project (1—1).

| Column | Type | Null | Meaning |
|---|---|---|---|
| id | BIGINT IDENTITY PK | no | |
| project_id | BIGINT FK projects UNIQUE | no | Enforces 1—1 |
| initial_amount | NUMERIC(14,2) | no | CHECK >= 0 |
| currency | CHAR(3) | no | Default `AED` |
| approved_by | BIGINT FK users | yes | |
| approved_at | TIMESTAMPTZ | yes | |

---

## budget_revisions

Signed deltas to a project's budget. Only `approved` rows affect current budget.

| Column | Type | Null | Meaning |
|---|---|---|---|
| id | BIGINT IDENTITY PK | no | |
| project_id | BIGINT FK projects | no | |
| amount | NUMERIC(14,2) | no | Signed delta, CHECK <> 0 |
| rationale | TEXT | no | |
| status | TEXT | no | `pending`, `approved`, `rejected` |
| requested_by | BIGINT FK users | no | |
| decided_by | BIGINT FK users | yes | CHECK: `decided_by <> requested_by` |
| decided_at | TIMESTAMPTZ | yes | |
| decision_reason | TEXT | yes | |
| effective_date | DATE | no | |
| created_at | TIMESTAMPTZ | no | |

Cardinality: project 1—N revisions.

---

## cost_transactions

Individual cost line items against a project.

| Column | Type | Null | Meaning |
|---|---|---|---|
| id | BIGINT IDENTITY PK | no | |
| project_id | BIGINT FK projects | no | |
| category_id | BIGINT FK cost_categories | no | |
| txn_date | DATE | no | |
| amount | NUMERIC(14,2) | no | CHECK > 0 |
| description | TEXT | no | |
| vendor | TEXT | yes | |
| status | TEXT | no | `draft` or `posted` |
| entry_type | TEXT | no | `expense` or `reversal` |
| reverses_id | BIGINT FK cost_transactions UNIQUE | yes | Links reversal to original |
| created_by | BIGINT FK users | no | |
| posted_by | BIGINT FK users | yes | Required when status = `posted` |
| posted_at | TIMESTAMPTZ | yes | Required when status = `posted` |
| version | INT | no | |
| created_at | TIMESTAMPTZ | no | |
| updated_at | TIMESTAMPTZ | no | |

Constraints: posted ⇒ posted_by+posted_at set; reversal ⇔ reverses_id set.
Trigger: `trg_prevent_posted_cost_mutation` — BEFORE UPDATE/DELETE raises on posted rows.

Cardinality: project 1—N costs.

---

## financial_forecasts

Monthly cost forecasts per project. UNIQUE on (project_id, month).

| Column | Type | Null | Meaning |
|---|---|---|---|
| id | BIGINT IDENTITY PK | no | |
| project_id | BIGINT FK projects | no | |
| month | DATE | no | First of month (CHECK day = 1) |
| amount | NUMERIC(14,2) | no | CHECK >= 0 |
| updated_by | BIGINT FK users | yes | |
| updated_at | TIMESTAMPTZ | no | |

---

## outbox

Transactional outbox for async event dispatch.

| Column | Type | Null | Meaning |
|---|---|---|---|
| id | BIGINT IDENTITY PK | no | |
| event_type | TEXT | no | |
| entity_type | TEXT | no | |
| entity_id | BIGINT | no | |
| event_date | DATE | yes | |
| payload | JSONB | yes | |
| status | TEXT | no | `pending`, `sent`, `failed` |
| attempts | INT | no | Default 0 |
| last_error | TEXT | yes | |
| created_at | TIMESTAMPTZ | no | |
| processed_at | TIMESTAMPTZ | yes | |

UNIQUE on (event_type, entity_id, event_date).

---

## automation_runs

Log of batch/automation job executions.

| Column | Type | Null | Meaning |
|---|---|---|---|
| id | BIGINT IDENTITY PK | no | |
| job_name | TEXT | no | |
| started_at | TIMESTAMPTZ | no | |
| finished_at | TIMESTAMPTZ | yes | |
| status | TEXT | no | `running`, `success`, `failed` |
| items_found | INT | yes | |
| items_created | INT | yes | |
| error | TEXT | yes | |

---

## notifications

User-facing notifications (optionally linked to outbox events).

| Column | Type | Null | Meaning |
|---|---|---|---|
| id | BIGINT IDENTITY PK | no | |
| user_id | BIGINT FK users | no | |
| title | TEXT | no | |
| body | TEXT | yes | |
| link | TEXT | yes | |
| outbox_id | BIGINT FK outbox | yes | |
| read_at | TIMESTAMPTZ | yes | null = unread |
| created_at | TIMESTAMPTZ | no | |

---

## Functions & views

### fn_reporting_date() → DATE
Returns `app_settings.reporting_date`.

### fn_project_financials(p_as_of DATE) → TABLE
One row per project with: initial_budget, approved_revisions, current_budget, actual_spend, remaining_budget, utilization, forecast_to_complete, eac, projected_variance, forecast_missing, is_overrun, is_near_budget. Uses CTE-first aggregation to avoid fan-out.

### fn_project_progress() → TABLE
One row per project: progress_pct (weighted), task_count, done_count.

### fn_project_delivery_status(p_as_of DATE) → TABLE
One row per project: `delivery_status` — `completed` (project status is completed), `at_risk` (an
overdue incomplete task, a missed milestone, or an open risk/issue scoring ≥15), `behind`
(elapsed-time% minus progress% > 15 points), else `on_track`. A milestone counts as "missed" when
its own status is `missed`, or it's still `planned` with `due_date < p_as_of` — the generator and
UI only ever set `planned`/`achieved` directly, so "missed" is otherwise derived relative to asOf.

### fn_exposure_band(p_score SMALLINT) → TEXT
`'high'` (score ≥ 15), `'medium'` (8–14), else `'low'`. Single definition of the exposure-band
thresholds, mirrored by the JS constant in `modules/risks/risks.shared.ts` (needed before a risk
row — and its generated `score` — exists, e.g. the create-time mitigation-required check).

### v_project_financials (view)
`SELECT * FROM fn_project_financials(fn_reporting_date())` — for Power BI / Access.

### v_project_progress (view)
`SELECT * FROM fn_project_progress()` — for Power BI / Access.

---

## Data generation (feature 03)

`backend/scripts/generate-data.ts` builds the whole demo dataset in memory
(`backend/scripts/generate/`) and writes it to `data/csv/*.csv`. Determinism comes from
two things: `faker.seed(42)` at the start of every generation run, and every date in the
dataset being computed from fixed base dates — never `new Date()` with no arguments (the
"current" wall-clock time). Regenerating produces byte-identical CSVs every time.

Business-rule-relevant fields (dates, amounts, statuses) are hand-picked, not left to
faker — faker is only used for filler text (names, titles, descriptions). IDs are
explicit in the CSVs; `import-csv.ts` loads them with `OVERRIDING SYSTEM VALUE` (the id
columns are `GENERATED ALWAYS`) and resets each identity sequence afterwards.

**Timestamp policy.** Every timestamp column with business meaning — every business
table's `created_at`/`updated_at`, `change_requests.submitted_at`/`decided_at`,
`change_history.created_at`, `audit_events.created_at`, `cost_transactions.posted_at`,
`tasks.completed_at`, `risks.closed_at`, `milestones.achieved_date`,
`budget_revisions.created_at`/`decided_at`, `financial_forecasts.updated_at` — is an
explicit historical value in the CSV, computed from the fixed reporting date with
`atTime`/`shiftTimestamp` (`backend/scripts/generate/dates.ts`). None of them are left
blank to pick up the DB's `now()` default on import, and each one is consistent with its
own record's story: a CR's `submitted_at` is always before its `decided_at`;
`change_history` rows reuse those same two timestamps so they're chronological by
construction. A task or risk can be `done`/`closed` even when its due date is still in
the future as of the reporting date — finishing early is a normal, valid outcome — but
its `completed_at`/`closed_at` is never a future timestamp: it lands on the due date
itself when that's already past, otherwise on a deterministic day shortly before the
reporting date. The **only** business timestamp anywhere in the dataset that falls after
the reporting date is the one documented "posted cost after the cutoff" row below —
everything else is historical.

`cost_transactions` also carries filler rows beyond its 42 hand-placed fixtures, to clear
its row-count minimum and spread posted spend realistically across the year. Two
projects — PRJ-001 and PRJ-002 — are "amount-locked": a tested KPI depends on their exact
posted-spend total (zero spend; 90-99% utilization), so their filler is always `draft`
and never changes that total. The other six projects have no such constraint, so most of
their filler is `posted`, cycling through every month January-September — that's what
gets the dataset to roughly 75% posted overall and guarantees posted spend exists in
every one of those nine months, not just the months the hand-placed fixtures happened to
cover.

### Edge-case catalogue

Reporting date for all of these is the default, `2026-09-30`.

| Edge case | Where |
|---|---|
| Project with no posted spend (drafts only) | PRJ-001 — amount-locked; all its `cost_transactions` (pinned + filler) are drafts, 0 posted |
| Project near budget (90-99% utilization) | PRJ-002 — amount-locked; budget 160,000, actual 150,000 (93.75%) |
| Project forecast to exceed budget (EAC > budget) | PRJ-003 — budget 100,000, pinned actual 70,000 + forecast 40,000 already puts EAC at 110,000 > budget; posted filler only adds more actual spend on top, so it stays an overrun |
| ≥ 5 overdue incomplete tasks (due < 2026-09-30, status ≠ done) | spread across all active projects by construction (42 in the generated dataset) |
| Task due exactly 2026-09-30 | PRJ-001, task 10 |
| Unassigned task | PRJ-003, task 6 (`assignee_id` null) |
| Completed project (all tasks done) | PRJ-004 — status `completed`, all 12 tasks `done` |
| Closed high-exposure risk (score ≥ 15, status closed) | PRJ-002, risk 1 (probability 5 × impact 5 = 25, closed) |
| Open high-exposure risk | PRJ-005, risk 1 (probability 5 × impact 4 = 20, open) |
| Returned change request | PRJ-006's second CR |
| Rejected change request | PRJ-003's second CR |
| Approved budget revision (affects budget) | PRJ-001/002/004/006/008 revisions |
| Pending budget revision (must not affect budget) | PRJ-003 (+15,000) and PRJ-007 (+12,000) |
| Posted and draft costs | every project has at least one draft; most have many posted rows (~75% of all `cost_transactions` are posted) |
| Posted spend in every month Jan-Sep 2026 | guaranteed by the posted filler's month cycle, regardless of which months the pinned fixtures happen to cover |
| Posted cost after the cutoff (Oct 2026) | PRJ-007, posted 2026-10-05 — excluded from `actual_spend` as of the default reporting date; the only business timestamp in the dataset after 2026-09-30 |
| Project without forecast rows (`forecastMissing`, EAC = actual) | PRJ-005 — posted filler adds to its actual spend but never adds a forecast row |
| Project with a reversal entry | PRJ-006 — 40,000 expense + 40,000 reversal, net 0 from that pair |
| Records across all 3 departments, Jan-Sep 2026 | all 8 projects, department_id 1-3, cost/task dates spread Jan-Sep 2026 |
