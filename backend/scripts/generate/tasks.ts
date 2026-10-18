import { faker } from '@faker-js/faker';
import { CONTRIBUTOR_SETS, PROJECTS } from './projects.js';
import { addDays, daysBetween, REPORTING_DATE } from './dates.js';
import type { TaskRow } from './types.js';

const TASKS_PER_PROJECT = 12;
const STATUS_CYCLE: TaskRow['status'][] = ['todo', 'in_progress', 'blocked', 'done'];
const PRIORITY_CYCLE: TaskRow['priority'][] = ['low', 'medium', 'high', 'critical'];

// Edge cases that must land on a specific, known task rather than wherever
// the cycling pattern happens to put them.
const FORCE_DUE_EXACTLY_ON_CUTOFF = { projectId: 1, index: 9 };
const FORCE_UNASSIGNED = { projectId: 3, index: 5 };

export function buildTasks(): TaskRow[] {
  const tasks: TaskRow[] = [];
  let id = 1;

  PROJECTS.forEach((project, projectIdx) => {
    const isCompletedProject = project.status === 'completed';
    const span = daysBetween(project.start_date, project.end_date);
    const contributors = CONTRIBUTOR_SETS[projectIdx]!;

    for (let i = 0; i < TASKS_PER_PROJECT; i++) {
      // Due dates spread proportionally across the project's own lifetime,
      // so the last task's due date lands on the project's end date.
      const offsetDays = Math.round(((i + 1) / TASKS_PER_PROJECT) * span);
      let dueDate = addDays(project.start_date, offsetDays);

      const status: TaskRow['status'] = isCompletedProject ? 'done' : STATUS_CYCLE[i % 4]!;
      let assigneeId: number | null = contributors[i % contributors.length]!;

      if (project.id === FORCE_DUE_EXACTLY_ON_CUTOFF.projectId && i === FORCE_DUE_EXACTLY_ON_CUTOFF.index) {
        dueDate = REPORTING_DATE;
      }
      if (project.id === FORCE_UNASSIGNED.projectId && i === FORCE_UNASSIGNED.index) {
        assigneeId = null;
      }

      const progress = status === 'done' ? 100 : [0, 25, 50, 75][i % 4]!;
      tasks.push({
        id: id++,
        project_id: project.id,
        title: `${project.code} task ${i + 1}: ${faker.hacker.phrase()}`,
        description: faker.company.catchPhrase(),
        assignee_id: assigneeId,
        status,
        priority: PRIORITY_CYCLE[i % 4]!,
        start_date: addDays(project.start_date, Math.max(0, offsetDays - 14)),
        due_date: dueDate,
        weight: (i % 5) + 1,
        progress,
        completed_at: status === 'done' ? `${dueDate}T00:00:00Z` : null,
      });
    }
  });

  return tasks;
}
