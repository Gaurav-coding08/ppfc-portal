import { describe, expect, it, beforeAll } from 'vitest';
import pg from 'pg';
import { asAdmin, asProjectManager, asProjectMember, asNonMember } from '../helpers/auth.js';
import type { LoggedInUser } from '../helpers/auth.js';
import type { AuthUser } from '../../src/middleware/authenticate.js';
import {
  getProjectAccess,
  assertProjectAccess,
  requireRole,
  scopedProjectIdsSql,
  assertNotSelf,
} from '../../src/lib/access.js';
import type { Request, Response, NextFunction } from 'express';

let admin: LoggedInUser;
let pm: LoggedInUser & { projectId: number; projectCode: string };
let member: LoggedInUser;
let nonMember: LoggedInUser;

beforeAll(async () => {
  admin = await asAdmin();
  pm = await asProjectManager();
  member = await asProjectMember();
  nonMember = await asNonMember();
});

async function withTestClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const connString = process.env.DATABASE_URL_TEST;
  if (!connString) throw new Error('DATABASE_URL_TEST is not set');
  const client = new pg.Client({ connectionString: connString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function toAuthUser(u: LoggedInUser['user']): AuthUser {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role as AuthUser['role'],
    departmentId: u.departmentId,
  };
}

describe('getProjectAccess', () => {
  it('admin can view and manage any project', async () => {
    const access = await withTestClient((client) =>
      getProjectAccess(admin.user.id, admin.user.role, pm.projectId, client),
    );
    expect(access).not.toBeNull();
    expect(access!.canView).toBe(true);
    expect(access!.canManage).toBe(true);
  });

  it('owning PM can view and manage their own project', async () => {
    const access = await withTestClient((client) =>
      getProjectAccess(pm.user.id, pm.user.role, pm.projectId, client),
    );
    expect(access).not.toBeNull();
    expect(access!.canView).toBe(true);
    expect(access!.canManage).toBe(true);
    expect(access!.isOwner).toBe(true);
  });

  it('PM on an unrelated project gets canView=false', async () => {
    const unrelatedProjectId = await withTestClient(async (client) => {
      const { rows } = await client.query<{ id: number }>(
        `SELECT p.id FROM projects p
         WHERE p.owner_id <> $1
           AND p.id NOT IN (SELECT project_id FROM project_members WHERE user_id = $1)
         ORDER BY p.id LIMIT 1`,
        [pm.user.id],
      );
      if (!rows[0]) throw new Error('No unrelated project found for PM');
      return rows[0].id;
    });

    const access = await withTestClient((client) =>
      getProjectAccess(pm.user.id, pm.user.role, unrelatedProjectId, client),
    );
    expect(access).not.toBeNull();
    expect(access!.canView).toBe(false);
  });

  it('member contributor can view but not manage', async () => {
    const access = await withTestClient((client) =>
      getProjectAccess(member.user.id, member.user.role, pm.projectId, client),
    );
    expect(access).not.toBeNull();
    expect(access!.canView).toBe(true);
    expect(access!.canManage).toBe(false);
    expect(access!.memberRole).toBe('contributor');
  });

  it('non-member contributor gets canView=false', async () => {
    const access = await withTestClient((client) =>
      getProjectAccess(nonMember.user.id, nonMember.user.role, pm.projectId, client),
    );
    expect(access).not.toBeNull();
    expect(access!.canView).toBe(false);
  });

  it('non-existent project returns null', async () => {
    const access = await withTestClient((client) =>
      getProjectAccess(admin.user.id, admin.user.role, 999999, client),
    );
    expect(access).toBeNull();
  });
});

describe('assertProjectAccess', () => {
  it('throws 404 for non-member contributor', async () => {
    await expect(
      withTestClient((client) =>
        assertProjectAccess(toAuthUser(nonMember.user), pm.projectId, 'view', client),
      ),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('throws 403 when member contributor requests manage-level access', async () => {
    await expect(
      withTestClient((client) =>
        assertProjectAccess(toAuthUser(member.user), pm.projectId, 'manage', client),
      ),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it('throws 404 for a non-existent project (even for admin)', async () => {
    await expect(
      withTestClient((client) =>
        assertProjectAccess(toAuthUser(admin.user), 999999, 'view', client),
      ),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});

describe('requireRole', () => {
  it('returns 403 when role is not in the allowed list', () => {
    const mockReq = { user: { role: 'contributor' } } as unknown as Request;
    const mockRes = {} as unknown as Response;
    let nextErr: unknown = null;
    const mockNext: NextFunction = (err?: unknown) => { nextErr = err; };

    requireRole('admin', 'project_manager')(mockReq, mockRes, mockNext);
    expect(nextErr).not.toBeNull();
    expect(nextErr).toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it('passes through when role is in the allowed list', () => {
    const mockReq = { user: { role: 'admin' } } as unknown as Request;
    const mockRes = {} as unknown as Response;
    let nextCalled = false;
    const mockNext: NextFunction = (err?: unknown) => {
      if (!err) nextCalled = true;
    };

    requireRole('admin', 'project_manager')(mockReq, mockRes, mockNext);
    expect(nextCalled).toBe(true);
  });
});

describe('scopedProjectIdsSql', () => {
  it('returns empty SQL for admin (no restriction)', () => {
    const result = scopedProjectIdsSql(toAuthUser(admin.user));
    expect(result.sql).toBe('');
    expect(result.params).toEqual([]);
  });

  it('returns a sub-select for non-admin users', () => {
    const result = scopedProjectIdsSql(toAuthUser(member.user));
    expect(result.sql).toContain('project_id IN');
    expect(result.params).toEqual([member.user.id]);
  });
});

describe('assertNotSelf', () => {
  it('throws when actor equals requester', () => {
    expect(() => assertNotSelf(5, 5)).toThrow();
  });

  it('does not throw for different users', () => {
    expect(() => assertNotSelf(5, 6)).not.toThrow();
  });
});
