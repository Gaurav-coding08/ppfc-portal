import type { SelectOption } from '@/components/form/SelectField';
import { formatDate } from '@/lib/format';

// Period presets for the timeframe filter, built from the reporting year
// with plain string concatenation (no Date maths, no timezone). A preset
// only sets `from`/`to`; the reporting "as of" date is never changed by it.
//
// The backend applies from/to to task and milestone due dates and CR
// submission dates. Financial figures stay "as of" the reporting date.

export interface Timeframe {
  value: string; // "from|to", or '' for all dates
  label: string;
  from: string;
  to: string;
}

const QUARTERS: [string, string, string][] = [
  ['Q1', '01-01', '03-31'],
  ['Q2', '04-01', '06-30'],
  ['Q3', '07-01', '09-30'],
  ['Q4', '10-01', '12-31'],
];

export function timeframeValue(from: string, to: string): string {
  return from || to ? `${from}|${to}` : '';
}

export function timeframePresets(asOf: string): Timeframe[] {
  const year = Number(asOf.slice(0, 4));
  const make = (label: string, from: string, to: string): Timeframe => ({
    value: timeframeValue(from, to),
    label,
    from,
    to,
  });
  return [
    make(`Year to date (${year})`, `${year}-01-01`, asOf),
    ...QUARTERS.map(([q, start, end]) => make(`${q} ${year}`, `${year}-${start}`, `${year}-${end}`)),
    make(`Full year ${year}`, `${year}-01-01`, `${year}-12-31`),
    make(`Full year ${year + 1}`, `${year + 1}-01-01`, `${year + 1}-12-31`),
  ];
}

/**
 * Select options for the current URL. A from/to pair that isn't a preset
 * (e.g. a shared link) still shows as a "Custom" option so it is visible.
 */
export function timeframeOptions(asOf: string, from: string, to: string): SelectOption[] {
  const presets = timeframePresets(asOf);
  const current = timeframeValue(from, to);
  const options = presets.map((p) => ({ value: p.value, label: p.label }));
  if (current && !presets.some((p) => p.value === current)) {
    options.push({ value: current, label: `Custom: ${describeRange(from, to)}` });
  }
  return options;
}

export function describeRange(from: string, to: string): string {
  if (from && to) return `${formatDate(from)} – ${formatDate(to)}`;
  if (from) return `from ${formatDate(from)}`;
  return `until ${formatDate(to)}`;
}

export function parseTimeframe(value: string): { from: string; to: string } {
  if (!value) return { from: '', to: '' };
  const [from = '', to = ''] = value.split('|');
  return { from, to };
}
