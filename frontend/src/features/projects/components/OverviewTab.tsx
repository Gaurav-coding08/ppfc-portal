import { KpiCard } from '@/components/display/KpiCard';
import { Money } from '@/components/display/Money';
import { Percent } from '@/components/display/Percent';
import { Card } from '@/components/ui/card';
import type { ProjectDetail } from '../types';
import { ProgressHistoryChart } from './ProgressHistoryChart';

// Every number here comes straight from `GET /projects/:id` (counts and
// budget headline are computed in SQL); this tab only lays them out.
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label="Current approved budget"
          value={<Money compact amount={budget?.currentBudget ?? null} />}
        />
        <KpiCard label="Actual spend" value={<Money compact amount={budget?.actualSpend ?? null} />} />
        {/* `utilization` is null when the budget is 0 (CLAUDE.md), shown as —. */}
        <KpiCard label="Budget utilization" value={<Percent kind="ratio" value={budget?.utilization} />} />
      </div>

      <Card className="p-5">
        <h2 className="text-base font-semibold">Progress history</h2>
        <ProgressHistoryChart projectId={project.id!} />
      </Card>
    </div>
  );
}
