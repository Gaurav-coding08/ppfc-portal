import { z } from 'zod';

// Builds a zod schema for list-endpoint query strings. `sortable` is a
// whitelist of column identifiers the caller allows for ORDER BY — never
// interpolate an unchecked identifier.
export function listQuery(opts: { sortable: string[] }) {
  return z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.enum(opts.sortable as [string, ...string[]]).optional(),
    order: z.enum(['asc', 'desc']).default('asc'),
  });
}

export type ListQueryResult = z.infer<ReturnType<typeof listQuery>>;

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
}

export function toPageMeta(query: ListQueryResult, total: number): PageMeta {
  return {
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}
