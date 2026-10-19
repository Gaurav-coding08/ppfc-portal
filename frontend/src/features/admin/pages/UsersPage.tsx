import { Building2, Plus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { isVersionConflict } from '@/api/errors';
import { isAdmin } from '@/auth/can';
import { useAuth } from '@/auth/useAuth';
import { DataTable } from '@/components/data/DataTable';
import { EmptyState } from '@/components/data/EmptyState';
import { ErrorState } from '@/components/data/ErrorState';
import { FilterBar, SearchInput } from '@/components/data/FilterBar';
import { FilterSelect } from '@/components/data/FilterSelect';
import { ForbiddenState } from '@/components/data/ForbiddenState';
import { LoadingState } from '@/components/data/LoadingState';
import { Pagination } from '@/components/data/Pagination';
import { ConfirmDialog } from '@/components/form/ConfirmDialog';
import { VersionConflictDialog } from '@/components/form/VersionConflictDialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useDepartmentOptions } from '@/features/projects/hooks/useReferenceData';
import { toastApiError } from '@/lib/notify';
import { useUrlFilters } from '@/lib/useUrlFilters';
import { ChangeRoleFlow } from '../components/ChangeRoleFlow';
import { CreateUserDialog } from '../components/CreateUserDialog';
import { userColumns } from '../components/userColumns';
import { useUpdateUser } from '../hooks/useAdminMutations';
import { ADMIN_PAGE_SIZE, useAdminUsers } from '../hooks/useAdminQueries';
import { ROLE_OPTIONS, USER_LIST_DEFAULTS, type AdminUser } from '../types';

// Admin-only user management (module 07). Hiding the nav link is only a
// hint; the backend's requireRole('admin') is the rule, and a non-admin who
// types the URL gets ForbiddenState without the page calling the API.
export function UsersPage() {
  const { user: me } = useAuth();
  const admin = isAdmin(me);
  const [filters, setFilters] = useUrlFilters(USER_LIST_DEFAULTS);
  const list = useAdminUsers(filters, admin);
  const departments = useDepartmentOptions();
  const update = useUpdateUser();
  const [creating, setCreating] = useState(false);
  const [roleTarget, setRoleTarget] = useState<AdminUser | null>(null);
  const [toggleTarget, setToggleTarget] = useState<AdminUser | null>(null);
  const [conflict, setConflict] = useState(false);

  const departmentOptions = useMemo(() => departments.data ?? [], [departments.data]);
  const columns = useMemo(
    () =>
      userColumns({
        departmentName: (id) => departmentOptions.find((d) => d.value === String(id))?.label ?? '—',
        currentUserId: me?.id,
        onChangeRole: setRoleTarget,
        onToggleActive: setToggleTarget,
      }),
    [departmentOptions, me?.id],
  );

  if (!admin) return <ForbiddenState message="Only admins can manage users." />;

  async function confirmToggle() {
    if (!toggleTarget) return;
    const activate = !toggleTarget.isActive;
    try {
      await update.mutateAsync({
        id: toggleTarget.id!,
        body: { isActive: activate, version: toggleTarget.version! },
      });
      toast.success(`${toggleTarget.fullName} ${activate ? 'activated' : 'deactivated'}`);
    } catch (err) {
      // Self-deactivation and the last active admin come back as 422 with
      // a readable message; a stale version gets the reload dialog.
      if (isVersionConflict(err)) setConflict(true);
      else toastApiError(err);
    } finally {
      setToggleTarget(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Accounts, roles and departments."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            New user
          </Button>
        }
      />

      <FilterBar>
        <SearchInput
          value={filters.q}
          onChange={(q) => setFilters({ q, page: '1' })}
          placeholder="Search name or email…"
        />
        <FilterSelect
          label="Role"
          allLabel="All roles"
          value={filters.role}
          onChange={(role) => setFilters({ role, page: '1' })}
          options={ROLE_OPTIONS}
        />
        <FilterSelect
          label="Department"
          allLabel="All departments"
          value={filters.departmentId}
          onChange={(departmentId) => setFilters({ departmentId, page: '1' })}
          options={departmentOptions}
        />
      </FilterBar>

      {list.isPending ? (
        <LoadingState rows={8} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.total === 0 ? (
        <EmptyState icon={Users} message="No users match these filters." />
      ) : (
        <div className="space-y-3">
          <DataTable
            columns={columns}
            data={list.data.rows}
            getRowId={(row) => String(row.id)}
            getRowClassName={(row) => (row.isActive ? undefined : 'text-muted-foreground')}
            sort={filters.sort}
            order={filters.order as 'asc' | 'desc'}
            onSortChange={(sort, order) => setFilters({ sort, order, page: '1' })}
          />
          <Pagination
            page={Number(filters.page) || 1}
            pageSize={ADMIN_PAGE_SIZE}
            total={list.data.total}
            onPageChange={(page) => setFilters({ page: String(page) })}
          />
        </div>
      )}

      <DepartmentsCard departments={departmentOptions} loading={departments.isPending} />

      <CreateUserDialog open={creating} onOpenChange={setCreating} departments={departmentOptions} />
      {roleTarget && (
        <ChangeRoleFlow key={roleTarget.id} user={roleTarget} onClose={() => setRoleTarget(null)} />
      )}
      <ConfirmDialog
        open={toggleTarget !== null}
        onOpenChange={(open) => !open && setToggleTarget(null)}
        title={toggleTarget?.isActive ? 'Deactivate this user?' : 'Activate this user?'}
        description={
          toggleTarget?.isActive
            ? `${toggleTarget?.fullName ?? ''} will no longer be able to sign in. Their history is kept.`
            : `${toggleTarget?.fullName ?? ''} will be able to sign in again.`
        }
        confirmLabel={toggleTarget?.isActive ? 'Deactivate' : 'Activate'}
        destructive={toggleTarget?.isActive}
        pending={update.isPending}
        onConfirm={confirmToggle}
      />
      <VersionConflictDialog open={conflict} onOpenChange={setConflict} />
    </div>
  );
}

// Read-only reference list: the API has no department create/rename
// (feature 06 scope).
function DepartmentsCard({
  departments,
  loading,
}: {
  departments: { value: string; label: string }[];
  loading: boolean;
}) {
  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center gap-2">
        <Building2 className="text-muted-foreground size-4" />
        <h2 className="text-base font-semibold">Departments</h2>
      </div>
      {loading ? (
        <LoadingState rows={2} />
      ) : (
        <ul className="flex flex-wrap gap-2" aria-label="Departments">
          {departments.map((d) => (
            <li key={d.value} className="bg-muted rounded-md px-2.5 py-1 text-sm">
              {d.label}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
