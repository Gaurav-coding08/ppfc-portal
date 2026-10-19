import { AlertCircle, CheckCircle2, Clock, FileWarning, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useMyTasks } from '@/features/tasks/hooks/useTaskQueries';
import { useChangeRequests } from '@/features/change-requests/hooks/useCrQueries';
import { useFinanceAlerts } from '@/features/finance/hooks/useFinanceQueries';
import { useAutomationRuns } from '@/features/automation/hooks/useAutomation';
import type { components } from '@/api/schema';

type Task = components['schemas']['TaskRow'];

function FocusItem({
  icon,
  count,
  label,
  to,
}: {
  icon: ReactNode;
  count: number;
  label: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="hover:bg-muted/50 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors"
    >
      {icon}
      <span className="font-semibold tabular-nums">{count}</span>
      <span className="text-muted-foreground">{label}</span>
    </Link>
  );
}

function ContributorFocus() {
  const tasks = useMyTasks(1);
  if (tasks.isPending) return <Skeleton className="h-10 w-60" />;
  if (tasks.isError) return null;

  const rows = tasks.data?.rows ?? [];
  const overdue = rows.filter(
    (t: Task) => t.status !== 'done' && t.isOverdue,
  ).length;
  const dueSoon = rows.filter(
    (t: Task) => t.status !== 'done' && !t.isOverdue && t.isDueSoon,
  ).length;

  if (overdue === 0 && dueSoon === 0) return <EmptyFocus />;

  return (
    <div className="flex flex-wrap gap-2">
      {overdue > 0 && (
        <FocusItem
          icon={<AlertCircle className="size-4 text-rose-600" />}
          count={overdue}
          label="overdue tasks"
          to="/tasks?overdue=true"
        />
      )}
      {dueSoon > 0 && (
        <FocusItem
          icon={<Clock className="size-4 text-amber-500" />}
          count={dueSoon}
          label="tasks due soon"
          to="/tasks"
        />
      )}
    </div>
  );
}

function PmFocus() {
  const crs = useChangeRequests({ status: 'submitted', mine: 'true', page: '1' });
  const alerts = useFinanceAlerts('');

  if (crs.isPending || alerts.isPending) return <Skeleton className="h-10 w-60" />;

  const crCount = crs.data?.total ?? 0;
  const alertCount = alerts.data?.length ?? 0;

  if (crCount === 0 && alertCount === 0) return <EmptyFocus />;

  return (
    <div className="flex flex-wrap gap-2">
      {crCount > 0 && (
        <FocusItem
          icon={<FileWarning className="size-4 text-sky-600" />}
          count={crCount}
          label="CRs awaiting decision"
          to="/change-requests?status=submitted&mine=true"
        />
      )}
      {alertCount > 0 && (
        <FocusItem
          icon={<AlertCircle className="size-4 text-amber-500" />}
          count={alertCount}
          label="finance alerts"
          to="/finance/alerts"
        />
      )}
    </div>
  );
}

function AdminFocus() {
  const runs = useAutomationRuns({ tab: 'runs', page: '1', status: '' }, true);
  const crs = useChangeRequests({ status: 'submitted', page: '1' });

  if (runs.isPending || crs.isPending) return <Skeleton className="h-10 w-60" />;

  const failedRuns = (runs.data?.rows ?? []).filter(
    (r: { status?: string }) => r.status === 'error',
  ).length;
  const pendingCrs = crs.data?.total ?? 0;

  if (failedRuns === 0 && pendingCrs === 0) return <EmptyFocus />;

  return (
    <div className="flex flex-wrap gap-2">
      {failedRuns > 0 && (
        <FocusItem
          icon={<Zap className="size-4 text-rose-600" />}
          count={failedRuns}
          label="failed automation runs"
          to="/admin/automation"
        />
      )}
      {pendingCrs > 0 && (
        <FocusItem
          icon={<FileWarning className="size-4 text-sky-600" />}
          count={pendingCrs}
          label="pending change requests"
          to="/change-requests?status=submitted"
        />
      )}
    </div>
  );
}

function EmptyFocus() {
  return (
    <div className="flex items-center gap-2 text-sm text-emerald-700">
      <CheckCircle2 className="size-4" />
      <span>Nothing needs your attention.</span>
    </div>
  );
}

export function YourFocus() {
  const { user } = useAuth();
  if (!user) return null;

  const role = user.role;

  return (
    <Card className="px-4 py-3" data-testid="your-focus">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Your focus</h2>
      {role === 'contributor' && <ContributorFocus />}
      {role === 'project_manager' && <PmFocus />}
      {role === 'admin' && <AdminFocus />}
    </Card>
  );
}
