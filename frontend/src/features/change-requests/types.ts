import type { components } from '@/api/schema';

export type ChangeRequestRow = components['schemas']['ChangeRequestRow'];
export type ChangeRequestDetail = components['schemas']['ChangeRequestDetail'];
export type ChangeHistoryEntry = components['schemas']['ChangeHistoryEntry'];
export type CrStatus = NonNullable<ChangeRequestRow['status']>;
export type CrDecision = 'approve' | 'reject' | 'return';

// Mirrors the backend's CR_STATUSES (changeRequests.schemas.ts), in
// workflow order.
export const CR_STATUS_OPTIONS: { value: CrStatus; label: string }[] = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'returned', label: 'Returned' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

// The /change-requests page's URL params. `mine` is 'true' or ''.
// `from`/`to` filter on the submitted date. The backend always orders by
// newest submission first (no sort param), so there is no sort here.
export const CR_LIST_DEFAULTS = {
  status: '',
  projectId: '',
  mine: '',
  from: '',
  to: '',
  page: '1',
};

export type CrListFilters = typeof CR_LIST_DEFAULTS;

// The project Change requests tab filters by status only (the project is fixed).
export const PROJECT_CR_DEFAULTS = { status: '', page: '1' };

// Every key the tab writes — cleared when the user leaves the tab.
export const CR_FILTER_KEYS = Object.keys(PROJECT_CR_DEFAULTS);
