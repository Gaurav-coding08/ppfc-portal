import { useQuery } from '@tanstack/react-query';
import { kpisQueryOptions } from '@/features/dashboard/hooks/useDashboardQueries';

// No endpoint exposes the reporting date on its own, so the topbar's
// "Data as of" badge reads it off `GET /dashboard/kpis`'s `meta.asOf` —
// an endpoint every role can reach (feature 16 spec Part A.5: "if none is
// exposed, read it from an existing endpoint's asOf; do not hardcode").
// It shares the unfiltered dashboard's KPI query (same key, same cached
// shape) and only selects `asOf`, so the dashboard page doesn't fetch the
// KPIs twice.
export function useReportingDate(): string | undefined {
  const { data } = useQuery({
    ...kpisQueryOptions({}),
    select: (result) => result.meta.asOf,
  });
  return data;
}
