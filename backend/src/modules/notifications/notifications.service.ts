import { notFound } from '../../lib/errors.js';
import type { PageMeta } from '../../lib/pagination.js';
import type { AuthUser } from '../../middleware/authenticate.js';
import * as notificationsRepo from './notifications.repository.js';
import type { NotificationRow } from './notifications.repository.js';
import type { NotificationsQuery } from './notifications.schemas.js';

export async function listMine(
  caller: AuthUser,
  filters: NotificationsQuery,
): Promise<{ rows: NotificationRow[]; meta: PageMeta; unreadCount: number }> {
  const { rows, total, unreadCount } = await notificationsRepo.listForUser(caller.id, filters);
  return { rows, meta: { page: filters.page, pageSize: filters.pageSize, total }, unreadCount };
}

// Another user's notification id must 404, not 403 — CLAUDE.md's "don't
// leak existence" pattern applies here too: a caller shouldn't learn that
// notification id N belongs to someone else.
export async function markRead(caller: AuthUser, id: number): Promise<NotificationRow> {
  const existing = await notificationsRepo.findById(id);
  if (!existing || existing.userId !== caller.id) {
    throw notFound();
  }
  return notificationsRepo.markRead(id);
}
