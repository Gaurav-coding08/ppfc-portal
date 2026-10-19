import { describe, expect, it } from 'vitest';
import { formatDate, formatMoney } from './format';

describe('formatDate', () => {
  it('renders a YYYY-MM-DD string as its own calendar date regardless of the viewer timezone', () => {
    // `TZ=Asia/Dubai` is set via the npm script for this file so the
    // assertion fails if formatDate ever goes back to `new Date(str)`
    // (CLAUDE.md's "Never pass them through new Date(str)" rule, feature 08).
    expect(formatDate('2026-09-30')).toBe('30 Sep 2026');
  });
});

describe('formatMoney', () => {
  // Intl.NumberFormat joins the currency code to the amount with a
  // non-breaking space (U+00A0), not a plain space.
  it('formats a numeric string as AED currency', () => {
    expect(formatMoney('1234.5')).toBe('AED 1,234.50');
  });

  it('formats a number as AED currency', () => {
    expect(formatMoney(0)).toBe('AED 0.00');
  });
});
