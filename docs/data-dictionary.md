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

### v_project_financials (view)
`SELECT * FROM fn_project_financials(fn_reporting_date())` — for Power BI / Access.

### v_project_progress (view)
`SELECT * FROM fn_project_progress()` — for Power BI / Access.
