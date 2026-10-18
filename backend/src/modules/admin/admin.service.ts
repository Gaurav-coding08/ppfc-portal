import bcrypt from 'bcryptjs';
import { withTx } from '../../db/tx.js';
import { assertProjectAccess } from '../../lib/access.js';
import { writeAudit } from '../../lib/audit.js';
import { businessRule, conflict, notFound } from '../../lib/errors.js';
import type { PageMeta } from '../../lib/pagination.js';
import { updateWithVersion } from '../../lib/versioning.js';
import type { AuthUser } from '../../middleware/authenticate.js';
import * as adminRepo from './admin.repository.js';
import type { AdminUserRow, AuditEventRow } from './admin.repository.js';
import type { ActivityQuery, AuditEventsQuery, CreateUserBody, UpdateUserBody } from './admin.schemas.js';

const BCRYPT_ROUNDS = 10;

export async function createUser(actor: AuthUser, body: CreateUserBody, requestId: string): Promise<AdminUserRow> {
  if (await adminRepo.emailExists(body.email)) {
    throw conflict('Email already in use');
  }

  const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);

  return withTx(async (client) => {
    const created = await adminRepo.createUser(
      { email: body.email, fullName: body.fullName, role: body.role, departmentId: body.departmentId, passwordHash },
      client,
    );

    await writeAudit(client, {
      actorId: actor.id,
      entityType: 'user',
      entityId: created.id,
      action: 'user.create',
      before: null,
      after: created,
      requestId,
    });

    return created;
  });
}

interface RawUserRow {
  id: number;
  email: string;
  full_name: string;
  role: 'contributor' | 'project_manager' | 'admin';
  department_id: number | null;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
  password_hash?: string;
}

export async function updateUser(
  actor: AuthUser,
  targetId: number,
  body: UpdateUserBody,
  requestId: string,
): Promise<AdminUserRow> {
  return withTx(async (client) => {
    const target = await adminRepo.findUserRowById(targetId, client);
    if (!target) throw notFound();

    // "Admin cannot change own role or deactivate self" — checked on the
    // fields actually submitted, regardless of whether the new value would
    // differ from the current one (CLAUDE.md feature spec, not a
    // state-dependent business rule like the last-admin guard below).
    if (targetId === actor.id) {
      if (body.role !== undefined) throw businessRule('Admins cannot change their own role');
      if (body.isActive === false) throw businessRule('Admins cannot deactivate their own account');
    }

    const wasActiveAdmin = target.role === 'admin' && target.isActive;
    const willBeActiveAdmin = (body.role ?? target.role) === 'admin' && (body.isActive ?? target.isActive);
    if (wasActiveAdmin && !willBeActiveAdmin) {
      const activeAdmins = await adminRepo.countActiveAdmins(client);
      if (activeAdmins <= 1) {
        throw businessRule('Cannot demote or deactivate the last active admin');
      }
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    if (body.fullName !== undefined) {
      params.push(body.fullName);
      sets.push(`full_name = $${params.length}`);
    }
    if (body.role !== undefined) {
      params.push(body.role);
      sets.push(`role = $${params.length}`);
    }
    if (body.departmentId !== undefined) {
      params.push(body.departmentId);
      sets.push(`department_id = $${params.length}`);
    }
    if (body.isActive !== undefined) {
      params.push(body.isActive);
      sets.push(`is_active = $${params.length}`);
    }

    const updated = await updateWithVersion<RawUserRow>(client, 'users', targetId, body.version, sets.join(', '), params);
    const after = adminRepo.toAdminUser(updated);

    await writeAudit(client, {
      actorId: actor.id,
      entityType: 'user',
      entityId: targetId,
      action: 'user.update',
      before: target,
      after,
      requestId,
    });

    return after;
  });
}

export async function listAuditEvents(filters: AuditEventsQuery): Promise<{ rows: AuditEventRow[]; meta: PageMeta }> {
  const { rows, total } = await adminRepo.listAuditEvents(filters);
  return { rows, meta: { page: filters.page, pageSize: filters.pageSize, total } };
}

export async function listProjectActivity(
  actor: AuthUser,
  projectId: number,
  query: ActivityQuery,
): Promise<{ rows: AuditEventRow[]; meta: PageMeta }> {
  await assertProjectAccess(actor, projectId, 'view');
  const { rows, total } = await adminRepo.listProjectActivity(projectId, query.page, query.pageSize);
  return { rows, meta: { page: query.page, pageSize: query.pageSize, total } };
}
