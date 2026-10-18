import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { withTx } from '../../db/tx.js';
import { unauthenticated } from '../../lib/errors.js';
import { writeAudit } from '../../lib/audit.js';
import { findMembershipsByUserId, findUserByEmail, type AuthUserRow, type MembershipRow } from './auth.repository.js';

export interface PublicUser {
  id: number;
  email: string;
  fullName: string;
  role: AuthUserRow['role'];
  departmentId: number | null;
}

// A real bcrypt hash that no seeded password will ever match, compared
// against on every login attempt where the email doesn't resolve to a
// user. Without this, an unknown-email request returns in roughly the time
// of a string lookup while a wrong-password request waits for a bcrypt
// compare — a timing side channel an attacker could use to enumerate valid
// emails even though both responses carry the same message/status.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

function toPublicUser(user: AuthUserRow): PublicUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    departmentId: user.departmentId,
  };
}

// Login and its audit trail are one atomic unit, but a failed attempt must
// still *commit* its audit row — only the attempt failed, not the write
// recording it. So the transaction only ever fails the request after it
// commits: the callback itself never throws, it returns a success flag that
// the caller inspects afterwards.
export async function login(email: string, password: string, requestId: string): Promise<{ user: PublicUser; token: string }> {
  const result = await withTx(async (client) => {
    const user = await findUserByEmail(email, client);
    const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    const success = Boolean(user && user.isActive && passwordOk);

    await writeAudit(client, {
      actorId: success ? user!.id : null,
      entityType: 'user',
      entityId: user?.id ?? 0,
      action: success ? 'login.success' : 'login.failure',
      requestId,
    });

    return success ? { success: true as const, user: user! } : { success: false as const };
  });

  if (!result.success) {
    // Same message for an unknown email and a wrong/deactivated-account
    // password — never confirm which part was wrong (no user enumeration).
    throw unauthenticated('Invalid email or password');
  }

  const token = jwt.sign({ sub: result.user.id }, env.JWT_SECRET, {
    // @types/jsonwebtoken types expiresIn as a template-literal union (via
    // the `ms` package) rather than plain string. JWT_EXPIRES_IN is
    // validated against that same "<n><unit>" shape by env.ts's own
    // parseDurationMs at boot, so this cast is sound, not a type escape hatch.
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    algorithm: 'HS256',
  });

  return { user: toPublicUser(result.user), token };
}

export async function getMemberships(userId: number): Promise<MembershipRow[]> {
  return findMembershipsByUserId(userId);
}
