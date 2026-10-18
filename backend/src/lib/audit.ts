import type { PoolClient } from 'pg';

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

// Always called with the *same* client as the mutation it records, inside
// one withTx — see CLAUDE.md "Transactions & audit". Never call this with
// the pool directly: that would let the audit row commit independently of
// the change it's supposed to document.
export async function writeAudit(client: PoolClient, input: AuditEventInput): Promise<void> {
  await client.query(
    `INSERT INTO audit_events (actor_id, entity_type, entity_id, action, project_id, before, after, request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.actorId,
      input.entityType,
      input.entityId,
      input.action,
      input.projectId ?? null,
      input.before === undefined ? null : JSON.stringify(input.before),
      input.after === undefined ? null : JSON.stringify(input.after),
      input.requestId,
    ],
  );
}
