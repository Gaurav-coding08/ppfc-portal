import cron from 'node-cron';
import { env } from './config/env.js';
import { closePool } from './db/pool.js';
import { logger } from './lib/logger.js';
import { runOverdueEscalation } from './modules/automation/overdueEscalation.job.js';
import { dispatchPending } from './modules/automation/outboxDispatcher.js';

// Separate process from the API (src/server.ts): runs the producer then
// the dispatcher on every AUTOMATION_CRON tick. AUTOMATION_ENABLED=false
// still starts the process (so `docker compose --profile app` brings it
// up) but skips scheduling, for environments that want the worker
// deployed but idle.
async function runPass(): Promise<void> {
  try {
    const run = await runOverdueEscalation({ trigger: 'schedule' });
    const dispatch = await dispatchPending();
    logger.info({ run, dispatch }, 'scheduled automation pass finished');
  } catch (err) {
    // runOverdueEscalation/dispatchPending already log and persist their
    // own failure state; this catch only stops a thrown error (e.g.
    // JOB_ALREADY_RUNNING when a manual trigger overlapped this tick)
    // from crashing the worker process.
    logger.error({ err }, 'scheduled automation pass errored');
  }
}

logger.info({ cron: env.AUTOMATION_CRON, enabled: env.AUTOMATION_ENABLED }, 'automation worker starting');

const task = env.AUTOMATION_ENABLED ? cron.schedule(env.AUTOMATION_CRON, () => void runPass()) : null;

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down worker`);
  task?.stop();
  await closePool();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
