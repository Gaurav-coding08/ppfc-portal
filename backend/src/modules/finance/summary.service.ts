import { assertProjectAccess, getProjectAccess, scopedProjectIdsSql } from '../../lib/access.js';
import { resolveAsOf } from '../../lib/dates.js';
import type { AuthUser } from '../../middleware/authenticate.js';
import * as summaryRepo from './summary.repository.js';
import type {
  AlertRow,
  FinancialSummaryRow,
  MonthlyTrendRow,
  SpendByCategoryRow,
} from './summary.repository.js';
import type { AlertsQuery, ComparisonQuery, SummaryQuery } from './summary.schemas.js';

export interface ProjectSummaryResponse {
  financials: FinancialSummaryRow;
  spendByCategory: SpendByCategoryRow[];
  monthlyTrend: MonthlyTrendRow[];
  alerts: AlertRow[];
  currency: string;
}

export async function getProjectSummary(
  caller: AuthUser,
  projectId: number,
  query: SummaryQuery,
): Promise<ProjectSummaryResponse> {
  await assertProjectAccess(caller, projectId, 'view');
  const asOf = resolveAsOf(query);

  const financials = await summaryRepo.getProjectFinancials(projectId, asOf);
  const spendByCategory = await summaryRepo.getSpendByCategory(projectId, asOf);
  const monthlyTrend = await summaryRepo.getMonthlyTrend(projectId, asOf);

  // Build per-project alerts from the financial row
  const alerts: AlertRow[] = [];
  if (financials) {
    const base = {
      projectId,
      projectCode: '',
      projectName: '',
      currentBudget: financials.currentBudget,
      actualSpend: financials.actualSpend,
      eac: financials.eac,
      utilization: financials.utilization,
    };
    if (financials.isOverrun) {
      alerts.push({ ...base, alertType: 'OVERRUN_FORECAST', severity: 'critical' });
    }
    if (financials.actualSpend != null && financials.currentBudget != null && financials.actualSpend > financials.currentBudget) {
      alerts.push({ ...base, alertType: 'OVERSPENT', severity: 'critical' });
    }
    if (financials.isNearBudget) {
      alerts.push({ ...base, alertType: 'NEAR_BUDGET', severity: 'warning' });
    }
    if (financials.forecastMissing) {
      alerts.push({ ...base, alertType: 'FORECAST_MISSING', severity: 'info' });
    }
  }

  return {
    financials: financials ?? {
      projectId,
      initialBudget: 0,
      approvedRevisions: 0,
      currentBudget: 0,
      actualSpend: 0,
      remainingBudget: 0,
      utilization: null,
      forecastToComplete: 0,
      eac: 0,
      projectedVariance: 0,
      forecastMissing: true,
      isOverrun: false,
      isNearBudget: false,
    },
    spendByCategory,
    monthlyTrend,
    alerts,
    currency: 'AED',
  };
}

export interface AlertsResponse {
  alerts: AlertRow[];
  currency: string;
}

export async function getAlerts(
  caller: AuthUser,
  query: AlertsQuery,
): Promise<AlertsResponse> {
  const asOf = resolveAsOf(query);
  const scope = scopedProjectIdsSql(caller);
  const alerts = await summaryRepo.getAlerts(
    asOf,
    scope.sql,
    scope.params,
    query.departmentId,
  );
  return { alerts, currency: 'AED' };
}

export interface ComparisonResponse {
  projects: FinancialSummaryRow[];
  excluded: number[];
  currency: string;
}

export async function getComparison(
  caller: AuthUser,
  query: ComparisonQuery,
): Promise<ComparisonResponse> {
  const asOf = resolveAsOf(query);
  const requestedIds = query.projectIds;

  // Filter to only projects the caller can view
  const visibleIds: number[] = [];
  const excluded: number[] = [];
  for (const pid of requestedIds) {
    const access = await getProjectAccess(caller.id, caller.role, pid);
    if (access && access.canView) {
      visibleIds.push(pid);
    } else {
      excluded.push(pid);
    }
  }

  const projects = await summaryRepo.getProjectFinancialsMulti(visibleIds, asOf);
  return { projects, excluded, currency: 'AED' };
}
