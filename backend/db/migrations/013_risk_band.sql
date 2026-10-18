-- 013_risk_band: single source of truth for the exposure-band label shown on
-- the risk register and reused by the dashboard/Power BI (feature 09).
-- Thresholds mirror the JS constant in modules/risks/risks.shared.ts —
-- change both together if they ever move.
CREATE OR REPLACE FUNCTION fn_exposure_band(p_score SMALLINT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_score >= 15 THEN 'high'
    WHEN p_score >= 8 THEN 'medium'
    ELSE 'low'
  END;
$$;
