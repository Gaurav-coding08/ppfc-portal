import { flexRender } from '@tanstack/react-table';
import { getCoreRowModel, useLegacyTable, type LegacyColumnDef } from '@tanstack/react-table/legacy';
import type { RowData } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/cn';

// `@tanstack/react-table` v9 replaced the familiar v8 hook (`useReactTable`
// + `getCoreRowModel`/`flexRender`) with an explicit, tree-shakeable
// `features` object graph. This table only ever needs the plain row model —
// sorting and pagination are server-side, not computed by the table — so it
// uses the package's own `useLegacyTable` v8-compatibility layer
// (`@tanstack/react-table/legacy`) instead of hand-rolling a `features`
// object for a single row model. It's marked deprecated upstream but is
// maintained by the same package for exactly this case; revisit if a future
// feature needs v9-only functionality (e.g. column grouping).
export function DataTable<TData extends RowData>({
  columns,
  data,
  sort,
  order = 'asc',
  onSortChange,
  onRowClick,
  getRowId,
  enableColumnVisibility = true,
}: {
  columns: LegacyColumnDef<TData, unknown>[];
  data: TData[];
  sort?: string;
  order?: 'asc' | 'desc';
  onSortChange?: (sort: string, order: 'asc' | 'desc') => void;
  onRowClick?: (row: TData) => void;
  getRowId?: (row: TData) => string;
  enableColumnVisibility?: boolean;
}) {
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});

  const table = useLegacyTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
    state: { columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
  });

  return (
    <div className="space-y-2">
      {enableColumnVisibility && (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm">
                  <SlidersHorizontal className="size-4" />
                  Columns
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              {table
                .getAllLeafColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sortId = header.column.id;
                  const sortable = header.column.columnDef.enableSorting !== false && !!onSortChange;
                  const isActive = sort === sortId;
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : sortable ? (
                        <button
                          type="button"
                          className="flex items-center gap-1 font-medium"
                          onClick={() => onSortChange!(sortId, isActive && order === 'asc' ? 'desc' : 'asc')}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {isActive ? (
                            order === 'asc' ? (
                              <ArrowUp className="size-3.5" />
                            ) : (
                              <ArrowDown className="size-3.5" />
                            )
                          ) : (
                            <ArrowUpDown className="text-muted-foreground/50 size-3.5" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-muted-foreground h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn(onRowClick && 'hover:bg-muted/50 cursor-pointer')}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
