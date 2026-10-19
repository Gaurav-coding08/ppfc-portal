import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';

// Mounted as a layout route wrapping every authenticated route. A 401 from
// `/auth/me` resolves `user` to `null` (not an error — see AuthProvider),
// so "not logged in" and "still checking" are distinguished by `isLoading`.
export function RequireAuth() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center" role="status" aria-live="polite">
        <span className="text-muted-foreground text-sm">Loading…</span>
      </div>
    );
  }

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <Outlet />;
}
