import type { LegacyColumnDef } from '@tanstack/react-table/legacy';
import { Link } from 'react-router-dom';
import { DateText } from '@/components/display/DateText';
import { ExposureBadge } from '@/components/display/ExposureBadge';
import { Money } from '@/components/display/Money';
import { ProgressBar } from '@/components/display/ProgressBar';
import { StatusBadge } from '@/components/display/StatusBadge';
import { ToneBadge } from '@/components/display/ToneBadge';
import { formatDateTime } from '@/lib/format';
import type { DrillCostRow, DrillCrRow, DrillRiskRow, DrillTaskRow } from '../types';

// Columns for the drill-down drawer, one set per record kind. Every row
// links to the record in its own screen. Drill endpoints have no sort
// param (newest/most relevant first), so no column is sortable.

const linkClass = 'text-primary font-medium hover:underline';

// A plain function (not a component) so this file only exports column
// definitions, which keeps React Fast Refresh happy.
function projectLink(id: number, code: string, tab: string) {
  return (
    <Link to={`/projects/${id}?tab=${tab}`} className={`${linkClass} whitespace-nowrap`}>
      {code}
    </Link>
  );
}

export const costDrillColumns: LegacyColumnDef<DrillCostRow, unknown>[] = [
  {
    id: 'txnDate',
    header: 'Date',
    cell: ({ row }) => (
      <span className="whitespace-nowrap">
        <DateText value={row.original.txnDate} />
      </span>
    ),
  },
  {
    id: 'project',
    header: 'Project',
    cell: ({ row }) => projectLink(row.original.projectId, row.original.projectCode, 'finance'),
  },
  { id: 'category', header: 'Category', cell: ({ row }) => row.original.categoryName },
  {
    id: 'description',
    header: 'Description',
    cell: ({ row }) => (
      <span className="line-clamp-1 max-w-56" title={row.original.description}>
        {row.original.description}
      </span>
    ),
  },
  {
    id: 'amount',
    header: () => <span className="block text-right">Amount</span>,
    // Reversal entries subtract from actual spend (CLAUDE.md); the badge
    // says so in words rather than the browser negating the amount.
    cell: ({ row }) => (
      <span className="flex items-center justify-end gap-2 whitespace-nowrap">
        {row.original.entryType === 'reversal' && <ToneBadge tone="neutral">Reversal</ToneBadge>}
        <Money amount={row.original.amount} />
      </span>
    ),
  },
];

export const taskDrillColumns: LegacyColumnDef<DrillTaskRow, unknown>[] = [
  {
    id: 'title',
    header: 'Task',
    cell: ({ row }) => (
      <Link
        to={`/projects/${row.original.projectId}?tab=tasks`}
        className={`${linkClass} line-clamp-2 max-w-64`}
        title={row.original.title}
      >
        {row.original.title}
      </Link>
    ),
  },
  {
    id: 'project',
    header: 'Project',
    cell: ({ row }) => <span className="whitespace-nowrap">{row.original.projectCode}</span>,
  },
  { id: 'assignee', header: 'Assignee', cell: ({ row }) => row.original.assigneeName ?? 'Unassigned' },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusBadge domain="task" status={row.original.status} />,
  },
  {
    id: 'dueDate',
    header: 'Due',
    cell: ({ row }) => (
      <span className="whitespace-nowrap">
        <DateText value={row.original.dueDate} />
      </span>
    ),
  },
  {
    id: 'progress',
    header: 'Progress',
    cell: ({ row }) => <ProgressBar value={row.original.progress} className="min-w-28" />,
  },
];

export const riskDrillColumns: LegacyColumnDef<DrillRiskRow, unknown>[] = [
  {
    id: 'title',
    header: 'Risk',
    cell: ({ row }) => (
      <Link
        to={`/projects/${row.original.projectId}?tab=risks`}
        className={`${linkClass} line-clamp-2 max-w-64`}
      >
        {row.original.title}
      </Link>
    ),
  },
  {
    id: 'project',
    header: 'Project',
    cell: ({ row }) => <span className="whitespace-nowrap">{row.original.projectCode}</span>,
  },
  {
    id: 'score',
    header: 'Score',
    cell: ({ row }) => (
      <span className="flex items-center gap-2 whitespace-nowrap tabular-nums">
        {row.original.probability} × {row.original.impact} = {row.original.score}
        <ExposureBadge exposure={row.original.band} />
      </span>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusBadge domain="risk" status={row.original.status} />,
  },
];

export const crDrillColumns: LegacyColumnDef<DrillCrRow, unknown>[] = [
  {
    id: 'code',
    header: 'Request',
    cell: ({ row }) => (
      <Link to={`/change-requests/${row.original.id}`} className={`${linkClass} whitespace-nowrap`}>
        {row.original.code}
      </Link>
    ),
  },
  {
    id: 'title',
    header: 'Title',
    cell: ({ row }) => <span className="line-clamp-2 max-w-64">{row.original.title}</span>,
  },
  {
    id: 'project',
    header: 'Project',
    cell: ({ row }) => <span className="whitespace-nowrap">{row.original.projectCode}</span>,
  },
  { id: 'requester', header: 'Requested by', cell: ({ row }) => row.original.requestedByName ?? '—' },
  {
    id: 'submittedAt',
    header: 'Submitted',
    cell: ({ row }) => (
      <span className="whitespace-nowrap">{formatDateTime(row.original.submittedAt, 'd MMM yyyy')}</span>
    ),
  },
];
