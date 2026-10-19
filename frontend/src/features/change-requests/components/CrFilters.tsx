import { X } from 'lucide-react';
import { FilterBar } from '@/components/data/FilterBar';
import { FilterMultiSelect } from '@/components/data/FilterMultiSelect';
import { FilterSelect } from '@/components/data/FilterSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProjectFilterOptions } from '@/features/projects/hooks/useReferenceData';
import { CR_STATUS_OPTIONS, type CrListFilters } from '../types';

// Filters for the portfolio /change-requests page. Every control writes to
// the URL; any change resets `page` to 1.
export function CrFilters({
  filters,
  setFilters,
}: {
  filters: CrListFilters;
  setFilters: (patch: Partial<CrListFilters>) => void;
}) {
  const options = useProjectFilterOptions();
  const set = (patch: Partial<CrListFilters>) => setFilters({ ...patch, page: '1' });
  const mine = filters.mine === 'true';
  const hasFilters = !!(filters.status || filters.projectId || filters.mine || filters.from || filters.to);

  return (
    <FilterBar>
      <FilterMultiSelect
        label="Status"
        allLabel="All statuses"
        value={filters.status}
        onChange={(status) => set({ status })}
        options={CR_STATUS_OPTIONS}
      />
      <FilterSelect
        label="Project"
        allLabel="All projects"
        value={filters.projectId}
        onChange={(projectId) => set({ projectId })}
        options={options.data?.projects ?? []}
      />
      {/* A toggle button (aria-pressed) rather than a checkbox: there is no
          checkbox primitive in the kit, and the pressed state is announced. */}
      <Button
        variant={mine ? 'secondary' : 'outline'}
        aria-pressed={mine}
        onClick={() => set({ mine: mine ? '' : 'true' })}
      >
        Raised by me
      </Button>
      {/* Submitted-date range; native date inputs emit YYYY-MM-DD. */}
      <div className="flex items-center gap-2">
        <Input
          type="date"
          aria-label="Submitted from"
          className="w-40"
          value={filters.from}
          onChange={(e) => set({ from: e.target.value })}
        />
        <span className="text-muted-foreground text-sm">to</span>
        <Input
          type="date"
          aria-label="Submitted to"
          className="w-40"
          value={filters.to}
          onChange={(e) => set({ to: e.target.value })}
        />
      </div>
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => set({ status: '', projectId: '', mine: '', from: '', to: '' })}
        >
          <X className="size-4" />
          Clear
        </Button>
      )}
    </FilterBar>
  );
}
