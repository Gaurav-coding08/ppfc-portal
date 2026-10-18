import { faker } from '@faker-js/faker';
import { buildDepartments } from './departments.js';
import { buildUsers } from './users.js';
import { buildProjects, buildProjectMembers } from './projects.js';
import { buildTasks } from './tasks.js';
import { buildMilestones } from './milestones.js';
import { buildRisks } from './risks.js';
import { buildProgressSnapshots } from './snapshots.js';
import { buildCostCategories, buildProjectBudgets, buildBudgetRevisions } from './finance.js';
import { buildCostTransactions } from './costs.js';
import { buildFinancialForecasts } from './forecasts.js';
import { buildChangeRequests, buildChangeHistory } from './governance.js';
import { buildAuditEvents } from './audit.js';
import { buildAutomationRuns } from './automation.js';
import type { Dataset } from './types.js';

// Re-seeds faker on every call so this is safe to call twice in the same
// process (the determinism unit test does exactly that) and always
// produces byte-identical CSVs across separate `npm run data:generate`
// invocations.
export function buildDataset(): Dataset {
  faker.seed(42);

  const departments = buildDepartments();
  const users = buildUsers();
  const projects = buildProjects();
  const project_members = buildProjectMembers();
  const cost_categories = buildCostCategories();
  const project_budgets = buildProjectBudgets();
  const budget_revisions = buildBudgetRevisions();
  const tasks = buildTasks();
  const milestones = buildMilestones();
  const risks = buildRisks();
  const cost_transactions = buildCostTransactions();
  const financial_forecasts = buildFinancialForecasts();
  const progress_snapshots = buildProgressSnapshots();
  const change_requests = buildChangeRequests();
  const change_history = buildChangeHistory(change_requests);
  const audit_events = buildAuditEvents(change_requests, cost_transactions);
  const automation_runs = buildAutomationRuns();

  return {
    departments,
    users,
    projects,
    project_members,
    cost_categories,
    project_budgets,
    budget_revisions,
    tasks,
    milestones,
    risks,
    cost_transactions,
    financial_forecasts,
    progress_snapshots,
    change_requests,
    change_history,
    audit_events,
    automation_runs,
  };
}
