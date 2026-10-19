import { z } from 'zod';

// Mirrors backend admin.schemas.ts createUserBodySchema, including the
// password policy (min 8, a letter and a digit). The backend re-checks
// everything; this only gives earlier inline feedback.
export const createUserSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter a name'),
  email: z.string().trim().email('Enter a valid email'),
  role: z.enum(['contributor', 'project_manager', 'admin'], { message: 'Choose a role' }),
  departmentId: z.string().min(1, 'Choose a department'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Za-z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one digit'),
});

export type CreateUserValues = z.infer<typeof createUserSchema>;
export const CREATE_USER_FIELDS = ['fullName', 'email', 'role', 'departmentId', 'password'] as const;

export function toCreateUserBody(values: CreateUserValues) {
  return {
    fullName: values.fullName.trim(),
    email: values.email.trim(),
    role: values.role,
    departmentId: Number(values.departmentId),
    password: values.password,
  };
}
