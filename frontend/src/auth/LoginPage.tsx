import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { ApiError } from '@/api/errors';
import { TextField } from '@/components/form/TextField';
import { SubmitButton } from '@/components/form/SubmitButton';
import { useAuth } from './useAuth';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

// Demo accounts for reviewers — read from docs/demo-accounts.md (feature 03
// seed data, password `Demo@1234` for every account). Dev-only convenience,
// not something a production login screen would ever show.
const DEMO_ACCOUNTS = [
  { email: 'garnet.wiegand@ppfc.demo', role: 'Admin' },
  { email: 'christelle.satterfield@ppfc.demo', role: 'Project manager' },
  { email: 'estell.conroy@ppfc.demo', role: 'Contributor' },
];

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  // Already signed in (e.g. opened /login directly in another tab) — don't
  // show the form again.
  if (user) {
    return <Navigate to={searchParams.get('next') ?? '/'} replace />;
  }

  async function onSubmit(values: LoginFormValues) {
    setFormError(null);
    try {
      await login(values.email, values.password);
      navigate(searchParams.get('next') ?? '/', { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">PPFC Portal</h1>
          <p className="text-muted-foreground mt-1 text-sm">Sign in to continue</p>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4 rounded-xl border bg-white p-6 shadow-sm"
        >
          {formError && (
            <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
              {formError}
            </p>
          )}
          <TextField
            label="Email"
            type="email"
            autoComplete="username"
            error={errors.email?.message}
            {...register('email')}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />
          <SubmitButton pending={isSubmitting} className="w-full">
            Sign in
          </SubmitButton>
        </form>

        <div className="text-muted-foreground rounded-xl border border-dashed p-4 text-xs">
          <p className="mb-2 font-medium">Demo accounts (password: Demo@1234)</p>
          <ul className="space-y-1">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email} className="flex justify-between gap-2">
                <span className="font-mono">{account.email}</span>
                <span>{account.role}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
