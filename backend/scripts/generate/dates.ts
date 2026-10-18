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

// Builds a full `YYYY-MM-DDTHH:MM:SSZ` timestamp from a `YYYY-MM-DD` date and
// a fixed time of day. Business timestamps (created_at, posted_at, etc.) are
// always built this way so they stay anchored to a fixed date, not now().
export function atTime(date: string, time = '09:00:00'): string {
  return `${date}T${time}Z`;
}

// Shifts a `YYYY-MM-DDTHH:MM:SSZ` timestamp by `days`, keeping its time of day.
export function shiftTimestamp(timestamp: string, days: number): string {
  const [datePart, timePart] = timestamp.split('T');
  return `${addDays(datePart!, days)}T${timePart}`;
}

// `YYYY-MM-DDTHH:MM:SSZ` -> true if strictly after the reporting date's end
// of day. Used to spot business timestamps that leak past the cutoff.
export function isAfterReportingDate(timestamp: string): boolean {
  return timestamp.slice(0, 10) > REPORTING_DATE;
}
