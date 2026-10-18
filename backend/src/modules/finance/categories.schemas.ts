import { z } from 'zod';

export const categoryIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type CategoryIdParams = z.infer<typeof categoryIdParamsSchema>;

export const categoryListQuerySchema = z.object({
  includeInactive: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

export type CategoryListQuery = z.infer<typeof categoryListQuerySchema>;

export const createCategoryBodySchema = z
  .object({
    code: z.string().trim().min(1),
    name: z.string().trim().min(1),
  })
  .strict();

export type CreateCategoryBody = z.infer<typeof createCategoryBodySchema>;

export const updateCategoryBodySchema = z
  .object({
    code: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine(
    (body) => body.code !== undefined || body.name !== undefined || body.isActive !== undefined,
    { message: 'At least one updatable field must be provided' },
  );

export type UpdateCategoryBody = z.infer<typeof updateCategoryBodySchema>;
