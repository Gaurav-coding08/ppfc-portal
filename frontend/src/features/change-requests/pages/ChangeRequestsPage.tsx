import { GitPullRequest } from 'lucide-react';
import { useMemo } from 'react';
import { DataTable } from '@/components/data/DataTable';
import { EmptyState } from '@/components/data/EmptyState';
import { ErrorState } from '@/components/data/ErrorState';
import { LoadingState } from '@/components/data/LoadingState';
import { Pagination } from '@/components/data/Pagination';
import { PageHeader } from '@/components/layout/PageHeader';
import { useProjectLabel } from '@/features/projects/hooks/useReferenceData';
import { useUrlFilters } from '@/lib/useUrlFilters';
import { CrFilters } from '../components/CrFilters';
import { crColumns } from '../components/crColumns';
import { CR_PAGE_SIZE, useChangeRequests } from '../hooks/useCrQueries';
import { CR_LIST_DEFAULTS } from '../types';

// Every change request on projects the caller can see (scoped by the
// backend), newest submission first. New requests are raised from a
// project's Change requests tab, where the project is known.
export function ChangeRequestsPage() {
  const [filters, setFilters] = useUrlFilters(CR_LIST_DEFAULTS);
  const list = useChangeRequests(filters);
  const projectLabel = useProjectLabel();
  const columns = useMemo(() => crColumns({ projectLabel }), [projectLabel]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Change requests"
        description="Scope, schedule and cost changes awaiting or past review."
      />
      <CrFilters filters={filters} setFilters={setFilters} />

      {list.isPending ? (
        <LoadingState rows={8} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.total === 0 ? (
        <EmptyState icon={GitPullRequest} message="No change requests match these filters." />
      ) : (
        <div className="space-y-3">
          <DataTable columns={columns} data={list.data.rows} getRowId={(row) => String(row.id)} />
          <Pagination
            page={Number(filters.page) || 1}
            pageSize={CR_PAGE_SIZE}
            total={list.data.total}
            onPageChange={(page) => setFilters({ page: String(page) })}
          />
        </div>
      )}
    </div>
  );
}
