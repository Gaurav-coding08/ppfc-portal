import { BellOff } from 'lucide-react';
import { EmptyState } from '@/components/data/EmptyState';
import { ErrorState } from '@/components/data/ErrorState';
import { LoadingState } from '@/components/data/LoadingState';
import { Pagination } from '@/components/data/Pagination';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toastApiError } from '@/lib/notify';
import { useUrlFilters } from '@/lib/useUrlFilters';
import { NotificationItem } from '../components/NotificationItem';
import {
  NOTIFICATION_PAGE_SIZE,
  useMarkNotificationRead,
  useNotificationsPage,
} from '../hooks/useNotifications';

const DEFAULTS = { unread: '', page: '1' };

// Every notification for the signed-in user (the API only ever returns the
// caller's own rows), with an All / Unread switch kept in the URL.
export function NotificationsPage() {
  const [filters, setFilters] = useUrlFilters(DEFAULTS);
  const list = useNotificationsPage(filters);
  const markRead = useMarkNotificationRead();

  async function onMarkRead(id: number) {
    try {
      await markRead.mutateAsync(id);
    } catch (err) {
      toastApiError(err);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description={
          list.data
            ? `${list.data.unreadCount} unread`
            : 'Overdue-task escalations and change-request decisions.'
        }
      />
      <Tabs
        value={filters.unread === 'true' ? 'unread' : 'all'}
        onValueChange={(v) => setFilters({ unread: v === 'unread' ? 'true' : '', page: '1' })}
      >
        <TabsList aria-label="Show">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">Unread</TabsTrigger>
        </TabsList>
      </Tabs>

      {list.isPending ? (
        <LoadingState rows={6} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.total === 0 ? (
        <EmptyState
          icon={BellOff}
          message={filters.unread === 'true' ? 'No unread notifications.' : 'No notifications yet.'}
        />
      ) : (
        <div className="space-y-3">
          <Card className="p-2">
            <ul className="divide-y" aria-label="Notifications">
              {list.data.rows.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onMarkRead={onMarkRead}
                  marking={markRead.isPending}
                />
              ))}
            </ul>
          </Card>
          <Pagination
            page={Number(filters.page) || 1}
            pageSize={NOTIFICATION_PAGE_SIZE}
            total={list.data.total}
            onPageChange={(page) => setFilters({ page: String(page) })}
          />
        </div>
      )}
    </div>
  );
}
