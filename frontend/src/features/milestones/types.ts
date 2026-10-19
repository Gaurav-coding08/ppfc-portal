import type { components } from '@/api/schema';

export type Milestone = components['schemas']['Milestone'];
export type MilestoneStatus = NonNullable<Milestone['status']>;

// Mirrors the backend's MILESTONE_STATUSES (milestones.schemas.ts).
export const MILESTONE_STATUS_OPTIONS: { value: MilestoneStatus; label: string }[] = [
  { value: 'planned', label: 'Planned' },
  { value: 'achieved', label: 'Achieved' },
  { value: 'missed', label: 'Missed' },
];

// Feature 16 spec: "Milestones due within 14 days highlighted".
export const DUE_SOON_DAYS = 14;

/**
 * True for a still-planned milestone due within the next 14 days. Reads
 * the API's `daysToDue` (computed in SQL against the reporting date), so
 * no date arithmetic happens in the browser.
 */
export function isDueWithinWindow(m: Milestone): boolean {
  return m.status === 'planned' && m.daysToDue != null && m.daysToDue >= 0 && m.daysToDue <= DUE_SOON_DAYS;
}
