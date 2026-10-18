import { buildApp } from './app.js';
import { env } from './config/env.js';
import { closePool } from './db/pool.js';
import { logger } from './lib/logger.js';

const app = buildApp();

const server = app.listen(env.PORT, () => {
  logger.info(`PPFC Portal API listening on port ${env.PORT}`);
});

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down`);
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
