import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { toApiError } from '@/api/errors';
import * as queryKeys from '@/api/queryKeys';

// No M1 endpoint exposes the reporting date on its own, so the topbar's
// "Data as of" badge reads it off `GET /dashboard/kpis`'s `meta.asOf` —
// an endpoint that already exists and is reachable by every role (feature
// spec Part A.5: "if none is exposed, read it from an existing endpoint's
// asOf; do not hardcode"). This does not build any dashboard UI.
export function useReportingDate(): string | undefined {
  const { data } = useQuery({
    queryKey: queryKeys.dashboard.kpis({}),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/dashboard/kpis', { params: { query: {} } });
      if (error) throw toApiError(error, response);
      return data!.meta!.asOf;
    },
    staleTime: Infinity,
  });
  return data;
}
