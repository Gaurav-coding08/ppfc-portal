import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API } from '@/test/handlers';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { mockSession } from '@/test/session';
import { TourOverlay } from './GuidedTour';
import { useTour } from './useTour';

const STORAGE_KEY = 'keel-tour-completed';

function TourHarness() {
  const tour = useTour();
  return (
    <div>
      <button type="button" onClick={tour.start} data-testid="restart">
        Restart
      </button>
      <TourOverlay
        active={tour.active}
        step={tour.step}
        total={tour.steps.length}
        currentStep={tour.currentStep}
        onNext={tour.next}
        onSkip={tour.skip}
      />
    </div>
  );
}

function stubDashboard() {
  server.use(
    http.get(`${API}/dashboard/kpis`, () =>
      HttpResponse.json({
        data: { kpis: [] },
        meta: { asOf: '2026-09-30', appliedFilters: [], ignoredFilters: [], generatedAt: '2026-10-19T00:00:00Z' },
      }),
    ),
    http.get(`${API}/notifications`, () =>
      HttpResponse.json({ data: [], meta: { page: 1, pageSize: 8, total: 0 }, unreadCount: 0 }),
    ),
  );
}

beforeEach(() => {
  localStorage.clear();
  stubDashboard();
});

afterEach(() => {
  localStorage.clear();
});

describe('GuidedTour', () => {
  it('auto-starts for a first-time user and advances through steps', async () => {
    const user = userEvent.setup();
    mockSession('admin');
    renderWithProviders(<TourHarness />);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Step 1 of 5');
    expect(dialog).toHaveTextContent('Navigation');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Step 2 of 5');
    expect(screen.getByRole('dialog')).toHaveTextContent('Filters');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Step 3 of 5');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Step 4 of 5');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Step 5 of 5');

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('1');
  });

  it('Skip persists completion and hides the tour', async () => {
    const user = userEvent.setup();
    mockSession('admin');
    renderWithProviders(<TourHarness />);

    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Skip' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('1');
  });

  it('does not auto-start when already completed', async () => {
    localStorage.setItem(STORAGE_KEY, '1');
    mockSession('admin');
    renderWithProviders(<TourHarness />);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('can be restarted via the start function after completion', async () => {
    const user = userEvent.setup();
    localStorage.setItem(STORAGE_KEY, '1');
    mockSession('admin');
    renderWithProviders(<TourHarness />);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByTestId('restart'));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Step 1 of 5');
  });

  it('can be restarted via the keel-start-tour custom event', async () => {
    localStorage.setItem(STORAGE_KEY, '1');
    mockSession('admin');
    renderWithProviders(<TourHarness />);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    act(() => {
      window.dispatchEvent(new Event('keel-start-tour'));
    });

    expect(await screen.findByRole('dialog')).toHaveTextContent('Step 1 of 5');
  });

  it('does not auto-start when ?tour=off is in the URL', async () => {
    mockSession('admin');
    // Simulate the query param
    const originalSearch = window.location.search;
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '?tour=off' },
      writable: true,
      configurable: true,
    });

    renderWithProviders(<TourHarness />);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: originalSearch },
      writable: true,
      configurable: true,
    });
  });

  it('does not auto-start when navigator.webdriver is true', async () => {
    mockSession('admin');
    const original = navigator.webdriver;
    Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true });

    renderWithProviders(<TourHarness />);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    Object.defineProperty(navigator, 'webdriver', { value: original, configurable: true });
  });
});
