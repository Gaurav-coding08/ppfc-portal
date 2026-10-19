import { HelpCircle, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const STORAGE_KEY = 'keel-how-to-read-dismissed';

function isDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function setDismissed() {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // localStorage unavailable
  }
}

export function HowToRead() {
  const [dismissed, setDismissedState] = useState(isDismissed);
  const [open, setOpen] = useState(!dismissed);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <HelpCircle className="size-4" />
        How to read this
      </Button>
    );
  }

  return (
    <Card className="border-sky-200 bg-sky-50/50 p-4 text-sm text-slate-700">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <HelpCircle className="size-4 text-sky-600" aria-hidden />
          <h3 className="font-semibold text-slate-900">How to read this dashboard</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="size-7 p-0"
          aria-label="Dismiss guide"
          onClick={() => {
            setOpen(false);
            setDismissed();
            setDismissedState(true);
          }}
        >
          <X className="size-4" />
        </Button>
      </div>
      <ul className="list-inside list-disc space-y-1">
        <li>
          <strong>Reporting date: 30 Sep 2026.</strong> All financial figures (budget, actual, EAC) are
          computed as of this fixed date, matching the seed data.
        </li>
        <li>
          <strong>Numbers come from SQL.</strong> Every value is computed by the backend on each request —
          the browser only displays them.
        </li>
        <li>
          <strong>Filters combine.</strong> Department, project, manager, timeframe and cost category each
          narrow the data independently; reset clears all of them.
        </li>
        <li>
          <strong>Drill icon.</strong> Cards with a clickable KPI open a drawer listing the individual
          records behind the number, with the same filters applied.
        </li>
      </ul>
    </Card>
  );
}
