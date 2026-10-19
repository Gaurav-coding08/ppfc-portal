import { format, parse } from 'date-fns';

// CLAUDE.md: "API dates are YYYY-MM-DD strings. Never pass them through
// `new Date(str)` for display (timezone shift)." `new Date('2026-09-30')`
// parses as UTC midnight, so formatting it with *local* getters (what every
// `toLocaleDateString`/`Intl.DateTimeFormat` call ultimately uses) can land
// on a different calendar day depending on the viewer's timezone offset.
// `date-fns#parse` instead builds the Date from the (year, month, day)
// components directly in local time, so there is no instant being
// reinterpreted across a timezone boundary — formatting it back out always
// reproduces the same calendar date, in any TZ.
export function formatDate(dateOnly: string, pattern = 'd MMM yyyy'): string {
  const parsed = parse(dateOnly, 'yyyy-MM-dd', new Date());
  return format(parsed, pattern);
}

// Audit/activity timestamps carry an explicit UTC offset (`...Z`), so they
// identify a real instant — ordinary Date parsing is correct here, unlike
// the bare YYYY-MM-DD case above.
export function formatDateTime(isoDateTime: string, pattern = 'd MMM yyyy, HH:mm'): string {
  return format(new Date(isoDateTime), pattern);
}

const aedFormatter = new Intl.NumberFormat('en-AE', {
  style: 'currency',
  currency: 'AED',
});

// CLAUDE.md: "Money: amounts arrive as strings. Format with
// Intl.NumberFormat(...) in <Money>; ... No arithmetic on money in the
// frontend." This only formats a value the backend already computed.
export function formatMoney(amount: number | string): string {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  return aedFormatter.format(n);
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(digits)}%`;
}
