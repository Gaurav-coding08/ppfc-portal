import { isForbidden, type ForbiddenFieldDetails } from '@/api/errors';

// Readable names for the task fields the backend may list in a 403's
// `details.fields` (backend tasks.update.service.ts).
const FIELD_LABELS: Record<string, string> = {
  title: 'title',
  description: 'description',
  assigneeId: 'assignee',
  priority: 'priority',
  startDate: 'start date',
  dueDate: 'due date',
  weight: 'weight',
  status: 'status',
  progress: 'progress',
};

/**
 * For a 403 on a task update, the message to show: the backend's message
 * plus which fields were rejected when it says (`details.fields`), e.g.
 * "… Not allowed: title, due date." Returns null for any other error.
 */
export function forbiddenFieldsMessage(err: unknown): string | null {
  if (!isForbidden(err)) return null;
  const fields = (err.details as ForbiddenFieldDetails | undefined)?.fields ?? [];
  if (fields.length === 0) return err.message;
  const names = fields.map((f) => FIELD_LABELS[f] ?? f).join(', ');
  return `${err.message}. Not allowed: ${names}.`;
}
