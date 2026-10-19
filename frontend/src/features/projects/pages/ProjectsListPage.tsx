import { FolderKanban, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { canCreateProject } from '@/auth/can';
import { useAuth } from '@/auth/useAuth';
import { DataTable } from '@/components/data/DataTable';
import { EmptyState } from '@/components/data/EmptyState';
import { ErrorState } from '@/components/data/ErrorState';
import { LoadingState } from '@/components/data/LoadingState';
import { Pagination } from '@/components/data/Pagination';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { useUrlFilters } from '@/lib/useUrlFilters';
import { ProjectFilters } from '../components/ProjectFilters';
import { ProjectFormSheet } from '../components/ProjectFormSheet';
import { projectColumns } from '../components/projectColumns';
import { PROJECT_PAGE_SIZE, useProjectsList } from '../hooks/useProjectQueries';
import { PROJECT_LIST_DEFAULTS } from '../types';

// Filters, sort and page all live in the URL (CLAUDE.md "Lists"), so a
// filtered view can be shared or bookmarked and the back button restores
// it. Sorting/paging happen on the server; the table only renders a page.
export function ProjectsListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [filters, setFilters] = useUrlFilters(PROJECT_LIST_DEFAULTS);
  const [createOpen, setCreateOpen] = useState(false);
  const list = useProjectsList(filters);
  const canCreate = canCreateProject(user);

  const newButton = canCreate ? (
    <Button onClick={() => setCreateOpen(true)}>
      <Plus className="size-4" />
      New project
    </Button>
  ) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Every project you own, manage or contribute to."
        action={newButton}
      />
      <ProjectFilters filters={filters} setFilters={setFilters} />

      {list.isPending ? (
        <LoadingState rows={8} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.total === 0 ? (
        <EmptyState icon={FolderKanban} message="No projects match these filters." action={newButton} />
      ) : (
        <div className="space-y-3">
          <DataTable
            columns={projectColumns}
            data={list.data.rows}
            getRowId={(row) => String(row.id)}
            sort={filters.sort}
            order={filters.order as 'asc' | 'desc'}
            onSortChange={(sort, order) => setFilters({ sort, order, page: '1' })}
            onRowClick={(row) => navigate(`/projects/${row.id}`)}
          />
          <Pagination
            page={Number(filters.page) || 1}
            pageSize={PROJECT_PAGE_SIZE}
            total={list.data.total}
            onPageChange={(page) => setFilters({ page: String(page) })}
          />
        </div>
      )}

      {canCreate && <ProjectFormSheet open={createOpen} onOpenChange={setCreateOpen} />}
    </div>
  );
}
