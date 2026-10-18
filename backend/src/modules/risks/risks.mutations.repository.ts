import type { Client, PoolClient } from 'pg';
import type { RawRiskRow } from './risks.repository.js';

export interface InsertRiskInput {
  projectId: number;
  type: string;
  title: string;
  description: string | null;
  ownerId: number;
  probability: number;
  impact: number;
  mitigation: string | null;
  dueDate: string | null;
  status: string;
}

export async function insertRisk(input: InsertRiskInput, client: PoolClient | Client): Promise<RawRiskRow> {
  const { rows } = await client.query<RawRiskRow>(
    `INSERT INTO risks (project_id, type, title, description, owner_id, probability, impact, mitigation, due_date, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      input.projectId,
      input.type,
      input.title,
      input.description,
      input.ownerId,
      input.probability,
      input.impact,
      input.mitigation,
      input.dueDate,
      input.status,
    ],
  );
  return rows[0]!;
}
