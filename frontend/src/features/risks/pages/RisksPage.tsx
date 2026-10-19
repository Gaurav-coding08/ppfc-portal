import { Flame, ShieldAlert } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from '@/components/data/DataTable';
import { EmptyState } from '@/components/data/EmptyState';
import { ErrorState } from '@/components/data/ErrorState';
import { FilterSelect } from '@/components/data/FilterSelect';
import { LoadingState } from '@/components/data/LoadingState';
import { Pagination } from '@/components/data/Pagination';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { useProjectFilterOptions, useProjectLabel } from '@/features/projects/hooks/useReferenceData';
import { useUrlFilters } from '@/lib/useUrlFilters';
import { RiskFilters } from '../components/RiskFilters';
import { riskColumns, riskRowClassName } from '../components/riskColumns';
import { RISK_PAGE_SIZE, usePortfolioRisks } from '../hooks/useRiskQueries';
import { RISK_LIST_DEFAULTS } from '../types';

// Portfolio risk register: every risk/issue on projects the caller can see
// (scoped by the backend). Read-only here — edits happen on the project's
// own Risks tab, which the Project column links to.
export function RisksPage() {
  const [filters, setFilters] = useUrlFilters(RISK_LIST_DEFAULTS);
  const list = usePortfolioRisks(filters);
  const options = useProjectFilterOptions();
  const projectLabel = useProjectLabel();
  const columns = useMemo(() => riskColumns({ projectLabel }), [projectLabel]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Risks & issues"
        description="Risks and issues across every project you can see."
        action={
          <Button variant="outline" nativeButton={false} render={<Link to="/risks/high-exposure" />}>
            <Flame className="size-4" />
            High exposure
          </Button>
        }
      />
      <RiskFilters filters={filters} setFilters={setFilters} extraKeys={['projectId', 'departmentId']}>
        <FilterSelect
          label="Project"
          allLabel="All projects"
          value={filters.projectId}
          onChange={(projectId) => setFilters({ projectId, page: '1' })}
          options={options.data?.projects ?? []}
        />
        <FilterSelect
          label="Department"
          allLabel="All departments"
          value={filters.departmentId}
          onChange={(departmentId) => setFilters({ departmentId, page: '1' })}
          options={options.data?.departments ?? []}
        />
      </RiskFilters>

      {list.isPending ? (
        <LoadingState rows={8} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.total === 0 ? (
        <EmptyState icon={ShieldAlert} message="No risks or issues match these filters." />
      ) : (
        <div className="space-y-3">
          <DataTable
            columns={columns}
            data={list.data.rows}
            getRowId={(row) => String(row.id)}
            getRowClassName={riskRowClassName}
            sort={filters.sort}
            order={filters.order as 'asc' | 'desc'}
            onSortChange={(sort, order) => setFilters({ sort, order, page: '1' })}
          />
          <Pagination
            page={Number(filters.page) || 1}
            pageSize={RISK_PAGE_SIZE}
            total={list.data.total}
            onPageChange={(page) => setFilters({ page: String(page) })}
          />
        </div>
      )}
    </div>
  );
}
