import { PROJECTS } from './projects.js';
import { addDays, atTime, daysBetween, isBeforeReportingDate } from './dates.js';
import type { MilestoneRow } from './types.js';

const NAMES = ['Requirements sign-off', 'Mid-point review', 'Go-live'];
// Fraction of the project's lifetime at which each milestone falls.
const OFFSETS = [0.15, 0.5, 1.0];

export function buildMilestones(): MilestoneRow[] {
  const milestones: MilestoneRow[] = [];
  let id = 1;

  for (const project of PROJECTS) {
    const span = daysBetween(project.start_date, project.end_date);
    // Milestones are planned at project kickoff, same as the project record.
    const createdAt = project.created_at;

    NAMES.forEach((name, i) => {
      const dueDate = addDays(project.start_date, Math.round(OFFSETS[i]! * span));
      const achieved = isBeforeReportingDate(dueDate);
      const achievedAt = achieved ? atTime(dueDate) : null;
      milestones.push({
        id: id++,
        project_id: project.id,
        name,
        due_date: dueDate,
        status: achieved ? 'achieved' : 'planned',
        achieved_date: achieved ? dueDate : null,
        created_at: createdAt,
        updated_at: achievedAt ?? createdAt,
      });
    });
  }

  return milestones;
}
