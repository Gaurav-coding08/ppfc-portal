import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { FilterBar } from './FilterBar';

// useIsMobile reads window.innerWidth (the matchMedia stub in setup.ts
// never fires change events), so each test sets the width it needs.
const desktopWidth = window.innerWidth;
afterEach(() => {
  window.innerWidth = desktopWidth;
});

describe('FilterBar', () => {
  it('shows the filters inline from 768 px up', () => {
    window.innerWidth = 1024;
    render(
      <FilterBar>
        <label>
          Status <input />
        </label>
      </FilterBar>,
    );
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Filters' })).not.toBeInTheDocument();
  });

  it('collapses the filters into a "Filters" sheet below 768 px', async () => {
    window.innerWidth = 390;
    render(
      <FilterBar>
        <label>
          Status <input />
        </label>
      </FilterBar>,
    );
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const sheet = await screen.findByRole('dialog', { name: 'Filters' });
    expect(sheet).toContainElement(screen.getByLabelText('Status'));
  });
});
