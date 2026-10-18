import { z } from 'zod';
import { env } from '../config/env.js';

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

// Resolves the reporting asOf date: from a validated ?asOf= query param,
// or falling back to the REPORTING_DATE env var (which mirrors the DB's
// fn_reporting_date() / app_settings row).
export function resolveAsOf(query: { asOf?: string }): string {
  if (query.asOf) {
    const parsed = z.string().regex(dateRe, 'asOf must be YYYY-MM-DD').parse(query.asOf);
    return parsed;
  }
  return env.REPORTING_DATE;
}
