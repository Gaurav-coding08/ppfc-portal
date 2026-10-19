import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { FilterBar, SearchInput } from '@/components/data/FilterBar';
import { FilterMultiSelect } from '@/components/data/FilterMultiSelect';
import { FilterSelect } from '@/components/data/FilterSelect';
import { Button } from '@/components/ui/button';
import { RISK_STATUS_OPTIONS, RISK_TYPE_OPTIONS, type ProjectRiskFilters } from '../types';

// Shared by the project Risks tab and the portfolio /risks page. The
// portfolio page passes its project/department selects as `children` and
// the extra keys they own in `extraKeys`, so "Clear" resets those too.
// Any filter change resets `page` to 1.
export function RiskFilters<F extends ProjectRiskFilters>({
  filters,
  setFilters,
  extraKeys = [],
  children,
}: {
  filters: F;
  setFilters: (patch: Partial<Record<keyof F, string>>) => void;
  extraKeys?: (keyof F)[];
  children?: ReactNode;
}) {
  const set = (patch: Partial<Record<keyof F, string>>) => setFilters({ ...patch, page: '1' });
  const clearable: (keyof F)[] = ['q', 'status', 'type', ...extraKeys];
  const hasFilters = clearable.some((key) => !!filters[key]);

  return (
    <FilterBar>
      <SearchInput
        value={filters.q}
        onChange={(q) => set({ q } as Partial<Record<keyof F, string>>)}
        placeholder="Search risks…"
      />
      <FilterMultiSelect
        label="Status"
        allLabel="All statuses"
        value={filters.status}
        onChange={(status) => set({ status } as Partial<Record<keyof F, string>>)}
        options={RISK_STATUS_OPTIONS}
      />
      <FilterSelect
        label="Type"
        allLabel="Risks & issues"
        value={filters.type}
        onChange={(type) => set({ type } as Partial<Record<keyof F, string>>)}
        options={RISK_TYPE_OPTIONS}
      />
      {children}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            set(Object.fromEntries(clearable.map((k) => [k, ''])) as Partial<Record<keyof F, string>>)
          }
        >
          <X className="size-4" />
          Clear
        </Button>
      )}
    </FilterBar>
  );
}
