import type { DepartmentRow } from './types.js';

// Fixed, not randomized — departments are organizational structure, not
// filler content, so they're hand-picked and company-neutral.
export function buildDepartments(): DepartmentRow[] {
  return [
    { id: 1, code: 'DIGPLT', name: 'Digital Platforms' },
    { id: 2, code: 'NETENG', name: 'Network Engineering' },
    { id: 3, code: 'ENTIT', name: 'Enterprise IT' },
  ];
}
