import { GitPullRequest, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { canViewProject } from '@/auth/can';
import { useAuth } from '@/auth/useAuth';
import { DataTable } from '@/components/data/DataTable';
import { EmptyState } from '@/components/data/EmptyState';
import { ErrorState } from '@/components/data/ErrorState';
import { FilterBar } from '@/components/data/FilterBar';
import { FilterMultiSelect } from '@/components/data/FilterMultiSelect';
import { LoadingState } from '@/components/data/LoadingState';
import { Pagination } from '@/components/data/Pagination';
import { Button } from '@/components/ui/button';
import { useUrlFilters } from '@/lib/useUrlFilters';
import { CR_PAGE_SIZE, useChangeRequests } from '../hooks/useCrQueries';
import { CR_STATUS_OPTIONS, PROJECT_CR_DEFAULTS } from '../types';
import { SubmitCrSheet } from './SubmitCrSheet';
import { crColumns } from './crColumns';

// The project's Change requests tab: the project's CRs (via the scoped
// list endpoint filtered to this project) and "Submit change" for anyone
// who can view the project — contributors included (backend: view access
// is enough to submit).
export function ChangeRequestsTab({ projectId }: { projectId: number }) {
  const { user, memberships } = useAuth();
  const [filters, setFilters] = useUrlFilters(PROJECT_CR_DEFAULTS);
  const list = useChangeRequests({ ...filters, projectId: String(projectId) });
  const [submitOpen, setSubmitOpen] = useState(false);
  const columns = useMemo(() => crColumns(), []);
  const canSubmit = canViewProject(user, memberships, projectId);

  const submitButton = canSubmit ? (
    <Button onClick={() => setSubmitOpen(true)}>
      <Plus className="size-4" />
      Submit change
    </Button>
  ) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <FilterBar>
          <FilterMultiSelect
            label="Status"
            allLabel="All statuses"
            value={filters.status}
            onChange={(status) => setFilters({ status, page: '1' })}
            options={CR_STATUS_OPTIONS}
          />
        </FilterBar>
        {submitButton}
      </div>

      {list.isPending ? (
        <LoadingState rows={5} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.total === 0 ? (
        <EmptyState
          icon={GitPullRequest}
          message="No change requests match these filters."
          action={submitButton}
        />
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

      {canSubmit && <SubmitCrSheet open={submitOpen} onOpenChange={setSubmitOpen} projectId={projectId} />}
    </div>
  );
}
