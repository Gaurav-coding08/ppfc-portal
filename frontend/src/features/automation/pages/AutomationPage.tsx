import { Loader2, Play } from 'lucide-react';
import { useRef } from 'react';
import { toast } from 'sonner';
import { isAdmin } from '@/auth/can';
import { useAuth } from '@/auth/useAuth';
import { ForbiddenState } from '@/components/data/ForbiddenState';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toastApiError } from '@/lib/notify';
import { useUrlFilters } from '@/lib/useUrlFilters';
import { OutboxTable } from '../components/OutboxTable';
import { RunsTable } from '../components/RunsTable';
import { useRunEscalation } from '../hooks/useAutomation';
import { AUTOMATION_DEFAULTS } from '../types';

// Admin view of the overdue-escalation automation (feature 15): the run
// log, the outbox, and a manual trigger. "Run now" returns the run's own
// counts, shown in a toast; the tables then refetch from the server, so
// the new run row and any new outbox events appear as the API reports them.
export function AutomationPage() {
  const { user } = useAuth();
  const [filters, setFilters] = useUrlFilters(AUTOMATION_DEFAULTS);
  const run = useRunEscalation();
  // Guards a double click landing before React re-renders the disabled
  // button (the run is idempotent per day anyway, but a second call while
  // the first holds the job lock would come back as a 409).
  const inFlight = useRef(false);

  if (!isAdmin(user)) return <ForbiddenState message="Only admins can manage automation." />;

  async function runNow() {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const result = await run.mutateAsync();
      toast.success('Overdue escalation finished', {
        description:
          `Found ${result.run?.itemsFound ?? 0} overdue tasks, queued ${result.run?.itemsCreated ?? 0} new events. ` +
          `Delivered ${result.dispatch?.sent ?? 0}, retrying ${result.dispatch?.retried ?? 0}, failed ${result.dispatch?.failed ?? 0}.`,
      });
    } catch (err) {
      toastApiError(err);
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automation"
        description="Overdue-task escalation: run history, the delivery outbox and a manual trigger."
        action={
          <Button onClick={runNow} disabled={run.isPending}>
            {run.isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Run now
          </Button>
        }
      />

      <Tabs
        value={filters.tab}
        // Each tab has its own paging; the outbox status filter only
        // applies to the outbox, so both reset on switch.
        onValueChange={(tab) => setFilters({ tab: String(tab), status: '', page: '1' })}
      >
        <TabsList>
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="outbox">Outbox</TabsTrigger>
        </TabsList>
        <TabsContent value="runs" className="pt-4">
          <RunsTable filters={filters} onPageChange={(page) => setFilters({ page: String(page) })} />
        </TabsContent>
        <TabsContent value="outbox" className="pt-4">
          <OutboxTable filters={filters} setFilters={setFilters} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
