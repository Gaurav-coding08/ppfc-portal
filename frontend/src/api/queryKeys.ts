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

// Dashboard is out of scope for M1's UI, but Part A reads
// `GET /dashboard/kpis` once for the topbar's "Data as of" badge, since no
// M1 endpoint otherwise exposes the reporting date (feature spec Part A.5).
export const dashboard = {
  all: ['dashboard'] as const,
  kpis: (filters: Record<string, unknown>) => [...dashboard.all, 'kpis', filters] as const,
};
