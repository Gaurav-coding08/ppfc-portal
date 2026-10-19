import { StatusBadge } from '@/components/display/StatusBadge';
import { ALERT_LABELS, type FinanceAlert } from '../types';

// The project's alerts from the summary response. Which alerts fire is
// decided in SQL (fn_project_financials flags); this only lists them.
// Nothing renders when there are none.
export function FinanceAlertsStrip({ alerts }: { alerts: FinanceAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <ul aria-label="Finance alerts" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {alerts.map((alert) => {
        const label = ALERT_LABELS[alert.alertType!];
        return (
          <li
            key={alert.alertType}
            className="bg-card flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-sm"
          >
            <StatusBadge domain="alertSeverity" status={alert.severity!} />
            <div>
              <p className="font-medium">{label?.title ?? alert.alertType}</p>
              {label && <p className="text-muted-foreground text-xs">{label.detail}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
