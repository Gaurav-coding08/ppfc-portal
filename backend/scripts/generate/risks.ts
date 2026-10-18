import { faker } from '@faker-js/faker';
import { CONTRIBUTOR_SETS, PROJECTS } from './projects.js';
import { addDays, atTime, REPORTING_DATE } from './dates.js';
import type { RiskRow } from './types.js';

const TYPE_CYCLE: RiskRow['type'][] = ['risk', 'issue', 'risk'];
const STATUS_CYCLE: RiskRow['status'][] = ['open', 'mitigating', 'closed'];
// [probability, impact] per slot — moderate scores (6, 6, 12) for the
// ordinary filler risks.
const SCORE_CYCLE: [number, number][] = [
  [2, 3],
  [3, 2],
  [4, 3],
];

// score = probability * impact >= 15 required by the two bullets below.
const FORCE_CLOSED_HIGH_EXPOSURE = { projectId: 2, index: 0 };
const FORCE_OPEN_HIGH_EXPOSURE = { projectId: 5, index: 0 };

export function buildRisks(): RiskRow[] {
  const risks: RiskRow[] = [];
  let id = 1;

  PROJECTS.forEach((project, projectIdx) => {
    const owner = CONTRIBUTOR_SETS[projectIdx]![0]!;
    const createdAt = project.created_at;

    for (let i = 0; i < 3; i++) {
      let [probability, impact] = SCORE_CYCLE[i]!;
      let status = STATUS_CYCLE[i]!;
      const dueDate = addDays(project.start_date, 60 + i * 45);

      if (project.id === FORCE_CLOSED_HIGH_EXPOSURE.projectId && i === FORCE_CLOSED_HIGH_EXPOSURE.index) {
        probability = 5;
        impact = 5;
        status = 'closed';
      }
      if (project.id === FORCE_OPEN_HIGH_EXPOSURE.projectId && i === FORCE_OPEN_HIGH_EXPOSURE.index) {
        probability = 5;
        impact = 4;
        status = 'open';
      }
      // A risk can be closed even if its due date is still in the future
      // as of the reporting date — it was resolved early. closed_at is
      // still always historical: on the due date itself when that's
      // already past, otherwise a deterministic day shortly before the
      // reporting date, never after it.
      const closedAt =
        status === 'closed'
          ? atTime(dueDate <= REPORTING_DATE ? dueDate : addDays(REPORTING_DATE, -((i % 5) + 1)))
          : null;
      risks.push({
        id: id++,
        project_id: project.id,
        type: TYPE_CYCLE[i]!,
        title: faker.company.catchPhrase(),
        description: faker.lorem.sentence(),
        owner_id: owner,
        probability,
        impact,
        mitigation: status === 'open' ? null : faker.lorem.sentence(),
        due_date: dueDate,
        status,
        closed_at: closedAt,
        created_at: createdAt,
        updated_at: closedAt ?? createdAt,
      });
    }
  });

  return risks;
}
