import type { Client, PoolClient } from 'pg';

export interface AuditEventInput {
  actorId: number | null;
  entityType: string;
  entityId: number;
  action: string;
  projectId?: number | null;
  before?: unknown;
  after?: unknown;
  requestId: string;
}

const REDACTED_KEYS = ['password_hash', 'passwordHash'];

// Recursively strips sensitive fields so they never end up in audit_events.
function stripSensitive(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stripSensitive);

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (REDACTED_KEYS.includes(k)) continue;
    result[k] = stripSensitive(v);
  }
  return result;
}

// Always called with the *same* client as the mutation it records, inside
// one withTx — see CLAUDE.md "Transactions & audit". Never call this with
// the pool directly: that would let the audit row commit independently of
// the change it's supposed to document.
export async function writeAudit(client: PoolClient | Client, input: AuditEventInput): Promise<void> {
  const before = input.before === undefined ? null : JSON.stringify(stripSensitive(input.before));
  const after = input.after === undefined ? null : JSON.stringify(stripSensitive(input.after));

  await client.query(
    `INSERT INTO audit_events (actor_id, entity_type, entity_id, action, project_id, before, after, request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.actorId,
      input.entityType,
      input.entityId,
      input.action,
      input.projectId ?? null,
      before,
      after,
      input.requestId,
    ],
  );
}
