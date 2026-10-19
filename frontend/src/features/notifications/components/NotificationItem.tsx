import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { components } from '@/api/schema';
import { DateText } from '@/components/display/DateText';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { notificationHref } from '../links';

export type Notification = components['schemas']['Notification'];

// One notification, shared by the bell dropdown and /notifications.
// Unread state is shown with a text label and a dot, not colour alone.
export function NotificationItem({
  notification,
  onMarkRead,
  marking,
  onNavigate,
}: {
  notification: Notification;
  onMarkRead: (id: number) => void;
  marking: boolean;
  onNavigate?: () => void;
}) {
  const unread = !notification.readAt;
  const href = notificationHref(notification.link);
  return (
    <li className={cn('flex items-start gap-3 rounded-lg px-2 py-2', unread && 'bg-indigo-50/60')}>
      <span
        aria-hidden
        className={cn('mt-1.5 size-2 shrink-0 rounded-full', unread ? 'bg-indigo-600' : 'bg-transparent')}
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        {href ? (
          <Link to={href} onClick={onNavigate} className="line-clamp-2 text-sm font-medium hover:underline">
            {notification.title}
          </Link>
        ) : (
          <p className="line-clamp-2 text-sm font-medium">{notification.title}</p>
        )}
        {notification.body && <p className="text-muted-foreground text-xs">{notification.body}</p>}
        <p className="text-muted-foreground text-xs">
          {unread && <span className="mr-1 font-medium text-indigo-700">Unread ·</span>}
          <DateText value={notification.createdAt ?? null} kind="dateTime" />
        </p>
      </div>
      {unread && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Mark "${notification.title}" as read`}
          disabled={marking}
          onClick={() => onMarkRead(notification.id!)}
        >
          <Check className="size-4" />
        </Button>
      )}
    </li>
  );
}
