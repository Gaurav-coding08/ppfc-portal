// Single JS-side definition of the exposure-band thresholds, mirrored in
// SQL by `fn_exposure_band` (migration 013) so the risk register and any
// SQL-side consumer (dashboard, Power BI) agree. Used here for the
// mitigation-required business rule, which must run before the row exists
// (so before the DB's generated `score` column is available to query).
export const HIGH_EXPOSURE_THRESHOLD = 15;
export const MEDIUM_EXPOSURE_THRESHOLD = 8;

export type ExposureBand = 'high' | 'medium' | 'low';

export function exposureBand(score: number): ExposureBand {
  if (score >= HIGH_EXPOSURE_THRESHOLD) return 'high';
  if (score >= MEDIUM_EXPOSURE_THRESHOLD) return 'medium';
  return 'low';
}

// CLAUDE.md/feature rule: mitigation is required once a risk's exposure
// reaches 'high' (score >= 15). Returns whether the rule is satisfied —
// the service decides how to turn a `false` into a 422. Checked against the
// *effective* probability/impact/mitigation (current row merged with the
// patch), so raising probability/impact into the high band on a risk that
// never needed mitigation before is caught too, not just a fresh create.
export function hasRequiredMitigation(score: number, mitigation: string | null | undefined): boolean {
  if (score < HIGH_EXPOSURE_THRESHOLD) return true;
  return !!mitigation && mitigation.trim().length > 0;
}
