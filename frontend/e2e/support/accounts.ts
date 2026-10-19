import path from 'node:path';

// Seeded demo accounts (docs/demo-accounts.md). Every account's password is
// the dev-only `Demo@1234`.
export const PASSWORD = 'Demo@1234';

export const ACCOUNTS = {
  admin: { email: 'garnet.wiegand@ppfc.demo' },
  pm: { email: 'christelle.satterfield@ppfc.demo' },
  contributor: { email: 'estell.conroy@ppfc.demo', fullName: 'Estell Conroy' },
} as const;

export type Role = keyof typeof ACCOUNTS;

// Saved browser sessions, written by auth.setup.ts. Git-ignored: the files
// hold a live session cookie.
export function storageStatePath(role: Role): string {
  return path.join(import.meta.dirname, '..', '.auth', `${role}.json`);
}

// Seed facts the journeys rely on (stable across `npm run db:reset`):
// PRJ-001 (id 1) is owned by the PM above, and the contributor is a member.
export const SEED = {
  pmProjectId: 1,
  digitalPlatformsDepartmentId: 1,
  digitalPlatformsDepartmentName: 'Digital Platforms',
} as const;

// A unique suffix so records created by one run never collide with the
// previous run's records in the shared dev database.
export function runTag(): string {
  return `E2E ${Date.now().toString(36)}`;
}
