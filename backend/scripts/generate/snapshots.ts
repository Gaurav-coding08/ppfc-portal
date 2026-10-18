import { PROJECTS } from './projects.js';
import type { ProgressSnapshotRow } from './types.js';

// Final actual spend per project as of the reporting date (must match the
// fixed cost_transactions totals built in costs.ts) — snapshots are a
// historical trend, so each month's figure is a fraction of that final
// number rather than an independent random value.
const FINAL_ACTUAL_BY_PROJECT: Record<number, number> = {
  1: 0,
  2: 150000,
  3: 70000,
  4: 80000,
  5: 40000,
  6: 30000,
  7: 25000,
  8: 35000,
};

const SNAPSHOT_MONTHS = ['2026-06-30', '2026-07-31', '2026-08-31', '2026-09-30'];
const SPEND_FRACTIONS = [0.25, 0.5, 0.75, 1.0];
const PROGRESS_FRACTIONS_ONGOING = [30, 55, 75, 90];
const PROGRESS_FRACTIONS_COMPLETED = [60, 80, 95, 100];

export function buildProgressSnapshots(): ProgressSnapshotRow[] {
  const snapshots: ProgressSnapshotRow[] = [];
  let id = 1;

  for (const project of PROJECTS) {
    const finalActual = FINAL_ACTUAL_BY_PROJECT[project.id]!;
    const progressFractions =
      project.status === 'completed' ? PROGRESS_FRACTIONS_COMPLETED : PROGRESS_FRACTIONS_ONGOING;

    SNAPSHOT_MONTHS.forEach((snapshotDate, i) => {
      snapshots.push({
        id: id++,
        project_id: project.id,
        snapshot_date: snapshotDate,
        progress_pct: progressFractions[i]!,
        actual_spend: Math.round(finalActual * SPEND_FRACTIONS[i]! * 100) / 100,
      });
    });
  }

  return snapshots;
}
