import type { ActivityEvent } from './types';

// Audit actions are `<entity>.<verb>` (e.g. `project_member.add`,
// `task.update`). Rendered as "added project member" so the feed reads as
// a sentence; an unknown verb falls back to the raw action string.
const VERB_PAST: Record<string, string> = {
  create: 'created',
  update: 'updated',
  delete: 'deleted',
  add: 'added',
  remove: 'removed',
  post: 'posted',
  reverse: 'reversed',
  // Seeded history (data/csv/audit_events.csv) uses bare `decide`/`post`
  // actions without the entity prefix — handled by the same lookup.
  decide: 'decided',
  submit: 'submitted',
  resubmit: 'resubmitted',
  upsert: 'updated',
  run: 'ran',
  retry: 'retried',
};

export function describeAction(event: Pick<ActivityEvent, 'action' | 'entityType'>): string {
  const action = event.action ?? '';
  const verb = action.split('.').pop() ?? '';
  const entity = (event.entityType ?? '').replaceAll('_', ' ');
  const past = VERB_PAST[verb];
  return past ? `${past} ${entity}` : action;
}
