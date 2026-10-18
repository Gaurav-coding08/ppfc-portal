// Row shapes mirror DB columns exactly (snake_case), so each generator file
// can be written straight against `docs/data-dictionary.md` and the CSV
// writer never has to rename anything.

export interface DepartmentRow {
  id: number;
  code: string;
  name: string;
}

export interface UserRow {
  id: number;
  email: string;
  full_name: string;
  password_hash: string;
  role: 'contributor' | 'project_manager' | 'admin';
  department_id: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectRow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  department_id: number;
  owner_id: number;
  status: 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';
  start_date: string;
  end_date: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectMemberRow {
  project_id: number;
  user_id: number;
  member_role: 'manager' | 'contributor';
  added_at: string;
}

export interface TaskRow {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  assignee_id: number | null;
  status: 'todo' | 'in_progress' | 'blocked' | 'done';
  priority: 'low' | 'medium' | 'high' | 'critical';
  start_date: string | null;
  due_date: string;
  weight: number;
  progress: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MilestoneRow {
  id: number;
  project_id: number;
  name: string;
  due_date: string;
  status: 'planned' | 'achieved' | 'missed';
  achieved_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface RiskRow {
  id: number;
  project_id: number;
  type: 'risk' | 'issue';
  title: string;
  description: string | null;
  owner_id: number | null;
  probability: number;
  impact: number;
  mitigation: string | null;
  due_date: string | null;
  status: 'open' | 'mitigating' | 'closed';
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProgressSnapshotRow {
  id: number;
  project_id: number;
  snapshot_date: string;
  progress_pct: number;
  actual_spend: number;
}

export interface CostCategoryRow {
  id: number;
  code: string;
  name: string;
}

export interface ProjectBudgetRow {
  id: number;
  project_id: number;
  initial_amount: number;
  approved_by: number;
  approved_at: string;
}

export interface BudgetRevisionRow {
  id: number;
  project_id: number;
  amount: number;
  rationale: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_by: number;
  decided_by: number | null;
  decided_at: string | null;
  decision_reason: string | null;
  effective_date: string;
  created_at: string;
}

export interface CostTransactionRow {
  id: number;
  project_id: number;
  category_id: number;
  txn_date: string;
  amount: number;
  description: string;
  vendor: string | null;
  status: 'draft' | 'posted';
  entry_type: 'expense' | 'reversal';
  reverses_id: number | null;
  created_by: number;
  posted_by: number | null;
  posted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialForecastRow {
  id: number;
  project_id: number;
  month: string;
  amount: number;
  updated_by: number;
  updated_at: string;
}

export interface ChangeRequestRow {
  id: number;
  code: string;
  project_id: number;
  title: string;
  description: string | null;
  impact_summary: string | null;
  requested_by: number;
  status: 'submitted' | 'approved' | 'rejected' | 'returned';
  submitted_at: string;
  decided_by: number | null;
  decided_at: string | null;
  decision_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChangeHistoryRow {
  id: number;
  change_request_id: number;
  from_status: string | null;
  to_status: string;
  actor_id: number;
  reason: string | null;
  created_at: string;
}

export interface AuditEventRow {
  id: number;
  actor_id: number | null;
  entity_type: string;
  entity_id: number;
  action: string;
  project_id: number | null;
  before: string | null;
  after: string | null;
  created_at: string;
}

export interface AutomationRunRow {
  id: number;
  job_name: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'failed';
  items_found: number | null;
  items_created: number | null;
  error: string | null;
}

export interface OutboxRow {
  id: number;
  event_type: string;
  entity_type: string;
  entity_id: number;
  event_date: string | null;
  payload: string;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  last_error: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface NotificationRow {
  id: number;
  user_id: number;
  title: string;
  body: string | null;
  link: string | null;
  outbox_id: number | null;
  read_at: string | null;
  created_at: string;
}

export interface Dataset {
  departments: DepartmentRow[];
  users: UserRow[];
  projects: ProjectRow[];
  project_members: ProjectMemberRow[];
  cost_categories: CostCategoryRow[];
  project_budgets: ProjectBudgetRow[];
  budget_revisions: BudgetRevisionRow[];
  tasks: TaskRow[];
  milestones: MilestoneRow[];
  risks: RiskRow[];
  cost_transactions: CostTransactionRow[];
  financial_forecasts: FinancialForecastRow[];
  progress_snapshots: ProgressSnapshotRow[];
  change_requests: ChangeRequestRow[];
  change_history: ChangeHistoryRow[];
  audit_events: AuditEventRow[];
  automation_runs: AutomationRunRow[];
  outbox: OutboxRow[];
  notifications: NotificationRow[];
}
