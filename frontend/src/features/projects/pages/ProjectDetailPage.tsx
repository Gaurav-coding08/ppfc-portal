import { ArrowLeft, Construction, SearchX } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { isNotFound } from '@/api/errors';
import { canManageProject } from '@/auth/can';
import { useAuth } from '@/auth/useAuth';
import { EmptyState } from '@/components/data/EmptyState';
import { ErrorState } from '@/components/data/ErrorState';
import { LoadingState } from '@/components/data/LoadingState';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChangeRequestsTab } from '@/features/change-requests/components/ChangeRequestsTab';
import { CR_FILTER_KEYS } from '@/features/change-requests/types';
import { MilestonesTab } from '@/features/milestones/components/MilestonesTab';
import { RisksTab } from '@/features/risks/components/RisksTab';
import { RISK_FILTER_KEYS } from '@/features/risks/types';
import { TasksTab } from '@/features/tasks/components/TasksTab';
import { TASK_FILTER_KEYS } from '@/features/tasks/types';
import { ActivityTab } from '../components/ActivityTab';
import { MembersTab } from '../components/MembersTab';
import { OverviewTab } from '../components/OverviewTab';
import { ProjectFormSheet } from '../components/ProjectFormSheet';
import { ProjectHeaderCard } from '../components/ProjectHeaderCard';
import { useProjectDetail } from '../hooks/useProjectQueries';

// CLAUDE.md tab order. Tabs whose module ships later render a placeholder
// so the page layout is final from now on.
const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'milestones', label: 'Milestones' },
  { value: 'risks', label: 'Risks' },
  { value: 'change-requests', label: 'Change requests' },
  { value: 'finance', label: 'Finance' },
  { value: 'members', label: 'Members' },
  { value: 'activity', label: 'Activity' },
] as const;

const COMING_LATER: Record<string, string> = {
  finance: 'Project finance arrives with the finance screens.',
};

// URL keys owned by the tabs that keep their filters in the URL (several
// share names like `status`/`page`). All are cleared on a tab switch so
// one tab's filters never leak into another.
const TAB_FILTER_KEYS = new Set([...TASK_FILTER_KEYS, ...RISK_FILTER_KEYS, ...CR_FILTER_KEYS]);

export function ProjectDetailPage() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const { user, memberships } = useAuth();
  // The selected tab lives in the URL (`?tab=members`) so a link can open a
  // specific tab and the back button returns to it.
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === searchParams.get('tab')) ? searchParams.get('tab')! : 'overview';
  const [editOpen, setEditOpen] = useState(false);
  const detail = useProjectDetail(id);

  // A non-numeric id can't exist; treat it like the backend's 404.
  if (!Number.isInteger(id) || id <= 0) return <ProjectNotFound />;
  if (detail.isPending) return <LoadingState rows={6} />;
  if (detail.isError) {
    // The backend answers 404 both for a missing project and for one the
    // caller can't see (CLAUDE.md: "don't leak existence"), so the message
    // covers both without saying which.
    if (isNotFound(detail.error)) return <ProjectNotFound />;
    return <ErrorState error={detail.error} onRetry={() => detail.refetch()} />;
  }

  const project = detail.data;
  // UI hint only — the PATCH/members endpoints re-check on the server.
  const canManage = canManageProject(user, memberships, id);

  return (
    <div className="space-y-6">
      <BackLink />
      <ProjectHeaderCard project={project} onEdit={canManage ? () => setEditOpen(true) : undefined} />

      <Tabs
        value={tab}
        onValueChange={(value) =>
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              for (const key of TAB_FILTER_KEYS) next.delete(key);
              if (value === 'overview') next.delete('tab');
              else next.set('tab', String(value));
              return next;
            },
            { replace: true },
          )
        }
      >
        <div className="overflow-x-auto">
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview" className="pt-4">
          <OverviewTab project={project} />
        </TabsContent>
        <TabsContent value="tasks" className="pt-4">
          <TasksTab project={project} canManage={canManage} />
        </TabsContent>
        <TabsContent value="milestones" className="pt-4">
          <MilestonesTab project={project} canManage={canManage} />
        </TabsContent>
        <TabsContent value="risks" className="pt-4">
          <RisksTab project={project} canManage={canManage} />
        </TabsContent>
        <TabsContent value="change-requests" className="pt-4">
          <ChangeRequestsTab projectId={id} />
        </TabsContent>
        <TabsContent value="members" className="pt-4">
          <MembersTab project={project} canManage={canManage} />
        </TabsContent>
        <TabsContent value="activity" className="pt-4">
          <ActivityTab projectId={id} />
        </TabsContent>
        {Object.entries(COMING_LATER).map(([value, message]) => (
          <TabsContent key={value} value={value} className="pt-4">
            <EmptyState icon={Construction} message={message} />
          </TabsContent>
        ))}
      </Tabs>

      {canManage && <ProjectFormSheet open={editOpen} onOpenChange={setEditOpen} project={project} />}
    </div>
  );
}

// `nativeButton={false}`: the Button renders a router <Link> (an <a>), so
// Base UI must not apply native-<button> semantics to it.
function BackLink() {
  return (
    <Button variant="ghost" size="sm" className="-ml-2" nativeButton={false} render={<Link to="/projects" />}>
      <ArrowLeft className="size-4" />
      Projects
    </Button>
  );
}

function ProjectNotFound() {
  return (
    <div className="space-y-6">
      <BackLink />
      <EmptyState
        icon={SearchX}
        message="Project not found or you don't have access."
        action={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/projects" />}>
            Back to projects
          </Button>
        }
      />
    </div>
  );
}
