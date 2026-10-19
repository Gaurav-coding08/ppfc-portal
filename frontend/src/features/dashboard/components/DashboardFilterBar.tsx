import { RotateCcw } from 'lucide-react';
import { FilterBar } from '@/components/data/FilterBar';
import { FilterMultiSelect } from '@/components/data/FilterMultiSelect';
import { FilterSelect } from '@/components/data/FilterSelect';
import { Button } from '@/components/ui/button';
import { useProjectFilterOptions } from '@/features/projects/hooks/useReferenceData';
import { PROJECT_STATUS_OPTIONS } from '@/features/projects/types';
import { parseTimeframe, timeframeOptions, timeframeValue } from '../timeframe';
import type { DashboardFilters } from '../types';

// Six coordinated filters, all in the URL (shareable, back button works).
// Option lists come from GET /dashboard/filters, already scoped to what
// the caller can see. Every widget reads the same URL filters, so a change
// here refetches all of them together.
export function DashboardFilterBar({
  filters,
  setFilters,
  asOf,
}: {
  filters: DashboardFilters;
  setFilters: (patch: Partial<DashboardFilters>) => void;
  asOf: string | undefined;
}) {
  const options = useProjectFilterOptions();
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <FilterBar>
      <FilterSelect
        label="Department"
        allLabel="All departments"
        value={filters.departmentId}
        onChange={(departmentId) => setFilters({ departmentId })}
        options={options.data?.departments ?? []}
      />
      <FilterSelect
        label="Project"
        allLabel="All projects"
        value={filters.projectId}
        onChange={(projectId) => setFilters({ projectId })}
        options={options.data?.projects ?? []}
      />
      <FilterSelect
        label="Manager"
        allLabel="All managers"
        value={filters.managerId}
        onChange={(managerId) => setFilters({ managerId })}
        options={options.data?.owners ?? []}
      />
      <FilterMultiSelect
        label="Status"
        allLabel="All statuses"
        value={filters.status}
        onChange={(status) => setFilters({ status })}
        options={PROJECT_STATUS_OPTIONS}
      />
      {asOf && (
        <FilterSelect
          label="Timeframe"
          allLabel="All dates"
          value={timeframeValue(filters.from, filters.to)}
          onChange={(value) => setFilters(parseTimeframe(value))}
          options={timeframeOptions(asOf, filters.from, filters.to)}
        />
      )}
      <FilterSelect
        label="Cost category"
        allLabel="All categories"
        value={filters.categoryId}
        onChange={(categoryId) => setFilters({ categoryId })}
        options={options.data?.categories ?? []}
      />
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setFilters({
              departmentId: '',
              projectId: '',
              managerId: '',
              status: '',
              from: '',
              to: '',
              categoryId: '',
            })
          }
        >
          <RotateCcw className="size-4" />
          Reset filters
        </Button>
      )}
    </FilterBar>
  );
}
