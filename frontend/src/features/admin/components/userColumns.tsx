import type { LegacyColumnDef } from '@tanstack/react-table/legacy';
import { DateText } from '@/components/display/DateText';
import { ToneBadge } from '@/components/display/ToneBadge';
import { Button } from '@/components/ui/button';
import { roleLabel, type AdminUser } from '../types';

// Columns sort unless `enableSorting: false`; sortable ids match the `GET /users` sort enum (fullName, email, role, createdAt).
export function userColumns({
  departmentName,
  currentUserId,
  onChangeRole,
  onToggleActive,
}: {
  departmentName: (id: number | null | undefined) => string;
  currentUserId: number | undefined;
  onChangeRole: (user: AdminUser) => void;
  onToggleActive: (user: AdminUser) => void;
}): LegacyColumnDef<AdminUser, unknown>[] {
  return [
    {
      id: 'fullName',
      header: 'Name',
      enableHiding: false,
      cell: ({ row }) => (
        <span className="font-medium">
          {row.original.fullName}
          {row.original.id === currentUserId && (
            <span className="text-muted-foreground font-normal"> (you)</span>
          )}
        </span>
      ),
    },
    { id: 'email', header: 'Email', cell: ({ row }) => row.original.email },
    {
      id: 'role',
      header: 'Role',
      cell: ({ row }) => (
        <ToneBadge tone={row.original.role === 'admin' ? 'info' : 'neutral'}>
          {roleLabel(row.original.role)}
        </ToneBadge>
      ),
    },
    {
      id: 'department',
      header: 'Department',
      enableSorting: false,
      cell: ({ row }) => departmentName(row.original.departmentId),
    },
    {
      id: 'isActive',
      header: 'Status',
      enableSorting: false,
      cell: ({ row }) => (
        <ToneBadge tone={row.original.isActive ? 'success' : 'neutral'}>
          {row.original.isActive ? 'Active' : 'Inactive'}
        </ToneBadge>
      ),
    },
    {
      id: 'createdAt',
      header: 'Created',
      cell: ({ row }) => <DateText value={row.original.createdAt ?? null} kind="dateTime" />,
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      enableHiding: false,
      // Shown for the admin's own row too: the backend's 422 ("can't
      // change your own role") is the rule, and its message is displayed.
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button variant="outline" size="sm" onClick={() => onChangeRole(row.original)}>
            Change role
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onToggleActive(row.original)}>
            {row.original.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      ),
    },
  ];
}
