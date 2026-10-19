import { useProjectFilterOptions } from '@/features/projects/hooks/useReferenceData';
import { PROJECT_STATUS_OPTIONS } from '@/features/projects/types';
import { describeRange } from '../timeframe';
import type { DashboardQuery } from '../types';

/**
 * The active dashboard filters in words ("Department: Digital Platforms ·
 * Timeframe: Q3 2026 …"), shown at the top of a drill drawer so the
 * records are read in the same context as the number that was clicked.
 */
export function FilterContext({
  query,
  categoryIgnored,
}: {
  query: DashboardQuery;
  categoryIgnored: boolean;
}) {
  const options = useProjectFilterOptions().data;
  const labelOf = (list: { value: string; label: string }[] | undefined, id: string) =>
    list?.find((o) => o.value === id)?.label ?? `#${id}`;

  const parts: string[] = [];
  if (query.departmentId) parts.push(`Department: ${labelOf(options?.departments, query.departmentId)}`);
  if (query.projectId) parts.push(`Project: ${labelOf(options?.projects, query.projectId)}`);
  if (query.managerId) parts.push(`Manager: ${labelOf(options?.owners, query.managerId)}`);
  if (query.status) {
    const names = query.status.split(',').map((s) => labelOf(PROJECT_STATUS_OPTIONS, s));
    parts.push(`Status: ${names.join(', ')}`);
  }
  if (query.from || query.to) parts.push(`Timeframe: ${describeRange(query.from ?? '', query.to ?? '')}`);
  if (query.categoryId) {
    parts.push(
      categoryIgnored
        ? 'Category: all categories (this figure is not split by category)'
        : `Category: ${labelOf(options?.categories, query.categoryId)}`,
    );
  }

  return (
    <span className="block text-xs" data-testid="drill-filter-context">
      {parts.length === 0 ? 'No filters — everything in your scope' : parts.join(' · ')}
    </span>
  );
}
