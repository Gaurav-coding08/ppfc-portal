import type { Request, Response } from 'express';
import * as notificationsService from './notifications.service.js';
import type { NotificationIdParams, NotificationsQuery } from './notifications.schemas.js';

export async function listMine(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as NotificationsQuery;
  const { rows, meta, unreadCount } = await notificationsService.listMine(req.user!, query);
  res.status(200).json({ data: rows, meta, unreadCount });
}

export async function markRead(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as NotificationIdParams;
  const notification = await notificationsService.markRead(req.user!, id);
  res.status(200).json({ data: notification });
}
