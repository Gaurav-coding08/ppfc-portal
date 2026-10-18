import type { NextFunction, Request, Response } from 'express';
import type { Client, Pool, PoolClient } from 'pg';
import { pool } from '../db/pool.js';
import type { AuthUser } from '../middleware/authenticate.js';
import { forbidden, notFound } from './errors.js';

type Queryable = Pool | PoolClient | Client;

// Middleware: rejects the request with 403 FORBIDDEN if req.user.role is
// not in the supplied list. Mount after `authenticate`.
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(forbidden());
      return;
    }
    next();
  };
}

export interface ProjectAccess {
  canView: boolean;
  canManage: boolean;
  isOwner: boolean;
  memberRole: 'manager' | 'contributor' | null;
}

// Single query that resolves whether `userId` with `role` can view/manage
// `projectId`, following CLAUDE.md rules exactly:
//   canView:   admin, OR owner, OR row in project_members
//   canManage: admin, OR (role=project_manager AND (owner OR member_role='manager'))
export async function getProjectAccess(
  userId: number,
  role: string,
  projectId: number,
  client: Queryable = pool,
): Promise<ProjectAccess | null> {
  const { rows } = await client.query<{
    owner_id: number;
    member_role: 'manager' | 'contributor' | null;
  }>(
    `SELECT p.owner_id,
            pm.member_role
     FROM projects p
     LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
     WHERE p.id = $2`,
    [userId, projectId],
  );

  if (rows.length === 0) return null;

  const row = rows[0]!;
  const isOwner = row.owner_id === userId;
  const memberRole = row.member_role;
  const isAdmin = role === 'admin';
  const isMember = memberRole !== null;

  const canView = isAdmin || isOwner || isMember;
  const canManage =
    isAdmin || (role === 'project_manager' && (isOwner || memberRole === 'manager'));

  return { canView, canManage, isOwner, memberRole };
}

// Load resource → get its project_id → call this. Out of scope → 404
// (don't leak existence). In scope but role insufficient → 403.
export async function assertProjectAccess(
  user: AuthUser,
  projectId: number,
  level: 'view' | 'manage',
  client: Queryable = pool,
): Promise<void> {
  const access = await getProjectAccess(user.id, user.role, projectId, client);

  if (!access || !access.canView) {
    throw notFound();
  }

  if (level === 'manage' && !access.canManage) {
    throw forbidden();
  }
}

// Returns a SQL fragment + params for list/aggregate queries that must be
// scoped to the caller's visible projects. Admin sees everything (no
// restriction); others see only projects they own or are members of.
export function scopedProjectIdsSql(user: AuthUser): { sql: string; params: unknown[] } {
  if (user.role === 'admin') {
    return { sql: '', params: [] };
  }

  return {
    sql: `AND project_id IN (
      SELECT id FROM projects WHERE owner_id = $1
      UNION
      SELECT project_id FROM project_members WHERE user_id = $1
    )`,
    params: [user.id],
  };
}

// 422 SELF_APPROVAL_FORBIDDEN when actor tries to approve/decide their
// own request (change requests, budget revisions).
export function assertNotSelf(actorId: number, requesterId: number): void {
  if (actorId === requesterId) {
    throw notFound('You cannot approve your own request');
  }
}
