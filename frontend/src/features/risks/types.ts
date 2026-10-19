import type { components } from '@/api/schema';

export type Risk = components['schemas']['Risk'];
export type RiskType = NonNullable<Risk['type']>;
export type RiskStatus = NonNullable<Risk['status']>;

// Mirrors the backend's RISK_TYPES / RISK_STATUSES (risks.schemas.ts).
export const RISK_TYPE_OPTIONS: { value: RiskType; label: string }[] = [
  { value: 'risk', label: 'Risk' },
  { value: 'issue', label: 'Issue' },
];

export const RISK_STATUS_OPTIONS: { value: RiskStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'mitigating', label: 'Mitigating' },
  { value: 'closed', label: 'Closed' },
];

// Probability and impact are each rated 1–5 (backend: int 1..5).
export const RATING_OPTIONS = ['1', '2', '3', '4', '5'].map((v) => ({ value: v, label: v }));

// The project Risks tab's URL params. Highest exposure first, like the
// backend default. All strings, as the URL holds them.
export const PROJECT_RISK_DEFAULTS = {
  q: '',
  status: '',
  type: '',
  sort: 'score',
  order: 'desc',
  page: '1',
};

export type ProjectRiskFilters = typeof PROJECT_RISK_DEFAULTS;

// Every key the Risks tab writes — cleared when the user leaves the tab.
export const RISK_FILTER_KEYS = Object.keys(PROJECT_RISK_DEFAULTS);

// The portfolio /risks page adds project and department filters.
export const RISK_LIST_DEFAULTS = {
  ...PROJECT_RISK_DEFAULTS,
  projectId: '',
  departmentId: '',
};

export type RiskListFilters = typeof RISK_LIST_DEFAULTS;
