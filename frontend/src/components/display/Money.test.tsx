import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Money } from './Money';

describe('Money', () => {
  it('formats a numeric amount as AED currency', () => {
    render(<Money amount={1234.5} />);
    // getByText's default normalizer collapses the real non-breaking space
    // Intl.NumberFormat puts between "AED" and the amount to a plain one.
    expect(screen.getByText('AED 1,234.50')).toBeInTheDocument();
  });

  it('formats a string amount (as the API sends it) as AED currency', () => {
    render(<Money amount="500" />);
    expect(screen.getByText('AED 500.00')).toBeInTheDocument();
  });

  it('renders an em dash for a null amount', () => {
    render(<Money amount={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
