import type { AuthUser } from '../../middleware/authenticate.js';
import { notFound } from '../../lib/errors.js';
import type { PageMeta } from '../../lib/pagination.js';
import type { UsersListQuery } from './users.schemas.js';
import * as usersRepo from './users.repository.js';
import type { DepartmentRow, UserSummaryRow } from './users.repository.js';

export async function listDepartments(): Promise<DepartmentRow[]> {
  return usersRepo.findDepartments();
}

// Admin sees everyone; a project_manager is scoped to users on projects
// they can manage (CLAUDE.md canManage: owner, or member_role='manager').
function managerScopeFor(caller: AuthUser): number | null {
  return caller.role === 'admin' ? null : caller.id;
}

export async function listUsers(
  caller: AuthUser,
  filters: UsersListQuery,
): Promise<{ rows: UserSummaryRow[]; meta: PageMeta }> {
  const { rows, total } = await usersRepo.listUsers(filters, managerScopeFor(caller));
  return { rows, meta: { page: filters.page, pageSize: filters.pageSize, total } };
}

// Out-of-scope for a PM and non-existent both return null here — the
// controller/route turns that into 404 either way, so a PM can't tell the
// two apart and probe for user ids outside their projects.
export async function getUserById(caller: AuthUser, id: number): Promise<UserSummaryRow> {
  const user = await usersRepo.findUserById(id, managerScopeFor(caller));
  if (!user) throw notFound();
  return user;
}
