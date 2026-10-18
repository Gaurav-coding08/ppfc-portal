import type { Client, Pool, PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import { toMoney } from '../../lib/money.js';

type Queryable = Pool | PoolClient | Client;

export interface ForecastRow {
  id: number;
  projectId: number;
  month: string;
  amount: number | null;
  updatedBy: number | null;
  updatedAt: string;
}

interface ForecastDbRow {
  id: number;
  project_id: number;
  month: string;
  amount: string;
  updated_by: number | null;
  updated_at: string;
}

function toForecastRow(row: ForecastDbRow): ForecastRow {
  return {
    id: row.id,
    projectId: row.project_id,
    month: row.month,
    amount: toMoney(row.amount),
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

export async function listForecasts(
  projectId: number,
  client: Queryable = pool,
): Promise<ForecastRow[]> {
  const { rows } = await client.query<ForecastDbRow>(
    `SELECT id, project_id, month, amount, updated_by, updated_at
     FROM financial_forecasts
     WHERE project_id = $1
     ORDER BY month`,
    [projectId],
  );
  return rows.map(toForecastRow);
}

export async function forecastToComplete(
  projectId: number,
  asOf: string,
  client: Queryable = pool,
): Promise<number> {
  const { rows } = await client.query<{ ftc: string }>(
    `SELECT COALESCE(SUM(amount), 0) AS ftc
     FROM financial_forecasts
     WHERE project_id = $1
       AND month > date_trunc('month', $2::date)::date`,
    [projectId, asOf],
  );
  return toMoney(rows[0]!.ftc) ?? 0;
}

// Upsert: INSERT ... ON CONFLICT (project_id, month) DO UPDATE
export async function upsertForecasts(
  projectId: number,
  months: { month: string; amount: number }[],
  userId: number,
  client: PoolClient | Client,
): Promise<ForecastRow[]> {
  const results: ForecastRow[] = [];

  for (const entry of months) {
    const { rows } = await client.query<ForecastDbRow>(
      `INSERT INTO financial_forecasts (project_id, month, amount, updated_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, month)
       DO UPDATE SET amount = EXCLUDED.amount, updated_by = EXCLUDED.updated_by, updated_at = now()
       RETURNING *`,
      [projectId, entry.month, entry.amount, userId],
    );
    results.push(toForecastRow(rows[0]!));
  }

  return results;
}
