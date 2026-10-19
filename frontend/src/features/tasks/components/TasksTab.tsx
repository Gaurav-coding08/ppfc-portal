import { ListChecks, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { canEditOwnTaskOnly } from '@/auth/can';
import { useAuth } from '@/auth/useAuth';
import { DataTable } from '@/components/data/DataTable';
import { EmptyState } from '@/components/data/EmptyState';
import { ErrorState } from '@/components/data/ErrorState';
import { LoadingState } from '@/components/data/LoadingState';
import { Pagination } from '@/components/data/Pagination';
import { ConfirmDialog } from '@/components/form/ConfirmDialog';
import { Button } from '@/components/ui/button';
import type { ProjectDetail } from '@/features/projects/types';
import { toastApiError } from '@/lib/notify';
import { useUrlFilters } from '@/lib/useUrlFilters';
import { useDeleteTask } from '../hooks/useTaskMutations';
import { TASK_PAGE_SIZE, useProjectTasks } from '../hooks/useTaskQueries';
import { TASK_LIST_DEFAULTS, isUntouched, type TaskRow } from '../types';
import { ContributorTaskSheet } from './ContributorTaskSheet';
import { TaskFilters } from './TaskFilters';
import { TaskFormSheet } from './TaskFormSheet';
import { taskColumns } from './taskColumns';

// The project's Tasks tab. Filters, sort and page live in the URL next to
// `?tab=tasks`, so a filtered task view can be linked to directly.
//
// Who gets which action (UI hints only — the backend re-checks):
// - managers (canManage): New task, full edit, delete while untouched
// - a contributor on their own assigned task: the reduced progress/status form
// - everyone else: read-only
export function TasksTab({ project, canManage }: { project: ProjectDetail; canManage: boolean }) {
  const projectId = project.id!;
  const { user, memberships } = useAuth();
  const [filters, setFilters] = useUrlFilters(TASK_LIST_DEFAULTS);
  const list = useProjectTasks(projectId, filters);
  const remove = useDeleteTask();

  // `editing === 'new'` opens an empty create form.
  const [editing, setEditing] = useState<TaskRow | 'new' | null>(null);
  const [ownTask, setOwnTask] = useState<TaskRow | null>(null);
  const [toDelete, setToDelete] = useState<TaskRow | null>(null);

  const assigneeOptions = (project.members ?? []).map((m) => ({
    value: String(m.userId),
    label: m.fullName ?? '',
  }));

  const columns = useMemo(
    () =>
      taskColumns({
        canEdit: (task) =>
          canManage || canEditOwnTaskOnly(user, memberships, projectId, task.assigneeId ?? null),
        // Backend rule: only an untouched task (todo, 0 %) can be deleted.
        canDelete: (task) => canManage && isUntouched(task),
        onEdit: (task) => (canManage ? setEditing(task) : setOwnTask(task)),
        onDelete: setToDelete,
      }),
    [canManage, user, memberships, projectId],
  );

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await remove.mutateAsync(toDelete.id!);
      toast.success('Task deleted');
    } catch (err) {
      toastApiError(err);
    } finally {
      setToDelete(null);
    }
  }

  const newButton = canManage ? (
    <Button onClick={() => setEditing('new')}>
      <Plus className="size-4" />
      New task
    </Button>
  ) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <TaskFilters filters={filters} setFilters={setFilters} assigneeOptions={assigneeOptions} />
        {newButton}
      </div>

      {list.isPending ? (
        <LoadingState rows={6} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.total === 0 ? (
        <EmptyState icon={ListChecks} message="No tasks match these filters." action={newButton} />
      ) : (
        <div className="space-y-3">
          <DataTable
            columns={columns}
            data={list.data.rows}
            getRowId={(row) => String(row.id)}
            sort={filters.sort}
            order={filters.order as 'asc' | 'desc'}
            onSortChange={(sort, order) => setFilters({ sort, order, page: '1' })}
          />
          <Pagination
            page={Number(filters.page) || 1}
            pageSize={TASK_PAGE_SIZE}
            total={list.data.total}
            onPageChange={(page) => setFilters({ page: String(page) })}
          />
        </div>
      )}

      {canManage && (
        <>
          <TaskFormSheet
            open={editing !== null}
            onOpenChange={(open) => !open && setEditing(null)}
            project={project}
            task={editing === 'new' || editing === null ? undefined : editing}
          />
          <ConfirmDialog
            open={toDelete !== null}
            onOpenChange={(open) => !open && setToDelete(null)}
            title="Delete task?"
            description={`"${toDelete?.title ?? ''}" will be permanently removed. Only tasks that haven't been started can be deleted.`}
            confirmLabel="Delete"
            destructive
            pending={remove.isPending}
            onConfirm={confirmDelete}
          />
        </>
      )}
      <ContributorTaskSheet
        open={ownTask !== null}
        onOpenChange={(open) => !open && setOwnTask(null)}
        task={ownTask}
      />
    </div>
  );
}
