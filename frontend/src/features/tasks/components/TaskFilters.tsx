import { X } from 'lucide-react';
import { FilterBar, SearchInput } from '@/components/data/FilterBar';
import { FilterMultiSelect } from '@/components/data/FilterMultiSelect';
import { FilterSelect } from '@/components/data/FilterSelect';
import type { SelectOption } from '@/components/form/SelectField';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS, UNASSIGNED, type TaskListFilters } from '../types';

// Same pattern as ProjectFilters: every control writes to the URL, and any
// filter change resets `page` to 1. `assigneeOptions` are the project's
// members (only members can be assigned), plus "Unassigned".
export function TaskFilters({
  filters,
  setFilters,
  assigneeOptions,
}: {
  filters: TaskListFilters;
  setFilters: (patch: Partial<TaskListFilters>) => void;
  assigneeOptions: SelectOption[];
}) {
  const set = (patch: Partial<TaskListFilters>) => setFilters({ ...patch, page: '1' });
  const hasFilters = !!(
    filters.q ||
    filters.status ||
    filters.assignee ||
    filters.priority ||
    filters.overdue
  );

  return (
    <FilterBar>
      <SearchInput value={filters.q} onChange={(q) => set({ q })} placeholder="Search tasks…" />
      <FilterMultiSelect
        label="Status"
        allLabel="All statuses"
        value={filters.status}
        onChange={(status) => set({ status })}
        options={TASK_STATUS_OPTIONS}
      />
      <FilterSelect
        label="Assignee"
        allLabel="All assignees"
        value={filters.assignee}
        onChange={(assignee) => set({ assignee })}
        options={[{ value: UNASSIGNED, label: 'Unassigned' }, ...assigneeOptions]}
      />
      <FilterSelect
        label="Priority"
        allLabel="All priorities"
        value={filters.priority}
        onChange={(priority) => set({ priority })}
        options={TASK_PRIORITY_OPTIONS}
      />
      <div className="flex items-center gap-2">
        <input
          id="task-overdue-only"
          type="checkbox"
          className="size-4 accent-indigo-600"
          checked={filters.overdue === 'true'}
          onChange={(e) => set({ overdue: e.target.checked ? 'true' : '' })}
        />
        <Label htmlFor="task-overdue-only" className="font-normal">
          Overdue only
        </Label>
      </div>
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => set({ q: '', status: '', assignee: '', priority: '', overdue: '' })}
        >
          <X className="size-4" />
          Clear
        </Button>
      )}
    </FilterBar>
  );
}
