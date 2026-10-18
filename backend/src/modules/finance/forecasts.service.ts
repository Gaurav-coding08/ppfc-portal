import { withTx } from '../../db/tx.js';
import { assertProjectAccess } from '../../lib/access.js';
import { writeAudit } from '../../lib/audit.js';
import { resolveAsOf } from '../../lib/dates.js';
import { businessRule } from '../../lib/errors.js';
import type { AuthUser } from '../../middleware/authenticate.js';
import * as forecastsRepo from './forecasts.repository.js';
import type { ForecastRow } from './forecasts.repository.js';
import type { ForecastQuery, UpsertForecastsBody } from './forecasts.schemas.js';

export interface ForecastsResponse {
  forecasts: ForecastRow[];
  forecastToComplete: number;
  currency: string;
}

export async function listForecasts(
  caller: AuthUser,
  projectId: number,
  query: ForecastQuery,
): Promise<ForecastsResponse> {
  await assertProjectAccess(caller, projectId, 'view');
  const asOf = resolveAsOf(query);
  const forecasts = await forecastsRepo.listForecasts(projectId);
  const ftc = await forecastsRepo.forecastToComplete(projectId, asOf);
  return { forecasts, forecastToComplete: ftc, currency: 'AED' };
}

export async function upsertForecasts(
  caller: AuthUser,
  projectId: number,
  body: UpsertForecastsBody,
  query: ForecastQuery,
  requestId: string,
): Promise<ForecastsResponse> {
  return withTx(async (client) => {
    await assertProjectAccess(caller, projectId, 'manage', client);
    const asOf = resolveAsOf(query);

    // Validate: months must be first-of-month and after the asOf month
    const asOfMonth = asOf.slice(0, 7);

    // Get project end_date for upper bound
    const { rows: projRows } = await client.query<{ end_date: string }>(
      `SELECT end_date FROM projects WHERE id = $1`,
      [projectId],
    );
    const projectEndMonth = projRows[0] ? projRows[0].end_date.slice(0, 7) : null;

    const normalizedMonths: { month: string; amount: number }[] = [];
    for (const entry of body.months) {
      // Normalize YYYY-MM → YYYY-MM-01 for the DB column (first of month)
      const monthDate = `${entry.month}-01`;

      if (entry.month <= asOfMonth) {
        throw businessRule(
          `Forecast month ${entry.month} must be after the reporting month (${asOfMonth})`,
        );
      }

      if (projectEndMonth && entry.month > projectEndMonth) {
        throw businessRule(
          `Forecast month ${entry.month} exceeds project end month (${projectEndMonth})`,
        );
      }

      normalizedMonths.push({ month: monthDate, amount: entry.amount });
    }

    const before = await forecastsRepo.listForecasts(projectId, client);
    const upserted = await forecastsRepo.upsertForecasts(
      projectId,
      normalizedMonths,
      caller.id,
      client,
    );

    await writeAudit(client, {
      actorId: caller.id,
      entityType: 'financial_forecast',
      entityId: projectId,
      action: 'forecast.upsert',
      projectId,
      before,
      after: upserted,
      requestId,
    });

    const forecasts = await forecastsRepo.listForecasts(projectId, client);
    const ftc = await forecastsRepo.forecastToComplete(projectId, asOf, client);
    return { forecasts, forecastToComplete: ftc, currency: 'AED' };
  });
}
