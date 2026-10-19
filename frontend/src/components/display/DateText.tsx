import { formatDate, formatDateTime } from '@/lib/format';

// `dateOnly`: a YYYY-MM-DD field (dueDate, startDate, ...). `dateTime`: a
// full ISO timestamp (createdAt, decidedAt, ...). Routed to the right
// formatter so callers never have to remember which parsing path is safe —
// see lib/format.ts for why the two need different handling.
export function DateText({ value, kind = 'date' }: { value: string | null; kind?: 'date' | 'dateTime' }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <span>{kind === 'date' ? formatDate(value) : formatDateTime(value)}</span>;
}
