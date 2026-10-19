import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from '@/auth/RequireAuth';
import { LoginPage } from '@/auth/LoginPage';
import { AppShell } from '@/components/layout/AppShell';
import { PlaceholderPage } from '@/components/layout/PlaceholderPage';
import { NotFoundPage } from './NotFoundPage';

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
          <Route path="projects" element={<PlaceholderPage title="Projects" />} />
          <Route path="my-tasks" element={<PlaceholderPage title="My tasks" />} />
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
