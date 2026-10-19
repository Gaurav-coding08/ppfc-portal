import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { API } from '@/test/handlers';
import { departmentsResponse } from '@/test/fixtures/projects';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { mockSession } from '@/test/session';
import { ProjectFormSheet } from './ProjectFormSheet';

beforeEach(() => {
  server.use(http.get(`${API}/departments`, () => HttpResponse.json(departmentsResponse)));
});

async function pickOption(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  await user.click(screen.getByLabelText(label));
  await user.click(await screen.findByRole('option', { name: option }));
}

describe('ProjectFormSheet (create)', () => {
  it('blocks submit client-side when the end date is before the start date', async () => {
    const user = userEvent.setup();
    mockSession('project_manager');
    renderWithProviders(<ProjectFormSheet open onOpenChange={() => {}} />);

    await user.type(await screen.findByLabelText(/^Start date/), '2026-06-01');
    await user.type(screen.getByLabelText(/^End date/), '2026-05-01');
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    expect(await screen.findByText('End date must be on or after start date')).toBeInTheDocument();
    expect(screen.getByText('Name is required')).toBeInTheDocument();
  });

  it('shows the backend 400 field errors inline next to their fields', async () => {
    const user = userEvent.setup();
    mockSession('project_manager');
    let posted: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API}/projects`, async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Request failed validation',
              details: { formErrors: [], fieldErrors: { name: ['Name already used by another project'] } },
              requestId: 'req-create-1',
            },
          },
          { status: 400 },
        );
      }),
    );
    renderWithProviders(<ProjectFormSheet open onOpenChange={() => {}} />);

    await user.type(await screen.findByLabelText(/^Name/), 'Core Network Refresh');
    await pickOption(user, 'Department *', 'Network Engineering');
    await user.type(screen.getByLabelText(/^Start date/), '2026-01-01');
    await user.type(screen.getByLabelText(/^End date/), '2026-12-31');
    await user.type(screen.getByLabelText(/^Initial approved budget/), '150000');
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    const nameField = screen.getByLabelText(/^Name/).closest('div')!;
    expect(await within(nameField).findByText('Name already used by another project')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toHaveAttribute('aria-invalid', 'true');

    // A PM's create is owned by themselves (backend rule) — the body proves
    // the locked owner field and the number conversions.
    expect(posted).toMatchObject({
      name: 'Core Network Refresh',
      departmentId: 2,
      ownerId: 2,
      status: 'planning',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      initialBudget: 150000,
    });
  });

  it('shows a 422 business rule as a form-level message', async () => {
    const user = userEvent.setup();
    mockSession('project_manager');
    server.use(
      http.post(`${API}/projects`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'BUSINESS_RULE',
              message: 'Owner must be an active project manager or admin',
              requestId: 'req-create-2',
            },
          },
          { status: 422 },
        ),
      ),
    );
    renderWithProviders(<ProjectFormSheet open onOpenChange={() => {}} />);

    await user.type(await screen.findByLabelText(/^Name/), 'X');
    await pickOption(user, 'Department *', 'Digital Platforms');
    await user.type(screen.getByLabelText(/^Start date/), '2026-01-01');
    await user.type(screen.getByLabelText(/^End date/), '2026-02-01');
    await user.type(screen.getByLabelText(/^Initial approved budget/), '0');
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Owner must be an active project manager or admin'),
    );
  });
});
