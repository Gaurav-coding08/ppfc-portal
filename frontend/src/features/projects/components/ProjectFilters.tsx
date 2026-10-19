import { X } from 'lucide-react';
import { FilterBar, SearchInput } from '@/components/data/FilterBar';
import { FilterSelect } from '@/components/data/FilterSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProjectFilterOptions } from '../hooks/useReferenceData';
import { PROJECT_STATUS_OPTIONS, type ProjectListFilters } from '../types';

// Every control writes straight to the URL via `setFilters`; any filter
// change also resets `page` to 1 so the user isn't left on page 4 of a
// result set that now has one page.
export function ProjectFilters({
  filters,
  setFilters,
}: {
  filters: ProjectListFilters;
  setFilters: (patch: Partial<ProjectListFilters>) => void;
}) {
  const options = useProjectFilterOptions();
  const set = (patch: Partial<ProjectListFilters>) => setFilters({ ...patch, page: '1' });
  const hasFilters = !!(
    filters.q ||
    filters.departmentId ||
    filters.ownerId ||
    filters.status ||
    filters.startFrom ||
    filters.endTo
  );

  return (
    <FilterBar>
      <SearchInput value={filters.q} onChange={(q) => set({ q })} placeholder="Search projects…" />
      <FilterSelect
        label="Department"
        allLabel="All departments"
        value={filters.departmentId}
        onChange={(departmentId) => set({ departmentId })}
        options={options.data?.departments ?? []}
      />
      <FilterSelect
        label="Owner"
        allLabel="All owners"
        value={filters.ownerId}
        onChange={(ownerId) => set({ ownerId })}
        options={options.data?.owners ?? []}
      />
      <FilterSelect
        label="Status"
        allLabel="All statuses"
        value={filters.status}
        onChange={(status) => set({ status })}
        options={PROJECT_STATUS_OPTIONS}
      />
      {/* Backend semantics: startFrom = project starts on/after; endTo =
          project ends on/before. Native date inputs emit YYYY-MM-DD. */}
      <div className="flex items-center gap-2">
        <Input
          type="date"
          aria-label="Starts on or after"
          className="w-40"
          value={filters.startFrom}
          onChange={(e) => set({ startFrom: e.target.value })}
        />
        <span className="text-muted-foreground text-sm">to</span>
        <Input
          type="date"
          aria-label="Ends on or before"
          className="w-40"
          value={filters.endTo}
          onChange={(e) => set({ endTo: e.target.value })}
        />
      </div>
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => set({ q: '', departmentId: '', ownerId: '', status: '', startFrom: '', endTo: '' })}
        >
          <X className="size-4" />
          Clear
        </Button>
      )}
    </FilterBar>
  );
}
