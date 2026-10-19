import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Pagination } from './Pagination';

// The range is page/pageSize arithmetic; `total` is the API's meta.total.
describe('Pagination', () => {
  it('shows the visible row range and the total record count', () => {
    render(<Pagination page={2} pageSize={20} total={67} onPageChange={() => {}} />);
    expect(screen.getByText('Showing 21–40 of 67 records')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 4')).toBeInTheDocument();
  });

  it('uses the singular for one record', () => {
    render(<Pagination page={1} pageSize={20} total={1} onPageChange={() => {}} />);
    expect(screen.getByText('Showing 1–1 of 1 record')).toBeInTheDocument();
  });
});
