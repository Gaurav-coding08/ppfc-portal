// Converts a Postgres NUMERIC string (or null) to a JS number rounded to
// 2 decimal places (or null). Money is always computed in SQL (never
// summed in JS loops) and only converted at the API boundary.
//
// Every response that includes money should carry a single `currency: 'AED'`
// field at the object level, not per amount — e.g.:
//   { budget: 100000, actual: 45000, currency: 'AED' }
export function toMoney(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Math.round(parseFloat(value) * 100) / 100;
}
