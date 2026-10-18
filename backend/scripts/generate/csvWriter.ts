import fs from 'node:fs';
import path from 'node:path';
import { stringify } from 'csv-stringify/sync';
import type { Dataset } from './types.js';

// Column order per file — matches each table's DB column order exactly, so
// import-csv.ts can read the header row and insert straight through. Every
// timestamp column with business meaning (created_at/updated_at included)
// is listed and carries an explicit, deterministic historical value — none
// of them are left out to fall back to the DB's `now()` default.
const COLUMNS: Record<keyof Dataset, string[]> = {
  departments: ['id', 'code', 'name'],
  users: [
    'id', 'email', 'full_name', 'password_hash', 'role', 'department_id', 'is_active',
    'created_at', 'updated_at',
  ],
  projects: [
    'id', 'code', 'name', 'description', 'department_id', 'owner_id', 'status',
    'start_date', 'end_date', 'created_by', 'created_at', 'updated_at',
  ],
  project_members: ['project_id', 'user_id', 'member_role', 'added_at'],
  cost_categories: ['id', 'code', 'name'],
  project_budgets: ['id', 'project_id', 'initial_amount', 'approved_by', 'approved_at'],
  budget_revisions: [
    'id', 'project_id', 'amount', 'rationale', 'status', 'requested_by', 'decided_by',
    'decided_at', 'decision_reason', 'effective_date', 'created_at',
  ],
  tasks: [
    'id', 'project_id', 'title', 'description', 'assignee_id', 'status', 'priority',
    'start_date', 'due_date', 'weight', 'progress', 'completed_at', 'created_at', 'updated_at',
  ],
  milestones: [
    'id', 'project_id', 'name', 'due_date', 'status', 'achieved_date', 'created_at', 'updated_at',
  ],
  risks: [
    'id', 'project_id', 'type', 'title', 'description', 'owner_id', 'probability', 'impact',
    'mitigation', 'due_date', 'status', 'closed_at', 'created_at', 'updated_at',
  ],
  cost_transactions: [
    'id', 'project_id', 'category_id', 'txn_date', 'amount', 'description', 'vendor',
    'status', 'entry_type', 'reverses_id', 'created_by', 'posted_by', 'posted_at',
    'created_at', 'updated_at',
  ],
  financial_forecasts: ['id', 'project_id', 'month', 'amount', 'updated_by', 'updated_at'],
  progress_snapshots: ['id', 'project_id', 'snapshot_date', 'progress_pct', 'actual_spend'],
  change_requests: [
    'id', 'code', 'project_id', 'title', 'description', 'impact_summary', 'requested_by',
    'status', 'submitted_at', 'decided_by', 'decided_at', 'decision_reason',
    'created_at', 'updated_at',
  ],
  change_history: [
    'id', 'change_request_id', 'from_status', 'to_status', 'actor_id', 'reason', 'created_at',
  ],
  audit_events: [
    'id', 'actor_id', 'entity_type', 'entity_id', 'action', 'project_id', 'before', 'after',
    'created_at',
  ],
  automation_runs: [
    'id', 'job_name', 'started_at', 'finished_at', 'status', 'items_found', 'items_created', 'error',
  ],
};

// Table order matters for import (FK dependency order); CSV filenames don't
// need to be ordered, but writing them in this order makes `ls data/csv`
// read the same way the importer processes them.
export const TABLE_ORDER: (keyof Dataset)[] = [
  'departments',
  'users',
  'projects',
  'project_members',
  'cost_categories',
  'project_budgets',
  'budget_revisions',
  'tasks',
  'milestones',
  'risks',
  'cost_transactions',
  'financial_forecasts',
  'progress_snapshots',
  'change_requests',
  'change_history',
  'audit_events',
  'automation_runs',
];

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

export function writeDataset(dataset: Dataset, outDir: string): void {
  fs.mkdirSync(outDir, { recursive: true });

  for (const table of TABLE_ORDER) {
    const columns = COLUMNS[table];
    const rows = dataset[table] as unknown as Record<string, unknown>[];
    const records = rows.map((row) => columns.map((col) => formatValue(row[col])));
    const csv = stringify(records, { header: true, columns });
    fs.writeFileSync(path.join(outDir, `${table}.csv`), csv);
  }
}

export function rowCounts(dataset: Dataset): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const table of TABLE_ORDER) {
    counts[table] = dataset[table].length;
  }
  return counts;
}
