import { Search } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

// CLAUDE.md "Page header pattern: ... filter bar below." A plain flex
// layout — callers compose their own SelectField/DateField controls inside
// it (each already wired to useUrlFilters by the caller); this component
// only owns the layout and the debounced search box, since search is the
// one control with special timing behaviour.
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  // Local state keeps the input responsive to every keystroke; only the
  // debounced value is pushed up to the URL, so the list doesn't refetch on
  // every character.
  const [draft, setDraft] = useState(value);
  // Tracks the last `value` seen from the parent, so an external change
  // (browser back/forward, a "clear filters" button) can reset `draft`
  // without a `useEffect` — React's documented pattern for "adjusting state
  // when a prop changes" (calling setState during render, not in an
  // effect): https://react.dev/learn/you-might-not-need-an-effect
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setDraft(value);
  }

  const debounced = useDebouncedValue(draft, 300);

  useEffect(() => {
    if (debounced !== value) onChange(debounced);
    // `value` deliberately excluded: this effect should only fire when the
    // debounced draft settles, not when the parent's URL-derived value
    // changes (handled above instead).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <div className="relative w-full max-w-xs">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        className="pl-8"
        aria-label={placeholder}
      />
    </div>
  );
}
