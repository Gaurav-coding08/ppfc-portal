import type { components } from '@/api/schema';

export type AuthUser = components['schemas']['AuthUser'];
export type Membership = components['schemas']['Membership'];

export type Role = AuthUser['role'];
