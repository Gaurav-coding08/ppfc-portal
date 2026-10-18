import { withTx } from '../../db/tx.js';
import type { AuthUser } from '../../middleware/authenticate.js';
import {
  buildFilteredProjectsCte,
  classifyFilters,
  type DashboardFilters,
} from './dashboard.filters.js';
import * as repo from './dashboard.repository.js';
import * as visuals from './dashboard.visuals.repository.js';
import * as drill from './dashboard.drill.repository.js';
import type {
  DrillCostsQuery,
  DrillTasksQuery,
  DrillRisksQuery,
  DrillCrQuery,
} from './dashboard.schemas.js';

interface Meta {
  asOf: string;
  appliedFilters: string[];
  ignoredFilters: string[];
  generatedAt: string;
}

interface DashboardResponse<T> {
  data: T;
  meta: Meta;
}

function buildMeta(asOf: string, filters: DashboardFilters, isFinance: boolean): Meta {
  const { applied, ignored } = classifyFilters(filters, isFinance);
  return { asOf, appliedFilters: applied, ignoredFilters: ignored, generatedAt: new Date().toISOString() };
}

// All dashboard queries run inside a read-only transaction with a 5s timeout.
async function withDashboardTx<T>(fn: (client: import('pg').PoolClient) => Promise<T>): Promise<T> {
  return withTx(async (client) => {
    await client.query(`SET LOCAL statement_timeout = '5s'`);
    return fn(client);
  });
}

export async function getKpis(
  caller: AuthUser,
  filters: DashboardFilters,
): Promise<DashboardResponse<{ kpis: repo.KpiRow[] }>> {
  const cte = buildFilteredProjectsCte(caller, filters);
  const kpis = await withDashboardTx((c) => repo.getKpis(cte, filters, c));
  return { data: { kpis }, meta: buildMeta(cte.asOf, filters, true) };
}

export async function getProjectHealth(
  caller: AuthUser,
  filters: DashboardFilters,
): Promise<DashboardResponse<{ projects: repo.ProjectHealthRow[] }>> {
  const cte = buildFilteredProjectsCte(caller, filters);
  const projects = await withDashboardTx((c) => repo.getProjectHealth(cte, c));
  return { data: { projects }, meta: buildMeta(cte.asOf, filters, false) };
}

export async function getBudgetVsActual(
  caller: AuthUser,
  filters: DashboardFilters,
): Promise<DashboardResponse<{ projects: repo.BudgetVsActualRow[] }>> {
  const cte = buildFilteredProjectsCte(caller, filters);
  const projects = await withDashboardTx((c) => repo.getBudgetVsActual(cte, c));
  return { data: { projects }, meta: buildMeta(cte.asOf, filters, true) };
}

export async function getMonthlySpend(
  caller: AuthUser,
  filters: DashboardFilters,
): Promise<DashboardResponse<{ months: visuals.MonthlySpendRow[] }>> {
  const cte = buildFilteredProjectsCte(caller, filters);
  const months = await withDashboardTx((c) => visuals.getMonthlySpend(cte, filters, c));
  return { data: { months }, meta: buildMeta(cte.asOf, filters, true) };
}

export async function getSpendByCategory(
  caller: AuthUser,
  filters: DashboardFilters,
): Promise<DashboardResponse<{ categories: visuals.SpendByCategoryRow[] }>> {
  const cte = buildFilteredProjectsCte(caller, filters);
  const categories = await withDashboardTx((c) => visuals.getSpendByCategory(cte, filters, c));
  return { data: { categories }, meta: buildMeta(cte.asOf, filters, true) };
}

export async function getOverdueByOwner(
  caller: AuthUser,
  filters: DashboardFilters,
): Promise<DashboardResponse<{ owners: visuals.OverdueByOwnerRow[] }>> {
  const cte = buildFilteredProjectsCte(caller, filters);
  const owners = await withDashboardTx((c) => visuals.getOverdueByOwner(cte, filters, c));
  return { data: { owners }, meta: buildMeta(cte.asOf, filters, false) };
}

export async function getRiskMatrix(
  caller: AuthUser,
  filters: DashboardFilters,
): Promise<DashboardResponse<{ cells: visuals.RiskMatrixCell[]; totalOpenRisks: number }>> {
  const cte = buildFilteredProjectsCte(caller, filters);
  const cells = await withDashboardTx((c) => visuals.getRiskMatrix(cte, c));
  const totalOpenRisks = cells.reduce((sum, cell) => sum + cell.count, 0);
  return { data: { cells, totalOpenRisks }, meta: buildMeta(cte.asOf, filters, false) };
}

export async function getMilestones(
  caller: AuthUser,
  filters: DashboardFilters,
): Promise<DashboardResponse<{ milestones: visuals.MilestoneRow[] }>> {
  const cte = buildFilteredProjectsCte(caller, filters);
  const milestones = await withDashboardTx((c) =>
    visuals.getMilestones(cte, filters.withinDays, c),
  );
  return { data: { milestones }, meta: buildMeta(cte.asOf, filters, false) };
}

export async function drillCosts(
  caller: AuthUser,
  query: DrillCostsQuery,
): Promise<DashboardResponse<drill.DrillCostRow[]> & { meta: Meta & { page: number; pageSize: number; total: number } }> {
  const cte = buildFilteredProjectsCte(caller, query);
  const result = await withDashboardTx((c) => drill.drillCosts(cte, query, c));
  return {
    data: result.data,
    meta: { ...buildMeta(cte.asOf, query, true), page: query.page, pageSize: query.pageSize, total: result.total },
  };
}

export async function drillTasks(
  caller: AuthUser,
  query: DrillTasksQuery,
): Promise<DashboardResponse<drill.DrillTaskRow[]> & { meta: Meta & { page: number; pageSize: number; total: number } }> {
  const cte = buildFilteredProjectsCte(caller, query);
  const result = await withDashboardTx((c) => drill.drillTasks(cte, query, c));
  return {
    data: result.data,
    meta: { ...buildMeta(cte.asOf, query, false), page: query.page, pageSize: query.pageSize, total: result.total },
  };
}

export async function drillRisks(
  caller: AuthUser,
  query: DrillRisksQuery,
): Promise<DashboardResponse<drill.DrillRiskRow[]> & { meta: Meta & { page: number; pageSize: number; total: number } }> {
  const cte = buildFilteredProjectsCte(caller, query);
  const result = await withDashboardTx((c) => drill.drillRisks(cte, query, c));
  return {
    data: result.data,
    meta: { ...buildMeta(cte.asOf, query, false), page: query.page, pageSize: query.pageSize, total: result.total },
  };
}

export async function drillChangeRequests(
  caller: AuthUser,
  query: DrillCrQuery,
): Promise<DashboardResponse<drill.DrillCrRow[]> & { meta: Meta & { page: number; pageSize: number; total: number } }> {
  const cte = buildFilteredProjectsCte(caller, query);
  const result = await withDashboardTx((c) => drill.drillChangeRequests(cte, query, c));
  return {
    data: result.data,
    meta: { ...buildMeta(cte.asOf, query, false), page: query.page, pageSize: query.pageSize, total: result.total },
  };
}

export async function getFilterOptions(
  caller: AuthUser,
  filters: DashboardFilters,
): Promise<DashboardResponse<Awaited<ReturnType<typeof visuals.getFilterOptions>>>> {
  const cte = buildFilteredProjectsCte(caller, filters);
  const options = await withDashboardTx((c) => visuals.getFilterOptions(cte, c));
  return { data: options, meta: buildMeta(cte.asOf, filters, false) };
}
