import { Plus, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { isVersionConflict } from '@/api/errors';
import { DataTable } from '@/components/data/DataTable';
import { EmptyState } from '@/components/data/EmptyState';
import { ErrorState } from '@/components/data/ErrorState';
import { ExportCsvButton } from '@/components/data/ExportCsvButton';
import { LoadingState } from '@/components/data/LoadingState';
import { Pagination } from '@/components/data/Pagination';
import { ConfirmDialog } from '@/components/form/ConfirmDialog';
import { VersionConflictDialog } from '@/components/form/VersionConflictDialog';
import { Button } from '@/components/ui/button';
import type { ProjectDetail } from '@/features/projects/types';
import { toastApiError } from '@/lib/notify';
import { useUrlFilters } from '@/lib/useUrlFilters';
import { useUpdateRisk } from '../hooks/useRiskMutations';
import { RISK_PAGE_SIZE, useProjectRisks } from '../hooks/useRiskQueries';
import { PROJECT_RISK_DEFAULTS, type Risk } from '../types';

const CSV_COLUMNS = [
  { label: 'Type', value: (r: Risk) => r.type },
  { label: 'Title', value: (r: Risk) => r.title },
  { label: 'Owner', value: (r: Risk) => r.ownerName },
  { label: 'Probability', value: (r: Risk) => r.probability },
  { label: 'Impact', value: (r: Risk) => r.impact },
  { label: 'Score', value: (r: Risk) => r.score },
  { label: 'Exposure', value: (r: Risk) => r.exposure },
  { label: 'Status', value: (r: Risk) => r.status },
  { label: 'Due date', value: (r: Risk) => r.dueDate },
  { label: 'Mitigation', value: (r: Risk) => r.mitigation },
];
import { RiskFilters } from './RiskFilters';
import { RiskFormSheet } from './RiskFormSheet';
import { riskColumns, riskRowClassName } from './riskColumns';

// The project's Risks tab. Every member can read it; managers (canManage,
// a UI hint — the backend re-checks) can create, edit and close.
export function RisksTab({ project, canManage }: { project: ProjectDetail; canManage: boolean }) {
  const projectId = project.id!;
  const [filters, setFilters] = useUrlFilters(PROJECT_RISK_DEFAULTS);
  const list = useProjectRisks(projectId, filters);
  const update = useUpdateRisk();

  // `editing === 'new'` opens an empty create form.
  const [editing, setEditing] = useState<Risk | 'new' | null>(null);
  const [toClose, setToClose] = useState<Risk | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);

  const columns = useMemo(
    () => riskColumns({ actions: canManage ? { onEdit: setEditing, onClose: setToClose } : undefined }),
    [canManage],
  );

  // Closing is a PATCH with the version the row was loaded with. The
  // backend re-checks the mitigation rule on every update, so closing an
  // unmitigated high risk comes back as a 422 whose message says why.
  async function confirmClose() {
    if (!toClose) return;
    try {
      await update.mutateAsync({
        id: toClose.id!,
        body: { status: 'closed', version: toClose.version ?? 1 },
      });
      toast.success('Risk closed');
    } catch (err) {
      if (isVersionConflict(err)) setConflictOpen(true);
      else toastApiError(err);
    } finally {
      setToClose(null);
    }
  }

  const newButton = canManage ? (
    <Button onClick={() => setEditing('new')}>
      <Plus className="size-4" />
      New risk
    </Button>
  ) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <RiskFilters filters={filters} setFilters={setFilters} />
        <div className="flex items-center gap-2">
          <ExportCsvButton rows={list.data?.rows} columns={CSV_COLUMNS} filename={`${project.code}-risks`} />
          {newButton}
        </div>
      </div>

      {list.isPending ? (
        <LoadingState rows={6} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.total === 0 ? (
        <EmptyState icon={ShieldAlert} message="No risks or issues match these filters." action={newButton} />
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

      {canManage && (
        <>
          <RiskFormSheet
            open={editing !== null}
            onOpenChange={(open) => !open && setEditing(null)}
            project={project}
            risk={editing === 'new' || editing === null ? undefined : editing}
          />
          <ConfirmDialog
            open={toClose !== null}
            onOpenChange={(open) => !open && setToClose(null)}
            title="Close this risk?"
            description={`"${toClose?.title ?? ''}" will be marked closed. It stays in the register, shown as closed, and drops out of the high-exposure view.`}
            confirmLabel="Close risk"
            pending={update.isPending}
            onConfirm={confirmClose}
          />
          <VersionConflictDialog open={conflictOpen} onOpenChange={setConflictOpen} />
        </>
      )}
    </div>
  );
}
