import type { LegacyColumnDef } from '@tanstack/react-table/legacy';
import { Link } from 'react-router-dom';
import { DateText } from '@/components/display/DateText';
import { StatusBadge } from '@/components/display/StatusBadge';
import type { ChangeRequestRow } from '../types';

// The backend always orders CRs newest-submission first and has no sort
// param, so no column is sortable. The code cell is a real link (keyboard
// reachable) to the detail page.
// `projectLabel`: the portfolio list adds a Project column; the project's
// own tab leaves it out.
export function crColumns({
  projectLabel,
}: { projectLabel?: (projectId: number) => string } = {}): LegacyColumnDef<ChangeRequestRow, unknown>[] {
  const columns: LegacyColumnDef<ChangeRequestRow, unknown>[] = [
    {
      id: 'code',
      header: 'Code',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <Link
          to={`/change-requests/${row.original.id}`}
          className="text-primary font-medium whitespace-nowrap hover:underline"
        >
          {row.original.code}
        </Link>
      ),
    },
  ];

  if (projectLabel) {
    columns.push({
      id: 'project',
      header: 'Project',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="line-clamp-1 max-w-56">{projectLabel(row.original.projectId!)}</span>
      ),
    });
  }

  columns.push(
    {
      id: 'title',
      header: 'Title',
      enableSorting: false,
      cell: ({ row }) => <span className="line-clamp-2 max-w-md">{row.original.title}</span>,
    },
    {
      id: 'requester',
      header: 'Requester',
      enableSorting: false,
      cell: ({ row }) => <span className="whitespace-nowrap">{row.original.requesterName}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.status ? <StatusBadge domain="changeRequest" status={row.original.status} /> : '—',
    },
    {
      id: 'submittedAt',
      header: 'Submitted',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          <DateText value={row.original.submittedAt ?? null} kind="dateTime" />
        </span>
      ),
    },
  );

  return columns;
}
