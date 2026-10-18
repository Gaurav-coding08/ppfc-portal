// One-shot CLI for demos: a single producer + dispatcher pass, printing
// the run summary. `npm run automation:run` twice in a row is the
// idempotency evidence CLAUDE.md's acceptance step asks for — the second
// run's itemsCreated should be 0.

import { closePool } from '../src/db/pool.js';
import { runOverdueEscalation } from '../src/modules/automation/overdueEscalation.job.js';
import { dispatchPending } from '../src/modules/automation/outboxDispatcher.js';

async function main(): Promise<void> {
  const run = await runOverdueEscalation({ trigger: 'manual' });
  const dispatch = await dispatchPending();

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ run, dispatch }, null, 2));
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('automation:run failed:', err);
    process.exitCode = 1;
  })
  .finally(() => void closePool());
