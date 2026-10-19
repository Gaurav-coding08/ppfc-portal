// A form-only preview of the backend's scoring rule, so someone filling in
// the risk form can see what probability × impact will mean before they
// save. It is never shown as a risk's score: every list, badge and detail
// displays `score`/`exposure` exactly as the API returns them, and the form
// labels this "calculated on save".
//
// The thresholds mirror backend/src/modules/risks/risks.shared.ts (and the
// SQL function fn_exposure_band). If those change, change these too.
export const HIGH_EXPOSURE_SCORE = 15;
const MEDIUM_EXPOSURE_SCORE = 8;

export type ExposureBand = 'high' | 'medium' | 'low';

export function previewScore(probability: number, impact: number): number | null {
  if (!Number.isInteger(probability) || !Number.isInteger(impact)) return null;
  return probability * impact;
}

export function previewBand(score: number): ExposureBand {
  if (score >= HIGH_EXPOSURE_SCORE) return 'high';
  if (score >= MEDIUM_EXPOSURE_SCORE) return 'medium';
  return 'low';
}

/** Backend rule (feature 09): a high-exposure risk must record a mitigation. */
export function mitigationRequired(score: number | null): boolean {
  return score !== null && score >= HIGH_EXPOSURE_SCORE;
}
