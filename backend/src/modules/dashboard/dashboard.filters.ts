import { z } from 'zod';
import type { AuthUser } from '../../middleware/authenticate.js';
import { scopedProjectIdsSql } from '../../lib/access.js';
import { resolveAsOf } from '../../lib/dates.js';

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

// Comma-separated ids → number[]
const csvInts = z
  .string()
  .transform((v) => v.split(',').map(Number))
  .pipe(z.array(z.number().int().positive()));

// Shared filter contract used by every dashboard endpoint.
export const dashboardFiltersSchema = z.object({
  departmentId: csvInts.optional(),
  projectId: csvInts.optional(),
  managerId: csvInts.optional(),
  status: z
    .string()
    .transform((v) => v.split(','))
    .optional(),
  from: z.string().regex(dateRe, 'from must be YYYY-MM-DD').optional(),
  to: z.string().regex(dateRe, 'to must be YYYY-MM-DD').optional(),
  categoryId: csvInts.optional(),
  asOf: z.string().regex(dateRe, 'asOf must be YYYY-MM-DD').optional(),
  riskTimeframe: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  withinDays: z.coerce.number().int().positive().optional(),
});

export type DashboardFilters = z.infer<typeof dashboardFiltersSchema>;

export interface FilterContext {
  asOf: string;
  filters: DashboardFilters;
  appliedFilters: string[];
  ignoredFilters: string[];
}

// Returns the applied/ignored filter lists. Finance endpoints honour categoryId;
// delivery endpoints report it as ignored.
export function classifyFilters(
  filters: DashboardFilters,
  isFinanceEndpoint: boolean,
): { applied: string[]; ignored: string[] } {
  const applied: string[] = [];
  const ignored: string[] = [];

  if (filters.departmentId) applied.push('departmentId');
  if (filters.projectId) applied.push('projectId');
  if (filters.managerId) applied.push('managerId');
  if (filters.status) applied.push('status');
  if (filters.from) applied.push('from');
  if (filters.to) applied.push('to');
  if (filters.asOf) applied.push('asOf');

  if (filters.categoryId) {
    if (isFinanceEndpoint) applied.push('categoryId');
    else ignored.push('categoryId');
  }

  return { applied, ignored };
}

// Builds a SQL CTE `filtered_projects` that intersects the caller's scope with
// the dashboard filters. Every dashboard query starts from this CTE, ensuring
// consistent scoping and filtering across all endpoints.
export interface FilteredCte {
  sql: string;
  params: unknown[];
  asOf: string;
}

export function buildFilteredProjectsCte(
  user: AuthUser,
  filters: DashboardFilters,
): FilteredCte {
  const scope = scopedProjectIdsSql(user);
  const params: unknown[] = [...scope.params];
  const clauses: string[] = [];

  if (scope.sql) {
    // scopedProjectIdsSql returns "AND project_id IN (...)" for use on fact
    // tables. Here we query the projects table directly (p.id), so rewrite.
    clauses.push(scope.sql.replace('project_id', 'p.id'));
  }

  if (filters.departmentId) {
    params.push(filters.departmentId);
    clauses.push(`AND p.department_id = ANY($${params.length})`);
  }
  if (filters.projectId) {
    params.push(filters.projectId);
    clauses.push(`AND p.id = ANY($${params.length})`);
  }
  if (filters.managerId) {
    params.push(filters.managerId);
    clauses.push(`AND p.owner_id = ANY($${params.length})`);
  }
  if (filters.status) {
    params.push(filters.status);
    clauses.push(`AND p.status = ANY($${params.length})`);
  }

  const asOf = resolveAsOf(filters);

  const sql = `filtered_projects AS (
    SELECT p.id FROM projects p WHERE 1=1 ${clauses.join(' ')}
  )`;

  return { sql, params, asOf };
}
