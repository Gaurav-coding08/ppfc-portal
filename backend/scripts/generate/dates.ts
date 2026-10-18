// Fixed-date helpers. All dates in the generated dataset are computed from
// hard-coded base dates below, never from the wall clock (`new Date()` with
// no arguments) — that's what keeps a regenerated CSV byte-identical.

export const REPORTING_DATE = '2026-09-30';

// Returns `YYYY-MM-DD` for `base` + `days` (base is itself a fixed `YYYY-MM-DD`).
export function addDays(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// First of the given month, e.g. firstOfMonth(2026, 10) -> '2026-10-01'.
export function firstOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

// `YYYY-MM-DD` -> true if strictly before the reporting date.
export function isBeforeReportingDate(date: string): boolean {
  return date < REPORTING_DATE;
}

// Whole days between two `YYYY-MM-DD` dates (end - start).
export function daysBetween(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`).getTime();
  const b = new Date(`${end}T00:00:00Z`).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}
