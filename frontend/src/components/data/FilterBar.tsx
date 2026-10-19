import { Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

// CLAUDE.md "Page header pattern: ... filter bar below." A plain flex
// layout — callers compose their own SelectField/DateField controls inside
// it (each already wired to useUrlFilters by the caller); this component
// only owns the layout and the debounced search box, since search is the
// one control with special timing behaviour.
//
// Below 768 px (CLAUDE.md responsive rules) the same controls move into a
// "Filters" bottom sheet, stacked full width. Each control still writes to
// the URL as soon as it changes, so there is no separate Apply step.
export function FilterBar({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (!isMobile) return <div className="flex flex-wrap items-center gap-3">{children}</div>;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <SlidersHorizontal className="size-4" />
        Filters
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85svh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Changes apply straight away.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-3 px-4 pb-6 *:w-full *:max-w-none">{children}</div>
        </SheetContent>
      </Sheet>
    </>
  );
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
