import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from '@/components/data/DataTable';
import { EmptyState } from '@/components/data/EmptyState';
import { ErrorState } from '@/components/data/ErrorState';
import { LoadingState } from '@/components/data/LoadingState';
import { Pagination } from '@/components/data/Pagination';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { useProjectLabel } from '@/features/projects/hooks/useReferenceData';
import { useUrlFilters } from '@/lib/useUrlFilters';
import { riskColumns } from '../components/riskColumns';
import { RISK_PAGE_SIZE, useHighExposureRisks } from '../hooks/useRiskQueries';

const DEFAULTS = { page: '1' };

// Open high-exposure risks across the caller's projects. Which risks
// qualify (not closed, score >= 15) and their order (score desc) are the
// backend's decision — this page renders exactly the rows it returns, with
// no client-side filtering or sorting (so no sortable headers either).
export function HighExposurePage() {
  const [filters, setFilters] = useUrlFilters(DEFAULTS);
  const page = Number(filters.page) || 1;
  const list = useHighExposureRisks(page);
  const projectLabel = useProjectLabel();
  const columns = useMemo(() => riskColumns({ projectLabel }), [projectLabel]);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2" nativeButton={false} render={<Link to="/risks" />}>
        <ArrowLeft className="size-4" />
        All risks
      </Button>
      <PageHeader
        title="High-exposure risks"
        description="Open risks and issues scoring 15 or more, highest score first."
      />

      {list.isPending ? (
        <LoadingState rows={6} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.total === 0 ? (
        <EmptyState icon={ShieldCheck} message="No open high-exposure risks on your projects." />
      ) : (
        <div className="space-y-3">
          <DataTable columns={columns} data={list.data.rows} getRowId={(row) => String(row.id)} />
          <Pagination
            page={page}
            pageSize={RISK_PAGE_SIZE}
            total={list.data.total}
            onPageChange={(p) => setFilters({ page: String(p) })}
          />
        </div>
      )}
    </div>
  );
}
