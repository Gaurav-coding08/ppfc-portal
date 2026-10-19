import type { LegacyColumnDef } from '@tanstack/react-table/legacy';
import { BellOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { isForbidden } from '@/api/errors';
import { DataTable } from '@/components/data/DataTable';
import { EmptyState } from '@/components/data/EmptyState';
import { ErrorState } from '@/components/data/ErrorState';
import { FilterBar } from '@/components/data/FilterBar';
import { FilterSelect } from '@/components/data/FilterSelect';
import { ForbiddenState } from '@/components/data/ForbiddenState';
import { LoadingState } from '@/components/data/LoadingState';
import { Money } from '@/components/display/Money';
import { Percent } from '@/components/display/Percent';
import { StatusBadge } from '@/components/display/StatusBadge';
import { PageHeader } from '@/components/layout/PageHeader';
import { useProjectFilterOptions } from '@/features/projects/hooks/useReferenceData';
import { useUrlFilters } from '@/lib/useUrlFilters';
import { useFinanceAlerts } from '../hooks/useFinanceQueries';
import { ALERT_LABELS, type FinanceAlert } from '../types';

const ALERT_DEFAULTS = { departmentId: '' };

// The backend returns every triggered alert, ordered by severity then
// project code, as one unpaginated list. No sorting UI: the order is the
// backend's.
const columns: LegacyColumnDef<FinanceAlert, unknown>[] = [
  {
    id: 'project',
    header: 'Project',
    enableSorting: false,
    cell: ({ row }) => (
      <Link
        to={`/projects/${row.original.projectId}?tab=finance`}
        className="text-primary whitespace-nowrap hover:underline"
      >
        {row.original.projectCode} — {row.original.projectName}
      </Link>
    ),
  },
  {
    id: 'alert',
    header: 'Alert',
    enableSorting: false,
    cell: ({ row }) => {
      const label = ALERT_LABELS[row.original.alertType!];
      return (
        <div>
          <p className="font-medium">{label?.title ?? row.original.alertType}</p>
          {label && <p className="text-muted-foreground text-xs">{label.detail}</p>}
        </div>
      );
    },
  },
  {
    id: 'severity',
    header: 'Severity',
    enableSorting: false,
    cell: ({ row }) => <StatusBadge domain="alertSeverity" status={row.original.severity!} />,
  },
  {
    id: 'currentBudget',
    header: 'Current budget',
    enableSorting: false,
    cell: ({ row }) => <Money amount={row.original.currentBudget ?? null} className="whitespace-nowrap" />,
  },
  {
    id: 'actualSpend',
    header: 'Actual spend',
    enableSorting: false,
    cell: ({ row }) => <Money amount={row.original.actualSpend ?? null} className="whitespace-nowrap" />,
  },
  {
    id: 'eac',
    header: 'EAC',
    enableSorting: false,
    cell: ({ row }) => <Money amount={row.original.eac ?? null} className="whitespace-nowrap" />,
  },
  {
    id: 'utilization',
    header: 'Utilization',
    enableSorting: false,
    cell: ({ row }) => <Percent kind="ratio" value={row.original.utilization} />,
  },
];

export function FinanceAlertsPage() {
  const [filters, setFilters] = useUrlFilters(ALERT_DEFAULTS);
  const options = useProjectFilterOptions();
  const alerts = useFinanceAlerts(filters.departmentId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance alerts"
        description="Projects forecast to overrun, overspent, near budget or missing a forecast."
      />
      <FilterBar>
        <FilterSelect
          label="Department"
          allLabel="All departments"
          value={filters.departmentId}
          onChange={(departmentId) => setFilters({ departmentId })}
          options={options.data?.departments ?? []}
        />
      </FilterBar>

      {alerts.isPending ? (
        <LoadingState rows={6} />
      ) : alerts.isError ? (
        isForbidden(alerts.error) ? (
          <ForbiddenState />
        ) : (
          <ErrorState error={alerts.error} onRetry={() => alerts.refetch()} />
        )
      ) : alerts.data.length === 0 ? (
        <EmptyState icon={BellOff} message="No finance alerts for the projects you can see." />
      ) : (
        <DataTable
          columns={columns}
          data={alerts.data}
          getRowId={(row) => `${row.projectId}-${row.alertType}`}
        />
      )}
    </div>
  );
}
