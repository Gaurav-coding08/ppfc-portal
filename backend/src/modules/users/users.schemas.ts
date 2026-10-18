import { z } from 'zod';

// `sort` accepts camelCase field names from the client; the repository maps
// each one to its actual (snake_case) column — never interpolates the
// client-supplied string directly.
export const usersListQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  role: z.enum(['contributor', 'project_manager', 'admin']).optional(),
  departmentId: z.coerce.number().int().positive().optional(),
  projectId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['fullName', 'email', 'role', 'createdAt']).default('fullName'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export type UsersListQuery = z.infer<typeof usersListQuerySchema>;

export const userIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type UserIdParams = z.infer<typeof userIdParamsSchema>;
