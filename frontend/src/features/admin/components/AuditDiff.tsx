import { cn } from '@/lib/cn';
import { diffSnapshots } from '../auditLinks';

function show(value: unknown): string {
  if (value === undefined) return '—';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

// Before/after JSON for one audit event. Changed fields are marked with
// text ("changed") as well as colour, so the difference isn't colour-only.
export function AuditDiff({ before, after }: { before: unknown; after: unknown }) {
  const rows = diffSnapshots(before, after);
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">No before/after data recorded for this event.</p>;
  }
  return (
    <table className="w-full table-fixed text-left text-xs" aria-label="Before and after">
      <thead className="text-muted-foreground">
        <tr>
          <th className="w-1/5 py-1 pr-3 font-medium">Field</th>
          <th className="py-1 pr-3 font-medium">Before</th>
          <th className="py-1 font-medium">After</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className={cn('align-top', row.changed && 'bg-amber-50')}>
            <td className="py-1 pr-3 font-mono">
              {row.key}
              {row.changed && <span className="ml-1 font-sans text-amber-700">(changed)</span>}
            </td>
            <td className="py-1 pr-3">
              <pre className="font-mono break-words whitespace-pre-wrap">{show(row.before)}</pre>
            </td>
            <td className="py-1">
              <pre className="font-mono break-words whitespace-pre-wrap">{show(row.after)}</pre>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
