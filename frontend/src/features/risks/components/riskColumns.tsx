import type { LegacyColumnDef } from '@tanstack/react-table/legacy';
import { CircleCheck, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DateText } from '@/components/display/DateText';
import { ExposureBadge } from '@/components/display/ExposureBadge';
import { StatusBadge } from '@/components/display/StatusBadge';
import { Button } from '@/components/ui/button';
import type { Risk } from '../types';

// Column ids double as the backend `sort` keys where the API can sort by
// them (score, dueDate, status — risks.schemas.ts SORTABLE); every other
// column sets `enableSorting: false`.
//
// `projectLabel`: portfolio pages add a Project column (a link to that
// project's Risks tab). `actions`: the project tab adds Edit / Close for
// managers. Both are UI hints; the backend re-checks every PATCH.
export function riskColumns({
  projectLabel,
  actions,
}: {
  projectLabel?: (projectId: number) => string;
  actions?: { onEdit: (risk: Risk) => void; onClose: (risk: Risk) => void };
} = {}): LegacyColumnDef<Risk, unknown>[] {
  const columns: LegacyColumnDef<Risk, unknown>[] = [];

  if (projectLabel) {
    columns.push({
      id: 'project',
      header: 'Project',
      enableSorting: false,
      cell: ({ row }) => (
        <Link
          to={`/projects/${row.original.projectId}?tab=risks`}
          className="text-primary whitespace-nowrap hover:underline"
        >
          {projectLabel(row.original.projectId!)}
        </Link>
      ),
    });
  }

  columns.push(
    {
      id: 'type',
      header: 'Type',
      enableSorting: false,
      cell: ({ row }) => <span className="capitalize">{row.original.type}</span>,
    },
    {
      id: 'title',
      header: 'Title',
      enableSorting: false,
      cell: ({ row }) => <span className="line-clamp-2 max-w-xs font-medium">{row.original.title}</span>,
    },
    {
      id: 'owner',
      header: 'Owner',
      enableSorting: false,
      cell: ({ row }) => row.original.ownerName ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'probability',
      header: 'P',
      enableSorting: false,
      cell: ({ row }) => <span className="tabular-nums">{row.original.probability}</span>,
    },
    {
      id: 'impact',
      header: 'I',
      enableSorting: false,
      cell: ({ row }) => <span className="tabular-nums">{row.original.impact}</span>,
    },
    {
      id: 'score',
      header: 'Score',
      cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.score}</span>,
    },
    {
      id: 'exposure',
      header: 'Exposure',
      enableSorting: false,
      cell: ({ row }) => (row.original.exposure ? <ExposureBadge exposure={row.original.exposure} /> : '—'),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) =>
        row.original.status ? <StatusBadge domain="risk" status={row.original.status} /> : '—',
    },
    {
      id: 'dueDate',
      header: 'Due',
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          <DateText value={row.original.dueDate ?? null} />
        </span>
      ),
    },
    {
      id: 'mitigation',
      header: 'Mitigation',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.mitigation ? (
          // Truncated in the table; the full text is in the title tooltip
          // and in the edit form.
          <span className="line-clamp-1 max-w-56" title={row.original.mitigation}>
            {row.original.mitigation}
          </span>
        ) : (
          <span className="text-muted-foreground">None recorded</span>
        ),
    },
  );

  if (actions) {
    columns.push({
      id: 'actions',
      header: '',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit ${row.original.title}`}
            onClick={() => actions.onEdit(row.original)}
          >
            <Pencil className="size-4" />
          </Button>
          {row.original.status !== 'closed' && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Close ${row.original.title}`}
              onClick={() => actions.onClose(row.original)}
            >
              <CircleCheck className="size-4" />
            </Button>
          )}
        </div>
      ),
    });
  }

  return columns;
}

/** Closed risks stay listed but read as inactive. */
export function riskRowClassName(risk: Risk): string | undefined {
  return risk.status === 'closed' ? 'text-muted-foreground opacity-70' : undefined;
}
