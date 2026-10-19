// UI-only permission hints — hide or disable actions the user probably
// can't take, so the screen doesn't invite a guaranteed 403. The backend is
// the real authority (CLAUDE.md "Role-aware UI is convenience only"); every
// mutation still handles a 403 from the server gracefully regardless of
// what this file says.
import type { AuthUser, Membership } from './types';

export function isAdmin(user: AuthUser | null): boolean {
  return user?.role === 'admin';
}

export function isProjectManager(user: AuthUser | null): boolean {
  return user?.role === 'project_manager';
}

export function isContributor(user: AuthUser | null): boolean {
  return user?.role === 'contributor';
}

/** CLAUDE.md canManage: admin, or PM who owns/manages this specific project. */
export function canManageProject(
  user: AuthUser | null,
  memberships: Membership[],
  projectId: number,
): boolean {
  if (!user) return false;
  if (isAdmin(user)) return true;
  if (!isProjectManager(user)) return false;
  return memberships.some((m) => m.projectId === projectId && m.memberRole === 'manager');
}

/** CLAUDE.md canView: admin, or any recorded membership on the project. */
export function canViewProject(user: AuthUser | null, memberships: Membership[], projectId: number): boolean {
  if (!user) return false;
  if (isAdmin(user)) return true;
  return memberships.some((m) => m.projectId === projectId);
}

export function canCreateProject(user: AuthUser | null): boolean {
  return isAdmin(user) || isProjectManager(user);
}

export function canViewAdminNav(user: AuthUser | null): boolean {
  return isAdmin(user);
}

/**
 * Who may decide (approve/reject/return) a change request:
 * - 'eligible': can manage the CR's project and didn't raise it
 * - 'own': could manage the project, but raised this CR themselves — the
 *   backend refuses self-approval (422 SELF_APPROVAL_FORBIDDEN), so the UI
 *   shows the panel disabled with an explanation
 * - 'none': can't decide on this project at all (contributors, PMs from
 *   other projects) — no panel
 */
export function canDecideChangeRequest(
  user: AuthUser | null,
  memberships: Membership[],
  cr: { projectId: number; requestedBy: number },
): 'eligible' | 'own' | 'none' {
  if (!canManageProject(user, memberships, cr.projectId)) return 'none';
  return cr.requestedBy === user!.id ? 'own' : 'eligible';
}

/**
 * Budget-revision decisions are admin-only (backend `requireRole('admin')`)
 * and never on a revision the admin requested themselves (422
 * SELF_APPROVAL_FORBIDDEN) — same three outcomes as change requests.
 */
export function canDecideBudgetRevision(
  user: AuthUser | null,
  revision: { requestedBy?: number },
): 'eligible' | 'own' | 'none' {
  if (!isAdmin(user)) return 'none';
  return revision.requestedBy === user!.id ? 'own' : 'eligible';
}

/** A contributor may edit only their own assigned task's progress/status. */
export function canEditOwnTaskOnly(
  user: AuthUser | null,
  memberships: Membership[],
  projectId: number,
  assigneeId: number | null,
): boolean {
  if (!user) return false;
  if (canManageProject(user, memberships, projectId)) return false;
  return assigneeId === user.id;
}
