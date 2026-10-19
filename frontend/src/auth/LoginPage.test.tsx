import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { LoginPage } from './LoginPage';

describe('LoginPage', () => {
  it('shows validation errors instead of submitting when the form is empty', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />, { route: '/login' });

    // Wait for the initial `/auth/me` check (mocked 401 → logged out) so the
    // form isn't still in its loading/redirect-pending state.
    await screen.findByLabelText('Email');

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
  });

  it('shows the backend message on a failed login', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />, { route: '/login' });

    await screen.findByLabelText('Email');
    await user.type(screen.getByLabelText('Email'), 'wrong@ppfc.demo');
    await user.type(screen.getByLabelText('Password'), 'WrongPassword1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password');
    });
  });
});
