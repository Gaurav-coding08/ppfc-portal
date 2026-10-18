// Core CSV -> Postgres import logic, shared by the `db:import` CLI script
// and the test harness (globalSetup/resetDb), so tests load the exact same
// data path as a real import rather than a separate shortcut.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { parse } from 'csv-parse/sync';

const csvDir = path.resolve(import.meta.dirname, '../../../data/csv');

// All tables that hold seed/demo data — truncated together so re-import
// always starts from a clean slate. Tables with a BIGINT identity PK get
// their sequence reset after load; project_members/idempotency_keys have
// composite keys and need no sequence reset.
const DATA_TABLES = [
  'departments', 'users', 'projects', 'project_members', 'tasks', 'milestones',
  'risks', 'progress_snapshots', 'change_requests', 'change_history', 'audit_events',
  'idempotency_keys', 'cost_categories', 'project_budgets', 'budget_revisions',
  'cost_transactions', 'financial_forecasts', 'outbox', 'automation_runs', 'notifications',
];

// Import order: dependencies before dependents.
const IMPORT_ORDER = [
  'departments', 'users', 'projects', 'project_members', 'cost_categories',
  'project_budgets', 'budget_revisions', 'tasks', 'milestones', 'risks',
  'cost_transactions', 'financial_forecasts', 'progress_snapshots',
  'change_requests', 'change_history', 'audit_events', 'automation_runs',
  'outbox', 'notifications',
];

const SEQUENCE_TABLES = [
  'departments', 'users', 'projects', 'tasks', 'milestones', 'risks',
  'progress_snapshots', 'cost_categories', 'project_budgets', 'budget_revisions',
  'cost_transactions', 'financial_forecasts', 'change_requests', 'change_history',
  'audit_events', 'automation_runs', 'outbox', 'notifications',
];

// Postgres caps bind parameters per statement at 65535; with our widest
// table (13 columns) a 500-row batch stays well under that limit.
const BATCH_SIZE = 500;

function readCsv(table: string): { columns: string[]; rows: string[][] } {
  const file = path.join(csvDir, `${table}.csv`);
  const content = fs.readFileSync(file, 'utf8');
  const records: string[][] = parse(content, { columns: false });
  const [columns, ...rows] = records;
  return { columns: columns ?? [], rows };
}

// Blank CSV fields must become SQL NULL, not the empty string, or casting
// '' into a DATE/NUMERIC/BOOLEAN column fails.
function toParam(value: string): string | null {
  return value === '' ? null : value;
}

async function importTable(client: pg.Client, table: string): Promise<number> {
  const { columns, rows } = readCsv(table);
  if (rows.length === 0) return 0;

  const hasIdColumn = columns.includes('id');
  const columnList = columns.map((c) => `"${c}"`).join(', ');
  const overriding = hasIdColumn ? 'OVERRIDING SYSTEM VALUE' : '';

  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    const valueRows = batch
      .map((_, i) => `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(', ')})`)
      .join(', ');
    const params = batch.flatMap((row) => row.map(toParam));
    await client.query(
      `INSERT INTO ${table} (${columnList}) ${overriding} VALUES ${valueRows}`,
      params
    );
  }
  return rows.length;
}

async function resetSequence(client: pg.Client, table: string): Promise<void> {
  await client.query(
    `SELECT setval(
       pg_get_serial_sequence($1, 'id'),
       COALESCE((SELECT MAX(id) FROM ${table}), 1),
       EXISTS (SELECT 1 FROM ${table})
     )`,
    [table]
  );
}

// Runs the whole truncate -> load -> reset-sequences flow in one
// transaction against an already-connected client. Returns row counts per
// table for logging.
export async function importAll(client: pg.Client): Promise<Record<string, number>> {
  await client.query('BEGIN');
  try {
    await client.query(`TRUNCATE TABLE ${DATA_TABLES.join(', ')} RESTART IDENTITY CASCADE`);

    const counts: Record<string, number> = {};
    for (const table of IMPORT_ORDER) {
      counts[table] = await importTable(client, table);
    }

    for (const table of SEQUENCE_TABLES) {
      await resetSequence(client, table);
    }

    await client.query('COMMIT');
    return counts;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}
