import { formatDate } from '@/lib/format';

// Calendar-month helpers for the forecast grid. This is date layout, not
// money: they decide which rows the grid shows and which are editable,
// mirroring the backend rule in forecasts.service.ts ("month must be after
// the reporting month and not after the project end month"). The backend
// still validates every PUT and its 422 is shown if they ever disagree.
//
// Months are handled as 'YYYY-MM' strings, which sort correctly as plain
// strings, and built from integer parts — never through `new Date(str)`.

/** '2026-09-30' or '2026-09-01' → '2026-09' */
export function toMonth(date: string): string {
  return date.slice(0, 7);
}

/** Every month from `startDate`'s month to `endDate`'s month, inclusive. */
export function monthsBetween(startDate: string, endDate: string): string[] {
  const months: string[] = [];
  let [year, month] = toMonth(startDate).split('-').map(Number);
  const last = toMonth(endDate);
  // Guard against a malformed range producing an endless loop.
  for (let i = 0; i < 600; i += 1) {
    const current = `${year}-${String(month).padStart(2, '0')}`;
    if (current > last) break;
    months.push(current);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

/** A forecast month is editable only when it is after the reporting month. */
export function isEditableMonth(month: string, asOf: string): boolean {
  return month > toMonth(asOf);
}

/** '2026-10' → 'Oct 2026' */
export function formatMonth(month: string, pattern = 'MMM yyyy'): string {
  return formatDate(`${month}-01`, pattern);
}
