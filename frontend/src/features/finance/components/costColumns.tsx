import type { LegacyColumnDef } from '@tanstack/react-table/legacy';
import { DateText } from '@/components/display/DateText';
import { Money } from '@/components/display/Money';
import { StatusBadge } from '@/components/display/StatusBadge';
import { ToneBadge } from '@/components/display/ToneBadge';
import type { Cost } from '../types';
import { CostRowActions, type CostActions } from './CostRowActions';

// Column ids double as the backend `sort` keys where it can sort by them
// (txnDate, amount, status — costs.schemas.ts SORTABLE).
//
// Row actions depend on the cost's state (UI hint; the backend enforces
// it): drafts can be edited, deleted or posted; posted expenses can only be
// reversed; reversal entries have no actions. `actions` is omitted for
// read-only viewers, so the column doesn't render at all.
export function costColumns(actions?: CostActions): LegacyColumnDef<Cost, unknown>[] {
  const columns: LegacyColumnDef<Cost, unknown>[] = [
    {
      id: 'txnDate',
      header: 'Date',
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          <DateText value={row.original.txnDate ?? null} />
        </span>
      ),
    },
    {
      id: 'category',
      header: 'Category',
      enableSorting: false,
      cell: ({ row }) => <span className="whitespace-nowrap">{row.original.categoryName}</span>,
    },
    {
      id: 'description',
      header: 'Description',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="max-w-xs">
          <p className="line-clamp-1" title={row.original.description}>
            {row.original.description}
          </p>
          {row.original.vendor && <p className="text-muted-foreground text-xs">{row.original.vendor}</p>}
        </div>
      ),
    },
    {
      id: 'amount',
      header: 'Amount',
      // `signedAmount` comes from SQL (reversals are negative), so the
      // table shows exactly what actual spend adds up.
      cell: ({ row }) => <Money amount={row.original.signedAmount ?? null} className="whitespace-nowrap" />,
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          <StatusBadge domain="cost" status={row.original.status!} />
          {row.original.entryType === 'reversal' && <ToneBadge tone="neutral">Reversal</ToneBadge>}
        </div>
      ),
    },
    {
      id: 'createdBy',
      header: 'Created by',
      enableSorting: false,
      cell: ({ row }) => <span className="whitespace-nowrap">{row.original.createdByName}</span>,
    },
    {
      id: 'posted',
      header: 'Posted',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.postedAt ? (
          <div className="text-sm whitespace-nowrap">
            <p>{row.original.postedByName}</p>
            <p className="text-muted-foreground text-xs">
              <DateText value={row.original.postedAt} kind="dateTime" />
            </p>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  if (actions) {
    columns.push({
      id: 'actions',
      header: '',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => <CostRowActions cost={row.original} actions={actions} />,
    });
  }

  return columns;
}

/** Reversal entries read as corrections, not new spend. */
export function costRowClassName(cost: Cost): string | undefined {
  return cost.entryType === 'reversal' ? 'text-muted-foreground' : undefined;
}
