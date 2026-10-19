import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

// CLAUDE.md "Lists: filters, sort and page live in the URL search params
// (shareable, back button works)." `defaults` should be a module-level
// constant (or memoized) — a fresh object identity every render would
// invalidate the `useMemo` below on every render.
export function useUrlFilters<T extends Record<string, string>>(defaults: T) {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => {
    const result = { ...defaults };
    for (const key of Object.keys(defaults) as (keyof T)[]) {
      const raw = searchParams.get(key as string);
      if (raw !== null) result[key] = raw as T[keyof T];
    }
    return result;
  }, [searchParams, defaults]);

  // A value equal to its default is removed from the URL rather than
  // written out, so the URL only ever shows filters that actually narrow
  // the list.
  const setFilters = useCallback(
    (patch: Partial<Record<keyof T, string | undefined>>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const key of Object.keys(patch) as (keyof T)[]) {
            const value = patch[key];
            if (value === undefined || value === '' || value === defaults[key]) {
              next.delete(key as string);
            } else {
              next.set(key as string, value);
            }
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams, defaults],
  );

  return [filters, setFilters] as const;
}
