import { CalendarRange } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/data/EmptyState';
import { ErrorState } from '@/components/data/ErrorState';
import { LoadingState } from '@/components/data/LoadingState';
import { Money } from '@/components/display/Money';
import { SubmitButton } from '@/components/form/SubmitButton';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { ProjectDetail } from '@/features/projects/types';
import { newIdempotencyKey } from '@/lib/idempotency';
import { toastApiError } from '@/lib/notify';
import { useSaveForecasts } from '../hooks/useFinanceMutations';
import { useForecasts } from '../hooks/useFinanceQueries';
import { formatMonth, isEditableMonth, monthsBetween, toMonth } from '../months';
import type { Forecast } from '../types';

// Monthly forecast for the project's whole timeline. Months after the
// reporting month are editable (managers only); the reporting month and
// earlier are read-only — the backend refuses them anyway. "Save" sends
// every filled-in editable month in one PUT.
export function ForecastGrid({
  project,
  canManage,
  asOf,
}: {
  project: ProjectDetail;
  canManage: boolean;
  asOf: string | undefined;
}) {
  const forecasts = useForecasts(project.id!);

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="text-base font-semibold">Forecast</h2>
        <p className="text-muted-foreground text-sm">
          Expected spend per month. Forecast to complete is the sum of the months after the reporting month.
        </p>
      </div>
      {forecasts.isPending || !asOf ? (
        <LoadingState rows={3} />
      ) : forecasts.isError ? (
        <ErrorState error={forecasts.error} onRetry={() => forecasts.refetch()} />
      ) : (
        // Remounts after every refetch so the inputs always start from
        // the saved values, never from a locally patched copy.
        <GridBody
          key={forecasts.dataUpdatedAt}
          project={project}
          canManage={canManage}
          asOf={asOf}
          rows={forecasts.data.forecasts ?? []}
          forecastToComplete={forecasts.data.forecastToComplete}
        />
      )}
    </Card>
  );
}

function GridBody({
  project,
  canManage,
  asOf,
  rows,
  forecastToComplete,
}: {
  project: ProjectDetail;
  canManage: boolean;
  asOf: string;
  rows: Forecast[];
  forecastToComplete: number | undefined;
}) {
  const save = useSaveForecasts(project.id!);
  const months = monthsBetween(project.startDate!, project.endDate!);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [toMonth(r.month!), String(r.amount)])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  // One key per grid; replaced only after a successful save.
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const inFlight = useRef(false);
  const editableMonths = months.filter((m) => isEditableMonth(m, asOf));

  async function onSave() {
    if (inFlight.current) return;
    // Validate locally first: every filled-in editable month must be a
    // number >= 0 (backend: amount >= 0). Blank months are not sent.
    const nextErrors: Record<string, string> = {};
    const payload: { month: string; amount: number }[] = [];
    for (const month of editableMonths) {
      const raw = (values[month] ?? '').trim();
      if (raw === '') continue;
      const amount = Number(raw);
      if (!Number.isFinite(amount) || amount < 0) nextErrors[month] = 'Enter 0 or more';
      else payload.push({ month, amount });
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    if (payload.length === 0) {
      toast.error('Enter at least one forecast month');
      return;
    }

    inFlight.current = true;
    try {
      await save.mutateAsync({ months: payload, idempotencyKey });
      toast.success('Forecast saved');
      setIdempotencyKey(newIdempotencyKey());
    } catch (err) {
      // 422 (month outside the allowed range) or 403: message + request id.
      toastApiError(err);
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <div className="space-y-4">
      {rows.length === 0 && (
        <EmptyState
          icon={CalendarRange}
          message="No forecast yet. Until one exists, forecast to complete is 0 and EAC equals actual spend."
        />
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {months.map((month) => {
          const editable = canManage && isEditableMonth(month, asOf);
          const id = `forecast-${month}`;
          return (
            <div key={month} className="space-y-1">
              <label htmlFor={id} className="text-muted-foreground text-xs font-medium">
                {formatMonth(month)}
              </label>
              <Input
                id={id}
                inputMode="decimal"
                className="tabular-nums"
                placeholder={editable ? '0' : '—'}
                value={values[month] ?? ''}
                disabled={!editable || save.isPending}
                aria-invalid={!!errors[month]}
                aria-describedby={errors[month] ? `${id}-error` : undefined}
                onChange={(e) => setValues((prev) => ({ ...prev, [month]: e.target.value }))}
              />
              {errors[month] && (
                <p id={`${id}-error`} className="text-xs text-rose-600">
                  {errors[month]}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-sm">
          <span className="text-muted-foreground">Forecast to complete (saved): </span>
          <Money amount={forecastToComplete ?? null} className="font-semibold" />
        </p>
        {canManage && (
          <SubmitButton
            type="button"
            pending={save.isPending}
            onClick={onSave}
            disabled={editableMonths.length === 0}
          >
            Save forecast
          </SubmitButton>
        )}
      </div>
      {canManage && editableMonths.length === 0 && (
        <p className="text-muted-foreground text-sm">
          The project ends on or before the reporting month, so no month can be forecast.
        </p>
      )}
    </div>
  );
}
