import { atTime } from './dates.js';
import type { FinancialForecastRow } from './types.js';

// All forecasts were entered during the same September planning cycle,
// before the reporting date — not whenever the import happens to run.
const FORECAST_UPDATED_AT = atTime('2026-09-15');

// Monthly forecast amounts from October 2026 through each project's own end
// month. Project 5 is deliberately left out entirely — that's the
// "no forecast rows" edge case (forecastMissing = true, EAC = actual).
// Project 4 (completed in June 2026) needs no forecast either: it finished
// before the forecast window starts.
//
// Project 3's months (15000, 15000, 10000 = 40000) are chosen so that
// EAC (actual 70000 + FTC 40000 = 110000) exceeds its 100000 budget — the
// "forecast to exceed budget" edge case.
const FORECASTS: Record<number, { month: string; amount: number }[]> = {
  1: [
    { month: '2026-10-01', amount: 15000 },
    { month: '2026-11-01', amount: 15000 },
    { month: '2026-12-01', amount: 15000 },
    { month: '2027-01-01', amount: 10000 },
    { month: '2027-02-01', amount: 10000 },
    { month: '2027-03-01', amount: 10000 },
  ],
  2: [
    { month: '2026-10-01', amount: 4000 },
    { month: '2026-11-01', amount: 3000 },
    { month: '2026-12-01', amount: 3000 },
  ],
  3: [
    { month: '2026-10-01', amount: 15000 },
    { month: '2026-11-01', amount: 15000 },
    { month: '2026-12-01', amount: 10000 },
  ],
  6: [
    { month: '2026-10-01', amount: 8000 },
    { month: '2026-11-01', amount: 6000 },
  ],
  7: [
    { month: '2026-10-01', amount: 6000 },
    { month: '2026-11-01', amount: 6000 },
    { month: '2026-12-01', amount: 6000 },
    { month: '2027-01-01', amount: 5000 },
    { month: '2027-02-01', amount: 5000 },
    { month: '2027-03-01', amount: 5000 },
    { month: '2027-04-01', amount: 5000 },
    { month: '2027-05-01', amount: 5000 },
    { month: '2027-06-01', amount: 5000 },
  ],
  8: [{ month: '2026-10-01', amount: 2000 }],
};

const UPDATED_BY_PROJECT: Record<number, number> = {
  1: 2,
  2: 3,
  3: 4,
  6: 4,
  7: 2,
  8: 3,
};

export function buildFinancialForecasts(): FinancialForecastRow[] {
  const rows: FinancialForecastRow[] = [];
  let id = 1;
  for (const [projectIdStr, entries] of Object.entries(FORECASTS)) {
    const projectId = Number(projectIdStr);
    for (const entry of entries) {
      rows.push({
        id: id++,
        project_id: projectId,
        month: entry.month,
        amount: entry.amount,
        updated_by: UPDATED_BY_PROJECT[projectId]!,
        updated_at: FORECAST_UPDATED_AT,
      });
    }
  }
  return rows;
}
