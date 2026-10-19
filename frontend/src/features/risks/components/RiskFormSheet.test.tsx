import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { API } from '@/test/handlers';
import { risk } from '@/test/fixtures/governance';
import { projectDetail } from '@/test/fixtures/projects';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { mockSession } from '@/test/session';
import { RiskFormSheet } from './RiskFormSheet';

type User = ReturnType<typeof userEvent.setup>;

async function pickOption(user: User, label: RegExp, option: string) {
  await user.click(screen.getByLabelText(label));
  await user.click(await screen.findByRole('option', { name: option }));
}

async function fillRequired(user: User, probability: string, impact: string) {
  await user.type(await screen.findByLabelText(/^Title/), 'Supplier insolvency');
  await pickOption(user, /^Owner/, 'Estell Conroy');
  await pickOption(user, /^Probability/, probability);
  await pickOption(user, /^Impact/, impact);
}

describe('RiskFormSheet', () => {
  it('marks mitigation required once the previewed score reaches 15', async () => {
    const user = userEvent.setup();
    mockSession('project_manager', [{ projectId: 1, memberRole: 'manager' }]);
    renderWithProviders(<RiskFormSheet open onOpenChange={() => {}} project={projectDetail} />);

    await fillRequired(user, '2', '3');
    // 2 × 3 = 6: low, mitigation optional.
    expect(screen.getByText('Score preview (calculated on save)')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
    expect(screen.getByLabelText('Mitigation')).toBeInTheDocument();
    expect(screen.queryByText(/Required for high-exposure risks/)).not.toBeInTheDocument();

    // 5 × 3 = 15: high, mitigation becomes visibly required.
    await pickOption(user, /^Probability/, '5');
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Mitigation \*/)).toBeInTheDocument();
    expect(screen.getByText(/Required for high-exposure risks/)).toBeInTheDocument();
  });

  it('relies on the backend rule and shows its 422 message on the mitigation field', async () => {
    const user = userEvent.setup();
    mockSession('project_manager', [{ projectId: 1, memberRole: 'manager' }]);
    let posted: unknown;
    server.use(
      http.post(`${API}/projects/1/risks`, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json(
          {
            error: {
              code: 'BUSINESS_RULE',
              message: 'Mitigation is required once a risk reaches high exposure (score >= 15)',
              requestId: 'req-risk-422',
            },
          },
          { status: 422 },
        );
      }),
    );
    renderWithProviders(<RiskFormSheet open onOpenChange={() => {}} project={projectDetail} />);

    await fillRequired(user, '4', '4');
    await user.click(screen.getByRole('button', { name: 'Create risk' }));

    // The form didn't block it client-side: the backend decided.
    await waitFor(() => expect(posted).toMatchObject({ probability: 4, impact: 4, ownerId: 6 }));
    expect(posted).not.toHaveProperty('mitigation');
    const message = await screen.findByText(/Mitigation is required once a risk reaches high exposure/);
    expect(screen.getByLabelText(/^Mitigation/)).toHaveAttribute('aria-invalid', 'true');
    expect(message).toHaveAttribute('role', 'alert');
  });

  it('edits send only the changed fields plus the loaded version', async () => {
    const user = userEvent.setup();
    mockSession('project_manager', [{ projectId: 1, memberRole: 'manager' }]);
    let patched: unknown;
    server.use(
      http.patch(`${API}/risks/1`, async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json({ data: risk({ mitigation: 'Dual-source the hardware', version: 5 }) });
      }),
    );
    renderWithProviders(
      <RiskFormSheet open onOpenChange={() => {}} project={projectDetail} risk={risk({ version: 4 })} />,
    );

    await user.type(await screen.findByLabelText(/^Mitigation/), 'Dual-source the hardware');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(patched).toEqual({ mitigation: 'Dual-source the hardware', version: 4 }));
  });
});
