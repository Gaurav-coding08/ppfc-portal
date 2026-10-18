import type { Client, PoolClient } from 'pg';
import type { RawTaskRow } from './tasks.repository.js';

export interface InsertTaskInput {
  projectId: number;
  title: string;
  description: string | null;
  assigneeId: number | null;
  status: string;
  priority: string;
  startDate: string | null;
  dueDate: string;
  weight: number;
  progress: number;
  completedAt: Date | string | null;
}

export async function insertTask(input: InsertTaskInput, client: PoolClient | Client): Promise<RawTaskRow> {
  const { rows } = await client.query<RawTaskRow>(
    `INSERT INTO tasks (project_id, title, description, assignee_id, status, priority, start_date, due_date, weight, progress, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      input.projectId,
      input.title,
      input.description,
      input.assigneeId,
      input.status,
      input.priority,
      input.startDate,
      input.dueDate,
      input.weight,
      input.progress,
      input.completedAt,
    ],
  );
  return rows[0]!;
}

export async function deleteTask(id: number, client: PoolClient | Client): Promise<void> {
  await client.query(`DELETE FROM tasks WHERE id = $1`, [id]);
}
