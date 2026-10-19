import { formatMoney } from '@/lib/format';

// Shared recharts styling (CLAUDE.md design system). Grid and axes stay
// muted so the data carries the reading.
export const AXIS_TICK = { fontSize: 12, fill: 'var(--color-slate-500)' };
export const GRID = 'var(--color-slate-200)';

// Legend labels in body text colour: recharts colours them with the series
// colour by default, and teal/amber/slate-400 text on white fails WCAG AA
// (2.1–2.6:1). The legend icon still carries the series colour.
export const legendLabel = (value: string) => <span className="text-slate-700">{value}</span>;

// CLAUDE.md fixed series colours.
export const SERIES = {
  budget: 'var(--color-slate-400)',
  actual: 'var(--color-indigo-600)',
  eac: 'var(--color-amber-500)',
  forecast: 'var(--color-teal-500)',
  overrun: 'var(--color-rose-600)',
};

// CLAUDE.md category series order: indigo, teal, amber, sky, violet, slate
// (the --chart-N theme tokens in index.css, plus slate as the sixth).
export const CATEGORY_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--color-slate-400)',
];

// Compact axis labels ("AED 25K"); tooltips show the full amount.
export const compactAed = new Intl.NumberFormat('en-AE', {
  style: 'currency',
  currency: 'AED',
  notation: 'compact',
  maximumFractionDigits: 1,
});

// Tooltip value for an AED series; null = no value that month/project.
export const moneyTooltip = (v: unknown) => (v === null || v === undefined ? '—' : formatMoney(Number(v)));
