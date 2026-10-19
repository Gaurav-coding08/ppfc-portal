import { Bell } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toastApiError } from '@/lib/notify';
import { useBellNotifications, useMarkNotificationRead } from '../hooks/useNotifications';
import { NotificationItem } from './NotificationItem';

// Topbar bell: the unread count is the server's `unreadCount`, polled every
// 60 s and refetched on window focus and after any mark-as-read. A failed
// poll keeps showing the last known count (no error UI in the topbar).
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const bell = useBellNotifications();
  const markRead = useMarkNotificationRead();
  const unread = bell.data?.unreadCount ?? 0;
  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';

  async function onMarkRead(id: number) {
    try {
      await markRead.mutateAsync(id);
    } catch (err) {
      toastApiError(err);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" aria-label={label} className="relative">
            <Bell className="size-4" />
            {unread > 0 && (
              <span
                aria-hidden
                data-testid="unread-count"
                className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold text-white tabular-nums"
              >
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Notifications</h2>
          <span className="text-muted-foreground text-xs">{unread} unread</span>
        </div>
        <div className="max-h-96 overflow-y-auto p-2">
          {bell.isPending ? (
            <p className="text-muted-foreground px-2 py-6 text-center text-sm">Loading…</p>
          ) : bell.isError && !bell.data ? (
            <p className="text-muted-foreground px-2 py-6 text-center text-sm">
              Couldn't load notifications.
            </p>
          ) : bell.data.rows.length === 0 ? (
            <p className="text-muted-foreground px-2 py-6 text-center text-sm">You're all caught up.</p>
          ) : (
            <ul className="space-y-1" aria-label="Latest notifications">
              {bell.data.rows.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onMarkRead={onMarkRead}
                  marking={markRead.isPending}
                  onNavigate={() => setOpen(false)}
                />
              ))}
            </ul>
          )}
        </div>
        <div className="border-t p-2">
          <Button
            variant="ghost"
            className="w-full"
            nativeButton={false}
            render={<Link to="/notifications" onClick={() => setOpen(false)} />}
          >
            View all
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
