import { faker } from '@faker-js/faker';
import type { UserRow } from './types.js';

// bcrypt hash of 'Demo@1234' with a fixed salt, computed once offline and
// hard-coded here. Hashing at generation time would call into bcrypt's
// random salt generator and break determinism (the acceptance check is
// "regenerate twice, no diff"). DEV-ONLY — never do this in production.
export const DEMO_PASSWORD_HASH = '$2a$10$DpWtftN2WrV1AdOh4/NwkuX3iE61vL2QBPJTfnEaF7LEa/TAiKZl6';
export const DEMO_PASSWORD = 'Demo@1234';

// Role and department are assigned explicitly (not left to faker) because
// later features' fixtures (project ownership, task assignment, approvals)
// depend on exactly who is a PM vs. a contributor and in which department.
const ROLE_BY_ID: Record<number, UserRow['role']> = {
  1: 'admin',
  2: 'project_manager',
  3: 'project_manager',
  4: 'project_manager',
  5: 'project_manager',
};
const DEPARTMENT_BY_ID: Record<number, number> = {
  1: 3,
  2: 1,
  3: 2,
  4: 3,
  5: 1,
};
const CONTRIBUTOR_DEPARTMENT_CYCLE = [1, 2, 3];

export function buildUsers(): UserRow[] {
  const users: UserRow[] = [];
  const usedEmails = new Set<string>();

  for (let id = 1; id <= 15; id++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const slug = `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z.]/g, '');
    let email = `${slug}@ppfc.demo`;
    let suffix = 2;
    while (usedEmails.has(email)) {
      email = `${slug}${suffix}@ppfc.demo`;
      suffix++;
    }
    usedEmails.add(email);

    const role = ROLE_BY_ID[id] ?? 'contributor';
    const departmentId =
      DEPARTMENT_BY_ID[id] ?? CONTRIBUTOR_DEPARTMENT_CYCLE[(id - 6) % 3]!;

    users.push({
      id,
      email,
      full_name: `${firstName} ${lastName}`,
      password_hash: DEMO_PASSWORD_HASH,
      role,
      department_id: departmentId,
      is_active: true,
    });
  }

  return users;
}
