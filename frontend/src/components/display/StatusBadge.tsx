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

const DELIVERY: Record<string, [Tone, string]> = {
  on_track: ['success', 'On track'],
  behind: ['warning', 'Behind'],
  at_risk: ['danger', 'At risk'],
  completed: ['success', 'Completed'],
};

const DOMAINS = {
  project: PROJECT,
  task: TASK,
  milestone: MILESTONE,
  risk: RISK,
  changeRequest: CHANGE_REQUEST,
  cost: COST,
  delivery: DELIVERY,
} as const;

export type StatusDomain = keyof typeof DOMAINS;

export function StatusBadge({ domain, status }: { domain: StatusDomain; status: string }) {
  const map = DOMAINS[domain];
  const [tone, label] = map[status] ?? (['neutral', status] as [Tone, string]);
  return <ToneBadge tone={tone}>{label}</ToneBadge>;
}
