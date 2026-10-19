import { zodResolver } from '@hookform/resolvers/zod';
import { BarChart3, Shield, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { ApiError } from '@/api/errors';
import { KeelLogo } from '@/components/display/KeelLogo';
import { TextField } from '@/components/form/TextField';
import { SubmitButton } from '@/components/form/SubmitButton';
import { useAuth } from './useAuth';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const DEMO_ACCOUNTS = [
  { email: 'garnet.wiegand@ppfc.demo', role: 'Admin' },
  { email: 'christelle.satterfield@ppfc.demo', role: 'Project manager' },
  { email: 'estell.conroy@ppfc.demo', role: 'Contributor' },
];

const VALUE_POINTS = [
  { icon: TrendingUp, text: 'Delivery tracking across every project' },
  { icon: Shield, text: 'Change-request governance with audit trail' },
  { icon: BarChart3, text: 'Real-time financial control and forecasts' },
];

function KpiIllustration() {
  return (
    <div className="mt-8 grid grid-cols-3 gap-3">
      <div className="rounded-lg border border-indigo-200/60 bg-indigo-50/50 p-3">
        <p className="text-[11px] font-medium text-indigo-400">Active projects</p>
        <p className="text-lg font-semibold tabular-nums text-indigo-700">12</p>
      </div>
      <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/50 p-3">
        <p className="text-[11px] font-medium text-emerald-400">On budget</p>
        <p className="text-lg font-semibold tabular-nums text-emerald-700">83%</p>
      </div>
      <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 p-3">
        <p className="text-[11px] font-medium text-amber-400">Risks tracked</p>
        <p className="text-lg font-semibold tabular-nums text-amber-700">47</p>
      </div>
    </div>
  );
}

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
    <div className="bg-background flex min-h-screen">
      {/* Left panel — brand, hidden on small screens */}
      <div className="hidden w-1/2 flex-col justify-center bg-slate-900 px-12 lg:flex xl:px-20">
        <div className="max-w-md">
          <div className="flex items-center gap-3">
            <KeelLogo className="size-10 text-indigo-400" />
            <h1 className="text-3xl font-semibold tracking-tight text-white">Keel</h1>
          </div>
          <p className="mt-2 text-sm font-medium text-slate-400">Portfolio & financial control</p>

          <ul className="mt-10 space-y-4">
            {VALUE_POINTS.map((vp) => (
              <li key={vp.text} className="flex items-start gap-3">
                <vp.icon className="mt-0.5 size-5 shrink-0 text-indigo-400" aria-hidden />
                <span className="text-sm text-slate-300">{vp.text}</span>
              </li>
            ))}
          </ul>

          <KpiIllustration />
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex w-full flex-col items-center justify-center p-6 lg:w-1/2">
        <div className="w-full max-w-sm space-y-6">
          {/* Mobile-only brand header */}
          <div className="text-center lg:hidden">
            <div className="flex items-center justify-center gap-2">
              <KeelLogo className="text-primary size-7" />
              <h1 className="text-2xl font-semibold tracking-tight">Keel</h1>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">Portfolio & financial control</p>
          </div>

          <div className="hidden text-left lg:block">
            <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
            <p className="text-muted-foreground mt-1 text-sm">Enter your credentials to continue</p>
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
    </div>
  );
}
