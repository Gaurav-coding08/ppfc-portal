import type { LegacyColumnDef } from '@tanstack/react-table/legacy';
import { Pencil, Trash2 } from 'lucide-react';
import { DateText } from '@/components/display/DateText';
import { PriorityBadge } from '@/components/display/PriorityBadge';
import { ProgressBar } from '@/components/display/ProgressBar';
import { StatusBadge } from '@/components/display/StatusBadge';
import { Button } from '@/components/ui/button';
import type { TaskRow } from '../types';
import { TaskDueBadges } from './TaskDueBadges';

// Column ids double as the backend `sort` keys (title, status, priority,
// dueDate, progress — tasks.schemas.ts SORTABLE). Columns the backend
// can't sort by set `enableSorting: false`.
//
// `canEdit`/`canDelete` are UI hints from can.ts and the row's state; the
// backend re-checks both on PATCH/DELETE.
export function taskColumns({
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  canEdit: (task: TaskRow) => boolean;
  canDelete: (task: TaskRow) => boolean;
  onEdit: (task: TaskRow) => void;
  onDelete: (task: TaskRow) => void;
}): LegacyColumnDef<TaskRow, unknown>[] {
  return [
    {
      id: 'title',
      header: 'Title',
      cell: ({ row }) => <span className="line-clamp-2 max-w-md font-medium">{row.original.title}</span>,
    },
    {
      id: 'assignee',
      header: 'Assignee',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.assigneeName ?? <span className="text-muted-foreground">Unassigned</span>,
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) =>
        row.original.status ? <StatusBadge domain="task" status={row.original.status} /> : '—',
    },
    {
      id: 'priority',
      header: 'Priority',
      cell: ({ row }) => (row.original.priority ? <PriorityBadge priority={row.original.priority} /> : '—'),
    },
    {
      id: 'dueDate',
      header: 'Due',
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center gap-2 whitespace-nowrap">
          <DateText value={row.original.dueDate ?? null} />
          <TaskDueBadges task={row.original} />
        </div>
      ),
    },
    {
      id: 'weight',
      header: 'Weight',
      enableSorting: false,
      cell: ({ row }) => <span className="tabular-nums">{row.original.weight}</span>,
    },
    {
      id: 'progress',
      header: 'Progress',
      cell: ({ row }) => <ProgressBar value={row.original.progress ?? null} className="w-28" />,
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          {canEdit(row.original) && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit ${row.original.title}`}
              onClick={() => onEdit(row.original)}
            >
              <Pencil className="size-4" />
            </Button>
          )}
          {canDelete(row.original) && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete ${row.original.title}`}
              onClick={() => onDelete(row.original)}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];
}
