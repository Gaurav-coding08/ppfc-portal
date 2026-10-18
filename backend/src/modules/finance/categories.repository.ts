import type { Client, Pool, PoolClient } from 'pg';
import { pool } from '../../db/pool.js';

type Queryable = Pool | PoolClient | Client;

export interface CategoryRow {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

interface CategoryDbRow {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
}

function toCategoryRow(row: CategoryDbRow): CategoryRow {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isActive: row.is_active,
  };
}

export async function listCategories(
  includeInactive: boolean,
  client: Queryable = pool,
): Promise<CategoryRow[]> {
  const where = includeInactive ? '' : 'WHERE is_active = TRUE';
  const { rows } = await client.query<CategoryDbRow>(
    `SELECT id, code, name, is_active FROM cost_categories ${where} ORDER BY code`,
  );
  return rows.map(toCategoryRow);
}

export async function findCategoryById(
  id: number,
  client: Queryable = pool,
): Promise<CategoryRow | null> {
  const { rows } = await client.query<CategoryDbRow>(
    `SELECT id, code, name, is_active FROM cost_categories WHERE id = $1`,
    [id],
  );
  return rows[0] ? toCategoryRow(rows[0]) : null;
}

export async function insertCategory(
  code: string,
  name: string,
  client: PoolClient | Client,
): Promise<CategoryRow> {
  const { rows } = await client.query<CategoryDbRow>(
    `INSERT INTO cost_categories (code, name) VALUES ($1, $2) RETURNING *`,
    [code, name],
  );
  return toCategoryRow(rows[0]!);
}

export async function updateCategory(
  id: number,
  fields: { code?: string; name?: string; isActive?: boolean },
  client: PoolClient | Client,
): Promise<CategoryRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (fields.code !== undefined) {
    params.push(fields.code);
    sets.push(`code = $${params.length}`);
  }
  if (fields.name !== undefined) {
    params.push(fields.name);
    sets.push(`name = $${params.length}`);
  }
  if (fields.isActive !== undefined) {
    params.push(fields.isActive);
    sets.push(`is_active = $${params.length}`);
  }

  if (sets.length === 0) return findCategoryById(id, client);

  params.push(id);
  const { rows } = await client.query<CategoryDbRow>(
    `UPDATE cost_categories SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  return rows[0] ? toCategoryRow(rows[0]) : null;
}

// Checks if any draft cost transactions reference this category.
export async function hasDraftCosts(
  categoryId: number,
  client: Queryable = pool,
): Promise<boolean> {
  const { rows } = await client.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM cost_transactions WHERE category_id = $1 AND status = 'draft'
     ) AS exists`,
    [categoryId],
  );
  return rows[0]!.exists;
}
