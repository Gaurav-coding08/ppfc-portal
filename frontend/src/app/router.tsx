import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from '@/auth/RequireAuth';
import { LoginPage } from '@/auth/LoginPage';
import { AppShell } from '@/components/layout/AppShell';
import { PlaceholderPage } from '@/components/layout/PlaceholderPage';
import { NotFoundPage } from './NotFoundPage';

// Feature pages are loaded on demand (route-level code splitting) so the
// login screen and shell don't pay for every module's code — recharts in
// particular. The shell's <Suspense> shows a skeleton while a chunk loads.
// The `.then` maps the named export to the default export `lazy` expects.
const ProjectsListPage = lazy(() =>
  import('@/features/projects/pages/ProjectsListPage').then((m) => ({ default: m.ProjectsListPage })),
);
const ProjectDetailPage = lazy(() =>
  import('@/features/projects/pages/ProjectDetailPage').then((m) => ({ default: m.ProjectDetailPage })),
);
const MyTasksPage = lazy(() =>
  import('@/features/tasks/pages/MyTasksPage').then((m) => ({ default: m.MyTasksPage })),
);

// Plain <Routes> per CLAUDE.md ("data routers not required; plain <Routes>
// is fine"). Every module gets a placeholder route from Part A onward
// (feature 16 spec: "Placeholder routes for every later module ... so
// navigation is complete from day one"); later parts/milestones replace a
// placeholder with its real page one module at a time.
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<PlaceholderPage title="Dashboard" />} />
          <Route path="projects" element={<ProjectsListPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="my-tasks" element={<MyTasksPage />} />
          <Route path="risks" element={<PlaceholderPage title="Risks" />} />
          <Route path="change-requests" element={<PlaceholderPage title="Change requests" />} />
          <Route path="finance/alerts" element={<PlaceholderPage title="Finance alerts" />} />
          <Route path="finance/comparison" element={<PlaceholderPage title="Finance comparison" />} />
          <Route path="admin/users" element={<PlaceholderPage title="Users" />} />
          <Route path="admin/audit-log" element={<PlaceholderPage title="Audit log" />} />
          <Route path="admin/automation" element={<PlaceholderPage title="Automation" />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
