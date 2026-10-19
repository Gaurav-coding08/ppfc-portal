import { ToneBadge } from '@/components/display/ToneBadge';
import type { TaskRow } from '../types';

// CLAUDE.md status mapping: overdue adds a danger "Overdue" badge, due-soon
// a warning "Due soon". Both flags come from the API (`isOverdue`,
// `isDueSoon`, computed in SQL against the reporting date) — the browser
// never compares dates itself, so a task due exactly on the reporting date
// is "not overdue" because the backend says so.
export function TaskDueBadges({ task }: { task: Pick<TaskRow, 'isOverdue' | 'isDueSoon'> }) {
  if (task.isOverdue) return <ToneBadge tone="danger">Overdue</ToneBadge>;
  if (task.isDueSoon) return <ToneBadge tone="warning">Due soon</ToneBadge>;
  return null;
}
