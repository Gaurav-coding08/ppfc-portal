import type { LegacyColumnDef } from '@tanstack/react-table/legacy';
import { Link } from 'react-router-dom';
import { DateText } from '@/components/display/DateText';
import { ProgressBar } from '@/components/display/ProgressBar';
import { StatusBadge } from '@/components/display/StatusBadge';
import type { ProjectListItem } from '../types';

// Column ids double as the backend `sort` keys (code, name, status,
// startDate, endDate, progress — projects.schemas.ts SORTABLE). Columns the
// backend can't sort by set `enableSorting: false` so no sort arrow shows.
export const projectColumns: LegacyColumnDef<ProjectListItem, unknown>[] = [
  {
    id: 'code',
    header: 'Code',
    // A real link (not just the row's onClick) so the detail page is
    // reachable by keyboard. stopPropagation avoids a second navigation
    // from the row handler.
    cell: ({ row }) => (
      <Link
        to={`/projects/${row.original.id}`}
        onClick={(e) => e.stopPropagation()}
        className="font-medium text-indigo-600 tabular-nums hover:underline"
      >
        {row.original.code}
      </Link>
    ),
  },
  { id: 'name', header: 'Name', cell: ({ row }) => row.original.name },
  {
    id: 'department',
    header: 'Department',
    enableSorting: false,
    cell: ({ row }) => row.original.department?.name ?? '—',
  },
  {
    id: 'owner',
    header: 'Owner',
    enableSorting: false,
    cell: ({ row }) => row.original.owner?.fullName ?? '—',
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) =>
      row.original.status ? <StatusBadge domain="project" status={row.original.status} /> : '—',
  },
  {
    id: 'startDate',
    header: 'Start',
    cell: ({ row }) => <DateText value={row.original.startDate ?? null} />,
  },
  { id: 'endDate', header: 'End', cell: ({ row }) => <DateText value={row.original.endDate ?? null} /> },
  {
    id: 'progress',
    header: 'Progress',
    // Weighted progress is computed by the backend (fn_project_progress);
    // the bar only displays it.
    cell: ({ row }) => <ProgressBar value={row.original.progressPct ?? null} className="w-32" />,
  },
  {
    id: 'deliveryStatus',
    header: 'Delivery',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.deliveryStatus ? (
        <StatusBadge domain="delivery" status={row.original.deliveryStatus} />
      ) : (
        '—'
      ),
  },
];
