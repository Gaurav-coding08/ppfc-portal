import { X } from 'lucide-react';
import { FilterBar } from '@/components/data/FilterBar';
import { FilterSelect } from '@/components/data/FilterSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCostCategories } from '../hooks/useFinanceQueries';
import { COST_STATUS_OPTIONS, type CostListFilters } from '../types';

// Status, category and date-range filters for the costs table. Every
// control writes to the URL; any change resets `page` to 1.
export function CostFilters({
  filters,
  setFilters,
}: {
  filters: CostListFilters;
  setFilters: (patch: Partial<CostListFilters>) => void;
}) {
  const categories = useCostCategories();
  const set = (patch: Partial<CostListFilters>) => setFilters({ ...patch, page: '1' });
  const hasFilters = !!(filters.status || filters.categoryId || filters.from || filters.to);

  return (
    <FilterBar>
      <FilterSelect
        label="Status"
        allLabel="All statuses"
        value={filters.status}
        onChange={(status) => set({ status })}
        options={COST_STATUS_OPTIONS}
      />
      <FilterSelect
        label="Category"
        allLabel="All categories"
        value={filters.categoryId}
        onChange={(categoryId) => set({ categoryId })}
        options={(categories.data ?? []).map((c) => ({ value: String(c.id), label: c.name ?? '' }))}
      />
      {/* Transaction-date range; native date inputs emit YYYY-MM-DD. */}
      <div className="flex items-center gap-2">
        <Input
          type="date"
          aria-label="Cost date from"
          className="w-40"
          value={filters.from}
          onChange={(e) => set({ from: e.target.value })}
        />
        <span className="text-muted-foreground text-sm">to</span>
        <Input
          type="date"
          aria-label="Cost date to"
          className="w-40"
          value={filters.to}
          onChange={(e) => set({ to: e.target.value })}
        />
      </div>
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => set({ status: '', categoryId: '', from: '', to: '' })}
        >
          <X className="size-4" />
          Clear
        </Button>
      )}
    </FilterBar>
  );
}
