import { z } from 'zod';

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

const roleSchema = z.enum(['contributor', 'project_manager', 'admin']);

// CLAUDE.md password policy: min 8 chars, at least one letter and one digit.
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one digit');

export const createUserBodySchema = z.object({
  email: z.string().email(),
  fullName: z.string().trim().min(1),
  role: roleSchema,
  departmentId: z.number().int().positive(),
  password: passwordSchema,
});

export type CreateUserBody = z.infer<typeof createUserBodySchema>;

export const updateUserBodySchema = z
  .object({
    fullName: z.string().trim().min(1).optional(),
    role: roleSchema.optional(),
    departmentId: z.number().int().positive().optional(),
    isActive: z.boolean().optional(),
    // Optimistic lock token — required on every update, per CLAUDE.md's
    // blanket rule for mutable entities (users carry a version column
    // like everything else).
    version: z.number().int().min(1),
  })
  .refine(
    (body) => body.fullName !== undefined || body.role !== undefined || body.departmentId !== undefined || body.isActive !== undefined,
    { message: 'At least one field (fullName, role, departmentId, isActive) must be provided' },
  );

export type UpdateUserBody = z.infer<typeof updateUserBodySchema>;

export const adminUserIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type AdminUserIdParams = z.infer<typeof adminUserIdParamsSchema>;

export const auditEventsQuerySchema = z.object({
  entityType: z.string().optional(),
  entityId: z.coerce.number().int().positive().optional(),
  actorId: z.coerce.number().int().positive().optional(),
  projectId: z.coerce.number().int().positive().optional(),
  action: z.string().optional(),
  from: z.string().regex(dateRe, 'from must be YYYY-MM-DD').optional(),
  to: z.string().regex(dateRe, 'to must be YYYY-MM-DD').optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type AuditEventsQuery = z.infer<typeof auditEventsQuerySchema>;

export const projectIdParamsSchema = z.object({
  projectId: z.coerce.number().int().positive(),
});

export type ProjectIdParams = z.infer<typeof projectIdParamsSchema>;

export const activityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ActivityQuery = z.infer<typeof activityQuerySchema>;
