// One factory per module, each namespaced under the module name so an
// `invalidateQueries({ queryKey: projects.all })` can't accidentally collide
// with another module's keys. Filters objects are included verbatim in the
// list key so each distinct filter/sort/page combination caches separately.

export const auth = {
  me: ['auth', 'me'] as const,
};

export const departments = {
  all: ['departments'] as const,
  list: () => [...departments.all, 'list'] as const,
};

export const users = {
  all: ['users'] as const,
  list: (filters: Record<string, unknown>) => [...users.all, 'list', filters] as const,
  detail: (id: number) => [...users.all, 'detail', id] as const,
};

export const projects = {
  all: ['projects'] as const,
  list: (filters: Record<string, unknown>) => [...projects.all, 'list', filters] as const,
  detail: (id: number, asOf?: string) => [...projects.all, 'detail', id, asOf] as const,
  members: (id: number) => [...projects.all, 'members', id] as const,
  progressSnapshots: (id: number) => [...projects.all, 'progress-snapshots', id] as const,
  activity: (id: number, filters: Record<string, unknown>) =>
    [...projects.all, 'activity', id, filters] as const,
};

export const tasks = {
  all: ['tasks'] as const,
  projectList: (projectId: number, filters: Record<string, unknown>) =>
    [...tasks.all, 'project-list', projectId, filters] as const,
  mine: (filters: Record<string, unknown>) => [...tasks.all, 'mine', filters] as const,
  detail: (id: number) => [...tasks.all, 'detail', id] as const,
};

export const milestones = {
  all: ['milestones'] as const,
  projectList: (projectId: number) => [...milestones.all, 'project-list', projectId] as const,
};

export const risks = {
  all: ['risks'] as const,
  projectList: (projectId: number, filters: Record<string, unknown>) =>
    [...risks.all, 'project-list', projectId, filters] as const,
  list: (filters: Record<string, unknown>) => [...risks.all, 'list', filters] as const,
  highExposure: (filters: Record<string, unknown>) => [...risks.all, 'high-exposure', filters] as const,
};

export const changeRequests = {
  all: ['change-requests'] as const,
  list: (filters: Record<string, unknown>) => [...changeRequests.all, 'list', filters] as const,
  detail: (id: number) => [...changeRequests.all, 'detail', id] as const,
};

// Every finance read lives under one namespace, because a single posting
// changes several of them at once (summary, costs, budget, alerts,
// comparison) and the rule is to invalidate them all rather than patch any
// one number (see features/finance/hooks/useFinanceMutations.ts).
export const finance = {
  all: ['finance'] as const,
  summary: (projectId: number) => [...finance.all, 'summary', projectId] as const,
  budget: (projectId: number) => [...finance.all, 'budget', projectId] as const,
  costs: (projectId: number, filters: Record<string, unknown>) =>
    [...finance.all, 'costs', projectId, filters] as const,
  forecasts: (projectId: number) => [...finance.all, 'forecasts', projectId] as const,
  categories: (includeInactive: boolean) => [...finance.all, 'categories', includeInactive] as const,
  alerts: (filters: Record<string, unknown>) => [...finance.all, 'alerts', filters] as const,
  comparison: (projectIds: number[]) => [...finance.all, 'comparison', projectIds] as const,
};

// Every dashboard read lives under `dashboard.all`. Each M1/M2 mutation hook
// already invalidates `dashboard.all`, so a task update or cost posting
// anywhere makes every KPI, chart and drill refetch (CLAUDE.md: invalidate,
// never patch). The topbar's "Data as of" badge also reads `kpis({})`.
export const dashboard = {
  all: ['dashboard'] as const,
  kpis: (filters: Record<string, unknown>) => [...dashboard.all, 'kpis', filters] as const,
  // One key per visual endpoint (e.g. 'monthly-spend'), keyed by filters.
  widget: (name: string, filters: Record<string, unknown>) =>
    [...dashboard.all, 'widget', name, filters] as const,
  drill: (kind: string, params: Record<string, unknown>) =>
    [...dashboard.all, 'drill', kind, params] as const,
  // Option lists (departments, managers, …) scoped to the caller. The
  // projects list's owner filter reads `managers` from here (Part B).
  filters: () => [...dashboard.all, 'filters'] as const,
};

// Admin screens (feature 18B). Users and audit events are admin-only
// endpoints, so they get their own namespace rather than sharing `users`
// (the PM-scoped directory used by owner/member pickers).
export const admin = {
  all: ['admin'] as const,
  users: (filters: Record<string, unknown>) => [...admin.all, 'users', filters] as const,
  audit: (filters: Record<string, unknown>) => [...admin.all, 'audit', filters] as const,
};

export const automation = {
  all: ['automation'] as const,
  runs: (filters: Record<string, unknown>) => [...automation.all, 'runs', filters] as const,
  outbox: (filters: Record<string, unknown>) => [...automation.all, 'outbox', filters] as const,
};

// The bell and the /notifications page read different pages of the same
// list; both live under `notifications.all`, so marking one read (or a
// manual automation run) refetches both and the unread count comes from
// the server, never from a local decrement.
export const notifications = {
  all: ['notifications'] as const,
  list: (filters: Record<string, unknown>) => [...notifications.all, 'list', filters] as const,
};
