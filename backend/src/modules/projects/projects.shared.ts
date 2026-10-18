import type { AuthUser } from '../../middleware/authenticate.js';

// admin: no restriction (null); otherwise canView's "owner or member" rule
// applied as a set filter — see projects.repository.ts#listProjects.
export function viewScopeFor(caller: AuthUser): number | null {
  return caller.role === 'admin' ? null : caller.id;
}

// Active + (project_manager or admin) — the only kind of user who may own
// a project, both on create and on an ownership transfer.
export function isEligibleOwner(candidate: { isActive: boolean; role: string } | null): boolean {
  return !!candidate && candidate.isActive && (candidate.role === 'project_manager' || candidate.role === 'admin');
}
