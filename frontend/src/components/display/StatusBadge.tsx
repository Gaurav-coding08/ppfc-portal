import { ToneBadge, type Tone } from './ToneBadge';

// CLAUDE.md "Fixed status mapping (use everywhere)" — one map per entity so
// every screen renders the same colour for the same status instead of each
// feature inventing its own.
const PROJECT: Record<string, [Tone, string]> = {
  planning: ['neutral', 'Planning'],
  active: ['info', 'Active'],
  on_hold: ['warning', 'On hold'],
  completed: ['success', 'Completed'],
  cancelled: ['neutral', 'Cancelled'],
};

const TASK: Record<string, [Tone, string]> = {
  todo: ['neutral', 'To do'],
  in_progress: ['info', 'In progress'],
  blocked: ['danger', 'Blocked'],
  done: ['success', 'Done'],
};

const MILESTONE: Record<string, [Tone, string]> = {
  planned: ['neutral', 'Planned'],
  achieved: ['success', 'Achieved'],
  missed: ['danger', 'Missed'],
};

const RISK: Record<string, [Tone, string]> = {
  open: ['warning', 'Open'],
  mitigating: ['info', 'Mitigating'],
  closed: ['neutral', 'Closed'],
};

const CHANGE_REQUEST: Record<string, [Tone, string]> = {
  submitted: ['info', 'Submitted'],
  returned: ['warning', 'Returned'],
  approved: ['success', 'Approved'],
  rejected: ['danger', 'Rejected'],
};

const COST: Record<string, [Tone, string]> = {
  draft: ['neutral', 'Draft'],
  posted: ['success', 'Posted'],
  reversed: ['neutral', 'Reversed'],
};

// Budget revisions aren't in the CLAUDE.md map; they follow the CR pattern
// (pending decision = info, approved = success, rejected = danger).
const REVISION: Record<string, [Tone, string]> = {
  pending: ['info', 'Pending'],
  approved: ['success', 'Approved'],
  rejected: ['danger', 'Rejected'],
};

// Finance alert severity (backend summary.repository.ts getAlerts).
const ALERT_SEVERITY: Record<string, [Tone, string]> = {
  critical: ['danger', 'Critical'],
  warning: ['warning', 'Warning'],
  info: ['info', 'Info'],
};

const DELIVERY: Record<string, [Tone, string]> = {
  on_track: ['success', 'On track'],
  behind: ['warning', 'Behind'],
  at_risk: ['danger', 'At risk'],
  completed: ['success', 'Completed'],
};

// Automation job runs and outbox events (feature 15 backend). Not in the
// CLAUDE.md map; they follow its semantic tones: in flight = info,
// finished = success, failed = danger.
const AUTOMATION_RUN: Record<string, [Tone, string]> = {
  running: ['info', 'Running'],
  success: ['success', 'Success'],
  failed: ['danger', 'Failed'],
};

const OUTBOX: Record<string, [Tone, string]> = {
  pending: ['info', 'Pending'],
  sent: ['success', 'Sent'],
  failed: ['danger', 'Failed'],
};

const DOMAINS = {
  project: PROJECT,
  task: TASK,
  milestone: MILESTONE,
  risk: RISK,
  changeRequest: CHANGE_REQUEST,
  cost: COST,
  revision: REVISION,
  alertSeverity: ALERT_SEVERITY,
  delivery: DELIVERY,
  automationRun: AUTOMATION_RUN,
  outbox: OUTBOX,
} as const;

export type StatusDomain = keyof typeof DOMAINS;

export function StatusBadge({ domain, status }: { domain: StatusDomain; status: string }) {
  const map = DOMAINS[domain];
  const [tone, label] = map[status] ?? (['neutral', status] as [Tone, string]);
  return <ToneBadge tone={tone}>{label}</ToneBadge>;
}
