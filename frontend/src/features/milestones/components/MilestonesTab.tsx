import { Flag, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/data/EmptyState';
import { ErrorState } from '@/components/data/ErrorState';
import { LoadingState } from '@/components/data/LoadingState';
import { DateText } from '@/components/display/DateText';
import { StatusBadge } from '@/components/display/StatusBadge';
import { ToneBadge } from '@/components/display/ToneBadge';
import { useReportingDate } from '@/components/layout/useReportingDate';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ProjectDetail } from '@/features/projects/types';
import { cn } from '@/lib/cn';
import { useProjectMilestones } from '../hooks/useMilestones';
import { isDueWithinWindow, type Milestone } from '../types';
import { MilestoneFormSheet } from './MilestoneFormSheet';
import { MilestoneRoadmap } from './MilestoneRoadmap';

// The project's Milestones tab: roadmap strip + table. A project has a
// handful of milestones and the API returns them all at once, so this is a
// plain table, not the server-paginated DataTable.
export function MilestonesTab({ project, canManage }: { project: ProjectDetail; canManage: boolean }) {
  const list = useProjectMilestones(project.id!);
  const asOf = useReportingDate();
  // `editing === 'new'` opens an empty create form.
  const [editing, setEditing] = useState<Milestone | 'new' | null>(null);

  const newButton = canManage ? (
    <Button onClick={() => setEditing('new')}>
      <Plus className="size-4" />
      New milestone
    </Button>
  ) : undefined;

  return (
    <div className="space-y-4">
      {newButton && <div className="flex justify-end">{newButton}</div>}

      {list.isPending ? (
        <LoadingState rows={4} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState icon={Flag} message="No milestones yet." action={newButton} />
      ) : (
        <>
          {project.startDate && project.endDate && (
            <MilestoneRoadmap
              milestones={list.data}
              startDate={project.startDate}
              endDate={project.endDate}
              asOf={asOf}
            />
          )}
          <div className="overflow-x-auto rounded-xl border bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Achieved</TableHead>
                  {canManage && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.map((m) => {
                  const dueSoon = isDueWithinWindow(m);
                  return (
                    <TableRow key={m.id} className={cn(dueSoon && 'bg-amber-50/60')}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2 whitespace-nowrap">
                          <DateText value={m.dueDate ?? null} />
                          {m.isOverdue && <ToneBadge tone="danger">Overdue</ToneBadge>}
                          {dueSoon && (
                            <ToneBadge tone="warning">
                              {m.daysToDue === 0
                                ? 'Due today'
                                : `Due in ${m.daysToDue} day${m.daysToDue === 1 ? '' : 's'}`}
                            </ToneBadge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {m.status && <StatusBadge domain="milestone" status={m.status} />}
                      </TableCell>
                      <TableCell>
                        <DateText value={m.achievedDate ?? null} />
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Edit ${m.name}`}
                            onClick={() => setEditing(m)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {canManage && (
        <MilestoneFormSheet
          open={editing !== null}
          onOpenChange={(open) => !open && setEditing(null)}
          project={project}
          milestone={editing === 'new' || editing === null ? undefined : editing}
        />
      )}
    </div>
  );
}
