import { z } from 'zod';

export const notificationsQuerySchema = z.object({
  unread: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type NotificationsQuery = z.infer<typeof notificationsQuerySchema>;

export const notificationIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type NotificationIdParams = z.infer<typeof notificationIdParamsSchema>;
