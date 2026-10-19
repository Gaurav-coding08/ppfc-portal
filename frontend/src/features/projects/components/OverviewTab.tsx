import { AlertTriangle, CalendarCheck, History } from 'lucide-react';
import { Link } from 'react-router-dom';
import { KpiCard } from '@/components/display/KpiCard';
import { Money } from '@/components/display/Money';
import { Percent } from '@/components/display/Percent';
import { DateText } from '@/components/display/DateText';
import { StatusBadge } from '@/components/display/StatusBadge';
import { ExposureBadge } from '@/components/display/ExposureBadge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjectMilestones } from '@/features/milestones/hooks/useMilestones';
import { useProjectRisks } from '@/features/risks/hooks/useRiskQueries';
import { useProjectActivity } from '../hooks/useProjectQueries';
import { describeAction } from '../activity';
import type { ProjectDetail } from '../types';
import { ProgressHistoryChart } from './ProgressHistoryChart';

export function OverviewTab({ project }: { project: ProjectDetail }) {
  const counts = project.counts;
  const budget = project.budget;

  return (
    <div className="space-y-6">
      {project.description && (
        <Card className="p-5">
          <h2 className="text-base font-semibold">Description</h2>
          <p className="text-muted-foreground text-sm whitespace-pre-line">{project.description}</p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard label="Tasks" value={counts?.taskCount ?? 0} />
        <KpiCard label="Overdue tasks" value={counts?.overdueTaskCount ?? 0} />
        <KpiCard label="Open risks" value={counts?.openRiskCount ?? 0} />
        <KpiCard label="Pending change requests" value={counts?.pendingCrCount ?? 0} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Left column: progress, milestones, risks */}
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-base font-semibold">Progress history</h2>
            <ProgressHistoryChart projectId={project.id!} />
          </Card>
          <NextMilestones projectId={project.id!} />
          <TopRisks projectId={project.id!} />
        </div>

        {/* Right column: finance mini-summary, latest activity */}
        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <h2 className="text-base font-semibold">Financial summary</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <KpiCard
                label="Current budget"
                value={<Money compact amount={budget?.currentBudget ?? null} />}
              />
              <KpiCard
                label="Actual spend"
                value={<Money compact amount={budget?.actualSpend ?? null} />}
              />
              <KpiCard
                label="Utilization"
                value={<Percent kind="ratio" value={budget?.utilization} />}
              />
            </div>
            <div className="text-right">
              <Link
                to={`/projects/${project.id}?tab=finance`}
                className="text-primary text-xs font-medium hover:underline"
              >
                View full finance tab
              </Link>
            </div>
          </Card>
          <LatestActivity projectId={project.id!} />
        </div>
      </div>
    </div>
  );
}

function NextMilestones({ projectId }: { projectId: number }) {
  const milestones = useProjectMilestones(projectId);

  const upcoming = (milestones.data ?? [])
    .filter((m) => m.status === 'planned')
    .slice(0, 3);

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <CalendarCheck className="text-muted-foreground size-4" aria-hidden />
        <h2 className="text-base font-semibold">Next milestones</h2>
      </div>
      {milestones.isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : upcoming.length === 0 ? (
        <p className="text-muted-foreground text-sm">No upcoming milestones.</p>
      ) : (
        <ul className="divide-y text-sm">
          {upcoming.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{m.name}</p>
                <p className="text-muted-foreground text-xs">
                  Due <DateText value={m.dueDate ?? null} />
                  {m.daysToDue != null && m.daysToDue >= 0 && (
                    <span className="ml-1">({m.daysToDue} days)</span>
                  )}
                </p>
              </div>
              <StatusBadge domain="milestone" status={m.status!} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TopRisks({ projectId }: { projectId: number }) {
  const risks = useProjectRisks(projectId, {
    q: '',
    status: 'open',
    type: '',
    sort: 'score',
    order: 'desc',
    page: '1',
  });

  const top = (risks.data?.rows ?? []).slice(0, 3);

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="text-muted-foreground size-4" aria-hidden />
        <h2 className="text-base font-semibold">Top open risks</h2>
      </div>
      {risks.isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : top.length === 0 ? (
        <p className="text-muted-foreground text-sm">No open risks.</p>
      ) : (
        <ul className="divide-y text-sm">
          {top.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{r.title}</p>
                <p className="text-muted-foreground text-xs">
                  {r.type === 'issue' ? 'Issue' : 'Risk'} · P{r.probability} × I{r.impact}
                </p>
              </div>
              <ExposureBadge exposure={r.exposure ?? 'low'} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function LatestActivity({ projectId }: { projectId: number }) {
  const activity = useProjectActivity(projectId, 1);
  const events = (activity.data?.rows ?? []).slice(0, 5);

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <History className="text-muted-foreground size-4" aria-hidden />
        <h2 className="text-base font-semibold">Latest activity</h2>
      </div>
      {activity.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : events.length === 0 ? (
        <p className="text-muted-foreground text-sm">No activity recorded yet.</p>
      ) : (
        <>
          <ul className="divide-y text-sm">
            {events.map((event) => (
              <li key={event.id} className="flex items-baseline justify-between gap-2 py-2">
                <p className="min-w-0">
                  <span className="font-medium">{event.actorName ?? 'System'}</span>{' '}
                  <span className="text-muted-foreground">{describeAction(event)}</span>
                </p>
                <span className="text-muted-foreground shrink-0 text-xs">
                  <DateText value={event.createdAt ?? null} kind="dateTime" />
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 text-right">
            <Link
              to={`/projects/${projectId}?tab=activity`}
              className="text-primary text-xs font-medium hover:underline"
            >
              View all activity
            </Link>
          </div>
        </>
      )}
    </Card>
  );
}
