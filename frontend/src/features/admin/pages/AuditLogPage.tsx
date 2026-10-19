import { ChevronDown, ChevronRight, ScrollText, X } from 'lucide-react';
import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { isAdmin } from '@/auth/can';
import { useAuth } from '@/auth/useAuth';
import { EmptyState } from '@/components/data/EmptyState';
import { ErrorState } from '@/components/data/ErrorState';
import { FilterBar } from '@/components/data/FilterBar';
import { FilterSelect } from '@/components/data/FilterSelect';
import { ForbiddenState } from '@/components/data/ForbiddenState';
import { LoadingState } from '@/components/data/LoadingState';
import { Pagination } from '@/components/data/Pagination';
import { DateText } from '@/components/display/DateText';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useUrlFilters } from '@/lib/useUrlFilters';
import { auditEntityHref } from '../auditLinks';
import { AuditDiff } from '../components/AuditDiff';
import { ADMIN_PAGE_SIZE, useActorOptions, useAuditEvents } from '../hooks/useAdminQueries';
import { AUDIT_ENTITY_TYPES, AUDIT_LIST_DEFAULTS, type AuditEvent } from '../types';

// Admin audit review: every audited mutation, newest first, filterable by
// entity type, actor and date range (all in the URL). Each row expands to
// show the stored before/after snapshots field by field.
export function AuditLogPage() {
  const { user } = useAuth();
  const admin = isAdmin(user);
  const [filters, setFilters] = useUrlFilters(AUDIT_LIST_DEFAULTS);
  const list = useAuditEvents(filters, admin);
  const actors = useActorOptions(admin);
  const [expanded, setExpanded] = useState<number | null>(null);

  if (!admin) return <ForbiddenState message="Only admins can review the audit log." />;

  const set = (patch: Partial<typeof filters>) => setFilters({ ...patch, page: '1' });
  const hasFilters = !!(filters.entityType || filters.actorId || filters.from || filters.to);

  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" description="Every recorded change, who made it and what it changed." />

      <FilterBar>
        <FilterSelect
          label="Entity type"
          allLabel="All entity types"
          value={filters.entityType}
          onChange={(entityType) => set({ entityType })}
          options={AUDIT_ENTITY_TYPES}
        />
        <FilterSelect
          label="Actor"
          allLabel="All actors"
          value={filters.actorId}
          onChange={(actorId) => set({ actorId })}
          options={actors.data ?? []}
        />
        {/* Native date inputs emit YYYY-MM-DD, the format the API expects. */}
        <div className="flex items-center gap-2">
          <Input
            type="date"
            aria-label="Audit date from"
            className="w-40"
            value={filters.from}
            onChange={(e) => set({ from: e.target.value })}
          />
          <span className="text-muted-foreground text-sm">to</span>
          <Input
            type="date"
            aria-label="Audit date to"
            className="w-40"
            value={filters.to}
            onChange={(e) => set({ to: e.target.value })}
          />
        </div>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => set({ entityType: '', actorId: '', from: '', to: '' })}
          >
            <X className="size-4" />
            Clear
          </Button>
        )}
      </FilterBar>

      {list.isPending ? (
        <LoadingState rows={8} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.total === 0 ? (
        <EmptyState icon={ScrollText} message="No audit events match these filters." />
      ) : (
        <div className="space-y-3">
          <Card className="p-0">
            <div className="overflow-x-auto">
              <Table aria-label="Audit events">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 pl-3">
                      <span className="sr-only">Details</span>
                    </TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Request ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.rows.map((event) => (
                    <AuditRow
                      key={event.id}
                      event={event}
                      open={expanded === event.id}
                      onToggle={() => setExpanded(expanded === event.id ? null : event.id!)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
          <Pagination
            page={Number(filters.page) || 1}
            pageSize={ADMIN_PAGE_SIZE}
            total={list.data.total}
            onPageChange={(page) => setFilters({ page: String(page) })}
          />
        </div>
      )}
    </div>
  );
}

function AuditRow({ event, open, onToggle }: { event: AuditEvent; open: boolean; onToggle: () => void }) {
  const href = auditEntityHref(event);
  const entityLabel = `${(event.entityType ?? '').replaceAll('_', ' ')} #${event.entityId}`;
  const detailsId = `audit-details-${event.id}`;
  return (
    <Fragment>
      <TableRow>
        <TableCell className="pl-3">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-expanded={open}
            aria-controls={detailsId}
            aria-label={`${open ? 'Hide' : 'Show'} changes for ${event.action} on ${entityLabel}`}
            onClick={onToggle}
          >
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </Button>
        </TableCell>
        <TableCell className="whitespace-nowrap tabular-nums">
          <DateText value={event.createdAt ?? null} kind="dateTime" />
        </TableCell>
        <TableCell>{event.actorName ?? <span className="text-muted-foreground">System</span>}</TableCell>
        <TableCell className="font-mono text-xs">{event.action}</TableCell>
        <TableCell>
          {href ? (
            <Link to={href} className="text-primary hover:underline">
              {entityLabel}
            </Link>
          ) : (
            entityLabel
          )}
        </TableCell>
        <TableCell
          className="text-muted-foreground max-w-40 truncate font-mono text-xs"
          title={event.requestId ?? ''}
        >
          {event.requestId ?? '—'}
        </TableCell>
      </TableRow>
      {open && (
        <TableRow id={detailsId} className="bg-muted/30 hover:bg-muted/30">
          <TableCell />
          <TableCell colSpan={5} className="whitespace-normal">
            <AuditDiff before={event.before} after={event.after} />
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}
