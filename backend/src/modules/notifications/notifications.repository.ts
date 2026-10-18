import type { Client, Pool, PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import type { NotificationsQuery } from './notifications.schemas.js';

type Queryable = Pool | PoolClient | Client;

export interface NotificationRow {
  id: number;
  userId: number;
  title: string;
  body: string | null;
  link: string | null;
  outboxId: number | null;
  readAt: string | null;
  createdAt: string;
}

function toNotificationRow(row: {
  id: number;
  user_id: number;
  title: string;
  body: string | null;
  link: string | null;
  outbox_id: number | null;
  read_at: string | null;
  created_at: string;
}): NotificationRow {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    body: row.body,
    link: row.link,
    outboxId: row.outbox_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export async function listForUser(
  userId: number,
  filters: NotificationsQuery,
  client: Queryable = pool,
): Promise<{ rows: NotificationRow[]; total: number; unreadCount: number }> {
  const conditions = [`user_id = $1`];
  const params: unknown[] = [userId];

  if (filters.unread) {
    conditions.push(`read_at IS NULL`);
  }

  const limit = filters.pageSize;
  const offset = (filters.page - 1) * filters.pageSize;
  params.push(limit, offset);

  const { rows } = await client.query(
    `SELECT id, user_id, title, body, link, outbox_id, read_at, created_at,
            count(*) OVER() AS total_count
     FROM notifications
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC, id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  const { rows: unreadRows } = await client.query<{ count: string }>(
    `SELECT count(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );

  return {
    rows: rows.map(toNotificationRow),
    total: rows.length > 0 ? parseInt(rows[0]!.total_count, 10) : 0,
    unreadCount: parseInt(unreadRows[0]!.count, 10),
  };
}

export async function findById(id: number, client: Queryable = pool): Promise<NotificationRow | null> {
  const { rows } = await client.query(
    `SELECT id, user_id, title, body, link, outbox_id, read_at, created_at FROM notifications WHERE id = $1`,
    [id],
  );
  return rows[0] ? toNotificationRow(rows[0]) : null;
}

// Idempotent: setting read_at on an already-read row just re-sets it to
// `now()`, so the handler always succeeds rather than needing a no-op
// branch — the feature only requires the *response* to be unchanged
// (200, already read), not the timestamp itself.
export async function markRead(id: number, client: Queryable = pool): Promise<NotificationRow> {
  const { rows } = await client.query(
    `UPDATE notifications SET read_at = coalesce(read_at, now()) WHERE id = $1
     RETURNING id, user_id, title, body, link, outbox_id, read_at, created_at`,
    [id],
  );
  return toNotificationRow(rows[0]);
}
