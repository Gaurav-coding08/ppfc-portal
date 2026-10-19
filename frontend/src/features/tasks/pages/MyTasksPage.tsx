import { ListChecks, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { EmptyState } from '@/components/data/EmptyState';
import { ErrorState } from '@/components/data/ErrorState';
import { LoadingState } from '@/components/data/LoadingState';
import { Pagination } from '@/components/data/Pagination';
import { DateText } from '@/components/display/DateText';
import { PriorityBadge } from '@/components/display/PriorityBadge';
import { StatusBadge } from '@/components/display/StatusBadge';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { ContributorTaskSheet } from '../components/ContributorTaskSheet';
import { InlineProgress } from '../components/InlineProgress';
import { TaskDueBadges } from '../components/TaskDueBadges';
import { MY_TASKS_PAGE_SIZE, useMyTasks } from '../hooks/useTaskQueries';
import type { TaskRow } from '../types';

type GroupKey = 'overdue' | 'dueSoon' | 'upcoming' | 'done';

const GROUPS: { key: GroupKey; title: string }[] = [
  { key: 'overdue', title: 'Overdue' },
  { key: 'dueSoon', title: 'Due soon' },
  { key: 'upcoming', title: 'Upcoming' },
  { key: 'done', title: 'Done' },
];

// Grouping reads only the API's own flags and status — `isOverdue` and
// `isDueSoon` are computed in SQL against the reporting date — so the
// browser never decides on its own whether a date has passed.
function groupOf(task: TaskRow): GroupKey {
  if (task.status === 'done') return 'done';
  if (task.isOverdue) return 'overdue';
  if (task.isDueSoon) return 'dueSoon';
  return 'upcoming';
}

// Every task assigned to the caller, across all their projects. The page
// number is in the URL like other lists; with the backend's 100-per-page
// maximum most people have a single page.
export function MyTasksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get('page')) || 1;
  const list = useMyTasks(page);
  const [editing, setEditing] = useState<TaskRow | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader title="My tasks" description="Tasks assigned to you across every project." />

      {list.isPending ? (
        <LoadingState rows={8} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.total === 0 ? (
        <EmptyState icon={ListChecks} message="No tasks are assigned to you." />
      ) : (
        <>
          {GROUPS.map((group) => {
            const tasks = list.data.rows.filter((t) => groupOf(t) === group.key);
            return <TaskGroup key={group.key} title={group.title} tasks={tasks} onEdit={setEditing} />;
          })}
          <Pagination
            page={page}
            pageSize={MY_TASKS_PAGE_SIZE}
            total={list.data.total}
            onPageChange={(next) =>
              setSearchParams((prev) => {
                const params = new URLSearchParams(prev);
                if (next === 1) params.delete('page');
                else params.set('page', String(next));
                return params;
              })
            }
          />
        </>
      )}

      <ContributorTaskSheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        task={editing}
      />
    </div>
  );
}

function TaskGroup({
  title,
  tasks,
  onEdit,
}: {
  title: string;
  tasks: TaskRow[];
  onEdit: (task: TaskRow) => void;
}) {
  const headingId = `my-tasks-${title.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <section aria-labelledby={headingId} className="rounded-xl border bg-white shadow-sm">
      <h2 id={headingId} className="flex items-center gap-2 border-b px-5 py-3 text-base font-semibold">
        {title}
        <span className="text-muted-foreground text-sm font-normal tabular-nums">{tasks.length}</span>
      </h2>
      {tasks.length === 0 ? (
        <p className="text-muted-foreground px-5 py-4 text-sm">Nothing here.</p>
      ) : (
        <ul className="divide-y">
          {tasks.map((task) => (
            <MyTaskItem key={task.id} task={task} onEdit={onEdit} />
          ))}
        </ul>
      )}
    </section>
  );
}

function MyTaskItem({ task, onEdit }: { task: TaskRow; onEdit: (task: TaskRow) => void }) {
  const { memberships } = useAuth();
  // `/tasks/mine` returns only `projectId`; the caller's memberships (from
  // `/auth/me`) carry the matching project code for the label.
  const projectCode =
    memberships.find((m) => m.projectId === task.projectId)?.projectCode ?? `Project #${task.projectId}`;

  return (
    <li className="flex flex-col gap-3 px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="truncate font-medium" title={task.title}>
          {task.title}
        </p>
        <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
          <Link
            to={`/projects/${task.projectId}?tab=tasks`}
            className="font-medium text-indigo-600 tabular-nums hover:underline"
          >
            {projectCode}
          </Link>
          <span>
            Due <DateText value={task.dueDate ?? null} />
          </span>
          <TaskDueBadges task={task} />
          {task.status && <StatusBadge domain="task" status={task.status} />}
          {task.priority && <PriorityBadge priority={task.priority} />}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <InlineProgress key={task.version} task={task} />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Update ${task.title}`}
          onClick={() => onEdit(task)}
        >
          <Pencil className="size-4" />
        </Button>
      </div>
    </li>
  );
}
